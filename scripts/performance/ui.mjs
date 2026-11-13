import fs from 'node:fs/promises';
import path from 'node:path';

export async function runUI(h, row, { fixture, seed, cleanupTabs, sample, options }) {
  for (const operation of ['projects', 'search', 'searchBroad', 'archive', 'today', 'restoreRefresh']) {
    if (operation === 'searchBroad' && fixture.links.length > 1000) {
      row.measurements['ui.searchBroad'] = { skipped: true, reason: 'Broad DOM workload capped at 1,000 records; broad worker RPC is measured at every size.' };
      continue;
    }
    const section = operation === 'searchBroad' ? 'search' : operation === 'restoreRefresh' ? 'projects' : operation;
    await sample(row, 'ui.' + operation, async () => {
      await h.page.evaluate(({ section, operation }) => chrome.storage.local.set({ linkshelfUiState: {
        lastSection: section, selectedProjectId: operation === 'restoreRefresh' ? 'restore-probe' : 'project-0', sessionOrder: 'newest', expandedSessionIds: [],
      } }), { section, operation });
      const page = await h.context.newPage();
      await page.addInitScript(() => {
        globalThis.__uiProfile = { requests: [], longTasks: [], firstArticleAt: null, lastResponseAt: 0, pending: 0, actionStart: 0 };
        const state = globalThis.__uiProfile;
        new PerformanceObserver(list => { for (const item of list.getEntries()) state.longTasks.push({ start: item.startTime, duration: item.duration }); }).observe({ type: 'longtask', buffered: true });
        const original = chrome.runtime.sendMessage.bind(chrome.runtime);
        chrome.runtime.sendMessage = async (...args) => {
          state.pending++; const start = performance.now();
          let response;
          try { response = await original(...args); return response; }
          finally { state.lastResponseAt = performance.now(); state.pending--; state.requests.push({ type: args[0]?.type, start, end: state.lastResponseAt, results: response?.results?.length, bookmarks: response?.bookmarks?.length }); }
        };
        new MutationObserver(() => { if (state.firstArticleAt === null && document.querySelector('article')) state.firstArticleAt = performance.now(); }).observe(document, { childList: true, subtree: true });
      });
      await page.setViewportSize({ width: 400, height: 800 });
      const cdp = await h.context.newCDPSession(page);
      await cdp.send('Performance.enable');
      const capture = options.profile;
      if (capture) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32768 }); }
      try {
        await page.goto(`chrome-extension://${h.id}/sidepanel.html`);
        await page.getByRole('navigation', { name: 'LinkShelf sections' }).waitFor();
        if (section === 'search') {
          await page.evaluate(() => { globalThis.__uiProfile.actionStart = performance.now(); });
          await page.locator('input[type=search]').fill(operation === 'searchBroad' ? 'synthetic' : fixture.links[1].url);
        }
        // Browser-state polling; explicit debounce is part of user-perceived Search latency.
        await page.waitForFunction(section => globalThis.__uiProfile.pending === 0 &&
          globalThis.__uiProfile.requests.some(item => item.type === ({ projects: 'GET_PARKED_SESSION_GROUPS', search: 'SEARCH_LINKS', archive: 'GET_ARCHIVED_LINKS', today: 'GET_DUE_REMINDER_LINKS' })[section]), section);
        if (section !== 'today') await page.locator('article').first().waitFor({ state: 'visible' });
        if (operation === 'restoreRefresh') {
          await page.locator('article').first().getByRole('button', { name: 'Restore', exact: true }).evaluate(button => {
            const state = globalThis.__uiProfile; state.actionStart = performance.now(); state.requests = []; button.click();
          });
          await page.waitForFunction(() => globalThis.__uiProfile.pending === 0 && document.querySelectorAll('article').length === 9 &&
            globalThis.__uiProfile.requests.some(item => item.type === 'GET_STORAGE_STATUS'));
        }
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const info = await page.evaluate(section => {
          const state = globalThis.__uiProfile;
          const mainEnd = performance.now();
          const dataType = ({ projects: 'GET_PARKED_SESSION_GROUPS', search: 'SEARCH_LINKS', archive: 'GET_ARCHIVED_LINKS', today: 'GET_DUE_REMINDER_LINKS' })[section];
          const dataEnd = state.requests.findLast(item => item.type === dataType)?.end;
          return { ms: mainEnd - state.actionStart, firstArticleAt: state.firstArticleAt, navigationToReadyMs: mainEnd,
            dataResponseToObservedFrameMs: dataEnd === undefined ? null : Math.max(0, mainEnd - dataEnd),
            requests: state.requests, longTasks: state.longTasks, articles: document.querySelectorAll('article').length,
            longTaskMs: state.longTasks.reduce((sum, item) => sum + item.duration, 0) };
        }, section);
        info.heap = await cdp.send('Runtime.getHeapUsage');
        info.metrics = (await cdp.send('Performance.getMetrics')).metrics.filter(item => ['LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration', 'JSHeapUsedSize'].includes(item.name));
        if (capture) {
          const cpu = await cdp.send('Profiler.stop'); const heap = await cdp.send('HeapProfiler.stopSampling');
          const stem = `${row.distribution}-${row.links}-${operation}-${Date.now()}`;
          await fs.writeFile(path.join(h.output, stem + '.cpuprofile'), JSON.stringify(cpu.profile));
          await fs.writeFile(path.join(h.output, stem + '-allocation.json'), JSON.stringify(heap.profile));
          info.profiles = stem;
        }
        return info;
      } finally { await cdp.detach(); await page.close(); }
    }, { repetitions: options.bulkRepetitions, warmups: 1, capture: false,
      reset: operation === 'restoreRefresh' ? async () => { await cleanupTabs(); await seed(); } : undefined });
    if (operation === 'restoreRefresh') await cleanupTabs();
  }
}
