import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHarness, navigateSidebar, poll, chosenValue, choose } from './harness.mjs';
import { backup } from './fixtures.mjs';
import { dataset } from '../performance/fixtures.mjs';

const h = await createHarness();
const page = h.page;
const nav = surface => surface.getByRole('navigation', { name: 'LinkShelf sections' });
const destination = (surface, name) => nav(surface).getByRole('button', { name, exact: true });
const sections = ['Park', 'Saved', 'Search', 'Today'];
const navLabels = [...sections, 'Manage'];
const managerTabs = () => h.context.pages().filter(surface => new URL(surface.url()).pathname === '/manager.html');
const active = target => poll(() => target.evaluate(el => document.activeElement === el), Boolean, 'expected focus');
const state = () => page.evaluate(async () => (await chrome.storage.local.get('linkshelfUiState')).linkshelfUiState);
const windowId = surface => surface.evaluate(async () => (await chrome.windows.getCurrent()).id);
const intents = () => page.evaluate(async () => (await chrome.storage.session.get('linkshelfSidePanelIntents')).linkshelfSidePanelIntents);
const publish = entries => page.evaluate(entries => chrome.storage.session.set({ linkshelfSidePanelIntents: entries }), entries);
const search = id => ({ section: 'search', focusTarget: 'search-query', requestId: id });
const today = id => ({ section: 'today', requestId: id });
const checks = [], layouts = [];

async function check(name, run) {
  await run();
  checks.push(name);
  console.log('PASS', name);
}

async function layout(label) {
  const metrics = await nav(page).evaluate(el => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    controls: [...el.querySelectorAll('button')].map(button => {
      const { left, right, top, width, height } = button.getBoundingClientRect();
      const label = button.querySelector('span').getBoundingClientRect();
      return { label: button.querySelector('span').textContent.trim(), left, right, top, width, height,
        fits: label.left >= left && label.right <= right };
    }),
  }));
  assert.deepEqual(metrics.controls.map(control => control.label), navLabels);
  assert.ok(metrics.documentWidth <= metrics.viewport + 1);
  assert.ok(metrics.controls.every(control => control.left >= 0 && control.right <= metrics.viewport &&
    control.fits && control.width >= 40 && control.height >= 44));
  assert.equal(new Set(metrics.controls.map(control => control.top)).size, 1);
  layouts.push({ label, ...metrics });
  await page.screenshot({ path: path.join(h.output, `navigation-${label}.png`) });
}

