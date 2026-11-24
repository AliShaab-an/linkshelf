import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHarness, navigateSidebar, choose } from './harness.mjs';

const h = await createHarness();
const { page } = h;
const checks = [];
const button = name => page.getByRole('button', { name, exact: true });
const tabBox = name => page.getByRole('checkbox', { name: `Select Synthetic /${name}`, exact: true });
const dialog = page.getByRole('dialog');
const checkWidth = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const openTabs = () => page.evaluate(async () => (await chrome.tabs.query({})).map(tab => tab.url));
const database = () => h.database();

try {
  const { project } = await h.ok({ type: 'CREATE_PROJECT', payload: { name: 'Duplicate project' } });
  // One link is already saved; two new tabs plus a re-opened copy of the saved URL (with a tracking parameter) are open.
  await h.park(['dup-existing'], project.id);
  const copy = await h.tab('dup-existing?utm_source=newsletter');
  const fresh = await h.tab('dup-fresh');
  const fresh2 = await h.tab('dup-fresh-2');
  await page.bringToFront();
  await page.setViewportSize({ width: 320, height: 760 });
  await navigateSidebar(page, 'Park');
  await tabBox('dup-fresh').waitFor();

  // Worker: duplicates are detected through normalization, and nothing is saved by the check.
  const duplicates = await h.ok({ type: 'GET_PARK_DUPLICATES', payload: { tabIds: [copy.id, fresh.id, fresh2.id] } });
  assert.deepEqual(duplicates.duplicateTabIds, [copy.id]);
  assert.equal((await database()).links.length, 1);

  // Review dialog: names the duplicate and defaults to skip-and-close.
  await tabBox('dup-existing?utm_source=newsletter').check();
  await tabBox('dup-fresh').check();
  await button('Review selection').click();
  await choose(dialog.getByLabel('Save to project'), project.id);
  await dialog.getByText('1 of 2 selected tabs are already saved').waitFor();
  assert.equal(await dialog.getByRole('radio', { name: 'Don’t save them again, but close the tabs' }).isChecked(), true);
  assert.equal(await checkWidth(), true);
  await page.screenshot({ path: path.join(h.output, 'duplicates-review-320.png') });
  await dialog.getByRole('button', { name: 'Save & close 2' }).click();
  await page.getByRole('heading', { name: 'Parking session saved' }).waitFor();
  await page.getByText(/Saved 1 tab to Duplicate project\. Skipped 1 already saved tab\./).waitFor();
  const afterSkip = await database();
  assert.equal(afterSkip.links.filter(link => link.url.includes('dup-existing')).length, 1, 'No second copy of the duplicate');
  assert.equal(afterSkip.links.filter(link => link.url.endsWith('/dup-fresh')).length, 1);
  const urls = await openTabs();
  assert.equal(urls.some(url => url?.includes('dup-existing')), false, 'Duplicate tab was closed');
  assert.equal(urls.some(url => url?.endsWith('/dup-fresh')), false, 'Saved tab was closed');
  checks.push('Park review detects normalized duplicates, defaults to skip-and-close, saves only new tabs and reports skipped ones');

  // Park anyway: choosing to save again keeps both records.
  await h.tab('dup-fresh');
  await page.bringToFront();
  await page.getByRole('button', { name: 'Refresh' }).click();
  await tabBox('dup-fresh').check();
  await button('Review selection').click();
  await choose(dialog.getByLabel('Save to project'), project.id);
  await dialog.getByText('1 of 1 selected tab is already saved').waitFor();
  await dialog.getByRole('button', { name: 'Close 1' }).waitFor();
  await dialog.getByRole('radio', { name: 'Save them again', exact: true }).check();
  await dialog.getByRole('button', { name: 'Save & close 1' }).click();
  await page.getByRole('heading', { name: 'Parking session saved' }).waitFor();
  assert.equal((await database()).links.filter(link => link.url.endsWith('/dup-fresh')).length, 2);
  checks.push('Choosing to save duplicates again keeps both records');

  // Everything is a duplicate: nothing is saved, no session is created, tabs close.
  const sessionsBefore = (await database()).sessions.length;
  await h.tab('dup-fresh');
  await page.bringToFront();
  await page.getByRole('button', { name: 'Refresh' }).click();
  await tabBox('dup-fresh').check();
  await button('Review selection').click();
  await choose(dialog.getByLabel('Save to project'), project.id);
  await dialog.getByRole('button', { name: 'Close 1' }).click();
  await page.getByRole('heading', { name: 'Nothing new to save' }).waitFor();
  assert.equal((await database()).sessions.length, sessionsBefore, 'No empty session is created');
  assert.equal(await page.getByRole('button', { name: 'View saved session' }).count(), 0);
  checks.push('When every tab is already saved, no session is created and the tab closes');

  // Popup: parking the current tab checks for an existing copy first.
  await h.park(['popup-dup'], project.id);
  const reopened = await h.tab('popup-dup');
  const linksBeforePopup = (await database()).links.length;
  const popup = await h.context.newPage();
  await popup.addInitScript(activeTab => {
    chrome.tabs.query = async () => [activeTab];
  }, { id: reopened.id, url: reopened.url, title: reopened.title, windowId: reopened.windowId });
  await popup.goto(`chrome-extension://${h.id}/popup.html`);
  await popup.getByText('This page is already saved').waitFor();
  assert.equal(await popup.getByRole('radio', { name: 'Don’t save it again, but close the tab' }).isChecked(), true);
  await popup.getByRole('button', { name: 'Close tab', exact: true }).click();
  await popup.getByText('Already saved, so nothing new was added. Closed the tab.').waitFor();
  assert.equal((await database()).links.length, linksBeforePopup, 'Popup skip adds no record');
  assert.equal((await openTabs()).some(url => url?.includes('popup-dup')), false, 'Popup closed the duplicate tab');
  await popup.close();
  checks.push('Popup detects an already-saved page, defaults to skip-and-close and adds no second record');

  // Export: Markdown and HTML downloads from Settings, safely escaped and not importable.
  const target = (await database()).links.find(link => link.url.endsWith('/dup-fresh'));
  await h.ok({ type: 'SET_LINK_TAGS', payload: { linkId: target.id, tags: ['export tag'] } });
  const stored = await h.raw();
  const link = stored.links.find(item => item.id === target.id);
  Object.assign(link, { title: '<script>alert(1)</script> [x](javascript:alert(1))', note: '<img src=x onerror=alert(1)>' });
  assert.equal((await h.seed(stored)).status.state, 'healthy');
  await page.reload();
  await navigateSidebar(page, 'Your data');
  const exportSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Export to read or share' }) });
  await choose(exportSection.getByLabel('Project', { exact: true }), { label: 'Duplicate project' });

  async function download(format, extension) {
    await choose(exportSection.getByLabel('Format', { exact: true }), format);
    const [file] = await Promise.all([page.waitForEvent('download'), exportSection.getByRole('button', { name: 'Download export' }).click()]);
    assert.match(file.suggestedFilename(), new RegExp(`^linkshelf-export-\\d{4}-\\d{2}-\\d{2}\\.${extension}$`));
    const saved = path.join(h.output, file.suggestedFilename());
    await file.saveAs(saved);
    return fs.readFile(saved, 'utf8');
  }

  const markdown = await download('markdown', 'md');
  assert.match(markdown, /## Duplicate project/);
  assert.match(markdown, /Tags: export tag/);
  assert.ok(markdown.includes(String.raw`\<script\>alert\(1\)\</script\>`), 'Markdown escapes hostile title');
  assert.doesNotMatch(markdown, /^<script/m);
  await page.getByText(/Export downloaded\. \d+ links? in 1 project\./).waitFor();
  const html = await download('html', 'html');
  assert.doesNotMatch(html, /<script/i);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'HTML escapes hostile title');
  assert.ok(html.includes("default-src 'none'"));
  assert.equal(await checkWidth(), true);
  await page.screenshot({ path: path.join(h.output, 'export-settings-320.png') });
  assert.deepEqual(h.requests, [], 'Export makes no remote requests');
  checks.push('Settings exports one project as Markdown and HTML with escaped content with no remote requests');

  console.log(JSON.stringify({ chrome: h.context.browser().version(), checks, output: h.output }));
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 1500));
  throw error;
} finally {
  await h.close();
}
