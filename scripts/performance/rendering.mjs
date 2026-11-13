import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHarness, navigateSidebar, sectionButton } from '../native/harness.mjs';
import { dataset } from './fixtures.mjs';

const smoke = process.argv.includes('--smoke');
const baseline = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const h = await createHarness(baseline ? {
  prepareBuild: destination => fs.cp(baseline, destination, { recursive: true }),
} : undefined);
const report = { baseline: !!baseline, chrome: h.context.browser().version(), node: process.version, archive: [], search: [], projects: [] };
const file = path.join(h.output, 'rendering-performance.json');
let active;
let page, cdp;
try {
  for (const distribution of smoke ? ['few'] : ['few', 'many']) for (const size of smoke ? [100, 1000] : [100, 1000, 5000, 10000]) {
    const fixture = dataset(size, distribution, h.base);
    assert.equal((await h.seed(fixture)).status.state, 'healthy');
    const archived = fixture.links.filter(link => link.status === 'archived').length;
    const samples = [];
    active = { operation: 'archive', distribution, size, samples };
    for (let i = 0; i < 4; i++) {
      await open();
      const archive = await sectionButton(page, 'Archive');
      await start();
      await archive.click();
      await page.getByRole('heading', { name: 'Archive', exact: true }).waitFor();
      await page.waitForFunction(() => globalThis.renderingProbe.replies.some(reply =>
        reply.type === 'GET_ARCHIVED_LINKS' && reply.start >= globalThis.renderingProbe.start));
      await waitCards(baseline ? archived : Math.min(25, archived));
      const sample = await read(['GET_ARCHIVED_LINKS', 'GET_PROJECTS']);
      if (i) samples.push(sample);
      await page.close();
    }
    report.archive.push({ distribution, size, archived, samples });
    active = undefined;
    console.log(distribution, size, 'Archive cards', samples[0].cards);
  }
  const fixture = dataset(1000, 'few', h.base);
  await h.seed(fixture);
  const count = fixture.links.filter(link => ['parked', 'archived'].includes(link.status)).length;
  const folder = await h.page.evaluate(async base => {
    const root = await chrome.bookmarks.create({ title: 'Benchmark' });
    const folder = await chrome.bookmarks.create({ title: 'Nested benchmark', parentId: root.id });
    for (let i = 0; i < 100; i++) await chrome.bookmarks.create({ parentId: folder.id, title: `Synthetic bookmark ${i}`, url: `${base}/benchmark-bookmark/${i}` });
    return folder.id;
  }, h.base);
  for (let attempt = 0; attempt < 3; attempt++) {
    active = { operation: 'search', attempt };
    await open();
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await start();
    await page.getByRole('searchbox').fill('synthetic');
    await waitCards(50);
    const initial = await read(['SEARCH_LINKS']);
    if (!baseline) await assertSearchCards();
    for (let i = 1; i <= 12; i++) {
      await start();
      await page.getByRole('button', { name: 'Load more LinkShelf links', exact: true }).click();
      await page.getByRole('heading', { name: `LinkShelf · ${25 * (i + 1)} of ${count}`, exact: true }).waitFor();
      if (!baseline && i < 12) await assertSearchCards();
    }
    const loaded = await read(['SEARCH_LINKS']);
    if (!baseline) await assertSearchCards();
    for (let i = 1; i <= 3; i++) {
      await start();
      await page.getByRole('button', { name: 'Load more Chrome bookmarks', exact: true }).click();
      await page.getByRole('heading', { name: `Chrome bookmarks · ${25 * (i + 1)} of 100`, exact: true }).waitFor();
      if (!baseline && i < 3) await assertSearchCards();
    }
    const bookmarks = await read(['SEARCH_LINKS']);
    if (!baseline) await assertSearchCards();
    assert.equal(bookmarks.cards, baseline ? 425 : 50);
    report.search.push({ initial, loaded, bookmarks });
    active = undefined;
    await page.close();
  }
  assert.ok(folder);
  for (const distribution of smoke ? [] : ['few', 'many']) {
    active = { operation: 'projects', distribution, size: 10000 };
    await h.seed(dataset(10000, distribution, h.base));
    await open();
    await navigateSidebar(page, 'Projects');
    await page.getByRole('button', { name: 'Expand all', exact: true }).waitFor();
    await start();
    await page.getByRole('button', { name: 'Expand all', exact: true }).click();
    const expanded = await read([]);
    let showMore, showAll;
    const more = page.getByRole('button', { name: /^Show \d+ more$/ }).first();
    const hasMore = await more.count() > 0;
    if (distribution === 'few') assert.ok(hasMore, 'Few-session Projects fixture must expose Show More');
    if (hasMore) {
      await start(); await more.click(); showMore = await read([]);
      await start(); await page.getByRole('button', { name: 'Show all', exact: true }).first().click(); showAll = await read([]);
    }
    const skipped = hasMore ? undefined : 'Fixture has no Projects continuation controls';
    report.projects.push({ distribution, expanded, showMore, showAll, skipped });
    active = undefined;
    await page.close();
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

async function open() {
  await h.page.evaluate(() => chrome.storage.local.set({ linkshelfUiState: {
    lastSection: 'projects', selectedProjectId: 'project-0', expandedSessionIds: [], sessionOrder: 'newest',
  } }));
  page = await h.context.newPage();
  await page.setViewportSize({ width: 400, height: 800 });
  cdp = await h.context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.addInitScript(() => {
    const probe = globalThis.renderingProbe = { tasks: [], replies: [], start: 0 };
    new PerformanceObserver(list => probe.tasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })))).observe({ type: 'longtask', buffered: true });
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async message => {
      const start = performance.now();
      try { return await send(message); }
      finally { probe.replies.push({ type: message.type, start, end: performance.now() }); }
    };
  });
  await page.goto(h.page.url());
  await (await sectionButton(page, 'Projects')).waitFor();
}
async function start() {
  await page.evaluate(() => { globalThis.renderingProbe.start = performance.now(); });
}
async function waitCards(cards) {
  await page.waitForFunction(cards => document.querySelectorAll('article').length === cards, cards);
}
async function assertSearchCards() {
  assert.equal(await page.locator('article[id^="search-link-"]').count(), 25);
  assert.equal(await page.locator('article[id^="search-bookmark-"]').count(), 25);
}
async function read(types) {
  const sample = await page.evaluate(async types => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const { start, replies, tasks } = globalThis.renderingProbe;
    const end = performance.now();
    const relevant = replies.filter(reply => reply.start >= start && types.includes(reply.type));
    return { ms: end - start, rpcMs: relevant.map(reply => reply.end - reply.start),
      responseToFrameMs: relevant.length ? end - Math.max(...relevant.map(reply => reply.end)) : null,
      longTaskMs: tasks.filter(task => task.startTime >= start && task.startTime <= end).reduce((sum, task) => sum + task.duration, 0),
      cards: document.querySelectorAll('article').length, elements: document.querySelectorAll('*').length };
  }, types);
  sample.heapBytes = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  sample.layoutCount = (await cdp.send('Performance.getMetrics')).metrics.find(metric => metric.name === 'LayoutCount')?.value;
  return sample;
}
