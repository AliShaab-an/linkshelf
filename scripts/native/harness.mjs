import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';

export async function poll(read, matches, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let value;
  do {
    value = await read();
    if (matches(value)) return value;
    // Bounded state polling, not a timing assumption about Chrome operations.
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${label}; last value ${JSON.stringify(value)?.slice(0, 240)}`);
}

export async function createHarness() {
  const require = createRequire(import.meta.url);
  let chromium;
  try { ({ chromium } = require(process.env.LINKSHELF_PLAYWRIGHT_MODULE || 'playwright')); }
  catch { throw new Error('Install Playwright separately or set LINKSHELF_PLAYWRIGHT_MODULE; see docs/testing.md.'); }
  const output = path.resolve('.output/native-runs', new Date().toISOString().replaceAll(':', '-') + '-' + process.pid);
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'disposable-profile-'));
  const extensionPath = path.join(output, 'built-extension');
  try {
    await fs.access('.output/chrome-mv3/manifest.json');
    await fs.cp('.output/chrome-mv3', extensionPath, { recursive: true });
  } catch { throw new Error('Build output is missing or changing. Finish npm run build before starting native tests.'); }
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<title>Synthetic ${req.url}</title><p>Disposable LinkShelf test page</p>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const options = {
    headless: process.env.LINKSHELF_HEADED !== '1', acceptDownloads: true,
    ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'],
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}),
  };
  const h = { output, base, requests: [], context: undefined, page: undefined, id: undefined };
  h.start = async () => {
    h.context = await chromium.launchPersistentContext(profile, options);
    h.context.setDefaultTimeout(15000);
    // Only synthetic loopback pages are allowed; record attempted remote assets.
    await h.context.route(/^https?:\/\//, route => {
      if (route.request().url().startsWith(base + '/')) return route.continue();
      h.requests.push(route.request().url());
      return route.abort();
    });
    const cdp = await h.context.browser().newBrowserCDPSession();
    h.id = (await cdp.send('Extensions.loadUnpacked', { path: extensionPath })).id;
    h.page = await h.context.newPage();
    await h.page.goto(`chrome-extension://${h.id}/sidepanel.html`);
    await h.rpc({ type: 'GET_STORAGE_STATUS' });
  };
  h.rpc = (message, page = h.page) => page.evaluate(message => chrome.runtime.sendMessage(message), message);
  h.ok = async (message, page) => {
    const result = await h.rpc(message, page);
    assert.equal(result.success, true, JSON.stringify(result));
    return result;
  };
  h.database = async () => (await h.ok({ type: 'EXPORT_DATA' })).backup.database;
  h.raw = () => h.page.evaluate(async () => (await chrome.storage.local.get('linkshelfDatabase')).linkshelfDatabase);
  h.seed = async value => {
    await h.page.evaluate(value => chrome.storage.local.set({ linkshelfDatabase: value }), value);
    return h.rpc({ type: 'RECHECK_STORAGE' });
  };
  h.worker = () => h.context.serviceWorkers().find(worker => worker.url().startsWith(`chrome-extension://${h.id}/`));
  h.surface = async (name = 'sidepanel') => {
    const page = await h.context.newPage();
    await page.goto(`chrome-extension://${h.id}/${name}.html`);
    return page;
  };
  h.tab = async label => {
    const page = await h.context.newPage();
    await page.goto(base + '/' + label, { waitUntil: 'load' });
    const tab = await h.page.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url), page.url());
    assert.ok(tab, 'Synthetic loaded tab must exist');
    return tab;
  };
  h.park = async (labels, projectId, extra = {}) => {
    const tabs = [];
    for (const label of labels) tabs.push(await h.tab(label));
    const response = await h.ok({ type: 'PARK_SELECTED_TABS', payload: { tabIds: tabs.map(tab => tab.id), projectId, ...extra } });
    assert.deepEqual(response.closedTabIds, tabs.map(tab => tab.id));
    return response;
  };
  h.import = async (backup, mode = 'replace') => {
    const { preview } = await h.ok({ type: 'PREVIEW_IMPORT_DATA', payload: { backup, mode } });
    return h.ok({ type: 'IMPORT_DATA', payload: { backup, mode, revisionToken: preview.revisionToken } });
  };
  h.stopWorker = async () => {
    const cdp = await h.context.newCDPSession(h.page);
    const running = new Promise(resolve => cdp.on('ServiceWorker.workerVersionUpdated', info => {
      const item = info.versions.find(v => v.scriptURL === `chrome-extension://${h.id}/background.js` && v.runningStatus === 'running');
      if (item) resolve(item);
    }));
    let timer;
    try {
      await cdp.send('ServiceWorker.enable');
      const version = await Promise.race([running, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('No running worker version')), 15000); })]);
      clearTimeout(timer);
      const stopped = new Promise(resolve => cdp.on('ServiceWorker.workerVersionUpdated', info => {
        if (info.versions.some(v => v.versionId === version.versionId && v.runningStatus === 'stopped')) resolve();
      }));
      await cdp.send('ServiceWorker.stopWorker', { versionId: version.versionId });
      await Promise.race([stopped, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Worker did not stop')), 15000); })]);
    } finally { clearTimeout(timer); await cdp.detach(); }
    return h.ok({ type: 'GET_STORAGE_STATUS' });
  };
  h.restart = async () => { await h.context.close(); await h.start(); };
  h.close = async () => { await h.context?.close(); await new Promise(resolve => server.close(resolve)); };
  try { await h.start(); } catch (error) { await h.close(); throw error; }
  return h;
}
