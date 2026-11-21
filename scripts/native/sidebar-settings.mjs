import assert from 'node:assert/strict';
import path from 'node:path';
import { choose, chosenValue, createHarness, optionLabels, poll } from './harness.mjs';

const h = await createHarness();
const checks = [];

try {
  await h.ok({ type: 'GET_STORAGE_STATUS' });
  const extensionUrl = path => new URL(path, h.page.url()).href;
  const manager = await h.page.context().newPage();
  await manager.goto(extensionUrl('/manager.html#settings'));

  const card = manager.getByRole('region', { name: 'Sidebar', exact: true });
  const start = card.getByRole('combobox', { name: 'Open the sidebar on' });
  const tab = name => card.getByRole('checkbox', { name, exact: true });
  await start.waitFor();

  // Defaults: everything shown, open where it was left. Saved can not be hidden.
  assert.equal(await chosenValue(start), 'last');
  for (const name of ['Park', 'Search', 'Today']) assert.equal(await tab(name).isChecked(), true);
  assert.equal(await tab('Saved').isDisabled(), true);
  assert.deepEqual(await optionLabels(start), ['Where I left off', 'Saved', 'Park', 'Search', 'Today']);
  checks.push('Sidebar settings start as before: every tab shown and the sidebar opens where it was left');

  // A sidebar that is already open follows the change without a reload.
  await h.page.goto(extensionUrl('/sidepanel.html'));
  const nav = h.page.getByRole('navigation', { name: 'LinkShelf sections' });
  const button = name => nav.getByRole('button', { name, exact: true });
  await button('Park').waitFor();
  await button('Saved').click();
  await tab('Park').uncheck();
  await button('Park').waitFor({ state: 'detached' });
  assert.deepEqual(await nav.getByRole('button').allTextContents(), ['Saved', 'Search', 'Today', 'ManageOpens Home, Review, Archive, and Settings in a tab']);
  assert.deepEqual(await optionLabels(start), ['Where I left off', 'Saved', 'Search', 'Today'], 'a hidden tab can not be the start tab');
  await tab('Park').check();
  await button('Park').waitFor();
  checks.push('Hiding and showing a tab updates an open sidebar straight away');

  // A fixed start tab applies when the sidebar opens, whatever tab it was left on.
  await choose(start, { label: 'Today' });
  await tab('Search').uncheck();
  await h.page.reload();
  await nav.waitFor();
  await poll(() => button('Today').getAttribute('aria-current'), value => value === 'page', 'sidebar opens on Today');
  assert.equal(await button('Search').count(), 0);
  checks.push('The sidebar opens on the chosen tab and leaves out hidden tabs');

  // Hiding the tab chosen as the start tab puts the start back to where it was left.
  await tab('Today').uncheck();
  await poll(() => chosenValue(start), value => value === 'last', 'start falls back when its tab is hidden');
  checks.push('Hiding the start tab returns the start choice to where the sidebar was left');

  // Hidden tabs stay out of the bar after a reload too.
  await tab('Park').check(); await tab('Search').uncheck();
  await h.page.reload();
  await nav.waitFor();
  assert.equal(await button('Search').count(), 0);
  checks.push('Hidden tabs stay out of the bar');

  await card.screenshot({ path: path.join(h.output, 'sidebar-settings.png') });
  assert.deepEqual(h.requests, []);
  await manager.close();
} finally {
  await h.close();
}

console.log(JSON.stringify({ checks }));
