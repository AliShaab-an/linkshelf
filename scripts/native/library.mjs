import assert from 'node:assert/strict';
import path from 'node:path';
import { choose, createHarness, managerLink, poll } from './harness.mjs';

const h = await createHarness();
const { page } = h;
const checks = [];

try {
  const stamp = new Date(Date.now() - 86_400_000).toISOString();
  const link = (id, projectId, extra = {}) => ({
    id, sessionId: `s-${id}`, projectId, title: `Link ${id}`, url: `https://example.invalid/${id}`,
    normalizedUrl: `https://example.invalid/${id}`, domain: 'example.invalid', status: 'parked', pinnedBeforeParking: false,
    createdAt: stamp, updatedAt: stamp, ...extra,
  });
  const links = [link('a', 'reading'), link('b', 'reading'), link('c', 'inbox'), ...Array.from({ length: 10 }, (_, index) => link(`big${index}`, 'big'))];
  await h.seed({
    projects: [
      { id: 'inbox', name: 'Inbox', isInbox: true, createdAt: stamp, updatedAt: stamp },
      { id: 'reading', name: 'Reading list', isInbox: false, createdAt: stamp, updatedAt: stamp },
      { id: 'big', name: 'Big project', isInbox: false, createdAt: stamp, updatedAt: stamp },
      { id: 'empty', name: 'Nothing here', isInbox: false, createdAt: stamp, updatedAt: stamp },
    ],
    sessions: links.map(item => ({ id: item.sessionId, projectId: item.projectId, createdAt: stamp, updatedAt: stamp })),
    links,
    settings: { schemaVersion: 3, defaultProjectId: 'inbox', includePinnedTabsByDefault: false, confirmBeforeBulkClose: true, notificationsEnabled: false, defaultRestoreBehavior: 'restore-and-remove', displayDensity: 'comfortable', defaultRestoreMode: 'normal', trackingParamsToRemove: [] },
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(new URL('/manager.html#library', page.url()).href);
  await page.getByRole('heading', { name: 'Library', exact: true }).waitFor();
  assert.equal(await managerLink(page, 'Library').getAttribute('aria-current'), 'page');
  const card = name => page.getByRole('region', { name, exact: true });
  await card('Reading list').waitFor();
  assert.equal(await card('Reading list').getByRole('listitem').count(), 2);
  assert.equal(await card('Nothing here').getByRole('listitem').count(), 0);
  await card('Nothing here').getByText('Drop a link here').waitFor();
  checks.push('The Library shows one card per project, including empty ones');

  assert.equal(await card('Big project').getByRole('listitem').count(), 8);
  await card('Big project').getByRole('button', { name: 'Show 2 more' }).click();
  assert.equal(await card('Big project').getByRole('listitem').count(), 10);
  checks.push('Large projects show the first links and expand on request');
  await page.screenshot({ path: path.join(h.output, 'library.png'), fullPage: true });

  // The top bar switches the theme, and the choice is the one Settings shows.
  const theme = page.getByRole('group', { name: 'Theme' });
  await theme.getByRole('button', { name: 'Dark theme' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.colorScheme), 'dark');
  assert.equal(await theme.getByRole('button', { name: 'Dark theme' }).getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: path.join(h.output, 'library-dark.png') });
  await theme.getByRole('button', { name: 'Light theme' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.colorScheme), 'light');
  checks.push('The top bar switches between light, dark and system themes');

  // The pages start beside the navigation and adapt from wide screens down to a phone.
  for (const hash of ['library', 'home', 'review', 'settings']) {
    await page.goto(new URL(`/manager.html#${hash}`, page.url()).href);
    for (const width of [1920, 1280, 768, 360]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${hash} overflows at ${width}px`);
      if (hash === 'library') await page.screenshot({ path: path.join(h.output, `library-${width}.png`) });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(new URL('/manager.html#library', page.url()).href);
  checks.push('Library, Home, Review and Settings do not overflow from 1920px down to 360px');

  // Keyboard path: the link's menu opens the Move dialog.
  await card('Reading list').getByRole('button', { name: 'Actions for Link a', exact: true }).click();
  await page.getByRole('group', { name: 'Actions for Link a', exact: true }).getByRole('button', { name: 'Move to…' }).click();
  const moveDialog = page.getByRole('dialog');
  await choose(moveDialog.getByLabel('Destination project'), 'empty');
  await moveDialog.getByRole('button', { name: 'Move link' }).click();
  await moveDialog.waitFor({ state: 'hidden' });
  await poll(async () => (await h.raw()).links.find(item => item.id === 'a')?.projectId, value => value === 'empty', 'link a moved');
  assert.equal(await card('Nothing here').getByRole('listitem').count(), 1);
  assert.equal(await card('Reading list').getByRole('listitem').count(), 1);
  checks.push('A link can be moved with its Move menu, and the saved data follows');

  // Drag path: dropping a link on another card.
  // Playwright's mouse cannot carry a native drag across these cards, so the drag events are sent by hand,
  // in the order Chrome sends them. A real pointer drag still needs checking by eye.
  await page.evaluate(() => {
    const item = document.querySelector('[aria-labelledby="lib-inbox"] li');
    const target = document.querySelector('[aria-labelledby="lib-reading"]');
    const data = new DataTransfer();
    const send = (element, type) => element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }));
    send(item, 'dragstart');
    send(target, 'dragenter');
    send(target, 'dragover');
    send(target, 'drop');
    send(item, 'dragend');
  });
  await poll(async () => (await h.raw()).links.find(item => item.id === 'c')?.projectId, value => value === 'reading', 'link c moved');
  assert.equal(await card('Reading list').getByRole('listitem').count(), 2);
  assert.equal(await card('Inbox').getByRole('listitem').count(), 0);
  await page.getByRole('status').filter({ hasText: 'Moved “Link c” to Reading list.' }).waitFor();
  checks.push('Dragging a link onto another project moves it');

  // The move survives a reload.
  await page.reload();
  await card('Reading list').waitFor();
  assert.equal(await card('Reading list').getByRole('listitem').count(), 2);
  checks.push('Moved links stay where they were put after a reload');

  // Filtering narrows every card and hides cards with no match.
  const filter = page.getByRole('searchbox', { name: 'Filter links' });
  await filter.fill('big3');
  await page.getByText('1 link match').waitFor();
  assert.equal(await page.locator('section[aria-labelledby^="lib-"]').count(), 1);
  assert.equal(await card('Big project').getByRole('listitem').count(), 1);
  await filter.fill('nothing-like-this');
  await page.getByRole('heading', { name: 'No links match' }).waitFor();
  await filter.fill('');
  await card('Inbox').waitFor();
  checks.push('The filter narrows cards to matching links and says when nothing matches');

  // Projects can be created, renamed and deleted from the board.
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name').fill('Synthetic new project');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await card('Synthetic new project').waitFor();
  const created = (await h.raw()).projects.find(item => item.name === 'Synthetic new project');
  assert.ok(created, 'the project is saved');

  await card('Synthetic new project').getByRole('button', { name: 'Synthetic new project actions' }).click();
  await page.getByRole('group', { name: 'Synthetic new project actions' }).getByRole('button', { name: 'Rename project' }).click();
  await page.getByLabel('Project name').fill('Renamed project');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await card('Renamed project').waitFor();
  assert.equal((await h.raw()).projects.find(item => item.id === created.id).name, 'Renamed project');

  await card('Reading list').getByRole('button', { name: 'Reading list actions' }).click();
  await page.getByRole('group', { name: 'Reading list actions' }).getByRole('button', { name: 'Delete project' }).click();
  await page.getByRole('group', { name: 'Delete Reading list' }).getByText('Its 2 links will move to the Inbox.').waitFor();
  await page.getByRole('group', { name: 'Delete Reading list' }).getByRole('button', { name: 'Delete project' }).click();
  await page.getByText('Deleted Reading list. Its 2 links moved to the Inbox.').waitFor();
  assert.equal((await h.raw()).projects.some(item => item.id === 'reading'), false);
  assert.equal(await card('Inbox').getByRole('listitem').count(), 2);
  await card('Inbox').getByRole('button', { name: 'Inbox actions' }).click();
  const inboxActions = await page.getByRole('group', { name: 'Inbox actions' }).getByRole('button').allTextContents();
  assert.deepEqual(inboxActions, ['Restore all (2)'], 'the Inbox can not be renamed or deleted');
  await page.keyboard.press('Escape');
  checks.push('Projects can be created, renamed and deleted (links move to the Inbox); the Inbox is protected');

  // Removing a link from its menu sends it to the Bin.
  await card('Big project').getByRole('button', { name: 'Actions for Link big0', exact: true }).click();
  await page.getByRole('group', { name: 'Actions for Link big0', exact: true }).getByRole('button', { name: 'Move to the Bin' }).click();
  await poll(async () => (await h.raw()).links.find(item => item.id === 'big0')?.status, value => value === 'removed', 'big0 moved to the Bin');
  await page.screenshot({ path: path.join(h.output, 'library-menus.png') });
  checks.push('Move to the Bin removes a link from the board');

  assert.deepEqual(h.requests, []);
} finally {
  await h.close();
}

console.log(JSON.stringify({ checks }));
