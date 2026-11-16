import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { library, backup } from './fixtures.mjs';

// Three sequential samples per API include page/worker messaging and Chrome
// storage. UI events and writes can trigger other extension-page refresh work.
export async function measure(h) {
  const output = [];
  const timed = async action => { const start = performance.now(); await action(); return +(performance.now() - start).toFixed(2); };
  const sample = async action => {
    const ms = [];
    for (let i = 0; i < 3; i++) ms.push(await timed(action));
    return { samplesMs: ms, medianMs: [...ms].sort((a, b) => a - b)[1] };
  };
  for (const count of [100, 1000, 5000, 10000]) {
    const value = library(count);
    for (const link of value.links) { link.status = 'parked'; link.url = `${h.base}/scale/${link.id}`; link.normalizedUrl = link.url; }
    await h.seed(value);
    await h.page.evaluate(() => chrome.storage.local.set({ linkshelfUiState: {
      lastSection: 'projects', selectedProjectId: 'legacy-project', sessionOrder: 'oldest', expandedSessionIds: ['legacy-session'],
    } }));
    const row = { links: count, jsonBytes: Buffer.byteLength(JSON.stringify(value)) };
    row.workerStopAndWakeMs = await timed(() => h.stopWorker());
    row.projects = await sample(() => h.ok({ type: 'GET_PROJECTS' }));
    row.projectGroups = await sample(() => h.ok({ type: 'GET_PARKED_SESSION_GROUPS', payload: { projectId: 'legacy-project' } }));
    row.search = await sample(() => h.ok({ type: 'SEARCH_LINKS', payload: { query: `historical ${count - 1}` } }));
    row.validatingRecheck = await sample(() => h.ok({ type: 'RECHECK_STORAGE' }));
    row.write = await sample(() => h.ok({ type: 'UPDATE_SETTINGS', payload: value.settings }));
    row.export = await sample(async () => {
      const response = await h.ok({ type: 'EXPORT_DATA' });
      assert.equal(response.backup.database.links.length, count);
      JSON.stringify(response.backup); // Include file serialization in Node.
    });
    row.replacePreviewAndImport = await sample(() => h.import(backup(value)));
    row.projectDocumentLoadMs = await timed(async () => {
      await h.page.reload();
      await h.page.getByText('Synthetic historical 0', { exact: true }).waitFor();
    });
    const cdp = await h.context.newCDPSession(h.page);
    row.pageHeap = await cdp.send('Runtime.getHeapUsage');
    await cdp.detach();
    // Three actual creates and verified lifecycle writes, not a 10k-tab stress.
    row.restoreThreeMs = await timed(async () => {
      for (const link of value.links.slice(0, 3)) await h.ok({ type: 'RESTORE_LINK', payload: { linkId: link.id } });
    });
    output.push(row);
    console.log('MEASURE', JSON.stringify(row));
  }
  return output;
}
