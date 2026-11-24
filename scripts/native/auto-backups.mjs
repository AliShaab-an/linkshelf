import assert from 'node:assert/strict';
import { createHarness, navigateSidebar, poll } from './harness.mjs';

const h = await createHarness();
const { page } = h;
const checks = [];
const KEY = 'linkshelfAutoBackups';
const stored = () => page.evaluate(async key => (await chrome.storage.local.get(key))[key], KEY);
const runDailyAlarm = () => page.evaluate(() => chrome.alarms.create('linkshelf-auto-backup', { when: Date.now() + 150 }));
const panel = page.getByRole('region', { name: 'Automatic backups' });
const iso = new Date().toISOString();

const databaseWith = titles => ({
  projects: [{ id: 'legacy-inbox', name: 'Inbox', isInbox: true, createdAt: iso, updatedAt: iso }],
  sessions: [{ id: 's1', projectId: 'legacy-inbox', createdAt: iso, updatedAt: iso }],
  links: titles.map((title, index) => ({
    id: `l${index}`, sessionId: 's1', projectId: 'legacy-inbox', title, url: `https://example.invalid/${index}`,
    normalizedUrl: `https://example.invalid/${index}`, domain: 'example.invalid', status: 'parked', pinnedBeforeParking: false,
    createdAt: iso, updatedAt: iso,
  })),
  settings: { schemaVersion: 3, defaultProjectId: 'legacy-inbox', includePinnedTabsByDefault: false, confirmBeforeBulkClose: true, notificationsEnabled: false, defaultRestoreBehavior: 'restore-and-remove', displayDensity: 'comfortable', defaultRestoreMode: 'normal', trackingParamsToRemove: [] },
});
const titlesOf = async () => (await h.database()).links.map(link => link.title).sort();

try {
  await page.setViewportSize({ width: 320, height: 800 });
  await navigateSidebar(page, 'Your data');
  await panel.waitFor();
  assert.equal(await panel.getByRole('checkbox', { name: 'Keep automatic backups' }).isChecked(), true);
  await panel.getByText(/No automatic backups yet/).waitFor();
  checks.push('Automatic backups are on by default and start empty');

  // A daily backup is made by the alarm and stored under its own key.
  const emptyBackup = (await h.ok({ type: 'EXPORT_DATA' })).backup;
  await h.seed(databaseWith(['Alpha']));
  await runDailyAlarm();
  const first = await poll(stored, value => value?.backups?.length === 1, 'daily backup stored');
  assert.deepEqual(first.backups[0].backup.database.links.map(link => link.title), ['Alpha']);
  assert.equal(first.backups[0].reason, 'daily');
  checks.push('The daily alarm stores a backup containing the current library');

  // Unchanged data is not backed up again.
  await runDailyAlarm();
  await page.waitForTimeout(800);
  assert.equal((await stored()).backups.length, 1);
  checks.push('Running again with unchanged data does not add a duplicate');

  // Replacing everything keeps a copy of what was there first.
  await h.seed(databaseWith(['Alpha', 'Beta']));
  await page.reload();
  await navigateSidebar(page, 'Your data');
  await page.getByLabel('Choose backup file').setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(emptyBackup)) });
  await page.getByRole('button', { name: 'Replace all' }).click();
  await page.getByRole('button', { name: 'Replace LinkShelf data' }).click();
  await page.getByText(/Backup restored/).waitFor();
  assert.deepEqual(await titlesOf(), []);
  const afterReplace = await poll(stored, value => value?.backups?.length === 2, 'before-import backup stored');
  assert.equal(afterReplace.backups[0].reason, 'before-import');
  assert.deepEqual(afterReplace.backups[0].backup.database.links.map(link => link.title).sort(), ['Alpha', 'Beta']);
  checks.push('Replacing data first saves a before-import backup');

  // Restore that backup through the normal import preview.
  await page.reload();
  await navigateSidebar(page, 'Your data');
  await panel.getByText('Before replacing data').first().waitFor();
  await panel.getByRole('button', { name: /^Restore automatic backup/ }).first().click();
  await panel.getByText(/Loaded below/).waitFor();
  await page.getByRole('button', { name: 'Replace all' }).click();
  await page.getByRole('button', { name: 'Replace LinkShelf data' }).click();
  await page.getByText(/Backup restored: 2 links loaded/).waitFor();
  assert.deepEqual(await titlesOf(), ['Alpha', 'Beta']);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  checks.push('An automatic backup restores through the standard preview and confirmation');

  // Delete one, then turning off deletes the rest.
  await page.reload();
  await navigateSidebar(page, 'Your data');
  const before = (await stored()).backups.length;
  await panel.getByRole('button', { name: /^Delete automatic backup/ }).first().click();
  await poll(stored, value => value.backups.length === before - 1, 'one backup deleted');
  await panel.getByRole('checkbox', { name: 'Keep automatic backups' }).click();
  await panel.getByText(/Automatic backups are off and the saved copies were deleted/).waitFor();
  assert.deepEqual((await stored()).backups, []);
  assert.equal((await stored()).enabled, false);
  await runDailyAlarm();
  await page.waitForTimeout(800);
  assert.deepEqual((await stored()).backups, []);
  checks.push('Delete removes one backup; turning off deletes all and stops new ones');

  assert.deepEqual(h.requests, []);
  console.log(JSON.stringify({ chrome: h.context.browser().version(), checks, output: h.output }));
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 1500));
  throw error;
} finally {
  await h.close();
}
