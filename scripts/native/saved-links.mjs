import assert from 'node:assert/strict';
import path from 'node:path';
import { createHarness, navigateSidebar, poll } from './harness.mjs';
import { dataset } from '../performance/fixtures.mjs';

const h = await createHarness();
const { page } = h;
const button = name => page.getByRole('button', { name, exact: typeof name === 'string' });
const heading = name => page.getByRole('heading', { name, exact: true });
const selector = page.getByLabel('Project', { exact: true });
const actions = button('Project actions');
const view = button('View options');
const status = text => page.getByRole('status').getByText(text);
const checkWidth = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const checks = [];

try {
  const fixture = dataset(1000, 'few', h.base);
  fixture.settings.notificationsEnabled = false;
  const probe = fixture.links.filter(link => link.projectId === 'restore-probe').slice(0, 3);
  fixture.links = fixture.links.filter(link => link.projectId !== 'restore-probe').concat(probe);
  fixture.projects.find(project => project.id === 'restore-probe').name = 'Synthetic restoration project with a long research name';
  probe[0].title = 'A long synthetic title '.repeat(15);
  probe[0].note = 'A long synthetic note '.repeat(30);
  Object.assign(probe[1], { url: probe[0].url, normalizedUrl: probe[0].normalizedUrl });
  assert.equal((await h.seed(fixture)).status.state, 'healthy');
  await page.setViewportSize({ width: 320, height: 760 });
  await page.reload();
  await navigateSidebar(page, 'Projects');
  await selector.selectOption('restore-probe');
  await button('Restore link').first().waitFor();
  assert.equal(await checkWidth(), true);
  await page.locator('article').filter({ hasText: 'A long synthetic title' }).getByRole('button', { name: 'Show more', exact: true }).click();
  await button('Show less').waitFor();
  await page.screenshot({ path: path.join(h.output, 'saved-links-320.png') });

  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(async () => chrome.tabs.setZoom((await chrome.tabs.getCurrent()).id, 2));
  await poll(() => page.evaluate(() => innerWidth), width => width === 320, '200% zoom applied');
  assert.equal(await checkWidth(), true);
  const other = await h.surface();
  await h.ok({ type: 'UPDATE_SETTINGS', payload: {
    ...fixture.settings, defaultRestoreBehavior: 'open-copy', defaultRestoreMode: 'unloaded',
  } }, other);
  await page.locator('#project-restore-scope').filter({ hasText: /Opened links stay parked/ }).waitFor({ state: 'attached' });
  await other.close();
  await page.bringToFront();

  await page.getByLabel('Filter this project').fill(probe[2].title);
  await page.locator('.projects-toolbar').getByText('1 of 3 parked links', { exact: true }).waitFor();
  await button('Restore all').click();
  const confirm = page.getByRole('region', { name: /^Restore all 3 links/ });
  await confirm.getByText(/includes parked links hidden by the filter/).waitFor();
  const unloaded = confirm.getByRole('button', { name: 'Load tabs when selected · Default' });
  await unloaded.focus();
  await poll(() => unloaded.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight && element.contains(
      document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2),
    );
  }), Boolean, 'focused restore choice is visible at 200% zoom');
  await page.screenshot({ path: path.join(h.output, 'saved-links-200.png') });
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await button('Restore link').click();
  await status(/Opened a copy.*remains parked/).waitFor();
  await page.bringToFront();
  await button('Restore session').click();
  await status(/Opened 3 tabs.*3 kept as parked copies/).waitFor();
  assert.equal((await h.raw()).links.filter(link => probe.some(record => record.id === link.id) && link.status === 'parked').length, 3);
  checks.push('Single-link and full-session scope, duplicate URLs, filter counts, cross-document preferences, and copy feedback');

  await h.ok({ type: 'UPDATE_SETTINGS', payload: fixture.settings });
  await page.locator('#project-restore-scope').filter({ hasText: /leave the parked list/ }).waitFor({ state: 'attached' });
  await h.worker().evaluate(() => {
    const original = chrome.tabs.create;
    let count = 0;
    chrome.tabs.create = function (options) {
      if (++count === 2) throw new Error('Synthetic open failure');
      return original.call(this, options);
    };
    globalThis.undoSavedProbe = () => { chrome.tabs.create = original; };
  });
  await button('Restore all').click();
  await button('Load tabs immediately · Default').click();
  await status(/Opened 2 of 3 tabs.*2 marked restored.*could not confirm opening 1 tab/).waitFor();
  await page.getByText(/Some browser opens were not confirmed/).waitFor();
  await h.worker().evaluate(() => globalThis.undoSavedProbe());
  const afterRestore = (await h.raw()).links.filter(link => probe.some(record => record.id === link.id));
  assert.equal(afterRestore.filter(link => link.status === 'restored').length, 2);
  checks.push('Project restore ignores the filter, persists confirmed records, and announces partial browser failures');

  await button('New project').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.getByLabel('New project name').evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Escape');
  assert.equal(await button('New project').evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Space');
  await page.getByLabel('New project name').fill('Synthetic new project');
  await button('Create project').click();
  await heading('This project is empty').waitFor();
  assert.equal(await selector.locator('option:checked').textContent(), 'Synthetic new project');
  await actions.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  assert.equal(await button('Rename').evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Escape');
  assert.equal(await actions.evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Enter');
  await button('Rename').click();
  await page.getByLabel('Project name', { exact: true }).fill('Synthetic renamed project');
  await button('Save name').click();
  await poll(() => selector.locator('option:checked').textContent(), value => value === 'Synthetic renamed project', 'renamed project selected');
  await selector.selectOption('restore-probe');
  await actions.click();
  await button('Delete').click();
  await button('Move to Inbox and delete').click();
  await poll(() => selector.inputValue(), value => value === 'inbox', 'Inbox selected');
  await poll(h.raw, value => value.links.filter(link => probe.some(record => record.id === link.id)).every(link => link.projectId === 'inbox'), 'all three records moved to Inbox');
  assert.equal(await checkWidth(), true);
  assert.equal(await actions.isDisabled(), true);
  assert.equal(await button('Rename').count(), 0);
  checks.push('Create, rename, and delete through management controls; Inbox retains the parked and restored records');

  await selector.selectOption('project-0');
  await button('Restore session').first().waitFor();
  assert.equal(await page.locator('article').count(), 25);
  const sessions = page.getByRole('button', { name: /^Parking session/ });
  const newestSession = await sessions.first().textContent();
  await view.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  assert.equal(await page.getByLabel('Session order').evaluate(el => document.activeElement === el), true);
  await page.getByLabel('Session order').selectOption('oldest');
  assert.notEqual(await sessions.first().textContent(), newestSession);
  await page.getByLabel('Density').selectOption('comfortable');
  await poll(h.raw, value => value.settings.displayDensity === 'comfortable', 'comfortable density persisted');
  await page.getByLabel('Density').selectOption('compact');
  await poll(h.raw, value => value.settings.displayDensity === 'compact', 'compact density persisted');
  await page.keyboard.press('Escape');
  assert.equal(await view.evaluate(el => document.activeElement === el), true);
  await view.click();
  await page.getByLabel('Session order').selectOption('newest');
  await page.getByLabel('Filter this project').focus();
  assert.equal(await view.getAttribute('aria-expanded'), 'false');
  await button(/^Show \d+ more$/).first().click();
  assert.equal(await page.locator('article').count(), 50);
  await button('Collapse all').click();
  assert.equal(await page.locator('article').count(), 0);
  assert.equal(await checkWidth(), true);
  checks.push('Large project at 320 CSS pixels and 200% zoom retains the initial 25-card batch, Show More, and Collapse all');

  await navigateSidebar(page, 'Review');
  await heading('Review').waitFor();
  await page.getByText(/^\d+ links to review$/).waitFor();
  const reviewCard = page.locator('article').first();
  const reviewActions = reviewCard.getByRole('button', { name: /^(Restore link|Bookmark in Chrome|More link actions)$/ });
  assert.deepEqual(await reviewActions.allTextContents(), ['Restore', 'Bookmark', '']);
  for (const control of await reviewActions.all()) {
    const rect = await control.evaluate(el => {
      const { x, right, top, width, height } = el.getBoundingClientRect();
      return { x, right, top, width, height, viewport: innerWidth };
    });
    assert.ok(rect.width >= 40 && rect.height >= 40 && rect.x >= 0 && rect.right <= rect.viewport);
    assert.equal(rect.top, (await reviewActions.first().boundingBox()).y);
  }
  assert.equal(await checkWidth(), true);
  const bookmarkAction = reviewCard.getByRole('button', { name: 'Bookmark in Chrome' });
  await bookmarkAction.click();
  const bookmark = page.getByRole('dialog');
  await bookmark.getByText(/saves the link in your Chrome bookmarks/).waitFor();
  await page.keyboard.press('Escape');
  await bookmark.waitFor({ state: 'hidden' });
  assert.equal(await bookmarkAction.evaluate(el => document.activeElement === el), true);

  const dueFixture = await h.raw();
  const due = dueFixture.links.find(link => link.status === 'parked');
  due.reminderAt = '2026-11-02T10:00:00.000Z';
  await h.seed(dueFixture);
  await navigateSidebar(page, 'Today');
  const dueCard = page.locator('article').filter({ has: heading(due.title) });
  await dueCard.getByText(/Parked · Due/).waitFor();
  assert.equal(await dueCard.getByRole('button', { name: 'Restore link' }).textContent(), 'Restore');
  assert.equal(await checkWidth(), true);
  await navigateSidebar(page, 'Review');
  await h.seed({ ...fixture, links: [] });
  await page.reload();
  await page.getByText('0 links to review').waitFor();
  await heading('Review queue is clear').waitFor();
  checks.push('Review count, single-row action targets at 200% zoom, native bookmark explanation, focus return and empty queue; Today retains due metadata and Restore');
  console.log(JSON.stringify({ chrome: h.context.browser().version(), checks, output: h.output }));
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 1500));
  throw error;
} finally {
  await h.close();
}
