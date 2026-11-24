import assert from 'node:assert/strict';
import path from 'node:path';
import { createHarness, poll } from './harness.mjs';

const h = await createHarness();
const { page } = h;
const checks = [];

try {
  const day = n => new Date(Date.now() - n * 86_400_000).toISOString();
  const link = (id, projectId, url, age, extra = {}) => ({
    id, sessionId: `s-${id}`, projectId, title: `Copy ${id}`, url, normalizedUrl: url, domain: 'example.invalid',
    status: 'parked', pinnedBeforeParking: false, createdAt: day(age), updatedAt: day(age), ...extra,
  });
  const links = [
    link('a-old', 'inbox', 'https://example.invalid/a', 9),
    link('a-mid', 'reading', 'https://example.invalid/a', 5, { status: 'archived', archivedAt: day(4) }),
    link('a-new', 'reading', 'https://example.invalid/a', 1),
    link('b-old', 'inbox', 'https://example.invalid/b', 8),
    link('b-new', 'inbox', 'https://example.invalid/b', 2),
    link('c', 'inbox', 'https://example.invalid/c', 3),
    link('d-removed', 'inbox', 'https://example.invalid/c', 1, { status: 'removed', removedAt: day(1) }),
  ];
  await h.seed({
    projects: [
      { id: 'inbox', name: 'Inbox', isInbox: true, createdAt: day(10), updatedAt: day(10) },
      { id: 'reading', name: 'Reading list', isInbox: false, createdAt: day(10), updatedAt: day(10) },
    ],
    sessions: links.map(item => ({ id: item.sessionId, projectId: item.projectId, createdAt: item.createdAt, updatedAt: item.createdAt })),
    links,
    settings: { schemaVersion: 3, defaultProjectId: 'inbox', includePinnedTabsByDefault: false, confirmBeforeBulkClose: true, notificationsEnabled: false, defaultRestoreBehavior: 'restore-and-remove', displayDensity: 'comfortable', defaultRestoreMode: 'normal', trackingParamsToRemove: [] },
  });
  const status = async id => (await h.raw()).links.find(item => item.id === id)?.status;
  const group = page.locator('[data-duplicate-group]');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(new URL('/manager.html#duplicates', page.url()).href);
  await page.getByRole('heading', { name: 'Duplicates', exact: true }).waitFor();
  await page.getByText('2 addresses saved more than once · 3 extra copies').waitFor();
  assert.equal(await group.count(), 2, 'removed links and single copies are left out');
  assert.match(await group.first().innerText(), /3 copies/);
  assert.match(await group.first().innerText(), /Reading list · Archived/);
  await page.screenshot({ path: path.join(h.output, 'duplicates.png') });
  checks.push('Duplicates groups parked and archived copies of the same address, biggest group first');

  // Keep one copy: the others go to the Bin.
  await group.first().getByRole('button', { name: 'Keep this copy of Copy a-old in Inbox', exact: true }).click();
  await page.getByText('Moved 2 extra copies to the Bin.').waitFor();
  assert.equal(await status('a-old'), 'parked');
  assert.equal(await status('a-mid'), 'removed');
  assert.equal(await status('a-new'), 'removed');
  assert.equal(await group.count(), 1);
  checks.push('Keep this one moves every other copy to the Bin');

  // Keep the newest of each, after confirming.
  await page.getByRole('button', { name: 'Keep the newest of each', exact: true }).click();
  const confirm = page.getByRole('group', { name: 'Keep the newest of each' });
  await confirm.getByText('move 1 extra copy to the Bin?').waitFor();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await status('b-old'), 'parked', 'Cancel changes nothing');
  await page.getByRole('button', { name: 'Keep the newest of each', exact: true }).click();
  await confirm.getByRole('button', { name: 'Keep newest' }).click();
  await page.getByText('Moved 1 extra copy to the Bin.').waitFor();
  assert.equal(await status('b-new'), 'parked');
  assert.equal(await status('b-old'), 'removed');
  await page.getByRole('heading', { name: 'No duplicates' }).waitFor();
  checks.push('Keep the newest of each asks first, then keeps one copy of every address');

  // Copies can be recovered from the Bin.
  await page.goto(new URL('/manager.html#bin', page.url()).href);
  await page.getByRole('button', { name: 'Recover Copy a-new', exact: true }).click();
  await poll(() => status('a-new'), value => value === 'parked', 'copy recovered');
  checks.push('Removed copies can be recovered from the Bin');

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(new URL('/manager.html#duplicates', page.url()).href);
  await group.first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  checks.push('Duplicates does not overflow at 360px');

  assert.deepEqual(h.requests, []);
} catch (error) {
  console.error('BODY', (await page.locator('body').innerText()).slice(0, 1500));
  throw error;
} finally {
  await h.close();
}

console.log(JSON.stringify({ checks }));
