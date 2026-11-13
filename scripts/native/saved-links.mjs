import assert from 'node:assert/strict';
import path from 'node:path';
import { createHarness, navigateSidebar, poll } from './harness.mjs';
import { dataset } from '../performance/fixtures.mjs';

const h = await createHarness();
const { page } = h;
const button = name => page.getByRole('button', { name, exact: typeof name === 'string' });
const heading = name => page.getByRole('heading', { name, exact: true });
const selector = page.getByLabel('Project', { exact: true });
const manage = page.getByText('Manage projects', { exact: true });
const status = text => page.getByRole('status').getByText(text);
const checkWidth = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const checks = [];

try {
  const fixture = dataset(1000, 'few', h.base);
  fixture.settings.notificationsEnabled = false;
  const probe = fixture.links.filter(link => link.projectId === 'restore-probe').slice(0, 3);
  fixture.links = fixture.links.filter(link => link.projectId !== 'restore-probe').concat(probe);
  probe[0].title = 'A long synthetic title '.repeat(15);
  probe[0].note = 'A long synthetic note '.repeat(30);
  Object.assign(probe[1], { url: probe[0].url, normalizedUrl: probe[0].normalizedUrl });
  assert.equal((await h.seed(fixture)).status.state, 'healthy');
  await page.setViewportSize({ width: 320, height: 760 });
  await page.reload();
  await navigateSidebar(page, 'Projects');
  await selector.selectOption('restore-probe');
  await heading('Synthetic restoration probe').waitFor();
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
  await page.locator('#project-restore-scope').filter({ hasText: /Opened links stay parked/ }).waitFor();
  await other.close();
  await page.bringToFront();

  await page.getByLabel('Filter this project').fill(probe[2].title);
  await page.getByText('1 of 3 parked links', { exact: true }).waitFor();
  await button('Restore all').click();
  const confirm = page.getByRole('region', { name: /^Restore all 3 links/ });
  const unloaded = confirm.getByRole('button', { name: 'Restore unloaded · Default' });
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
  await page.locator('#project-restore-scope').filter({ hasText: /leave the parked list/ }).waitFor();
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
  await button('Restore normally · Default').click();
  await status(/Opened 2 tabs.*2 marked restored.*could not confirm opening 1 tab/).waitFor();
  await page.getByText(/Some browser opens were not confirmed/).waitFor();
  await h.worker().evaluate(() => globalThis.undoSavedProbe());
  const afterRestore = (await h.raw()).links.filter(link => probe.some(record => record.id === link.id));
  assert.equal(afterRestore.filter(link => link.status === 'restored').length, 2);
  checks.push('Project restore ignores the filter, persists confirmed records, and announces partial browser failures');

  await manage.click();
  await page.getByLabel('New project name').fill('Synthetic new project');
  await button('Create project').click();
  await heading('Synthetic new project').waitFor();
  await button('Rename').click();
  await page.getByLabel('Project name', { exact: true }).fill('Synthetic renamed project');
  await button('Save name').click();
  await heading('Synthetic renamed project').waitFor();
  await selector.selectOption('restore-probe');
  await heading('Synthetic restoration probe').waitFor();
  await button('Delete').click();
  await button('Move to Inbox and delete').click();
  await heading('Inbox').waitFor();
  await poll(h.raw, value => value.links.filter(link => probe.some(record => record.id === link.id)).every(link => link.projectId === 'inbox'), 'all three records moved to Inbox');
  assert.equal(await checkWidth(), true);
  checks.push('Create, rename, and delete through management controls; Inbox retains the parked and restored records');

  await selector.selectOption('project-0');
  await button('Restore session').first().waitFor();
  assert.equal(await page.locator('article').count(), 25);
  await button(/^Show \d+ more$/).first().click();
  assert.equal(await page.locator('article').count(), 50);
  await button('Collapse all').click();
  assert.equal(await page.locator('article').count(), 0);
  assert.equal(await checkWidth(), true);
  checks.push('Large project at 320 CSS pixels and 200% zoom retains the initial 25-card batch, Show More, and Collapse all');
  console.log(JSON.stringify({ chrome: h.context.browser().version(), checks, output: h.output }));
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 1500));
  throw error;
} finally {
  await h.close();
}
