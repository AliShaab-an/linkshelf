import assert from 'node:assert/strict';
import path from 'node:path';
import { createHarness, navigateSidebar, poll } from './harness.mjs';

const h = await createHarness();
const page = h.page;
const button = name => page.getByRole('button', { name, exact: true });
const tab = name => page.getByRole('checkbox', { name: `Select Synthetic /${name}`, exact: true });
const modal = page.getByRole('dialog');
const checks = [];

try {
  await h.tab('naming-a');
  await h.tab('naming-b');
  await h.surface('popup');
  await page.bringToFront();
  await page.setViewportSize({ width: 360, height: 760 });
  await navigateSidebar(page, 'Park');
  await tab('naming-a').waitFor();

  // The name is asked for only when there is a session of several tabs to name.
  await tab('naming-a').check();
  await button('Review selection').click();
  await modal.waitFor();
  assert.equal(await modal.getByLabel('Session name (optional)').count(), 0);
  await button('Back').click();
  await modal.waitFor({ state: 'hidden' });
  await tab('naming-b').check();
  await button('Review selection').click();
  await modal.waitFor();
  const field = modal.getByLabel('Session name (optional)');
  assert.equal(await field.getAttribute('maxlength'), '80');
  await field.fill('  Trip   planning ');
  await page.screenshot({ path: path.join(h.output, 'session-name-park.png') });
  await button('Save & close 2').click();
  await page.getByRole('status').filter({ hasText: /Saved|Parked/ }).first().waitFor().catch(() => undefined);
  checks.push('Parking two or more tabs asks for an optional session name');

  const stored = (await h.raw()).sessions;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].name, 'Trip planning', 'the name is trimmed and tidied');

  await navigateSidebar(page, 'Saved');
  const header = page.getByRole('button', { name: /Trip planning/ });
  await header.waitFor();
  assert.match(await header.innerText(), /Trip planning · 2 links/);
  await header.click();
  assert.match(await page.getByRole('button', { name: /Trip planning/ }).innerText(), /Trip planning/);
  await page.getByRole('button', { name: /Trip planning/ }).click();
  checks.push('Saved shows the name as the session heading, expanded and collapsed');

  // Rename from Saved.
  await button('Rename session').click();
  await modal.getByRole('heading', { name: 'Rename session' }).waitFor();
  const input = modal.getByLabel('Session name');
  assert.equal(await input.inputValue(), 'Trip planning');
  assert.equal(await input.evaluate(el => document.activeElement === el), true, 'the name field has focus');
  await input.fill('Trip ideas');
  await modal.getByRole('button', { name: 'Save name', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: /Trip ideas/ }).waitFor();
  assert.equal((await h.raw()).sessions[0].name, 'Trip ideas');
  checks.push('A session can be renamed from Saved and the heading updates');

  // Remove the name: back to the plain heading, and nothing stored.
  await button('Rename session').click();
  await modal.getByRole('button', { name: 'Remove name', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.getByText(/Parking session · 2 links/).first().waitFor();
  assert.equal('name' in (await h.raw()).sessions[0], false);
  checks.push('Removing the name restores the plain session heading');

  // A name survives export and import.
  await h.ok({ type: 'RENAME_SESSION', payload: { sessionId: stored[0].id, name: 'Kept in backups' } });
  const backup = (await h.ok({ type: 'EXPORT_DATA' })).backup;
  assert.equal(backup.database.sessions[0].name, 'Kept in backups');
  const refused = await h.rpc({ type: 'RENAME_SESSION', payload: { sessionId: stored[0].id, name: 'x'.repeat(81) } });
  assert.equal(refused.success, false);
  assert.equal(refused.error.code, 'INVALID_NAME');
  assert.equal((await h.raw()).sessions[0].name, 'Kept in backups');
  checks.push('The name is included in backups, and an over-long name is refused without changing the saved one');

  assert.deepEqual(h.requests, []);
} finally {
  await h.close();
}

console.log(JSON.stringify({ checks }));
