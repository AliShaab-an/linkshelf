import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createHarness, poll } from './harness.mjs';
import { backup, library } from './fixtures.mjs';

const h = await createHarness();
const timeoutMs = process.argv.includes('--performance') ? 900000 : 300000;
const watchdog = setTimeout(() => { console.error('Native suite exceeded its execution limit'); void h.close(); process.exitCode = 1; }, timeoutMs);
watchdog.unref();
const results = {
  startedAt: new Date().toISOString(), browser: h.context.browser().version(), node: process.version,
  platform: process.platform, checks: [], ui: [], performance: [],
  limitations: [
    'Synthetic data and disposable profiles only. Extension HTML tabs exercise page code; toolbar popup and docked side-panel gestures remain manual.',
    'Chrome notification acceptance/acknowledgment is measurable; visible OS notification delivery is not established.',
    'Storage and permission failures and concurrency barriers are injected explicitly. Actual quota, tabs, bookmarks, alarms, storage and worker stop/restart use Chrome APIs.',
    'Historical fixtures represent supported schemas; reload and browser restart are not an upgrade from a signed Store package.',
    'No power-loss or exactly-once browser-side-effect guarantee across a worker crash.',
  ],
};
const check = label => { results.checks.push(label); console.log('PASS', label); };
const request = (type, payload, page) => h.rpc({ type, ...(payload ? { payload } : {}) }, page);
const ok = (type, payload, page) => h.ok({ type, ...(payload ? { payload } : {}) }, page);
const tabs = () => h.page.evaluate(() => chrome.tabs.query({}));
// Chrome regenerates the virtual root's dateAdded across browser launches.
const bookmarkContents = tree => tree.map(({ id, parentId, title, url, dateAdded, children }) => ({
  id, parentId, title, url, ...(id !== '0' ? { dateAdded } : {}),
  ...(children ? { children: bookmarkContents(children) } : {}),
}));
const update = async patch => ok('UPDATE_SETTINGS', { ...(await h.database()).settings, ...patch });
const linksFor = async result => (await h.database()).links.filter(link => result.linkIds.includes(link.id));
async function failNextWrite() {
  await h.worker().evaluate(() => {
    const original = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.set = async () => { chrome.storage.local.set = original; throw new Error('Injected verification failure'); };
  });
}
async function hold(api, method) {
  await h.worker().evaluate(({ api, method }) => {
    const target = chrome[api];
    const original = target[method].bind(target);
    let entered, release;
    const waiting = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    let first = true;
    target[method] = async (...args) => { if (first) { first = false; entered(); await gate; } return original(...args); };
    globalThis.releaseTestGate = { waiting, release, target, original, method };
  }, { api, method });
}
const entered = () => h.worker().evaluate(() => globalThis.releaseTestGate.waiting);
const release = () => h.worker().evaluate(() => { const g = globalThis.releaseTestGate; g.target[g.method] = g.original; g.release(); });

