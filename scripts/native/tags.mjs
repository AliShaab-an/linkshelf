import assert from 'node:assert/strict';
import path from 'node:path';
import { createHarness, navigateSidebar, poll } from './harness.mjs';
import { library } from './fixtures.mjs';

const h = await createHarness();
const { page } = h;
const checks = [];
const checkWidth = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const card = title => page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const dialog = page.getByRole('dialog', { name: /^Tags for/ });
const filterGroup = page.getByRole('group', { name: 'Filter by tag' });
const tagsOf = async title => (await h.database()).links.find(link => link.title === title)?.tags;
const focusedLabel = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent);

async function openTagDialog(title, label) {
  await card(title).getByRole('button', { name: 'More link actions' }).click();
  await card(title).getByRole('button', { name: label, exact: true }).click();
  await dialog.waitFor();
}

try {
  const database = library(8);
  database.settings.notificationsEnabled = false;
  assert.equal((await h.seed(database)).status.state, 'healthy');
  await page.setViewportSize({ width: 320, height: 760 });
  await page.reload();
  await navigateSidebar(page, 'Projects');
  await page.getByLabel('Project', { exact: true }).selectOption('legacy-project');

  const first = 'Synthetic historical 0';
  const second = 'Synthetic historical 4';
  await card(first).waitFor();
  assert.equal(await filterGroup.count(), 0, 'No tag filter without tags');

  // Saved: add tags through the dialog, keyboard-only submit, normalization preview, focus return.
  await openTagDialog(first, 'Add tags');
  assert.equal(await dialog.getByRole('textbox', { name: 'Tags', exact: true }).evaluate(el => document.activeElement === el), true, 'Tag field takes initial focus');
  await dialog.getByRole('textbox', { name: 'Tags', exact: true }).fill(' Work, Read   Later ,, work');
  await dialog.getByText('Will be saved as:').waitFor();
  assert.match(await dialog.innerText(), /work, read later/);
  assert.equal(await checkWidth(), true);
  assert.equal(await dialog.getByRole('button', { name: 'Save tags' }).isEnabled(), true);
  await page.screenshot({ path: path.join(h.output, 'tags-dialog-320.png') });
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(await tagsOf(first), ['work', 'read later']);
  await card(first).getByRole('list', { name: 'Tags' }).waitFor();
  assert.match(await card(first).innerText(), /work/);
  await page.getByRole('status').getByText(/Saved tags for/).first().waitFor();
  assert.equal(await focusedLabel(), 'More link actions', 'Focus returns to the card actions button');
  checks.push('Saved: Add tags dialog focuses the field, previews normalized tags, saves with Enter, updates the card and returns focus');

  // Invalid input: live alert, Save disabled, nothing persisted, Escape returns focus.
  await openTagDialog(second, 'Add tags');
  await dialog.getByRole('textbox', { name: 'Tags', exact: true }).fill('x'.repeat(33));
  await dialog.getByRole('alert').getByText(/at most 32 characters/).waitFor();
  assert.equal(await dialog.getByRole('button', { name: 'Save tags' }).isDisabled(), true);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await tagsOf(second), undefined);
  assert.equal(await focusedLabel(), 'More link actions');
  await openTagDialog(second, 'Add tags');
  await dialog.getByRole('button', { name: 'Add tag work' }).click();
  await dialog.getByRole('button', { name: 'Save tags' }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(await tagsOf(second), ['work']);
  checks.push('Saved: invalid tags show an alert and cannot be saved, Escape persists nothing and returns focus, a suggestion adds an existing tag');

  // Saved: filter chips are derived from the project, exact, toggle, and combine with the text filter.
  await filterGroup.waitFor();
  const work = filterGroup.getByRole('button', { name: /^work/ });
  assert.equal(await work.getAttribute('aria-pressed'), 'false');
  await work.click();
  assert.equal(await work.getAttribute('aria-pressed'), 'true');
  await page.locator('.projects-toolbar').getByText('2 links shown', { exact: false }).waitFor();
  assert.equal(await card('Synthetic historical 0').count(), 1);
  await filterGroup.getByRole('button', { name: /^read later/ }).click();
  assert.equal(await work.getAttribute('aria-pressed'), 'false');
  await page.locator('.projects-toolbar').getByText('1 link shown', { exact: false }).waitFor();
  assert.equal(await card(second).count(), 0, 'Single-tag filter hides links without the tag');
  assert.equal(await checkWidth(), true);
  await page.screenshot({ path: path.join(h.output, 'tags-saved-filter-320.png') });
  await filterGroup.getByRole('button', { name: /^read later/ }).click();
  await card(second).waitFor();
  checks.push('Saved: tag chips filter exactly, toggle off, expose pressed state and keep 320px layout');

  // Clearing tags removes the field and the chip group.
  await openTagDialog(second, 'Edit tags');
  await dialog.getByRole('textbox', { name: 'Tags', exact: true }).fill('');
  await dialog.getByRole('button', { name: 'Save tags' }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await tagsOf(second), undefined);
  assert.equal('tags' in (await h.database()).links.find(link => link.title === second), false);
  checks.push('Saved: clearing all tags removes the field from stored data');

  // Search: global chips write tag: filters into the query and results stay exact.
  await navigateSidebar(page, 'Search');
  const readLater = page.getByRole('group', { name: 'Filter by tag' }).getByRole('button', { name: /^read later/ });
  await readLater.waitFor();
  await readLater.click();
  assert.equal(await page.getByLabel('Search saved links').inputValue(), 'tag:"read later"');
  await page.getByText(/LinkShelf · 1 of 1/).waitFor();
  assert.equal(await card(first).count(), 1);
  assert.equal(await readLater.getAttribute('aria-pressed'), 'true');
  await readLater.click();
  assert.equal(await page.getByLabel('Search saved links').inputValue(), '');
  await page.getByLabel('Search saved links').fill('tag:work');
  await card(first).waitFor();
  assert.equal(await checkWidth(), true);
  checks.push('Search: tag chips toggle tag: filters in the query; typed filters select the chip; results and layout stay correct');

  // Search result editing refreshes results from the worker.
  await page.getByLabel('Search saved links').fill('Synthetic historical');
  await card('Synthetic historical 1').waitFor();
  await openTagDialog('Synthetic historical 1', 'Add tags');
  await dialog.getByRole('textbox', { name: 'Tags', exact: true }).fill('archived-note');
  await dialog.getByRole('button', { name: 'Save tags' }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(await tagsOf('Synthetic historical 1'), ['archived-note']);
  await card('Synthetic historical 1').getByRole('list', { name: 'Tags' }).waitFor();
  checks.push('Search: tagging an archived result saves it and refreshes the result');

  // Archive and Review expose the same editor.
  await navigateSidebar(page, 'Archive');
  await card('Synthetic historical 1').getByRole('list', { name: 'Tags' }).waitFor();
  await openTagDialog('Synthetic historical 1', 'Edit tags');
  await dialog.getByRole('textbox', { name: 'Tags', exact: true }).fill('archived-note, second');
  await dialog.getByRole('button', { name: 'Save tags' }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(await tagsOf('Synthetic historical 1'), ['archived-note', 'second']);
  await navigateSidebar(page, 'Review');
  await openTagDialog(first, 'Edit tags');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await dialog.waitFor({ state: 'hidden' });
  checks.push('Archive and Review: the tag editor saves and cancels');

  // Two documents: a tag change in one is visible in the other after reload and never loses other fields.
  const before = (await h.database()).links.find(link => link.title === first);
  const other = await h.surface();
  await h.ok({ type: 'SET_LINK_TAGS', payload: { linkId: before.id, tags: ['from-other-document'] } }, other);
  await other.close();
  await page.bringToFront();
  const after = (await h.database()).links.find(link => link.title === first);
  assert.deepEqual({ ...after, tags: undefined, updatedAt: undefined }, { ...before, tags: undefined, updatedAt: undefined });
  assert.deepEqual(after.tags, ['from-other-document']);
  checks.push('Worker tag changes from another document keep every other field intact');

  console.log(JSON.stringify({ chrome: h.context.browser().version(), checks, output: h.output }));
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 1500));
  throw error;
} finally {
  await h.close();
}
