import assert from 'node:assert/strict';
import { createHarness, navigateSidebar, poll } from './harness.mjs';

const h = await createHarness();
const { page } = h;
const checks = [];
const ago = days => new Date(Date.now() - days * 86_400_000).toISOString();
const panel = page.getByRole('region', { name: 'Bin', exact: true });

try {
  const link = (id, title, status, extra = {}) => ({
    id, sessionId: `s-${id}`, projectId: 'legacy-inbox', title, url: `https://example.invalid/${id}`,
    normalizedUrl: `https://example.invalid/${id}`, domain: 'example.invalid', status, pinnedBeforeParking: false,
    createdAt: ago(60), updatedAt: ago(60), ...extra,
  });
  const links = [
    link('recent', 'Removed recently', 'removed', { removedAt: ago(5), updatedAt: ago(5) }),
    link('from-archive', 'Removed from archive', 'removed', { removedAt: ago(2), updatedAt: ago(2), archivedAt: ago(10) }),
    link('old', 'Removed long ago', 'removed', { removedAt: ago(40), updatedAt: ago(40) }),
    link('kept', 'Still saved', 'parked'),
  ];
  await h.seed({
    projects: [{ id: 'legacy-inbox', name: 'Inbox', isInbox: true, createdAt: ago(60), updatedAt: ago(60) }],
    sessions: links.map(item => ({ id: item.sessionId, projectId: 'legacy-inbox', createdAt: ago(60), updatedAt: ago(60) })),
    links,
    settings: { schemaVersion: 3, defaultProjectId: 'legacy-inbox', includePinnedTabsByDefault: false, confirmBeforeBulkClose: true, notificationsEnabled: false, defaultRestoreBehavior: 'restore-and-remove', displayDensity: 'comfortable', defaultRestoreMode: 'normal', trackingParamsToRemove: [] },
  });

  await page.setViewportSize({ width: 320, height: 800 });
  await navigateSidebar(page, 'Bin');
  await panel.waitFor();
  await panel.getByText('Removed recently').waitFor();
  await panel.getByText('Removed from archive').waitFor();
  assert.equal(await panel.getByText('Removed long ago').count(), 0, 'Links older than 30 days are gone');
  assert.equal((await h.database()).links.some(item => item.id === 'old'), false, 'and were deleted from storage');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${h.output}/trash-320.png` });
  checks.push('The Bin tab lists recent removals and deletes those older than 30 days');

  // Recover: goes back to where it came from.
  await panel.getByRole('button', { name: 'Recover Removed recently', exact: true }).click();
  await panel.getByText('Recovered “Removed recently”.').waitFor();
  await poll(() => h.database(), db => db.links.find(item => item.id === 'recent')?.status === 'parked', 'recovered link is parked');
  await panel.getByRole('button', { name: 'Recover Removed from archive', exact: true }).click();
  await poll(() => h.database(), db => db.links.find(item => item.id === 'from-archive')?.status === 'archived', 'archived link returns to the archive');
  assert.equal((await h.database()).links.find(item => item.id === 'from-archive').removedAt, undefined);
  await panel.getByRole('heading', { name: 'The bin is empty' }).waitFor();
  checks.push('Recover returns links to their project or the archive');

  // Permanent delete needs confirmation; empty trash too.
  await page.evaluate(async () => { await chrome.runtime.sendMessage({ type: 'REMOVE_LINK', payload: { linkId: 'recent' } }); });
  await panel.getByText('Removed recently').waitFor();
  await panel.getByRole('button', { name: 'Delete Removed recently permanently', exact: true }).click();
  await panel.getByRole('button', { name: 'Cancel' }).click();
  assert.ok((await h.database()).links.some(item => item.id === 'recent'), 'Cancel keeps the link');
  await panel.getByRole('button', { name: 'Delete Removed recently permanently', exact: true }).click();
  await panel.getByRole('button', { name: 'Delete permanently' }).click();
  await panel.getByText('Link deleted permanently.').waitFor();
  assert.equal((await h.database()).links.some(item => item.id === 'recent'), false);
  checks.push('Permanent delete asks first and then removes the link');

  assert.ok((await h.database()).links.some(item => item.id === 'kept'), 'Saved links are untouched');
  assert.deepEqual(h.requests, []);
  console.log(JSON.stringify({ chrome: h.context.browser().version(), checks, output: h.output }));
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 1500));
  throw error;
} finally {
  await h.close();
}
