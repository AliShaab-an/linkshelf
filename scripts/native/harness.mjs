import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';

export async function sectionButton(page, name) {
  const navigation = page.getByRole('navigation', { name: 'LinkShelf sections' });
  await navigation.waitFor();
  const label = name === 'Projects' && await navigation.getByRole('button', { name: 'Saved', exact: true }).count()
    ? 'Saved' : name;
  const button = navigation.getByRole('button', { name: label, exact: true });
  if (!(await button.count())) await navigation.getByRole('button', { name: /^More(?:, current section .+)?$/ }).click();
  return button;
}

const managerSections = { Home: 'home', Library: 'library', Review: 'review', Archive: 'archive', Bin: 'bin', Duplicates: 'duplicates', Settings: 'settings' };

/** The Manager page's link for a section. */
// A link's name may end with a count, such as "Review, 4 waiting".
export const managerLink = (page, name) => page.getByRole('navigation', { name: 'Manager sections' }).getByRole('link', { name: new RegExp(`^${name}(?![A-Za-z])`) });

/**
 * Shows a LinkShelf section in this test page the way it lives in the product:
 * Park, Saved, Search and Today in the sidebar; Home, Review, Archive and Settings on the Manager page.
 */
export async function navigateSidebar(page, name) {
  // Your data and About are pages inside Settings, opened by their address.
  const settingsPage = { 'Your data': 'data', About: 'about' }[name];
  if (settingsPage) {
    await page.goto(new URL(`/manager.html#settings/${settingsPage}`, page.url()).href);
    await poll(() => page.getByRole('navigation', { name: 'Settings groups' }).getByRole('link', { name, exact: true }).getAttribute('aria-current'),
      value => value === 'page', `${name} shown in Settings`);
    return;
  }
  const managerSection = managerSections[name];
  const onManager = new URL(page.url()).pathname === '/manager.html';
  if (managerSection) {
    if (onManager) await managerLink(page, name).click();
    else await page.goto(new URL(`/manager.html#${managerSection}`, page.url()).href);
    await poll(() => managerLink(page, name).getAttribute('aria-current'), value => value === 'page', `${name} shown on the Manager page`);
    return;
  }
  if (onManager) await page.goto(new URL('/sidepanel.html', page.url()).href);
  await (await sectionButton(page, name)).click();
}

/**
 * Chooses a value in a LinkShelf Dropdown (combobox) or SegmentedControl (radiogroup),
 * the way a user would: by clicking. `choice` is an option value, or `{ label }`.
 */
export async function choose(control, choice) {
  const match = typeof choice === 'object'
    ? item => item.filter({ hasText: new RegExp(`^${choice.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })
    : item => item.and(control.page().locator(`[data-value="${String(choice).replace(/"/g, '\\"')}"]`));
  if (await control.getAttribute('role') === 'radiogroup') {
    await match(control.getByRole('radio')).click();
    return;
  }
  // While open, the listbox shares the label, so pin the combobox itself.
  const box = control.and(control.page().getByRole('combobox'));
  const list = control.page().locator(`[id="${await box.getAttribute('aria-controls')}"]`);
  await box.click();
  await match(list.getByRole('option')).click();
  await list.waitFor({ state: 'detached' });
}

/** The value currently chosen in a Dropdown or SegmentedControl. */
export const chosenValue = control => control.getAttribute('data-value');

/** The option labels a Dropdown or SegmentedControl offers. */
export async function optionLabels(control) {
  if (await control.getAttribute('role') === 'radiogroup') return control.getByRole('radio').allTextContents();
  // While open, the listbox shares the label, so pin the combobox itself.
  const box = control.and(control.page().getByRole('combobox'));
  const list = control.page().locator(`[id="${await box.getAttribute('aria-controls')}"]`);
  await box.click();
  const labels = await list.getByRole('option').allTextContents();
  await box.press('Escape');
  await list.waitFor({ state: 'detached' });
  return labels;
}

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

export async function createHarness({ pagePath = 'sidepanel.html', prepareBuild } = {}) {
  const require = createRequire(import.meta.url);
  let chromium;
  try { ({ chromium } = require(process.env.LINKSHELF_PLAYWRIGHT_MODULE || 'playwright')); }
  catch { throw new Error('Install Playwright separately or set LINKSHELF_PLAYWRIGHT_MODULE; see docs/testing.md.'); }
  const output = path.resolve('.output/native-runs', new Date().toISOString().replaceAll(':', '-') + '-' + process.pid);
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'disposable-profile-'));
  async function removeProfile() {
    if (process.env.LINKSHELF_DISCARD_PROFILE !== '1') return;
    const target = await fs.realpath(profile).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (!target) return;
    const relative = path.relative(await fs.realpath(output), target);
    assert.match(relative, /^disposable-profile-[a-z0-9]+$/i, 'Remove only the generated profile inside this run');
    await fs.rm(target, { recursive: true, force: true, maxRetries: 3 });
  }
  const extensionPath = path.join(output, 'built-extension');
  try {
    await fs.access('.output/chrome-mv3/manifest.json');
    await fs.cp('.output/chrome-mv3', extensionPath, { recursive: true });
  } catch {
    await removeProfile();
    throw new Error('Build output is missing or changing. Finish npm run build before starting native tests.');
  }
  try { await prepareBuild?.(extensionPath); } catch (error) { await removeProfile(); throw error; }
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
    await h.page.goto(`chrome-extension://${h.id}/${pagePath}`);
    await h.ok({ type: 'GET_STORAGE_STATUS' });
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
  h.stopWorker = async ({ wake = true } = {}) => {
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
    return wake ? h.ok({ type: 'GET_STORAGE_STATUS' }) : undefined;
  };
  h.restart = async () => { await h.context.close(); await h.start(); };
  h.close = async () => {
    try { await h.context?.close(); }
    finally {
      await new Promise(resolve => server.close(resolve));
      await removeProfile();
    }
  };
  try { await h.start(); } catch (error) { await h.close(); throw error; }
  return h;
}
