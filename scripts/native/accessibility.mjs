import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { createHarness, poll } from './harness.mjs';
import { backup } from './fixtures.mjs';
import { dataset } from '../performance/fixtures.mjs';

const h = await createHarness({ prepareBuild: async (destination) => {
  // Compile only into the disposable Chrome snapshot, with React's development effects enabled.
  await build({
    configFile: false, mode: 'development', logLevel: 'error', esbuild: { jsx: 'automatic' },
    define: { 'process.env.NODE_ENV': '"development"' },
    build: {
      outDir: destination, emptyOutDir: false, minify: false,
      lib: { entry: 'scripts/native/accessibility-fixture.tsx', name: 'LinkShelfAccessibilityFixture',
        formats: ['iife'], fileName: () => 'accessibility-fixture.js' },
    },
  });
  await fs.writeFile(path.join(destination, 'accessibility-fixture.html'),
    '<!doctype html><html lang="en"><meta charset="utf-8"><div id="root"></div><script src="accessibility-fixture.js"></script></html>');
} });

const checks = [];
const page = h.page;
const button = (name, surface = page) => surface.getByRole('button', { name, exact: true });
const heading = (name, surface = page) => surface.getByRole('heading', { name, exact: true });
const dialog = page.getByRole('dialog');
const actions = page.getByRole('group', { name: 'Link actions', exact: true });
const more = card => card.getByRole('button', { name: 'More link actions', exact: true });
const card = name => page.locator('article').filter({ has: heading(name) });
const active = locator => poll(() => locator.evaluate(el => el === document.activeElement), Boolean, 'expected active element');
const waitClosed = () => dialog.waitFor({ state: 'hidden' });
const backdrop = () => page.mouse.click(4, 4);
const openAction = async (target, action) => {
  await more(target).click();
  await actions.getByRole('button', { name: action, exact: true }).click();
};

async function scenario(name, run) {
  await run();
  checks.push(name);
  console.log('PASS', name);
}

