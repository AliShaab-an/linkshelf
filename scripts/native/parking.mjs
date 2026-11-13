import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHarness, navigateSidebar, poll } from './harness.mjs';

const h = await createHarness();
const page = h.page;
const button = name => page.getByRole('button', { name, exact: true });
const tab = name => page.getByRole('checkbox', { name: `Select Synthetic /${name}`, exact: true });
const modal = page.getByRole('dialog');
const checks = [];

async function check(name, run) {
  await run();
  checks.push(name);
  console.log('PASS', name);
}

async function inViewport(locator) {
  const bounds = await locator.boundingBox();
  assert.ok(bounds && bounds.y >= 0 && bounds.x >= 0);
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.ok(bounds.y + bounds.height <= viewport.height + 1 && bounds.x + bounds.width <= viewport.width + 1);
}

async function activate(locator, key = 'Enter') {
  await locator.focus();
  await page.keyboard.press(key);
}

try {
  const { project } = await h.ok({ type: 'CREATE_PROJECT', payload: { name: 'Parking destination' } });
  const earlier = await h.park(['earlier-session'], project.id);
  const fixture = [];
  for (let i = 0; i < 12; i++) fixture.push(await h.tab(`parking-${i}`));
  const pinned = await h.tab('pinned-parking');
  await page.evaluate(id => chrome.tabs.update(id, { pinned: true }), pinned.id);
  await h.surface('popup');
  await page.bringToFront();
  await page.setViewportSize({ width: 320, height: 760 });
  await navigateSidebar(page, 'Park');
  await tab('parking-11').waitFor();

  await check('320 px and 200% zoom keep selection and confirmation reachable; Back preserves the draft', async () => {
    await inViewport(button('Review selection'));
    assert.equal(await tab('pinned-parking').isDisabled(), true);
    assert.ok(await page.getByRole('list', { name: 'Tabs in this window' }).getByText('restricted', { exact: true }).count());
    for (const id of [1, 6, 11]) await activate(tab(`parking-${id}`), 'Space');
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 3);
    await inViewport(button('Review selection'));
    await page.screenshot({ path: path.join(h.output, 'parking-selection-320.png') });
    await activate(button('Review selection'));
    await modal.waitFor();
    assert.equal(await modal.getByRole('heading').evaluate(el => document.activeElement === el), true);
    await inViewport(button('Save & close 3'));
    await modal.getByLabel('Save to project').selectOption(project.id);
    await modal.getByText('Add note or reminder', { exact: true }).click();
    await modal.getByLabel('Shared note (optional)').fill('Synthetic parking note');
    await modal.getByLabel('Shared reminder (optional)').fill('2098-01-02T10:30');
    await button('Back').click();
    await modal.waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 3);
    assert.equal(await button('Review selection').evaluate(el => document.activeElement === el), true);
    await page.setViewportSize({ width: 640, height: 900 });
    await page.evaluate(async () => chrome.tabs.setZoom((await chrome.tabs.getCurrent()).id, 2));
    assert.equal(await page.evaluate(() => innerWidth), 320);
    await inViewport(button('Review selection'));
    await button('Review selection').click();
    assert.equal(await modal.getByLabel('Save to project').inputValue(), project.id);
    assert.equal(await modal.getByLabel('Shared note (optional)').inputValue(), 'Synthetic parking note');
    assert.equal(await modal.getByLabel('Shared reminder (optional)').inputValue(), '2098-01-02T10:30');
    await inViewport(button('Save & close 3'));
    await page.bringToFront();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(h.output, 'parking-review-200.png') });
    await page.evaluate(async () => chrome.tabs.setZoom((await chrome.tabs.getCurrent()).id, 1));
    await page.setViewportSize({ width: 320, height: 760 });
  });

  await check('Stale selection is rejected without writes and Refresh prunes it', async () => {
    const before = await h.raw();
    await page.evaluate(id => chrome.tabs.remove(id), fixture[1].id);
    await button('Save & close 3').click();
    await modal.getByText(/selected tab no longer exists/).waitFor();
    assert.equal(await button('Save & close 3').isDisabled(), true);
    assert.deepEqual(await h.raw(), before);
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden' });
    await button('Refresh').click();
    await page.getByRole('status').getByText('2 selected', { exact: true }).waitFor();
    await tab('parking-2').check();
    await button('Review selection').click();
  });

  await check('Real worker write failure leaves all tabs open and the review draft available', async () => {
    const before = await h.raw();
    const ids = [2, 6, 11].map(index => fixture[index].id);
    await h.worker().evaluate(() => {
      const set = chrome.storage.local.set;
      chrome.storage.local.set = async patch => {
        if (Object.hasOwn(patch, 'linkshelfDatabase')) {
          chrome.storage.local.set = set;
          throw new Error('Synthetic persistence failure');
        }
        return set.call(chrome.storage.local, patch);
      };
    });
    await button('Save & close 3').click();
    await modal.getByText(/All tabs stayed open/).waitFor();
    assert.deepEqual(await h.raw(), before);
    assert.equal(await page.evaluate(async ids => (await chrome.tabs.query({})).filter(tab => ids.includes(tab.id)).length, ids), 3);
    assert.equal(await modal.getByLabel('Shared note (optional)').inputValue(), 'Synthetic parking note');
  });

  await check('Pending review stays open; real partial closure keeps the saved session and reminder', async () => {
    await h.worker().evaluate(id => {
      const remove = chrome.tabs.remove;
      chrome.tabs.remove = async tabId => {
        if (tabId === id) {
          await new Promise(resolve => { globalThis.finishParkingClose = resolve; });
          chrome.tabs.remove = remove;
          throw new Error('Synthetic close refusal');
        }
        return remove.call(chrome.tabs, tabId);
      };
    }, fixture[6].id);
    await button('Save & close 3').click();
    await modal.getByText('Saving before closing…').waitFor();
    await page.keyboard.press('Escape');
    await page.mouse.click(2, 2);
    assert.equal(await modal.isVisible(), true);
    assert.equal(await button('Back').isDisabled(), true);
    assert.equal(await button('Save & close 3').isDisabled(), true);
    await poll(() => h.worker().evaluate(() => typeof globalThis.finishParkingClose === 'function'), Boolean, 'worker reached close');
    const saved = await h.raw();
    const session = saved.sessions.find(item => item.projectId === project.id && item.id !== earlier.sessionId);
    assert.equal(session.note, 'Synthetic parking note');
    const expectedReminder = await page.evaluate(() => new Date('2098-01-02T10:30').toISOString());
    assert.equal(session.reminderAt, expectedReminder);
    assert.equal(saved.links.filter(item => item.sessionId === session.id).length, 3);
    await h.worker().evaluate(() => globalThis.finishParkingClose());
    const result = page.getByRole('region', { name: 'Parking session saved' });
    await result.waitFor();
    assert.match(await result.innerText(), /Saved tabs 3/);
    assert.match(await result.innerText(), /Confirmed closures 2/);
    assert.match(await result.innerText(), /Closures not confirmed 1/);
    await page.screenshot({ path: path.join(h.output, 'parking-partial-320.png') });
    await button('View saved session').click();
    await page.getByRole('heading', { name: 'Synthetic /parking-6', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Project', { exact: true }).inputValue(), project.id);
    const active = await page.evaluate(() => ({
      expanded: document.activeElement.getAttribute('aria-expanded'),
      text: document.activeElement.textContent,
      links: [...document.activeElement.closest('section').querySelectorAll('article h3')].map(el => el.textContent),
    }));
    assert.equal(active.expanded, 'true');
    assert.match(active.text, /Parking session/);
    assert.deepEqual(active.links.sort(), ['Synthetic /parking-11', 'Synthetic /parking-2', 'Synthetic /parking-6']);
    assert.ok(await page.evaluate(async id => (await chrome.tabs.get(id)).id === id, fixture[6].id));
  });
} finally {
  await fs.writeFile(path.join(h.output, 'parking-results.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ output: h.output, checks: checks.length }));
  await h.close();
}
