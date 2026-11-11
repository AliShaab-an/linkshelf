import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHarness } from './harness.mjs';
import { dataset } from '../performance/fixtures.mjs';

// An optional snapshot from the baseline RPC benchmark reproduces the old UI.
const baseline = process.argv[2];
const h = await createHarness(baseline ? {
  prepareBuild: destination => fs.cp(baseline, destination, { recursive: true }),
} : undefined);
const report = { chrome: h.context.browser().version(), baseline: !!baseline, timings: [], checks: [] };
const rpc = (query, page, surface) => h.rpc({ type: 'SEARCH_LINKS', payload: { query, page } }, surface);
try {
  const folder = await h.page.evaluate(async base => {
    const folder = await chrome.bookmarks.create({ title: 'Search fixture' });
    for (let i = 0; i < 60; i++) {
      await chrome.bookmarks.create({ parentId: folder.id, title: `Synthetic bookmark ${i}`, url: `${base}/search-bookmark/${i}` });
    }
    return folder.id;
  }, h.base);
  const ui = await h.context.newPage();
  const cdp = await h.context.newCDPSession(ui);
  await ui.setViewportSize({ width: 400, height: 800 });
  await ui.addInitScript(() => {
    const state = globalThis.searchProbe = { tasks: [] };
    new PerformanceObserver(list => state.tasks.push(...list.getEntries().map(entry => ({
      start: entry.startTime, duration: entry.duration,
    })))).observe({ type: 'longtask', buffered: true });
    document.addEventListener('input', event => {
      if (event.target.id === 'link-search') { state.start = performance.now(); state.first = undefined; state.reply = undefined; }
    }, true);
    new MutationObserver(() => {
      if (state.start && state.first === undefined && document.querySelector('article')) state.first = performance.now();
    }).observe(document, { subtree: true, childList: true });
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async message => {
      if (message.type !== 'SEARCH_LINKS') return send(message);
      const start = performance.now();
      const result = await send(message);
      const end = performance.now();
      if (state.hold?.(message)) {
        await new Promise(resolve => { state.release = resolve; });
        state.delivered = true;
      } else {
        state.reply = { query: message.payload.query, start, end, results: result.results?.length, bookmarks: result.bookmarks?.length };
      }
      return result;
    };
  });
  await ui.goto(h.page.url());
  await ui.getByRole('button', { name: 'Search', exact: true }).click();
  const input = ui.getByRole('searchbox', { name: 'Search saved links' });
  const cards = ui.locator('article');
  async function query(text, expected, total = expected) {
    if (await input.inputValue() !== '') {
      await input.fill('');
      await cards.first().waitFor({ state: 'detached' });
    }
    await input.fill(text);
    await ui.waitForFunction(({ text, expected }) => globalThis.searchProbe.reply?.query === text && document.querySelectorAll('article').length === expected, { text, expected });
    if (!baseline) await ui.getByText(`${total} result${total === 1 ? '' : 's'}`, { exact: true }).waitFor();
    await ui.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const timing = await ui.evaluate(() => {
      const { start, first, reply, tasks } = globalThis.searchProbe;
      const frame = performance.now();
      return { query: reply.query, cards: document.querySelectorAll('article').length, rpcMs: reply.end - reply.start,
        inputToFirstMs: first === undefined ? null : first - start, inputToFrameMs: frame - start, responseToFrameMs: frame - reply.end,
        longTaskMs: tasks.filter(task => task.start >= start && task.start <= frame).reduce((sum, task) => sum + task.duration, 0) };
    });
    timing.uiHeapUsedBytes = (await cdp.send('Runtime.getHeapUsage')).usedSize;
    report.timings.push(timing);
  }
  for (const size of baseline ? [1000] : [1000, 10000, 100]) {
    const fixture = dataset(size, 'few', h.base);
    await h.seed(fixture);
    const expected = fixture.links.filter(link => link.status === 'parked' || link.status === 'archived').length;
    await query('synthetic', baseline ? expected + 60 : 50, expected + 60);
    await query(fixture.links[1].url, 1);
    await query('never-exists-synthetic-query', 0);
    await query('synthetic bookmark', baseline ? 60 : 25, 60);
    await query('restoration probe', 10);
    const archived = fixture.links.find(link => link.status === 'archived');
    await query(archived.url, 1);
    await cards.first().getByText('archived', { exact: true }).waitFor();
    assert.equal((await rpc(' ', baseline ? undefined : {})).results.length, 0);
    report.checks.push(`${size} links: broad, narrow, empty, no matches, project, archived and native bookmark searches`);
  }
  if (!baseline) {
    const moreLinks = ui.getByRole('button', { name: 'Load more LinkShelf links', exact: true });
    const moreBookmarks = ui.getByRole('button', { name: 'Load more Chrome bookmarks', exact: true });
    const full = await rpc('synthetic');
    await query('synthetic', 50, full.results.length + full.bookmarks.length);
    let expectedCards = 50;
    const observed = await cards.locator('h3').allTextContents();
    const expectedSaved = full.results.map(item => item.link.title);
    const expectedBookmarks = full.bookmarks.map(item => item.title);
    const loadedSaved = observed.slice(0, 25);
    const loadedBookmarks = observed.slice(25);
    for (const [more, expected, collected, saved] of [[moreLinks, expectedSaved, loadedSaved, true], [moreBookmarks, expectedBookmarks, loadedBookmarks, false]]) {
      const count = expected.length;
      for (let loaded = 25; loaded < count; loaded += 25) {
        const batch = Math.min(25, count - loaded);
        const otherCards = saved ? 25 : expectedSaved.length % 25 || 25;
        expectedCards = otherCards + batch;
        const start = await ui.evaluate(() => performance.now());
        await more.click();
        const nav = ui.getByRole('navigation', { name: saved ? 'LinkShelf result pages' : 'Chrome bookmark pages' });
        await nav.getByText(new RegExp(`Showing ${loaded + 1}–${loaded + batch} of ${loaded + batch}`)).waitFor();
        const visible = await cards.locator('h3').allTextContents();
        assert.equal(visible.length, expectedCards);
        collected.push(...(saved ? visible.slice(0, batch) : visible.slice(otherCards)));
        report.timings.push({ query: 'load more', cards: expectedCards, clickToCardsMs: await ui.evaluate(start => performance.now() - start, start) });
      }
      await more.waitFor({ state: 'detached' });
      assert.deepEqual(collected, expected);
    }
    const savedNav = ui.getByRole('navigation', { name: 'LinkShelf result pages' });
    const jump = savedNav.getByRole('spinbutton', { name: 'Page number' });
    await jump.fill('1');
    await jump.press('Enter');
    await savedNav.getByText(/Showing 1–25/).waitFor();
    assert.deepEqual((await cards.locator('h3').allTextContents()).slice(0, 25), expectedSaved.slice(0, 25));
    report.checks.push('Actual sidebar reaches every result in both categories in legacy order');

    await query('synthetic', 50, expectedSaved.length + expectedBookmarks.length);
    const first = await rpc('synthetic', {});
    await h.stopWorker();
    assert.equal((await rpc('synthetic', { cursor: first.page.cursor, category: 'results', offset: 25 })).error.code, 'SEARCH_EXPIRED');
    await moreLinks.click();
    await moreLinks.waitFor({ state: 'visible' });
    await ui.waitForFunction(() => !document.querySelector('button[disabled]') || [...document.querySelectorAll('button')].some(button => button.textContent === 'Load more LinkShelf links' && !button.disabled));
    await moreLinks.click();
    await savedNav.getByText(/Showing 26–50 of 50/).waitFor();
    report.checks.push('Worker restart expires cursor and sidebar restarts the query');

    await ui.evaluate(() => { globalThis.searchProbe.hold = message => message.payload.page?.offset === 50; });
    await moreLinks.click();
    await ui.waitForFunction(() => !!globalThis.searchProbe.release);
    await query('synthetic bookmark', 25, 60);
    await ui.evaluate(() => globalThis.searchProbe.release());
    await ui.waitForFunction(() => globalThis.searchProbe.delivered);
    assert.equal(await cards.count(), 25);
    assert.match(await cards.first().innerText(), /Synthetic bookmark/);
    await ui.evaluate(() => {
      const probe = globalThis.searchProbe;
      probe.release = undefined;
      probe.delivered = false;
      probe.hold = message => message.payload.query === 'synthetic';
    });
    await input.fill('synthetic');
    await ui.waitForFunction(() => !!globalThis.searchProbe.release);
    await query('restoration probe', 10);
    await ui.evaluate(() => globalThis.searchProbe.release());
    await ui.waitForFunction(() => globalThis.searchProbe.delivered);
    assert.equal(await cards.count(), 10);
    report.checks.push('Out-of-order first and continuation replies cannot replace newer query results');

    const other = await h.surface();
    const current = await rpc('synthetic', {});
    await h.ok({ type: 'RENAME_PROJECT', payload: { projectId: 'project-0', name: 'Renamed synthetic project' } }, other);
    const next = { cursor: current.page.cursor, category: 'results', offset: 25 };
    assert.equal((await rpc('synthetic', next)).error.code, 'SEARCH_EXPIRED');
    const renamedTotal = full.results.filter(item => item.link.projectId === 'project-0').length;
    await query('renamed synthetic project', Math.min(25, renamedTotal), renamedTotal);
    const beforeBookmark = await rpc('synthetic', {});
    await other.evaluate(({ base, folder }) => chrome.bookmarks.create({ parentId: folder, title: 'Synthetic bookmark extra', url: `${base}/extra` }), { base: h.base, folder });
    assert.equal((await rpc('synthetic', { cursor: beforeBookmark.page.cursor, category: 'bookmarks', offset: 25 })).error.code, 'SEARCH_EXPIRED');
    await query('synthetic bookmark', 25, 61);
    report.checks.push('A second document changes project and bookmarks, invalidating old cursors');

    const beforePark = await rpc('synthetic', {});
    const parked = await h.park(['search-lifecycle-one', 'search-lifecycle-two', 'search-lifecycle-three'], 'restore-probe');
    const continuation = initial => ({ cursor: initial.page.cursor, category: 'results', offset: 25 });
    assert.equal((await rpc('synthetic', continuation(beforePark))).error.code, 'SEARCH_EXPIRED');
    await query('search-lifecycle', 3);
    const beforeArchive = await rpc('synthetic', {});
    await cards.first().getByRole('button', { name: 'More link actions' }).click();
    await ui.getByRole('menuitem', { name: 'Archive', exact: true }).click();
    await ui.getByText('archived', { exact: true }).waitFor();
    assert.equal((await rpc('synthetic', continuation(beforeArchive))).error.code, 'SEARCH_EXPIRED');
    await ui.getByText('archived', { exact: true }).locator('xpath=ancestor::article').getByRole('button', { name: 'More link actions' }).click();
    await ui.getByRole('menuitem', { name: 'Return to project' }).click();
    await ui.getByText(/Returned .* to its project/).waitFor();
    const [restoreId, bookmarkId, removeId] = parked.linkIds;
    const beforeRemove = await rpc('synthetic', {});
    await h.ok({ type: 'REMOVE_LINK', payload: { linkId: removeId } }, other);
    await ui.waitForFunction(() => document.querySelectorAll('article').length === 2);
    assert.equal((await rpc('synthetic', continuation(beforeRemove))).error.code, 'SEARCH_EXPIRED');
    const settings = (await h.database()).settings;
    await h.ok({ type: 'UPDATE_SETTINGS', payload: { ...settings, defaultRestoreBehavior: 'open-copy' } }, other);
    const restoreCard = cards.filter({ hasText: 'search-lifecycle-one' });
    await restoreCard.getByRole('button', { name: 'Restore', exact: true }).click();
    await ui.getByText(/Opened a copy of .* remains parked/).waitFor();
    assert.equal((await rpc('search-lifecycle-one')).results[0].link.status, 'parked');
    await h.ok({ type: 'UPDATE_SETTINGS', payload: settings }, other);
    await h.ok({ type: 'RESTORE_LINK', payload: { linkId: restoreId } }, other);
    await ui.waitForFunction(() => document.querySelectorAll('article').length === 1);
    await h.ok({ type: 'BOOKMARK_LINK', payload: { linkId: bookmarkId, parentId: folder } }, other);
    await ui.getByRole('heading', { name: 'Chrome bookmarks · 1 of 1' }).waitFor();
    const converted = await rpc('search-lifecycle');
    assert.equal(converted.results.length, 0);
    assert.equal(converted.bookmarks.length, 1);
    await cards.first().getByRole('button', { name: 'Open bookmark', exact: true }).click();
    await ui.waitForFunction(async url => (await chrome.tabs.query({})).some(tab => (tab.pendingUrl || tab.url) === url), converted.bookmarks[0].url);
    await other.close();
    report.checks.push('Search refreshes after parking, archive, unarchive, removal, restore and conversion, and supports copies and opening bookmarks');
  }
  const file = path.join(h.output, 'search-ui.json');
  await fs.writeFile(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks, file }));
} finally {
  await h.close();
}
