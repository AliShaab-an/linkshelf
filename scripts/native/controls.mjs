import assert from 'node:assert/strict';
import { chosenValue, createHarness, navigateSidebar, poll } from './harness.mjs';

const h = await createHarness();
const { page } = h;
const checks = [];
const iso = new Date().toISOString();
const projects = [
  { id: 'legacy-inbox', name: 'Inbox', isInbox: true, createdAt: iso, updatedAt: iso },
  ...['Alpha research', 'Beta reading', 'Thesis notes', 'Trip planning'].map((name, index) => ({ id: `p${index}`, name, isInbox: false, createdAt: iso, updatedAt: iso })),
];
const links = projects.map((project, index) => ({
  id: `l${index}`, sessionId: `s${index}`, projectId: project.id, title: `Synthetic link in ${project.name}`, url: `https://example.invalid/${index}`,
  normalizedUrl: `https://example.invalid/${index}`, domain: 'example.invalid', status: 'parked', pinnedBeforeParking: false, createdAt: iso, updatedAt: iso,
}));
const focusedId = () => page.evaluate(() => document.activeElement?.id);
const fitsViewport = locator => locator.evaluate(element => {
  const { top, bottom, left, right } = element.getBoundingClientRect();
  return top >= 0 && left >= 0 && bottom <= innerHeight && right <= innerWidth;
});

