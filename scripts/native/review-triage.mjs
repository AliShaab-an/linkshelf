import assert from 'node:assert/strict';
import path from 'node:path';
import { createHarness, poll } from './harness.mjs';

const h = await createHarness();
const { page } = h;
const checks = [];

try {
  const stamp = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const link = (id, projectId, minutes) => ({
    id, sessionId: `s-${id}`, projectId, title: `Triage ${id}`, url: `https://example.invalid/${id}`,
    normalizedUrl: `https://example.invalid/${id}`, domain: 'example.invalid', status: 'parked', pinnedBeforeParking: false,
    createdAt: new Date(Date.parse(stamp) + minutes * 60_000).toISOString(), updatedAt: stamp,
  });
  // Oldest first in Review: a, b, c, d in the Inbox, then e, f in Reading list.
  const links = [link('a', 'inbox', 1), link('b', 'inbox', 2), link('c', 'inbox', 3), link('d', 'inbox', 4), link('e', 'reading', 5), link('f', 'reading', 6)];
  await h.seed({
    projects: [
      { id: 'inbox', name: 'Inbox', isInbox: true, createdAt: stamp, updatedAt: stamp },
      { id: 'reading', name: 'Reading list', isInbox: false, createdAt: stamp, updatedAt: stamp },
    ],
    sessions: links.map(item => ({ id: item.sessionId, projectId: item.projectId, createdAt: stamp, updatedAt: stamp })),
    links,
    settings: { schemaVersion: 3, defaultProjectId: 'inbox', includePinnedTabsByDefault: false, confirmBeforeBulkClose: true, notificationsEnabled: false, defaultRestoreBehavior: 'restore-and-remove', displayDensity: 'comfortable', defaultRestoreMode: 'normal', trackingParamsToRemove: [] },
  });
  const status = async id => (await h.raw()).links.find(item => item.id === id)?.status;
  const row = title => page.locator('[data-link-row]').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  const focusedRow = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label'));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(new URL('/manager.html#review', page.url()).href);
  await page.getByText('6 links to review').waitFor();
  assert.equal(await page.locator('[data-link-row]').count(), 6);
  await page.screenshot({ path: path.join(h.output, 'review-rows.png') });
  checks.push('Review lists each link as one compact row');

  // Keyboard triage: move with the arrow keys, archive with A, and focus moves on to the next link.
  await row('Triage a').focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await focusedRow(), 'Triage b');
  await page.keyboard.press('a');
  await poll(() => status('b'), value => value === 'archived', 'b archived by keyboard');
  await poll(focusedRow, value => value === 'Triage c', 'focus moves to the next link');
  await page.keyboard.press('ArrowUp');
  assert.equal(await focusedRow(), 'Triage a');
  checks.push('Arrow keys move between links, A archives, and focus moves to the next link');

  // Delete opens the usual confirmation; the removed link goes to the Bin.
  await page.keyboard.press('Delete');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Remove link' }).click();
  await poll(() => status('a'), value => value === 'removed', 'a removed by keyboard');
  await dialog.waitFor({ state: 'hidden' });
  await row('Triage a').waitFor({ state: 'detached' });
  await poll(focusedRow, value => value === 'Triage c', 'focus moves to the next link after removing');
  checks.push('Delete asks first, then moves the link to the Bin');

  // X selects; bulk archive acts on every selected link.
  await row('Triage c').focus();
  await page.keyboard.press('x');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('x');
  await page.getByText('2 selected').waitFor();
  await page.getByRole('button', { name: 'Archive selected', exact: true }).click();
  await page.getByText('Archived 2 links.').waitFor();
  assert.equal(await status('c'), 'archived');
  assert.equal(await status('d'), 'archived');
  checks.push('X selects links and Archive selected archives them all');

  // The project filter narrows the list, and Select all only takes what is shown.
  await page.getByRole('checkbox', { name: 'Select Triage e', exact: true }).waitFor();
  assert.equal(await page.locator('[data-link-row]').count(), 2);
  await page.getByLabel('Select all').check();
  await page.getByRole('button', { name: 'Remove selected', exact: true }).click();
  await page.getByRole('group', { name: 'Remove selected links' }).getByText('Move 2 links to the Bin?').waitFor();
  await page.getByRole('group', { name: 'Remove selected links' }).getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await status('e'), 'parked', 'Cancel keeps the links');
  await page.getByRole('button', { name: 'Remove selected', exact: true }).click();
  await page.getByRole('group', { name: 'Remove selected links' }).getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByText('Removed 2 links.').waitFor();
  assert.equal(await status('e'), 'removed');
  assert.equal(await status('f'), 'removed');
  await page.getByRole('heading', { name: 'Review queue is clear' }).waitFor();
  checks.push('Remove selected asks first and moves every selected link to the Bin');

  // The Bin has its own tab and shows what was removed.
  await page.goto(new URL('/manager.html#bin', page.url()).href);
  const bin = page.getByRole('region', { name: 'Bin', exact: true });
  await bin.getByText('Triage e').waitFor();
  assert.equal(await bin.getByRole('listitem').count(), 3);
  await bin.getByRole('button', { name: 'Recover Triage e', exact: true }).click();
  await poll(() => status('e'), value => value === 'parked', 'e recovered from the Bin');
  await page.screenshot({ path: path.join(h.output, 'bin.png') });
  checks.push('The Bin tab lists removed links and recovers them');

  for (const width of [768, 360]) {
    await page.setViewportSize({ width, height: 800 });
    for (const hash of ['review', 'archive', 'bin']) {
      await page.goto(new URL(`/manager.html#${hash}`, page.url()).href);
      await page.getByRole('heading', { level: 2 }).first().waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${hash} overflows at ${width}px`);
    }
  }
  await page.goto(new URL('/manager.html#review', page.url()).href);
  await page.getByText('1 link to review').waitFor();
  await page.screenshot({ path: path.join(h.output, 'review-360.png') });
  checks.push('Review, Archive and Bin do not overflow at 768px or 360px');

  assert.deepEqual(h.requests, []);
} finally {
  await h.close();
}

console.log(JSON.stringify({ checks }));
