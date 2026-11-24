import assert from 'node:assert/strict';
import path from 'node:path';
import { createHarness, navigateSidebar, poll } from './harness.mjs';

const h = await createHarness();
const { page } = h;
const checks = [];
const KEY = 'linkshelfSnapshots';
const panel = page.getByRole('region', { name: 'Recent window snapshots' });
const toggle = panel.getByRole('checkbox', { name: 'Keep recent window snapshots' });
const stored = () => page.evaluate(async key => (await chrome.storage.local.get(key))[key], KEY);
const alarm = () => page.evaluate(() => chrome.alarms.get('linkshelf-snapshot'));
const openUrls = () => page.evaluate(async () => (await chrome.tabs.query({})).map(tab => tab.url || tab.pendingUrl));
const checkWidth = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

try {
  await page.setViewportSize({ width: 320, height: 760 });
  await navigateSidebar(page, 'Your data');
  await panel.waitFor();

  // Off by default: nothing is stored and no alarm exists.
  assert.equal(await toggle.isChecked(), false);
  assert.equal(await stored(), undefined);
  assert.equal(await alarm(), undefined);
  await panel.getByText(/stores the web addresses and titles of all your open tabs/).waitFor();
  checks.push('Snapshots are off by default, store nothing and schedule no alarm; the privacy notice is visible');

  // Opt in: stored under its own key, periodic alarm created, main database untouched.
  const databaseBefore = JSON.stringify(await h.raw());
  await toggle.click();
  await panel.getByText('Snapshots are on.').waitFor();
  await poll(stored, value => value?.enabled === true, 'snapshot store enabled');
  assert.equal((await alarm())?.periodInMinutes, 5);
  assert.equal(JSON.stringify(await h.raw()), databaseBefore, 'Enabling snapshots does not write the main database');
  await panel.getByText(/No snapshots yet/).waitFor();
  checks.push('Opting in writes only the separate key, creates the 5-minute alarm and leaves the main database unchanged');

  // A second window with two synthetic tabs plus a restricted page; refresh the working copy via the alarm.
  const urls = [`${h.base}/snap-one`, `${h.base}/snap-two`];
  const windowId = await page.evaluate(async urls => (await chrome.windows.create({ url: [...urls, 'chrome://version'], focused: false })).id, urls);
  await poll(openUrls, value => urls.every(url => value.includes(url)), 'snapshot tabs open');
  await page.evaluate(() => chrome.alarms.create('linkshelf-snapshot', { when: Date.now() + 200, periodInMinutes: 5 }));
  const working = await poll(stored, value => value?.working?.windows?.some(window => window.windowId === windowId), 'working copy captured the new window');
  const keptUrls = working.working.windows.flatMap(window => window.tabs.map(tab => tab.url));
  assert.ok(urls.every(url => keptUrls.includes(url)));
  assert.equal(keptUrls.some(url => url.startsWith('chrome:') || url.startsWith('chrome-extension:')), false, 'Restricted pages are never stored');
  checks.push('The alarm refreshes the working copy with http(s) tabs only');

  // Closing that window saves it as a snapshot.
  await page.evaluate(id => chrome.windows.remove(id), windowId);
  const afterClose = await poll(stored, value => value?.history?.length === 1, 'closed window snapshot saved');
  assert.equal(afterClose.history[0].reason, 'window-closed');
  assert.equal(afterClose.history[0].windows[0].tabs.length, 2);
  await page.bringToFront();
  await page.reload();
  await navigateSidebar(page, 'Your data');
  await panel.getByText('Closed window').waitFor();
  await panel.getByText(/2 tabs/).waitFor();
  assert.equal(await checkWidth(), true);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(h.output, 'snapshots-320.png') });
  checks.push('Closing a window saves it as a snapshot that appears in Settings');

  // Restore: explicit confirmation, tabs open in this window, discarded lazily.
  await panel.getByRole('button', { name: /^Restore Closed window/ }).click();
  await panel.getByText(/Open 2 tabs in this window\?/).waitFor();
  await panel.getByRole('button', { name: 'Cancel' }).click();
  assert.equal((await openUrls()).includes(urls[0]), false, 'Cancel opens nothing');
  await panel.getByRole('button', { name: /^Restore Closed window/ }).click();
  await panel.getByRole('button', { name: 'Open tabs' }).click();
  await panel.getByText('Opened 2 tabs.').waitFor();
  await poll(openUrls, value => urls.every(url => value.includes(url)), 'both restored tabs listed');
  checks.push('Restore asks first, opens the snapshot tabs and reports the real count');

  // The backup never contains snapshot data, even for pages that were never saved.
  const backup = JSON.stringify((await h.ok({ type: 'EXPORT_DATA' })).backup);
  assert.equal(backup.includes('snap-one'), false);
  checks.push('JSON backups exclude snapshot data');

  // Delete all keeps the opt-in; turning off deletes everything and removes the alarm.
  await panel.getByRole('button', { name: 'Delete all snapshots' }).click();
  await panel.getByText(/Snapshots deleted/).waitFor();
  assert.deepEqual((await stored()).history, []);
  assert.equal((await stored()).enabled, true);
  await toggle.click();
  await panel.getByText('Snapshots are off and have been deleted.').waitFor();
  assert.deepEqual(await stored(), { version: 1, enabled: false, history: [] });
  assert.equal(await alarm(), undefined);
  assert.deepEqual(h.requests, []);
  checks.push('Delete all keeps snapshots on; turning off deletes the data and clears the alarm');

  console.log(JSON.stringify({ chrome: h.context.browser().version(), checks, output: h.output }));
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 1500));
  throw error;
} finally {
  await h.close();
}
