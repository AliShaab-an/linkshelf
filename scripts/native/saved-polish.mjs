import assert from 'node:assert/strict';
import path from 'node:path';
import { createHarness, navigateSidebar, poll, choose, optionLabels } from './harness.mjs';
import { dataset } from '../performance/fixtures.mjs';

const h = await createHarness();
const { page } = h;
const button = name => page.getByRole('button', { name, exact: typeof name === 'string' });
const picker = page.getByRole('combobox', { name: 'Project', exact: true });
const filter = page.getByRole('searchbox', { name: 'Filter this project' });
const checks = [];
const active = locator => poll(() => locator.evaluate(el => document.activeElement === el), Boolean, 'expected keyboard focus');
const checkPickerContrast = () => picker.evaluate(element => {
  const style = getComputedStyle(element);
  const context = document.createElement('canvas').getContext('2d');
  function luminance(color) {
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }
  const background = luminance(style.backgroundColor);
  const ratio = color => {
    const foreground = luminance(color);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  };
  return { border: ratio(style.borderTopColor), text: ratio(style.color) };
});

try {
  const fixture = dataset(100, 'few', h.base);
  const stamp = await page.evaluate(() => {
    const today = new Date();
    today.setHours(10, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { today: today.toISOString(), yesterday: yesterday.toISOString() };
  });
  const original = fixture.sessions[0];
  fixture.sessions = [
    { ...original, id: 'alpha', note: 'Research notes', createdAt: stamp.today, updatedAt: stamp.today },
    { ...original, id: 'zulu', note: undefined, createdAt: stamp.today, updatedAt: stamp.today },
    { ...original, id: 'earlier', note: undefined, createdAt: stamp.yesterday, updatedAt: stamp.yesterday },
  ];
  fixture.links = [
    ['alpha', 'Alpha computer', 'a', stamp.today],
    ['alpha', 'Reference page', 'b', stamp.today],
    ['zulu', 'Zulu computer', 'c', stamp.today],
    ['earlier', 'Yesterday computer', 'd', stamp.yesterday],
  ].map(([sessionId, title, suffix, createdAt], index) => ({
    ...fixture.links[1], id: suffix, sessionId, title, createdAt, updatedAt: createdAt,
    url: `${h.base}/polish/${suffix}`, normalizedUrl: `${h.base}/polish/${suffix}`, originalIndex: index,
  }));
  fixture.settings.defaultRestoreBehavior = 'open-copy';
  fixture.settings.notificationsEnabled = false;
  assert.equal((await h.seed(fixture)).status.state, 'healthy');
  await page.setViewportSize({ width: 320, height: 760 });
  await page.reload();
  await navigateSidebar(page, 'Saved');
  const actions = button('Project actions');
  const inboxHelp = page.getByText('Inbox can’t be renamed or deleted.', { exact: true });
  await inboxHelp.waitFor();
  assert.equal(await actions.getAttribute('title'), 'Inbox can’t be renamed or deleted.');
  assert.equal(await actions.getAttribute('aria-describedby'), await inboxHelp.getAttribute('id'));
  assert.equal(await actions.getAttribute('aria-disabled'), 'true');
  assert.equal(await button('New project').getAttribute('title'), 'New project');
  await choose(picker, 'restore-probe');
  const preview = button(/^Parking session Alpha computer/);
  const single = page.getByRole('article', { name: 'Zulu computer' });
  await preview.waitFor();
  assert.equal(await inboxHelp.count(), 0);
  assert.equal(await actions.getAttribute('title'), 'Project actions');
  await page.getByRole('heading', { name: 'Today', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Yesterday', exact: true }).waitFor();
  assert.equal(await button('Restore session').count(), 1);
  assert.equal(await single.getByRole('button', { name: 'Restore link' }).count(), 1);
  assert.match(await preview.textContent(), /\+1 more/);
  assert.match(await single.textContent(), /Parked/);
  await button('View options').click();
  assert.deepEqual(await optionLabels(page.getByLabel('Session order')), ['Newest first', 'Oldest first', 'Link title A–Z within each day']);
  assert.deepEqual(await optionLabels(page.getByLabel('Group sessions')), ['By day', 'No grouping']);
  await choose(page.getByLabel('Session order'), 'title');
  await page.keyboard.press('Escape');
  if (await preview.getAttribute('aria-expanded') === 'false') await preview.click();
  await preview.click();
  assert.equal(await preview.evaluate(el => el.matches(':focus-visible')), false);
  await page.keyboard.press('ArrowDown');
  await active(single);
  assert.equal(await single.evaluate(el => el.matches(':focus-visible')), true);
  await page.keyboard.press('/');
  await active(filter);
  await page.keyboard.type('/');
  assert.equal(await filter.inputValue(), '/');
  await filter.clear();

  await button('View options').click();
  await choose(page.getByLabel('Group sessions'), 'none');
  await choose(page.getByLabel('Session order'), 'title');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('heading', { name: 'Yesterday', exact: true }).count(), 0);
  const names = await page.locator('[data-saved-row]').evaluateAll(rows => rows.map(row => row.getAttribute('aria-label') ?? row.textContent));
  assert.match(names[0], /Alpha computer/);
  assert.equal(names.at(-1), 'Zulu computer');
  await button('View options').click();
  await choose(page.getByLabel('Group sessions'), 'day');
  await page.keyboard.press('Escape');
  checks.push('Content previews and single rows distinguish equal timestamps; calendar grouping, title order, and keyboard focus work');

  await single.focus();
  await page.keyboard.press('Enter');
  await page.getByText('Opened a copy. The link remains parked.', { exact: true }).waitFor();
  await page.bringToFront();
  await single.getByRole('button', { name: 'More link actions' }).click();
  await button('Restore and remove from list').click();
  await page.getByText(/Tab opened. Undo returns/).waitFor();
  await page.bringToFront();
  const restoreRecord = (await h.raw()).links.find(link => link.id === 'c');
  assert.equal(restoreRecord.status, 'restored');
  const tabsBefore = await page.evaluate(() => chrome.tabs.query({}).then(tabs => tabs.length));
  await button('Undo').click();
  await single.waitFor();
  assert.equal((await h.raw()).links.find(link => link.id === 'c').status, 'parked');
  assert.equal(await page.evaluate(() => chrome.tabs.query({}).then(tabs => tabs.length)), tabsBefore);
  await single.focus();
  await page.keyboard.press('Delete');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Remove link' }).click();
  await page.getByText('Link removed from Saved.', { exact: true }).waitFor();
  await button('Undo').click();
  await single.waitFor();
  const stale = await h.rpc({ type: 'UNDO_PARKED_LINK', payload: { linkId: 'c', projectId: restoreRecord.projectId,
    sessionId: restoreRecord.sessionId, updatedAt: restoreRecord.updatedAt, status: 'restored' } });
  assert.equal(stale.success, false);
  checks.push('Enter restores a copy; forced restore and keyboard remove support verified undo without closing browser tabs');

  const quick = button('Quick settings');
  await quick.click();
  const theme = page.getByRole('radiogroup', { name: 'Theme', exact: true });
  await choose(theme, 'dark');
  await page.keyboard.press('Escape');
  await poll(() => page.evaluate(() => document.documentElement.dataset.colorScheme), value => value === 'dark', 'dark theme applied');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.reload();
  await poll(() => page.evaluate(() => document.documentElement.dataset.colorScheme), value => value === 'dark', 'dark theme persists');
  await preview.waitFor();
  await page.screenshot({ path: path.join(h.output, 'saved-dark-320.png') });
  await quick.click();
  await choose(theme, 'system');
  await page.keyboard.press('Escape');
  await page.emulateMedia({ colorScheme: 'dark' });
  await poll(() => page.evaluate(() => document.documentElement.dataset.colorScheme), value => value === 'dark', 'system dark');
  const dark = await checkPickerContrast();
  assert.ok(dark.border >= 3 && dark.text >= 4.5, JSON.stringify(dark));
  await page.emulateMedia({ colorScheme: 'light' });
  await poll(() => page.evaluate(() => document.documentElement.dataset.colorScheme), value => value === 'light', 'system light');
  const light = await checkPickerContrast();
  assert.ok(light.border >= 3 && light.text >= 4.5, JSON.stringify(light));
  checks.push('Dark, light and system themes persist at 320px and pass picker border and text contrast checks');
  console.log(JSON.stringify({ checks, output: h.output }));
} finally {
  await h.close();
}