try {
  const fixture = dataset(100, 'few', h.base);
  const longTitle = 'Long synthetic title ' + 'wrapping words '.repeat(18).trim();
  fixture.links[0].title = longTitle;
  await h.seed(fixture);
  await page.addInitScript(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    const control = globalThis.accessibilityProbe = { hold: '', calls: 0, finish: null, types: [] };
    chrome.runtime.sendMessage = async (message) => {
      control.types.push(message.type);
      if (message.type !== control.hold) return send(message);
      control.calls++;
      const outcome = await new Promise(resolve => { control.finish = resolve; });
      if (outcome === 'error') return { success: false, error: { code: 'STORAGE_FAILED', message: 'Synthetic operation failure.' } };
      const result = await send(message);
      return outcome === 'warning' ? { ...result, warnings: [...(result.warnings ?? []), 'Synthetic secondary warning.'] } : result;
    };
  });
  await page.reload();
  const hold = type => page.evaluate(type => Object.assign(globalThis.accessibilityProbe, { hold: type, calls: 0 }), type);
  const finish = async outcome => {
    assert.equal(await page.evaluate(() => globalThis.accessibilityProbe.calls), 1);
    await page.evaluate(outcome => {
      const probe = globalThis.accessibilityProbe;
      probe.hold = '';
      probe.finish(outcome);
    }, outcome);
  };

  await scenario('Development Strict Mode, hidden/disabled/inert controls, loading, two open attempts, and unmount', async () => {
    const test = await h.surface('accessibility-fixture');
    const fixtureDialog = test.getByRole('dialog', { name: 'Fixture dialog' });
    const fixtureHeading = heading('Fixture dialog', test);
    const trigger = button('Open fixture', test);
    const invoke = action => test.locator(`[data-action="${action}"]`).evaluate(element => element.click());
    await poll(() => test.locator('#effect-runs').textContent(), text => Number(text) >= 2, 'React development effect replay');
    await trigger.click();
    await fixtureDialog.waitFor();
    await active(fixtureHeading);
    await test.keyboard.press('Tab');
    await test.keyboard.press('Shift+Tab');
    await active(fixtureHeading);
    await invoke('add');
    await active(fixtureHeading);
    await test.keyboard.press('Tab');
    await active(button('Loaded control', test));
    await invoke('remove');
    await active(fixtureHeading);
    await invoke('overlap');
    assert.equal(await test.locator('dialog[open]').count(), 1);
    await invoke('unmount');
    await fixtureDialog.waitFor({ state: 'hidden' });
    await active(trigger);
    await button('Background 0', test).click();
    await button('Background 1', test).waitFor();
    await test.close();
  });

  await page.setViewportSize({ width: 400, height: 760 });
  await button('Projects').click();
  await page.getByLabel('Project', { exact: true }).selectOption('restore-probe');
  await button('Expand all').click();
  const first = card(longTitle);
  const firstMore = more(first);

  await scenario('Disclosure pointer and keyboard interaction, ordinary Tab order, outside and Escape dismissal', async () => {
    await firstMore.click();
    await actions.waitFor();
    const id = await firstMore.getAttribute('aria-controls');
    assert.equal(await actions.getAttribute('id'), id);
    assert.equal(await firstMore.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Tab');
    await active(actions.getByRole('button', { name: 'Archive', exact: true }));
    await page.keyboard.press('Shift+Tab');
    await active(firstMore);
    await page.keyboard.press('Escape');
    await actions.waitFor({ state: 'hidden' });
    await active(firstMore);
    await page.keyboard.press('Space');
    await actions.waitFor();
    await heading('Synthetic restoration probe').focus();
    await actions.waitFor({ state: 'hidden' });
    await firstMore.click();
    await more(card(fixture.links[1].title)).click();
    assert.equal(await actions.count(), 1);
    assert.equal(await firstMore.getAttribute('aria-expanded'), 'false');
    await heading('Synthetic restoration probe').click();
    await actions.waitFor({ state: 'hidden' });
    await firstMore.focus();
    await page.keyboard.press('Enter');
    await actions.waitFor();
    await page.keyboard.press('Escape');
    await active(firstMore);
  });

  await scenario('Native modal containment and inert background, click, drag, Escape and cancellation', async () => {
    await page.evaluate(() => { globalThis.accessibilityProbe.types.length = 0; });
    await openAction(first, 'Remove');
    assert.deepEqual(await page.evaluate(() => globalThis.accessibilityProbe.types), []);
    const cancel = dialog.getByRole('button', { name: 'Cancel' });
    const remove = dialog.getByRole('button', { name: 'Remove link' });
    await active(cancel);
    await page.keyboard.press('Shift+Tab');
    await active(remove);
    await page.keyboard.press('Tab');
    await active(cancel);
    for (const width of [320, 400, 600, 800]) {
      await page.setViewportSize({ width, height: 360 });
      const geometry = await dialog.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return { fits: rect.left >= 0 && rect.right <= innerWidth && el.scrollWidth <= el.clientWidth + 1,
          scrolls: el.scrollHeight > el.clientHeight };
      });
      assert.equal(geometry.fits, true);
      if (width === 320) assert.equal(geometry.scrolls, true);
      await cancel.focus();
      await active(cancel);
    }
    await page.setViewportSize({ width: 400, height: 760 });
    await dialog.getByText(/removed-state record/).click();
    const rect = await dialog.boundingBox();
    await page.mouse.move(rect.x + 5, rect.y + 10);
    await page.mouse.down();
    await page.mouse.move(4, 4);
    await page.mouse.up();
    assert.equal(await dialog.count(), 1);
    const search = await button('Search').boundingBox();
    await page.mouse.click(search.x + 3, search.y + 3);
    await waitClosed();
    await heading('Synthetic restoration probe').waitFor();
    await active(firstMore);
    await openAction(first, 'Remove');
    await page.keyboard.press('Escape');
    await waitClosed();
    await active(firstMore);
  });

  await scenario('Pending blocks repeat confirmation, background navigation, Escape and backdrop; error and warning are distinct', async () => {
    await openAction(first, 'Remove');
    await hold('REMOVE_LINK');
    await dialog.getByRole('button', { name: 'Remove link' }).click();
    await dialog.getByRole('status').getByText('Updating link…').waitFor();
    await page.keyboard.press('Escape');
    await backdrop();
    const foreignWindow = await page.evaluate(async () => {
      const window = await chrome.windows.getCurrent();
      const foreignWindow = window.id + 1_000_000;
      await chrome.storage.session.set({ linkshelfSidePanelIntents: {
        [window.id]: { section: 'search', focusTarget: 'search-query', requestId: 'synthetic-modal-test' },
        [foreignWindow]: { section: 'today', requestId: 'synthetic-other-window' },
      } });
      document.getElementById('project-selector').focus();
      return String(foreignWindow);
    });
    const remaining = await poll(() => page.evaluate(async () => {
      const value = await chrome.storage.session.get('linkshelfSidePanelIntents');
      return Object.keys(value.linkshelfSidePanelIntents ?? {});
    }), keys => keys.length === 1 && keys[0] === foreignWindow, 'modal consumes only the current window intent');
    assert.deepEqual(remaining, [foreignWindow]);
    assert.equal(await page.getByRole('searchbox', { name: 'Search saved links' }).count(), 0);
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
    await page.keyboard.press('Enter');
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Cancel' }).isDisabled(), true);
    await finish('error');
    await dialog.getByRole('alert').getByText('Synthetic operation failure.').waitFor();
    assert.equal(await dialog.getByText('Updating link…').count(), 0);
    await hold('REMOVE_LINK');
    await dialog.getByRole('button', { name: 'Remove link' }).click();
    await dialog.getByRole('status').getByText('Updating link…').waitFor();
    assert.equal(await dialog.getByText('Synthetic operation failure.').count(), 0);
    await finish('warning');
    await waitClosed();
    await active(heading('Synthetic restoration probe'));
    // A concurrent session-map writer may still hold a copy of the consumed request.
    await page.evaluate(async () => {
      const { linkshelfSidePanelIntents } = await chrome.storage.session.get('linkshelfSidePanelIntents');
      const { id } = await chrome.windows.getCurrent();
      await chrome.storage.session.set({ linkshelfSidePanelIntents: {
        ...linkshelfSidePanelIntents,
        [id]: { section: 'search', focusTarget: 'search-query', requestId: 'synthetic-modal-test' },
      } });
    });
    await poll(() => page.evaluate(async () => {
      const { linkshelfSidePanelIntents } = await chrome.storage.session.get('linkshelfSidePanelIntents');
      return Object.keys(linkshelfSidePanelIntents ?? {});
    }), keys => keys.length === 1 && keys[0] === foreignWindow, 'consumed request cannot replay after dismissal');
    assert.equal(await page.getByRole('searchbox', { name: 'Search saved links' }).count(), 0);
    const status = page.getByRole('status').filter({ hasText: 'Synthetic secondary warning.' });
    await status.getByText(/Removed .* from LinkShelf/).waitFor();
    assert.equal(await status.count(), 1);
    assert.equal((await h.database()).links.find(link => link.id === 'link-0').status, 'removed');
  });

  await scenario('Review move, create bookmark, duplicate prompt, and opening the existing native bookmark', async () => {
    await button('Review').click();
    const moving = card(fixture.links[1].title);
    await openAction(moving, 'Move to project');
    const destination = dialog.getByLabel('Destination project');
    await active(destination);
    await destination.selectOption('inbox');
    await dialog.getByRole('button', { name: 'Move link' }).click();
    await waitClosed();
    await active(more(moving));
    assert.equal((await h.database()).links.find(link => link.id === 'link-1').projectId, 'inbox');

    const converted = card(fixture.links[2].title);
    await converted.getByRole('button', { name: 'Keep', exact: true }).click();
    await active(dialog.getByRole('heading'));
    await dialog.getByRole('button', { name: 'Create bookmark' }).click();
    await waitClosed();
    await active(heading('Review parked links'));
    assert.equal((await h.database()).links.find(link => link.id === 'link-2').status, 'removed');
    const duplicate = fixture.links[3];
    await page.evaluate(link => chrome.bookmarks.create({ title: 'Synthetic duplicate', url: link.url }), duplicate);
    await card(duplicate.title).getByRole('button', { name: 'Keep', exact: true }).click();
    await dialog.getByRole('button', { name: 'Create bookmark' }).click();
    await dialog.getByText(/already has this URL/).waitFor();
    await dialog.getByRole('button', { name: 'Open existing' }).click();
    await dialog.getByText('Opened the existing Chrome bookmark.').waitFor();
    const opened = await page.evaluate(async url => (await chrome.tabs.query({})).some(tab => (tab.pendingUrl ?? tab.url) === url), duplicate.url);
    assert.equal(opened, true);
    await page.bringToFront();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await waitClosed();
    assert.equal((await h.database()).links.find(link => link.id === 'link-3').status, 'parked');
  });

  await scenario('Inline project confirmations focus their headings and return on cancel and delete', async () => {
    await button('Projects').click();
    await page.getByLabel('Project', { exact: true }).selectOption('restore-probe');
    await button('Restore all').click();
    const restore = page.getByRole('region', { name: /^Restore all/ });
    await active(restore.getByRole('heading'));
    await restore.getByRole('button', { name: 'Cancel' }).click();
    await active(button('Restore all'));
    await button('Delete').click();
    const deletion = page.getByRole('region', { name: /^Delete/ });
    await active(deletion.getByRole('heading'));
    await deletion.getByRole('button', { name: 'Cancel' }).click();
    await active(button('Delete'));
    await button('Delete').click();
    await hold('DELETE_PROJECT');
    await deletion.getByRole('button', { name: 'Move to Inbox and delete' }).click();
    await page.getByRole('status').getByText('Moving links to Inbox…').waitFor();
    assert.equal(await button('Restore all').isDisabled(), true);
    assert.equal(await button('Rename').isDisabled(), true);
    assert.equal(await deletion.getByRole('button', { name: 'Cancel' }).isDisabled(), true);
    await finish('success');
    await deletion.waitFor({ state: 'hidden' });
    await active(heading('Inbox'));
    assert.equal((await h.database()).projects.some(project => project.id === 'restore-probe'), false);
  });

  await scenario('Backup Merge and Replace remain named inline previews with cancel and verified Merge focus', async () => {
    await button('Settings').click();
    const file = { name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup(await h.database()))) };
    const chooser = page.getByLabel('Choose backup file');
    await chooser.setInputFiles(file);
    for (const [label, mode] of [['Merge', 'merge'], ['Replace all', 'replace']]) {
      const trigger = button(label);
      await trigger.click();
      const preview = page.getByRole('region', { name: `Confirm ${mode} import` });
      await active(preview.getByRole('heading'));
      assert.equal(await page.getByRole('dialog').count(), 0);
      await preview.getByRole('button', { name: 'Cancel' }).click();
      await active(trigger);
    }
    await button('Merge').click();
    await hold('IMPORT_DATA');
    const preview = page.getByRole('region', { name: 'Confirm merge import' });
    await preview.getByRole('button', { name: 'Confirm merge' }).click();
    await page.getByRole('status').getByText('Importing backup…').waitFor();
    assert.equal(await preview.getByRole('button', { name: 'Cancel' }).isDisabled(), true);
    assert.equal(await chooser.isDisabled(), true);
    await finish('success');
    await preview.waitFor({ state: 'hidden' });
    await active(chooser);
    await page.getByRole('status').getByText(/Backup merged/).waitFor();
  });

  await scenario('200% Chrome zoom, disappearing Search result, and section navigation after dismissal', async () => {
    await button('Search').click();
    await page.getByRole('searchbox').fill(fixture.links[4].title);
    const searchCard = card(fixture.links[4].title);
    await openAction(searchCard, 'Remove');
    await page.setViewportSize({ width: 800, height: 680 });
    const zoom = value => page.evaluate(async value => chrome.tabs.setZoom((await chrome.tabs.getCurrent()).id, value), value);
    await zoom(2);
    const right = await dialog.evaluate(el => el.getBoundingClientRect().right <= innerWidth && el.scrollWidth <= el.clientWidth + 1);
    assert.equal(right, true);
    await zoom(1);
    await dialog.getByRole('button', { name: 'Remove link' }).click();
    await waitClosed();
    await active(page.getByRole('searchbox'));
    await searchCard.waitFor({ state: 'hidden' });
    await button('Archive').click();
    await heading('Archive').waitFor();
  });

  await scenario('Cancel returns to the Archive heading if an external mutation removed the invoking card', async () => {
    const archived = (await h.database()).links.find(link => link.status === 'archived');
    const archivedCard = card(archived.title);
    await openAction(archivedCard, 'Remove');
    await h.ok({ type: 'UNARCHIVE_LINK', payload: { linkId: archived.id } });
    await archivedCard.waitFor({ state: 'hidden' });
    await page.keyboard.press('Escape');
    await waitClosed();
    await active(heading('Archive'));
  });
} finally {
  const file = path.join(h.output, 'accessibility-results.json');
  await fs.writeFile(file, JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ file, checks: checks.length }));
  await h.close();
}
