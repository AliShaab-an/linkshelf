import assert from 'node:assert/strict';
import path from 'node:path';
import { createHarness, navigateSidebar, poll } from './harness.mjs';

const h = await createHarness();
const { page } = h;
const button = (surface, name) => surface.getByRole('button', { name, exact: true });
const picker = surface => surface.getByRole('combobox', { name: 'Save to', exact: true });

// An extension tab can exercise the popup document while the worker still acts on a real synthetic browser tab.
async function popupFor(tab, missingDefault = false) {
  const popup = await h.context.newPage();
  await popup.addInitScript(({ tab, missingDefault }) => {
    const query = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = options => options.active && options.currentWindow ? Promise.resolve([tab]) : query(options);
    if (missingDefault) {
      const send = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = async message => {
        const response = await send(message);
        if (message.type === 'GET_SETTINGS' && response.success) response.settings.defaultProjectId = 'missing-project';
        return response;
      };
    }
  }, { tab, missingDefault });
  await popup.setViewportSize({ width: 360, height: 640 });
  await popup.goto(`chrome-extension://${h.id}/popup.html`);
  return popup;
}

try {
  const restricted = await h.surface('popup');
  await restricted.setViewportSize({ width: 320, height: 640 });
  await restricted.getByText(/Chrome doesn’t allow LinkShelf to park this page/).waitFor();
  assert.equal(await picker(restricted).count(), 0);
  assert.equal(await button(restricted, 'Park and close').count(), 0);
  await button(restricted, 'Open sidebar').waitFor();
  await restricted.screenshot({ path: path.join(h.output, 'popup-unavailable-320.png') });
  await restricted.close();

  const { project } = await h.ok({ type: 'CREATE_PROJECT', payload: { name: 'Popup research project with a very long destination name' } });
  await h.ok({ type: 'PATCH_SETTINGS', payload: { defaultProjectId: project.id, displayDensity: 'compact', notificationsEnabled: false } });
  const first = await h.tab('popup-default-project');
  const popup = await popupFor(first);
  await poll(() => picker(popup).inputValue(), value => value === project.id, 'configured destination in popup');
  const details = popup.locator('summary');
  assert.equal(await popup.getByLabel('Note', { exact: true }).isVisible(), false);
  await details.focus();
  await popup.keyboard.press('Enter');
  await popup.getByLabel('Note', { exact: true }).fill('Synthetic popup session note');
  await details.click();
  await details.getByText('· Note added', { exact: true }).waitFor();
  await details.click();
  const reminder = '2099-01-01T10:00';
  await popup.getByLabel('Reminder', { exact: true }).fill(reminder);
  await details.click();
  await details.getByText('· Both added', { exact: true }).waitFor();
  for (const [width, factor, label] of [[320, 1, '320'], [400, 1, '400'], [640, 2, '200-percent']]) {
    await popup.setViewportSize({ width, height: 640 * factor });
    await popup.evaluate(async factor => chrome.tabs.setZoom((await chrome.tabs.getCurrent()).id, factor), factor);
    await poll(() => popup.evaluate(() => innerWidth), value => value === width / factor, 'popup layout width');
    assert.ok(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await popup.screenshot({ path: path.join(h.output, `popup-${label}.png`) });
  }
  await popup.evaluate(async () => chrome.tabs.setZoom((await chrome.tabs.getCurrent()).id, 1));
  await button(popup, 'Park and close').click();
  await popup.getByRole('status').getByText(/Saved to .* and closed the tab/).waitFor();
  await poll(() => page.evaluate(id => chrome.tabs.get(id).then(() => false, () => true), first.id), Boolean, 'park closed the actual tab');
  const parked = (await h.raw()).links.find(link => link.url === first.url);
  assert.equal(parked.projectId, project.id);
  assert.equal(parked.note, 'Synthetic popup session note');
  assert.equal(parked.reminderAt, new Date(reminder).toISOString());
  await popup.close();

  const second = await h.tab('popup-close-failure');
  const partial = await popupFor(second, true);
  await poll(() => picker(partial).inputValue(), value => value === 'inbox', 'missing preference falls back to Inbox');
  const worker = h.worker();
  await worker.evaluate(id => {
    const original = chrome.tabs.remove;
    chrome.tabs.remove = function (target) {
      if (target === id) return Promise.reject(new Error('Synthetic close failure'));
      return original.call(this, target);
    };
    globalThis.restorePopupRemove = () => { chrome.tabs.remove = original; };
  }, second.id);
  try {
    await button(partial, 'Park and close').click();
    const saved = partial.getByRole('status').getByText(/Saved to Inbox.*couldn’t confirm the tab closed/);
    await saved.waitFor();
    assert.equal(await saved.evaluate(element => element === document.activeElement), true);
    await partial.keyboard.press('Tab');
    assert.equal(await button(partial, 'Open sidebar').evaluate(element => element === document.activeElement), true);
    assert.equal(await button(partial, 'Park and close').count(), 0);
    assert.equal(await button(partial, 'Open sidebar').isEnabled(), true);
    assert.equal((await h.raw()).links.find(link => link.url === second.url).projectId, 'inbox');
    assert.equal(await page.evaluate(id => chrome.tabs.get(id).then(tab => tab.id), second.id), second.id);
    await partial.screenshot({ path: path.join(h.output, 'popup-partial.png') });
  } finally {
    await worker.evaluate(() => globalThis.restorePopupRemove());
    await partial.close();
  }

  await page.bringToFront();
  await navigateSidebar(page, 'Park');
  await navigateSidebar(page, 'Saved');
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption(project.id);
  const link = page.locator('article').filter({ hasText: first.title });
  await link.waitFor();
  assert.equal(await page.getByText('Synthetic popup session note', { exact: true }).count(), 1);
  assert.equal(await link.getByText('Synthetic popup session note', { exact: true }).count(), 1);
  await page.getByRole('searchbox', { name: 'Filter this project' }).fill('popup-default-project');
  await button(page, 'Restore all (1)').click();
  const confirm = page.getByRole('region', { name: /^Restore all 1 link/ });
  await confirm.getByRole('combobox', { name: 'When to load tabs' }).selectOption('unloaded');
  assert.equal((await h.raw()).links.find(link => link.id === parked.id).status, 'parked');
  await button(confirm, 'Restore 1 tab').click();
  await poll(h.raw, value => value.links.find(link => link.id === parked.id)?.status === 'restored', 'Saved restored the popup link');
  assert.equal((await h.raw()).settings.defaultRestoreMode, 'normal');
  console.log(JSON.stringify({ chrome: h.context.browser().version(), output: h.output,
    checks: ['Unavailable page gives a sidebar action without parking controls', 'Popup project default, note, confirmed close and responsive layout',
      'Missing default fallback and truthful partial close', 'Find popup link in Saved and restore with a one-time load mode'] }));
} finally {
  await h.close();
}
