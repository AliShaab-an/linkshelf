import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHarness } from '../native/harness.mjs';
import { dataset } from './fixtures.mjs';
import { statistics, eventSummary } from './stats.mjs';

const paged = process.argv.includes('--paged');
const diagnostic = process.argv.includes('--diagnostic');
const smoke = process.argv.includes('--smoke');
const h = await createHarness(diagnostic ? { prepareBuild: (await import('./instrument.mjs')).instrumentBuild } : undefined);
const report = { paged, diagnostic, chrome: h.context.browser().version(), node: process.version, rows: [] };
const file = path.join(h.output, 'search-performance.json');
let active;
try {
  for (let i = 0; i < 100; i++) {
    await h.page.evaluate(({ i, base }) => chrome.bookmarks.create({ title: `Synthetic bookmark ${i}`, url: `${base}/bookmark/${i}` }), { i, base: h.base });
  }
  for (const distribution of smoke ? ['few'] : ['few', 'many']) for (const size of smoke ? [100] : [100, 1000, 5000, 10000]) {
    const fixture = dataset(size, distribution, h.base);
    assert.equal((await h.seed(fixture)).status.state, 'healthy');
    const queries = {
      url: fixture.links[1].url, title: 'item 99 topic', note: 'reference-99', project: 'restoration probe',
      none: 'no-such-synthetic-record', broad: 'synthetic', archived: fixture.links.find(link => link.status === 'archived').title,
      bookmarks: 'synthetic bookmark',
    };
    for (const [name, query] of Object.entries(queries)) {
      const samples = [];
      active = { distribution, size, operation: name, samples };
      for (let i = 0; i < 4; i++) {
        const sample = await h.page.evaluate(async ({ query, paged, all, diagnostic }) => {
          const encoder = new TextEncoder();
          const bytes = response => encoder.encode(JSON.stringify(response)).length;
          const send = (page) => chrome.runtime.sendMessage({ type: 'SEARCH_LINKS', payload: { query, ...(page && { page }) } });
          if (diagnostic) await chrome.runtime.sendMessage({ type: 'PERF_START' });
          const start = performance.now();
          const first = await send(paged ? {} : undefined);
          const firstMs = performance.now() - start;
          if (!first.success || (paged && !first.page)) throw new Error('Search failed');
          if (paged && (first.results.length > 25 || first.bookmarks.length > 25)) throw new Error('Initial search page exceeds category limits');
          const firstBytes = bytes(first);
          const saved = first.results.map(item => item.link.id);
          const bookmarks = first.bookmarks.map(item => item.id);
          const continuations = [];
          let fullBytes = firstBytes;
          let fullMs = firstMs;
          if (all && paged) {
            for (const category of ['results', 'bookmarks']) {
              let offset = category === 'results' ? first.page.nextResults : first.page.nextBookmarks;
              const ids = category === 'results' ? saved : bookmarks;
              while (offset !== undefined) {
                if (offset !== ids.length) throw new Error('Invalid continuation offset');
                const pageStart = performance.now();
                const next = await send({ cursor: first.page.cursor, category, offset });
                const ms = performance.now() - pageStart;
                if (!next.success) throw new Error(next.error.message);
                if (next[category].length > 25) throw new Error('Continuation exceeds category limit');
                fullMs += ms;
                continuations.push(ms);
                fullBytes += bytes(next);
                ids.push(...(category === 'results' ? next.results.map(item => item.link.id) : next.bookmarks.map(item => item.id)));
                offset = category === 'results' ? next.page.nextResults : next.page.nextBookmarks;
              }
            }
            if (new Set(saved).size !== first.page.totalResults || new Set(bookmarks).size !== first.page.totalBookmarks) throw new Error('Lost or duplicate search records');
          }
          const events = diagnostic ? (await chrome.runtime.sendMessage({ type: 'PERF_STOP' })).events : undefined;
          if (all && paged) {
            const legacy = await send();
            if (JSON.stringify(saved) !== JSON.stringify(legacy.results.map(item => item.link.id)) ||
                JSON.stringify(bookmarks) !== JSON.stringify(legacy.bookmarks.map(item => item.id))) {
              throw new Error('Page traversal differs from full search ordering');
            }
          }
          return { firstMs, firstBytes, fullMs, fullBytes, continuations, firstCount: first.results.length + first.bookmarks.length,
            total: (first.page?.totalResults ?? saved.length) + (first.page?.totalBookmarks ?? bookmarks.length), events };
        }, { query, paged, diagnostic, all: name === 'broad' });
        if (diagnostic) {
          const counts = eventSummary(sample.events);
          assert.equal(counts['repo.searchLinks']?.calls, 1, 'One repository scan per query including continuations');
          assert.equal(counts['chrome.bookmarks.getTree']?.calls, 1, 'One bookmark tree read per query including continuations');
        }
        if (i) samples.push(sample);
      }
      report.rows.push({ distribution, size, name, samples, first: statistics(samples.map(s => s.firstMs)), full: statistics(samples.map(s => s.fullMs)) });
      active = undefined;
    }
    console.log(distribution, size, report.rows.at(-3).first.medianMs, 'ms broad');
  }
} catch (error) {
  report.failure = { ...active, error: error.message };
  process.exitCode = 1;
} finally {
  try {
    await fs.writeFile(file, JSON.stringify(report, null, 2));
    console.log(file);
  } finally { await h.close(); }
}
