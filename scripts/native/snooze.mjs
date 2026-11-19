import assert from 'node:assert/strict';
import { createHarness, navigateSidebar, poll } from './harness.mjs';

const h = await createHarness();
const { page } = h;
const checks = [];
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const HOUR = 3_600_000;
const alarms = () => page.evaluate(async () => (await chrome.alarms.getAll()).map(alarm => alarm.name));

try {
  const link = (id, title, extra = {}) => ({
    id, sessionId: `s-${id}`, projectId: 'legacy-inbox', title, url: `https://example.invalid/${id}`,
    normalizedUrl: `https://example.invalid/${id}`, domain: 'example.invalid', status: 'parked', pinnedBeforeParking: false,
    createdAt: iso(-48 * HOUR), updatedAt: iso(-48 * HOUR), ...extra,
  });
  const links = [
    link('due', 'Due link', { reminderAt: iso(-2 * HOUR), reminderNotifiedAt: iso(-2 * HOUR) }),
    link('plain', 'Plain link'),
  ];
  await h.seed({
    projects: [{ id: 'legacy-inbox', name: 'Inbox', isInbox: true, createdAt: iso(-48 * HOUR), updatedAt: iso(-48 * HOUR) }],
    sessions: links.map(item => ({ id: item.sessionId, projectId: 'legacy-inbox', createdAt: iso(-48 * HOUR), updatedAt: iso(-48 * HOUR) })),
    links,
    settings: { schemaVersion: 3, defaultProjectId: 'legacy-inbox', includePinnedTabsByDefault: false, confirmBeforeBulkClose: true, notificationsEnabled: false, defaultRestoreBehavior: 'restore-and-remove', displayDensity: 'comfortable', defaultRestoreMode: 'normal', trackingParamsToRemove: [] },
  });

  await page.setViewportSize({ width: 360, height: 800 });
  await page.reload();
  await navigateSidebar(page, 'Today');
  await page.getByRole('heading', { name: 'Due link' }).waitFor();

  // Snooze to tomorrow morning from a due card.
  await page.getByRole('button', { name: 'More link actions' }).click();
  await page.getByRole('button', { name: 'Snooze…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('heading', { name: /Snooze “Due link”/ }).waitFor();
  assert.equal(await dialog.getByRole('button', { name: /^In 1 hour/ }).count(), 1);
  await page.screenshot({ path: `${h.output}/snooze-360.png` });
  await dialog.getByRole('button', { name: /^Tomorrow morning/ }).click();
  await page.getByText(/Snoozed “Due link” until/).waitFor();
  await page.getByText('Nothing due').waitFor();
  const expected = await page.evaluate(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9).toISOString(); });
  const snoozed = (await h.database()).links.find(item => item.id === 'due');
  assert.equal(snoozed.reminderAt, expected);
  assert.equal(snoozed.reminderNotifiedAt, undefined, 'A snoozed reminder is pending again');
  await poll(alarms, names => names.includes('linkshelf-reminder:due'), 'alarm scheduled for the snoozed link');
  checks.push('Snoozing a due link moves its reminder to tomorrow 9:00, makes it pending and schedules the alarm');

  // Set a custom reminder on a saved link, then clear it.
  await navigateSidebar(page, 'Saved');
  await page.getByLabel('Project', { exact: true }).selectOption('legacy-inbox');
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Plain link', exact: true }) });
  await card.waitFor();
  await card.getByRole('button', { name: 'More link actions' }).click();
  await page.getByRole('button', { name: 'Remind me…' }).click();
  const custom = await page.evaluate(() => { const d = new Date(Date.now() + 3 * 86_400_000); d.setSeconds(0, 0); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; });
  await dialog.getByLabel('Pick a date and time').fill(custom);
  await dialog.getByRole('button', { name: 'Set reminder' }).click();
  await page.getByText(/Reminder set for “Plain link”/).waitFor();
  const set = (await h.database()).links.find(item => item.id === 'plain');
  assert.equal(set.reminderAt, await page.evaluate(value => new Date(value).toISOString(), custom));

  await card.getByRole('button', { name: 'More link actions' }).click();
  await page.getByRole('button', { name: 'Change reminder' }).click();
  await dialog.getByRole('button', { name: 'Clear reminder' }).click();
  await page.getByText(/Cleared the reminder for “Plain link”/).waitFor();
  assert.equal((await h.database()).links.find(item => item.id === 'plain').reminderAt, undefined);
  await poll(alarms, names => !names.includes('linkshelf-reminder:plain'), 'alarm removed');
  checks.push('A custom reminder can be set on a saved link and cleared again');

  // Past times are rejected by the dialog.
  await card.getByRole('button', { name: 'More link actions' }).click();
  await page.getByRole('button', { name: 'Remind me…' }).click();
  await dialog.getByLabel('Pick a date and time').fill(await page.evaluate(() => { const d = new Date(Date.now() - 86_400_000); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }));
  await dialog.getByRole('button', { name: 'Set reminder' }).click();
  await dialog.getByRole('alert').waitFor();
  assert.equal((await h.database()).links.find(item => item.id === 'plain').reminderAt, undefined);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  checks.push('A reminder in the past is rejected and nothing changes');

  assert.deepEqual(h.requests, []);
  console.log(JSON.stringify({ chrome: h.context.browser().version(), checks, output: h.output }));
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 1500));
  throw error;
} finally {
  await h.close();
}