try {
  await check('Four daily destinations and Manage fit one row through 200% Chrome zoom', async () => {
    await destination(page, 'Saved').waitFor();
    assert.equal(await destination(page, 'Saved').getAttribute('aria-current'), 'page');
    for (const width of [320, 400, 600, 800]) {
      await page.setViewportSize({ width, height: 760 });
      await layout(width);
    }
    await page.setViewportSize({ width: 640, height: 760 });
    const zoom = value => page.evaluate(async value => chrome.tabs.setZoom((await chrome.tabs.getCurrent()).id, value), value);
    await zoom(2);
    await poll(() => page.evaluate(() => innerWidth), width => width === 320, '200% zoom applied');
    await layout('200-percent');
    await zoom(1);
    await poll(() => page.evaluate(() => innerWidth), width => width === 640, 'zoom reset');
  });

  await page.setViewportSize({ width: 320, height: 760 });
  await check('All destinations support direct navigation, keyboard order, and a single current page', async () => {
    await destination(page, 'Park').focus();
    for (const label of navLabels.slice(1)) {
      await page.keyboard.press('Tab');
      await active(destination(page, label));
    }
    await page.keyboard.press('Shift+Tab');
    const todayButton = destination(page, 'Today');
    assert.notEqual(await todayButton.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    await page.keyboard.press('Space');
    assert.equal(await todayButton.getAttribute('aria-current'), 'page');
    await active(todayButton);
    await page.keyboard.press('Shift+Tab');
    await active(destination(page, 'Search'));
    for (const name of sections) {
      await navigateSidebar(page, name);
      assert.equal(await destination(page, name).getAttribute('aria-current'), 'page');
      assert.equal(await nav(page).locator('[aria-current="page"]').count(), 1);
    }
    assert.equal(await destination(page, 'Manage').getAttribute('aria-current'), null);
    await navigateSidebar(page, 'Projects');
    await poll(state, value => value?.lastSection === 'projects', 'persisted Saved ID');
  });

  await check('Manage opens Home, Review, Archive, and Settings in one reused tab', async () => {
    assert.equal(managerTabs().length, 0);
    await destination(page, 'Manage').click();
    await poll(() => managerTabs().length, count => count === 1, 'Manager tab opened');
    const manager = managerTabs()[0];
    await manager.waitForLoadState();
    assert.equal(new URL(manager.url()).hash, '#home');
    assert.equal(await windowId(manager), await windowId(page));
    await manager.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    assert.deepEqual(await manager.getByRole('navigation', { name: 'Manager sections' }).getByRole('link').allTextContents(), ['Home', 'Library', 'Review', 'Archive', 'Settings']);
    await manager.getByRole('link', { name: 'Archive', exact: true }).click();
    await manager.getByRole('heading', { name: 'Archive', exact: true }).waitFor();
    assert.equal(await manager.title(), 'Archive · LinkShelf Manager');
    await manager.goBack();
    await manager.getByRole('heading', { name: 'Home', exact: true }).waitFor();

    // Quick settings links to the full Settings page in the same tab.
    await page.bringToFront();
    await page.getByRole('button', { name: 'Quick settings' }).click();
    await page.getByRole('button', { name: 'All settings' }).click();
    await poll(() => new URL(manager.url()).hash, hash => hash === '#settings', 'Manager tab moved to Settings');
    await manager.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    assert.equal(managerTabs().length, 1);
    // Settings is grouped into General, Your data and About, each reachable from a jump button.
    const groupTitles = manager.getByRole('region').locator('h3');
    assert.deepEqual(await groupTitles.allTextContents(), ['General', 'Your data', 'About']);
    await manager.getByRole('navigation', { name: 'Settings groups' }).getByRole('button', { name: 'About' }).click();
    await poll(() => manager.evaluate(() => document.activeElement?.textContent), text => text === 'About', 'About heading focused');
    await manager.getByRole('region', { name: 'Why these permissions?' }).waitFor();
    await page.screenshot({ path: path.join(h.output, 'navigation-manage-320.png') });
    await manager.setViewportSize({ width: 1024, height: 760 });
    await manager.screenshot({ path: path.join(h.output, 'manager-settings-1024.png') });
    await manager.setViewportSize({ width: 360, height: 760 });
    await manager.screenshot({ path: path.join(h.output, 'manager-settings-360.png') });
    assert.ok(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await manager.close();
    await page.bringToFront();
    await page.keyboard.press('Escape');

    // A sidebar last left on a section that moved opens Saved.
    await page.evaluate(async () => {
      const { linkshelfUiState } = await chrome.storage.local.get('linkshelfUiState');
      await chrome.storage.local.set({ linkshelfUiState: { ...linkshelfUiState, lastSection: 'settings' } });
    });
    await page.reload();
    await destination(page, 'Saved').waitFor();
    assert.equal(await destination(page, 'Saved').getAttribute('aria-current'), 'page');
  });

  const data = dataset(100, 'few', h.base);
  data.settings.notificationsEnabled = false;
  data.links[0].reminderAt = '2000-01-01T00:00:00.000Z';
  data.links[0].title = 'Navigation probe original';
  await h.seed(data);
  await check('Today without notifications, Quick Settings keyboard dismissal and nonoverlapping disclosure', async () => {
    await navigateSidebar(page, 'Today');
    await page.getByRole('heading', { name: data.links[0].title }).waitFor();
    const quick = page.getByRole('button', { name: 'Quick settings' });
    await quick.focus();
    await page.keyboard.press('Enter');
    const panel = page.getByRole('group', { name: 'Quick settings' });
    const reminders = panel.getByRole('switch', { name: 'Desktop reminders' });
    await reminders.waitFor();
    assert.ok((await panel.boundingBox()).y >= (await nav(page).boundingBox()).y + (await nav(page).boundingBox()).height - 1);
    await page.keyboard.press('Tab');
    await active(reminders);
    await page.keyboard.press('Escape');
    await active(quick);
    await panel.waitFor({ state: 'hidden' });
    await quick.click();
    await panel.waitFor();
    await destination(page, 'Today').click();
    await panel.waitFor({ state: 'hidden' });
  });

  await check('Search keeps query only in the open sidebar and refreshes records on return', async () => {
    await navigateSidebar(page, 'Search');
    const input = page.getByRole('searchbox', { name: 'Search saved links' });
    await active(input);
    await input.fill('Navigation probe');
    await page.getByRole('heading', { name: 'Navigation probe original' }).waitFor();
    await navigateSidebar(page, 'Projects');
    assert.equal(await input.count(), 0);
    const changed = structuredClone(data);
    changed.links[0].title = 'Navigation probe updated';
    await h.seed(changed);
    await navigateSidebar(page, 'Search');
    await active(input);
    assert.equal(await input.inputValue(), 'Navigation probe');
    await page.getByRole('heading', { name: 'Navigation probe updated' }).waitFor();
    assert.equal(JSON.stringify(await state()).includes('Navigation probe'), false);
    await poll(state, value => value?.lastSection === 'search', 'persisted Search destination');
    await page.reload();
    await input.waitFor();
    assert.equal(await input.inputValue(), '');
  });

  await check('Returning project preferences and malformed state use established fallback rules', async () => {
    const set = value => page.evaluate(value => chrome.storage.local.set({ linkshelfUiState: value }), value);
    await set({ lastSection: 'projects', selectedProjectId: 'restore-probe', sessionOrder: 'oldest', expandedSessionIds: ['restore-session'] });
    await page.reload();
    const project = page.getByLabel('Project', { exact: true });
    await poll(() => chosenValue(project), value => value === 'restore-probe', 'persisted project');
    const view = page.getByRole('button', { name: 'View options' });
    await view.click();
    assert.equal(await chosenValue(page.getByRole('combobox', { name: 'Session order' })), 'oldest');
    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: 'Navigation probe updated' }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 280));
    await poll(() => project.evaluate(el => {
      const toolbar = el.closest('.projects-toolbar').getBoundingClientRect();
      const sections = document.querySelector('nav[aria-label="LinkShelf sections"]').getBoundingClientRect();
      return scrollY > 100 && toolbar.top >= sections.bottom - 1;
    }), Boolean, 'Projects toolbar stays below the sticky navigation');
    await set({ lastSection: 'projects', selectedProjectId: 'missing-project', sessionOrder: 'oldest', expandedSessionIds: [] });
    await page.reload();
    await poll(() => chosenValue(project), value => value === 'inbox', 'removed project falls back to Inbox');
    await set({ lastSection: 'saved' });
    await page.reload();
    await destination(page, 'Saved').waitFor();
    assert.equal(await destination(page, 'Saved').getAttribute('aria-current'), 'page');
    await view.click();
    assert.equal(await chosenValue(page.getByRole('combobox', { name: 'Session order' })), 'newest');
  });

  await check('Two real windows consume only their own intents, repeated Search refocuses and duplicates stay ignored', async () => {
    const first = await windowId(page);
    const opened = h.context.waitForEvent('page');
    await page.evaluate(url => chrome.windows.create({ url, focused: true }), page.url());
    const other = await opened;
    await nav(other).waitFor();
    const second = await windowId(other);
    assert.notEqual(first, second);
    await publish({ [first]: search('one'), [second]: today('other') });
    await active(page.getByRole('searchbox', { name: 'Search saved links' }));
    await other.getByRole('heading', { name: 'Today', exact: true }).waitFor();
    await poll(intents, value => Object.keys(value ?? {}).length === 0, 'both window requests consumed');
    await destination(page, 'Today').focus();
    await publish({ [first]: search('repeat') });
    await active(page.getByRole('searchbox', { name: 'Search saved links' }));
    await navigateSidebar(page, 'Projects');
    await publish({ [first]: search('one') });
    await poll(intents, value => Object.keys(value ?? {}).length === 0, 'duplicate consumed');
    assert.equal(await destination(page, 'Saved').getAttribute('aria-current'), 'page');
    assert.equal(await destination(other, 'Today').getAttribute('aria-current'), 'page');
    await other.close();
    await page.bringToFront();
  });

  await check('Modal blocks navigation and the consumed request cannot replay after Escape', async () => {
    await navigateSidebar(page, 'Projects');
    await choose(page.getByRole('combobox', { name: 'Project', exact: true }), 'restore-probe');
    const trigger = page.locator('article').first().getByRole('button', { name: 'More link actions' });
    await trigger.click();
    await page.getByRole('group', { name: 'Link actions' }).getByRole('button', { name: 'Remove' }).click();
    const dialog = page.getByRole('dialog');
    await active(dialog.getByRole('button', { name: 'Cancel' }));
    const id = await windowId(page);
    await publish({ [id]: today('blocked') });
    await poll(intents, value => Object.keys(value ?? {}).length === 0, 'modal request consumed');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await active(trigger);
    await publish({ [id]: today('blocked') });
    await poll(intents, value => Object.keys(value ?? {}).length === 0, 'blocked replay consumed');
    await page.getByRole('heading', { name: 'Saved', exact: true }).waitFor();
    await navigateSidebar(page, 'Today');
    await page.getByRole('heading', { name: 'Today', exact: true }).waitFor();
  });

  await check('Popup forwards the active tab window from the user click and handles a failed open', async () => {
    const popup = await h.context.newPage();
    await popup.addInitScript(() => {
      const open = chrome.sidePanel.open.bind(chrome.sidePanel);
      globalThis.popupProbe = { fail: true, windowId: undefined, opened: false };
      chrome.sidePanel.open = async options => {
        globalThis.popupProbe.windowId = options.windowId;
        if (globalThis.popupProbe.fail) throw new Error('Synthetic popup open failure.');
        await open(options);
        globalThis.popupProbe.opened = true;
      };
      window.close = () => undefined;
    });
    await popup.goto(`chrome-extension://${h.id}/popup.html`);
    const launch = popup.getByRole('button', { name: 'Open sidebar', exact: true });
    await popup.getByText(/Chrome doesn’t allow LinkShelf to park this page/).waitFor();
    assert.equal(await popup.getByRole('combobox', { name: 'Save to' }).count(), 0);
    await launch.click();
    await popup.getByText('Synthetic popup open failure.', { exact: true }).waitFor();
    assert.equal(await popup.evaluate(() => globalThis.popupProbe.windowId), await windowId(popup));
    await popup.evaluate(() => { globalThis.popupProbe.fail = false; });
    await launch.click();
    await poll(() => popup.evaluate(() => globalThis.popupProbe.opened), Boolean, 'native Side Panel open resolved');
    await popup.close();
  });

  await check('Unhealthy storage hides workspace actions and leaves raw recovery export available', async () => {
    const original = await h.database();
    const corrupted = structuredClone(original);
    corrupted.links[0].sessionId = 'missing-session';
    await h.seed(corrupted);
    await page.getByRole('button', { name: 'Export raw recovery data' }).waitFor();
    assert.equal(await nav(page).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Quick settings' }).count(), 0);
    const id = await windowId(page);
    await publish({ [id]: search('during-recovery') });
    await poll(intents, value => Object.keys(value ?? {}).length === 0, 'recovery intent consumed');
    assert.deepEqual(await h.raw(), corrupted);
    const rawDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export raw recovery data' }).click();
    const rawFile = await (await rawDownload).path();
    assert.deepEqual(JSON.parse(await fs.readFile(rawFile, 'utf8')).rawValue, corrupted);
    await page.getByLabel('I saved the raw recovery file securely.').check();
    await page.getByLabel('Recovery backup file').setInputFiles({
      name: 'trusted.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup(original))),
    });
    await page.getByRole('button', { name: 'Review recovery backup' }).click();
    await page.getByRole('button', { name: 'Replace stored data from backup' }).click();
    await destination(page, 'Search').waitFor();
    await active(page.getByRole('searchbox', { name: 'Search saved links' }));
    assert.deepEqual(await h.raw(), original);
  });
} finally {
  const output = path.join(h.output, 'navigation-results.json');
  await fs.writeFile(output, JSON.stringify({ chrome: h.context.browser().version(), checks, layouts }, null, 2));
  console.log(JSON.stringify({ output, checks: checks.length }));
  await h.close();
}