try {
  await poll(tabs, list => list.some(tab => tab.url?.endsWith('/onboarding.html')), 'Fresh installation opens onboarding');
  const onboarding = h.context.pages().find(page => page.url().endsWith('/onboarding.html'));
  assert.ok(onboarding);
  await onboarding.getByRole('heading').first().waitFor();
  const popup = await h.surface('popup');
  await popup.getByRole('heading', { name: 'Park this tab', exact: true }).waitFor();
  await popup.close();
  await h.page.getByText('This project is empty', { exact: true }).waitFor();
  await update({ notificationsEnabled: false });
  check('Fresh install opens onboarding; popup and side-panel documents render');

  // A: Real tab closure, cross-feature lifecycle, and a separate clean library.
  const { project } = await ok('CREATE_PROJECT', { name: 'Synthetic lifecycle Ω' });
  const destination = (await ok('CREATE_PROJECT', { name: 'Synthetic later' })).project;
  await ok('RENAME_PROJECT', { projectId: destination.id, name: 'Later renamed Ω' });
  await update({ defaultProjectId: project.id });
  const parked = await h.park(['life-a', 'life-b', 'life-c'], project.id, { note: 'Shared Ω lifecycle note', reminderAt: '2099-01-01T10:00:00.000Z' });
  const [moved, archived, restored] = await linksFor(parked);
  assert.equal((await ok('SEARCH_LINKS', { query: 'lifecycle Ω' })).results.length, 3);
  await ok('MOVE_LINK', { linkId: moved.id, projectId: destination.id });
  await ok('ARCHIVE_LINK', { linkId: archived.id });
  const restoration = await ok('RESTORE_SESSION', { sessionId: parked.sessionId });
  assert.deepEqual(restoration.openedLinkIds, [restored.id]);
  assert.equal((await tabs()).filter(tab => (tab.pendingUrl || tab.url) === restored.url).length, 1);
  assert.equal((await ok('SEARCH_LINKS', { query: 'lifecycle Ω' })).results.length, 2);
  const exported = (await ok('EXPORT_DATA')).backup;
  const independent = await createHarness();
  try { await independent.import(exported); assert.deepEqual(await independent.database(), exported.database); }
  finally { await independent.close(); }
  await h.import(exported, 'merge');
  assert.deepEqual(await h.database(), exported.database);
  await ok('DELETE_PROJECT', { projectId: project.id });
  const afterDelete = await h.database();
  assert.equal(afterDelete.settings.defaultProjectId, 'inbox');
  assert.ok(afterDelete.links.filter(link => link.id !== moved.id).every(link => link.projectId === 'inbox'));
  check('A: park/search/move/archive/session restore/export/independent-profile replace/idempotent merge/project deletion preserve metadata');

  // B: Reminders are reconciled from stored state after actual worker termination.
  const reminder = await h.park(['reminder-a', 'reminder-b', 'reminder-c'], 'inbox', { reminderAt: '2099-01-01T10:00:00.000Z' });
  const reminderLinks = await linksFor(reminder);
  await ok('MOVE_LINK', { linkId: reminderLinks[0].id, projectId: destination.id });
  await ok('RESTORE_LINK', { linkId: reminderLinks[1].id });
  await update({ notificationsEnabled: true });
  const alarmList = () => h.page.evaluate(() => chrome.alarms.getAll());
  assert.ok((await alarmList()).length >= 2);
  await h.page.evaluate(async () => { for (const alarm of await chrome.alarms.getAll()) await chrome.alarms.clear(alarm.name); });
  await h.stopWorker();
  await poll(alarmList, alarms => alarms.length >= 2, 'Worker repairs missing reminder alarms');
  const due = await h.database();
  for (const link of due.links.filter(link => reminder.linkIds.includes(link.id))) link.reminderAt = '2020-01-01T00:00:00.000Z';
  await h.seed(due);
  const today = await ok('GET_DUE_REMINDER_LINKS');
  assert.equal(today.links.filter(link => reminder.linkIds.includes(link.id)).length, 2);
  await poll(h.database, db => db.links.filter(link => reminder.linkIds.includes(link.id) && link.status === 'parked').every(link => link.reminderNotifiedAt), 'Chrome accepts due notifications and acknowledgments persist');
  const beforeNotifications = await h.page.evaluate(() => chrome.notifications.getAll());
  await h.stopWorker(); await ok('GET_DUE_REMINDER_LINKS');
  assert.deepEqual(await h.page.evaluate(() => chrome.notifications.getAll()), beforeNotifications);
  await h.restart();
  await ok('GET_DUE_REMINDER_LINKS');
  assert.ok((await h.database()).links.filter(link => reminder.linkIds.includes(link.id) && link.status === 'parked').every(link => link.reminderNotifiedAt));
  check('B: move/partial restore/missing alarm repair/overdue notification acknowledgment survive worker and browser restart');

  // C: Two real extension documents with deterministic injected API barriers.
  await update({ notificationsEnabled: false });
  const other = await h.surface();
  const concurrent = await h.park(['concurrent-a'], 'inbox');
  const [link] = await linksFor(concurrent);
  await hold('tabs', 'create');
  const first = request('RESTORE_LINK', { linkId: link.id }); await entered();
  assert.equal((await request('RESTORE_LINK', { linkId: link.id }, other)).error.code, 'OPERATION_IN_PROGRESS');
  await release(); assert.equal((await first).success, true);
  assert.equal((await tabs()).filter(tab => (tab.pendingUrl || tab.url) === link.url).length, 1);
  const folder = await h.page.evaluate(() => chrome.bookmarks.create({ title: 'Disposable LinkShelf test folder' }));
  const bookmarkResult = await h.park(['bookmark-a'], 'inbox');
  const [bookmarkLink] = await linksFor(bookmarkResult);
  await hold('bookmarks', 'create');
  const conversion = request('BOOKMARK_LINK', { linkId: bookmarkLink.id, parentId: folder.id }); await entered();
  assert.equal((await request('BOOKMARK_LINK', { linkId: bookmarkLink.id, parentId: folder.id }, other)).error.code, 'OPERATION_IN_PROGRESS');
  await release(); assert.equal((await conversion).success, true);
  assert.equal((await h.page.evaluate(id => chrome.bookmarks.getChildren(id), folder.id)).length, 1);
  const duplicateBookmark = await h.park(['bookmark-a'], 'inbox');
  assert.equal((await request('BOOKMARK_LINK', { linkId: duplicateBookmark.linkIds[0], parentId: folder.id })).error.code, 'DUPLICATE_BOOKMARK');
  assert.equal((await h.database()).links.find(item => item.id === duplicateBookmark.linkIds[0]).status, 'parked');
  const recoveryResult = await h.park(['restore-write-failure'], 'inbox');
  const [recoveryLink] = await linksFor(recoveryResult);
  await failNextWrite();
  assert.deepEqual((await request('RESTORE_LINK', { linkId: recoveryLink.id })).opened, true);
  assert.equal((await ok('RESTORE_LINK', { linkId: recoveryLink.id }, other)).restored, true);
  assert.equal((await tabs()).filter(tab => (tab.pendingUrl || tab.url) === recoveryLink.url).length, 1);
  await update({ defaultRestoreBehavior: 'open-copy' });
  const copies = await h.park(['keep-parked'], 'inbox');
  await ok('RESTORE_LINK', { linkId: copies.linkIds[0] });
  assert.equal((await h.database()).links.find(item => item.id === copies.linkIds[0]).status, 'parked');
  await update({ defaultRestoreBehavior: 'restore-and-remove' });
  const targeting = await h.park(['window-target'], 'inbox');
  const origin = await h.page.evaluate(() => chrome.windows.getCurrent());
  const targetWindow = await h.page.evaluate(() => chrome.windows.create({ url: 'about:blank', focused: false }));
  await other.evaluate(async windowId => { const tab = await chrome.tabs.getCurrent(); await chrome.tabs.move(tab.id, { windowId, index: -1 }); }, targetWindow.id);
  await hold('tabs', 'create');
  const targetRestore = request('RESTORE_LINK', { linkId: targeting.linkIds[0] }, other); await entered();
  await h.page.evaluate(windowId => chrome.windows.update(windowId, { focused: true }), origin.id);
  await release(); assert.equal((await targetRestore).success, true);
  const targetedLink = (await linksFor(targeting))[0];
  assert.equal((await tabs()).find(tab => (tab.pendingUrl || tab.url) === targetedLink.url).windowId, targetWindow.id);
  await other.close();
  check('C: overlapping restore/bookmark requests create once; duplicate URL preserves parked data; confirmed-open receipt avoids reopening; Keep Parked Copies and sender-window targeting survive focus changes');

  // D: Actual invalid storage, worker restart, download, cancel and confirmation.
  const trusted = (await ok('EXPORT_DATA')).backup;
  const malformed = { settings: { schemaVersion: 999 }, privateNote: 'SYNTHETIC_PRIVATE_RECOVERY_VALUE' };
  assert.equal((await h.seed(malformed)).status.state, 'recovery');
  await h.stopWorker();
  await h.page.reload();
  await h.page.getByRole('heading', { name: 'Stored data needs attention' }).waitFor();
  await h.page.getByText('Storage diagnostics', { exact: true }).click();
  assert.ok(!(await h.page.locator('body').innerText()).includes(malformed.privateNote));
  await h.page.screenshot({ path: path.join(h.output, 'recovery.png'), fullPage: true });
  const downloadEvent = h.page.waitForEvent('download');
  await h.page.getByRole('button', { name: 'Export raw recovery data', exact: true }).click();
  const rawPath = path.join(h.output, 'synthetic-raw-recovery.json');
  await (await downloadEvent).saveAs(rawPath);
  const raw = JSON.parse(await fs.readFile(rawPath, 'utf8'));
  assert.deepEqual(raw.rawValue, malformed);
  assert.equal((await request('PREVIEW_IMPORT_DATA', { backup: raw, mode: 'replace' })).success, false);
  await h.page.getByLabel('I saved the raw recovery file securely.').check();
  await h.page.locator('input[type=file]').setInputFiles({ name: 'trusted.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(trusted)) });
  await h.page.getByRole('button', { name: 'Review recovery backup', exact: true }).click();
  await h.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(await h.raw(), malformed);
  await h.page.getByRole('button', { name: 'Review recovery backup', exact: true }).click();
  await h.page.getByRole('button', { name: 'Replace stored data from backup', exact: true }).click();
  await poll(h.raw, db => isDeepStrictEqual(db, trusted.database), 'Confirmed recovery restores trusted backup');
  await h.stopWorker();
  assert.deepEqual(await h.database(), trusted.database);
  const invalid = structuredClone(trusted); invalid.database.links[0].projectId = 'missing';
  assert.equal((await request('PREVIEW_IMPORT_DATA', { backup: invalid, mode: 'replace' })).success, false);
  const beforeQuota = await h.database();
  const tooBig = backup(library(1)); tooBig.database.links[0].note = 'x'.repeat(11 * 1024 * 1024);
  const quotaPreview = await ok('PREVIEW_IMPORT_DATA', { backup: tooBig, mode: 'replace' });
  const quota = await request('IMPORT_DATA', { backup: tooBig, mode: 'replace', revisionToken: quotaPreview.preview.revisionToken });
  assert.equal(quota.success, false); assert.match(quota.error.message, /storage space/);
  assert.deepEqual(await h.database(), beforeQuota);
  check('D: corruption survives restart; raw download is exact/private; cancel preserves raw; confirmed recovery succeeds; invalid relations and actual Chrome quota failure preserve data');

  // E: Historical shapes, native storage migration/reload/restart, unrelated keys/bookmarks.
  const uiState = { lastSection: 'projects', selectedProjectId: 'legacy-project', sessionOrder: 'oldest', expandedSessionIds: ['legacy-session'] };
  await h.page.evaluate(value => chrome.storage.local.set({ linkshelfUiState: value, syntheticUnrelated: 'preserve' }), uiState);
  const bookmarksBefore = bookmarkContents(await h.page.evaluate(() => chrome.bookmarks.getTree()));
  for (const version of [1, 2]) {
    const historical = library(4, version);
    await h.seed(historical); await h.stopWorker();
    const expected = structuredClone(historical);
    expected.settings = { ...expected.settings, schemaVersion: 2, ...(version === 1 ? { displayDensity: 'comfortable', defaultRestoreMode: 'normal' } : {}) };
    assert.deepEqual(await h.database(), expected);
    await h.import(backup(historical));
    assert.deepEqual(await h.database(), expected);
    await h.page.reload();
    assert.deepEqual(await h.database(), expected);
    check(`E${version}: representative schema-${version} native storage and backup preserve IDs/metadata/history/settings through migration and document reload`);
  }
  await h.restart();
  assert.deepEqual(await h.database(), library());
  assert.equal((await h.page.evaluate(() => chrome.storage.local.get('syntheticUnrelated'))).syntheticUnrelated, 'preserve');
  assert.deepEqual(bookmarkContents(await h.page.evaluate(() => chrome.bookmarks.getTree())), bookmarksBefore);
  check('E: browser restart retains migrated library and unrelated local key; backup/recovery leave native bookmarks untouched');

  // UI smoke: use real page DOM; record findings instead of concealing failures.
  for (const width of [320, 400, 800]) {
    await h.page.setViewportSize({ width, height: 800 });
    for (const name of ['Projects', 'Today', 'Review', 'Search', 'Archive', 'Settings']) {
      await h.page.getByRole('button', { name, exact: true }).click();
      await h.page.getByRole('button', { name, exact: true }).getAttribute('aria-current').then(value => assert.equal(value, 'page'));
      results.ui.push({ width, section: name, ...await h.page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, headings: [...document.querySelectorAll('h1,h2')].map(el => el.textContent) })) });
    }
    await h.page.screenshot({ path: path.join(h.output, `settings-${width}.png`), fullPage: true });
  }
  await h.page.getByRole('button', { name: 'Projects', exact: true }).click();
  await h.page.getByLabel('Project', { exact: true }).selectOption('legacy-project');
  await h.page.getByLabel('Filter this project').fill('Synthetic');
  await h.page.keyboard.press('Tab');
  assert.ok(await h.page.evaluate(() => document.activeElement !== document.body));
  const modalTrigger = h.page.getByRole('button', { name: 'More link actions', exact: true }).first();
  await modalTrigger.click();
  await h.page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
  await h.page.getByRole('dialog').waitFor();
  results.ui.push({ modalInitialFocusInside: await h.page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')) });
  await h.page.keyboard.press('Tab'); await h.page.keyboard.press('Tab');
  results.ui.push({ modalFocusContainedAfterTwoTabs: await h.page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')) });
  await h.page.keyboard.press('Escape');
  await h.page.getByRole('dialog').waitFor({ state: 'detached' });
  results.ui.push({ modalReturnFocusConnected: await h.page.evaluate(() => document.activeElement !== document.body && !!document.activeElement?.isConnected) });
  await h.page.evaluate(async () => { const tab = await chrome.tabs.getCurrent(); await chrome.tabs.setZoom(tab.id, 2); });
  results.ui.push({ zoom: 2, ...await h.page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, pixelRatio: devicePixelRatio })) });
  results.ui.push({ zoomControls: await h.page.locator('header button').evaluateAll(buttons => buttons.map(button => {
    const rect = button.getBoundingClientRect(); return { name: button.getAttribute('aria-label') || button.textContent, left: rect.left, right: rect.right, viewport: innerWidth };
  })) });
  await h.page.screenshot({ path: path.join(h.output, 'projects-zoom-200.png'), fullPage: true });
  await h.page.evaluate(async () => { const tab = await chrome.tabs.getCurrent(); await chrome.tabs.setZoom(tab.id, 1); });
  const long = await h.database();
  long.projects[1].name = 'Long synthetic project Ω '.repeat(20);
  long.links[0].title = 'Long synthetic title Ω '.repeat(30);
  long.links[0].url = h.base + '/long/' + 'x'.repeat(1000);
  long.links[0].note = 'Long synthetic note Ω '.repeat(100);
  await h.seed(long); await h.page.reload();
  await h.page.getByText(long.links[0].title, { exact: true }).waitFor();
  await h.page.setViewportSize({ width: 320, height: 800 });
  results.ui.push({ longContent: true, ...await h.page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth })) });
  await h.page.screenshot({ path: path.join(h.output, 'long-content-320.png'), fullPage: true });
  await h.page.getByRole('button', { name: 'Settings', exact: true }).click();
  await h.page.getByRole('button', { name: 'Save settings', exact: true }).waitFor();
  const exportDownload = h.page.waitForEvent('download');
  await h.page.getByRole('button', { name: 'Export LinkShelf data', exact: true }).click();
  const exportPath = path.join(h.output, 'synthetic-standard-backup.json');
  await (await exportDownload).saveAs(exportPath);
  assert.deepEqual(JSON.parse(await fs.readFile(exportPath, 'utf8')).database, await h.database());
  const fileInput = h.page.locator('input[type=file]');
  await fileInput.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') });
  await h.page.getByText(/This file could not be read as JSON/).waitFor();
  const beforeLarge = await h.database();
  await fileInput.setInputFiles({ name: 'oversized.json', mimeType: 'application/json', buffer: Buffer.alloc(32 * 1024 * 1024 + 1, 32) });
  await h.page.getByText(/Choose a LinkShelf JSON backup of 32 MiB or less/).waitFor();
  assert.deepEqual(await h.database(), beforeLarge);
  await fileInput.setInputFiles(exportPath);
  for (const mode of ['Merge', 'Replace all']) {
    await h.page.getByRole('button', { name: mode, exact: true }).click();
    await h.page.getByRole('alertdialog').waitFor();
    await h.page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.deepEqual(await h.database(), beforeLarge);
  }
  await h.page.getByRole('button', { name: 'Projects', exact: true }).click();
  // Probe existing remote favicon behavior without allowing an external request.
  const remote = await h.database(); remote.links[0].faviconUrl = 'https://example.invalid/privacy-probe.png';
  await h.seed(remote); await h.page.reload();
  await poll(() => h.requests, urls => urls.some(url => url.includes('privacy-probe')), 'Record remote favicon request attempt');
  results.remoteAssetRequests = h.requests;
  check('UI: sections at 320/400/800px; 200% Chrome zoom; long content; modal focus/Escape; actual export; invalid JSON/large-file rejection; import cancellation; remote favicon probe');

  if (process.argv.includes('--performance')) {
    const { measure } = await import('./performance.mjs');
    results.performance = await measure(h);
  }
  results.result = 'passed';
} catch (error) {
  results.result = 'failed'; results.error = error.stack;
  await h.page?.screenshot({ path: path.join(h.output, 'failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  results.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(h.output, 'results.json'), JSON.stringify(results, null, 2));
  await h.close();
  console.log(JSON.stringify({ result: results.result, checks: results.checks.length, output: h.output, error: results.error }, null, 2));
}