try {
  await h.seed({
    projects, links,
    sessions: links.map(link => ({ id: link.sessionId, projectId: link.projectId, createdAt: iso, updatedAt: iso })),
    settings: { schemaVersion: 3, defaultProjectId: 'legacy-inbox', includePinnedTabsByDefault: false, confirmBeforeBulkClose: true, notificationsEnabled: false, defaultRestoreBehavior: 'restore-and-remove', displayDensity: 'comfortable', defaultRestoreMode: 'normal', trackingParamsToRemove: [] },
  });
  await page.evaluate(() => chrome.storage.local.set({ linkshelfRatePrompt: { version: 1, parked: 0, status: 'done', laterCount: 0 } }));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.reload();
  await navigateSidebar(page, 'Saved');
  const project = page.getByRole('combobox', { name: 'Project', exact: true });
  const list = page.getByRole('listbox', { name: 'Project', exact: true });
  await project.waitFor();

  // Keyboard: open on ArrowDown at the current value, move, and choose with Enter.
  await project.focus();
  await page.keyboard.press('ArrowDown');
  await list.waitFor();
  assert.equal(await project.getAttribute('aria-expanded'), 'true');
  const activeOption = async () => page.locator(`[id="${await project.getAttribute('aria-activedescendant')}"]`).textContent();
  assert.equal(await activeOption(), 'Inbox');
  assert.equal(await list.getByRole('option', { selected: true }).textContent(), 'Inbox');
  assert.ok(await fitsViewport(list));
  await page.screenshot({ path: `${h.output}/dropdown-open-360.png` });
  await page.keyboard.press('ArrowDown');
  assert.equal(await activeOption(), 'Alpha research');
  await page.keyboard.press('End');
  assert.equal(await activeOption(), 'Trip planning');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await list.waitFor({ state: 'detached' });
  await poll(() => chosenValue(project), value => value === 'p0', 'Alpha research chosen');
  await page.getByRole('heading', { name: 'Synthetic link in Alpha research' }).waitFor();
  assert.equal(await focusedId(), 'project-selector');
  checks.push('Arrow keys, Home/End and Enter choose a project, and focus stays on the dropdown');

  // Type-ahead while closed jumps to the next match; repeating the letter cycles.
  await page.keyboard.press('t');
  await list.waitFor();
  assert.equal(await activeOption(), 'Thesis notes');
  await page.keyboard.press('t');
  await page.waitForTimeout(700);
  assert.equal(await activeOption(), 'Trip planning');
  await page.keyboard.press(' ');
  await poll(() => chosenValue(project), value => value === 'p3', 'Trip planning chosen with Space');
  await page.getByRole('heading', { name: 'Synthetic link in Trip planning' }).waitFor();
  await poll(() => project.isEnabled(), enabled => enabled, 'project picker enabled after loading');
  checks.push('Typing a letter jumps to matching projects and Space chooses');

  // Escape and outside clicks close without changing anything.
  await page.keyboard.press('ArrowDown');
  await list.waitFor();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  await list.waitFor({ state: 'detached' });
  assert.equal(await chosenValue(project), 'p3');
  await project.click();
  await list.waitFor();
  await page.getByRole('heading', { name: 'Saved', exact: true }).click();
  await list.waitFor({ state: 'detached' });
  assert.equal(await chosenValue(project), 'p3');
  checks.push('Escape and clicking outside close the list without a change');

  // Pointer: click an option.
  await project.click();
  await list.getByRole('option', { name: 'Beta reading' }).click();
  await poll(() => chosenValue(project), value => value === 'p1', 'Beta reading clicked');
  await page.getByRole('heading', { name: 'Synthetic link in Beta reading' }).waitFor();
  checks.push('Clicking an option chooses it');

  // Inside the View menu: Escape closes only the inner list, and segments use arrow keys.
  await page.getByRole('button', { name: 'View options' }).click();
  const viewMenu = page.getByRole('group', { name: 'View options', exact: true });
  const order = viewMenu.getByRole('combobox', { name: 'Session order' });
  await order.click();
  await page.getByRole('listbox', { name: 'Session order' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('listbox', { name: 'Session order' }).waitFor({ state: 'detached' });
  assert.equal(await viewMenu.isVisible(), true, 'The View menu stays open');
  const spacing = viewMenu.getByRole('radiogroup', { name: 'Saved link spacing' });
  assert.equal(await spacing.getByRole('radio', { name: 'Comfortable' }).getAttribute('aria-checked'), 'true');
  assert.equal(await spacing.getByRole('radio', { name: 'Compact' }).getAttribute('tabindex'), '-1');
  await spacing.getByRole('radio', { name: 'Comfortable' }).focus();
  await page.keyboard.press('ArrowRight');
  await poll(() => chosenValue(spacing), value => value === 'compact', 'compact chosen by arrow key');
  await poll(async () => (await h.raw()).settings.displayDensity, value => value === 'compact', 'compact spacing saved');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Compact');
  await page.screenshot({ path: `${h.output}/view-menu-360.png` });
  await page.keyboard.press('Escape');
  await viewMenu.waitFor({ state: 'detached' });
  checks.push('In the View menu, Escape closes only the open list, and arrow keys move between segments');

  // Inside a dialog the list is not clipped and Escape keeps the dialog open.
  await page.getByRole('button', { name: 'More link actions' }).first().click();
  await page.getByRole('button', { name: 'Move to project' }).click();
  const dialog = page.getByRole('dialog');
  const destination = dialog.getByRole('combobox', { name: 'Destination project' });
  await destination.click();
  const destinations = page.getByRole('listbox', { name: 'Destination project' });
  await destinations.waitFor();
  assert.ok(await fitsViewport(destinations));
  await page.screenshot({ path: `${h.output}/dropdown-in-dialog-360.png` });
  await page.keyboard.press('Escape');
  await destinations.waitFor({ state: 'detached' });
  assert.equal(await dialog.isVisible(), true, 'The dialog stays open');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  checks.push('Inside a dialog the list fits on screen and Escape closes only the list');

  // Dark theme.
  await page.emulateMedia({ colorScheme: 'dark' });
  await poll(() => page.evaluate(() => document.documentElement.dataset.colorScheme), value => value === 'dark', 'system dark');
  await project.click();
  await list.waitFor();
  await page.screenshot({ path: `${h.output}/dropdown-dark-360.png` });
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  checks.push('The dropdown renders in the dark theme');

  assert.deepEqual(h.requests, []);
  console.log(JSON.stringify({ chrome: h.context.browser().version(), checks, output: h.output }));
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 1500));
  throw error;
} finally {
  await h.close();
}
