import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { navigateSidebar, createHarness } from './harness.mjs';
import { dataset } from '../performance/fixtures.mjs';

const h = await createHarness();
const checks = [];
const observations = {};
try {
  const fixture = dataset(10000, 'few', h.base);
  const last = fixture.links.findLast(link => link.status === 'archived');
  last.title = 'Long synthetic archive title '.repeat(20);
  last.note = 'Long synthetic archive note Ω '.repeat(45);
  last.url = last.normalizedUrl = h.base + '/long/' + 'x'.repeat(700);
  assert.equal((await h.seed(fixture)).status.state, 'healthy');
  const ordered = (await h.ok({ type: 'GET_ARCHIVED_LINKS' })).links;
  const page = await h.surface();
  await page.setViewportSize({ width: 400, height: 800 });
  await navigateSidebar(page, 'Archive');
  const cards = page.locator('article');
  const nav = page.getByRole('navigation', { name: 'Archived links pages' });
  const jump = nav.getByRole('spinbutton', { name: 'Page number' });
  const titles = async () => (await cards.locator('h3').allTextContents()).map(title => title.trim());
  const expected = links => links.map(link => link.title.trim());
  const total = ordered.length;
  const end = Math.ceil(total / 25);
  async function go(number) {
    await jump.fill(String(number));
    await jump.press('Enter');
    await nav.getByText(new RegExp(`Page ${number} of \\d+`)).waitFor();
    assert.ok(await jump.evaluate(node => document.activeElement === node));
    assert.ok(await jump.evaluate(node => {
      const style = getComputedStyle(node);
      return style.outlineStyle !== 'none' || style.boxShadow !== 'none';
    }));
  }
  await nav.getByText(/Page 1 of/).waitFor();
  assert.deepEqual(await titles(), expected(ordered.slice(0, 25)));
  await nav.getByRole('button', { name: 'Next page' }).press('Space');
  await nav.getByText(/Page 2 of/).waitFor();
  assert.deepEqual(await titles(), expected(ordered.slice(25, 50)));
  await jump.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Next page');
  await jump.press('Tab');
  await go(end);
  assert.deepEqual(await titles(), expected(ordered.slice((end - 1) * 25)));
  assert.ok(await cards.count() <= 25);
  checks.push('Archive exposes the first, next and last ranges in order with bounded cards and keyboard controls');

  // Find the long record by its actual archive ordering.
  const longPage = Math.floor(ordered.findIndex(link => link.id === last.id) / 25) + 1;
  await go(longPage);
  const longCard = page.locator(`[id="archived-${last.id}"]`);
  observations.scroll = await page.evaluate(async () => {
    const scroller = document.scrollingElement;
    const frames = [];
    let previous = performance.now();
    for (let i = 0; i < 8; i++) {
      window.scrollBy(0, 200);
      await new Promise(resolve => requestAnimationFrame(resolve));
      const now = performance.now();
      frames.push(now - previous);
      previous = now;
    }
    return { scrollTop: scroller.scrollTop, frames };
  });
  assert.ok(observations.scroll.scrollTop > 0);
  await longCard.getByRole('button', { name: 'Show more', exact: true }).click();
  for (const width of [320, 400, 600, 800]) {
    await page.setViewportSize({ width, height: 800 });
    await longCard.scrollIntoViewIfNeeded();
    assert.ok(await longCard.getByRole('button', { name: 'Show less', exact: true }).isVisible());
    assert.equal(await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('article')].map(card => card.getBoundingClientRect());
      return boxes.every((box, i) => i === 0 || boxes[i - 1].bottom <= box.top + 1);
    }), true);
  }
  await page.evaluate(async () => {
    const tab = await chrome.tabs.getCurrent();
    await chrome.tabs.setZoom(tab.id, 2);
  });
  await longCard.getByRole('button', { name: 'Show less', exact: true }).click();
  await page.evaluate(async () => {
    const tab = await chrome.tabs.getCurrent();
    await chrome.tabs.setZoom(tab.id, 1);
  });
  checks.push('Expanded notes remain usable at 320/400/600/800 px and 200% zoom without card overlap');

  const menu = longCard.getByRole('button', { name: 'More link actions' });
  await menu.press('Enter');
  await page.getByRole('group', { name: 'Link actions' }).getByRole('button', { name: 'Remove', exact: true }).press('Enter');
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.ok(await menu.evaluate(node => document.activeElement === node));
  await h.stopWorker();
  await menu.press('Enter');
  await page.getByRole('group', { name: 'Link actions' }).getByRole('button', { name: 'Remove', exact: true }).press('Enter');
  const removeStart = performance.now();
  await page.getByRole('button', { name: 'Remove link', exact: true }).press('Enter');
  await longCard.waitFor({ state: 'detached' });
  observations.removeToDetachedMs = performance.now() - removeStart;
  assert.equal((await h.raw()).links.find(link => link.id === last.id).status, 'removed');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Archive');
  checks.push('Archive cancellation restores focus, and removal after worker restart persists by ID with a focus fallback');

  await go(1);
  const first = ordered[0];
  const firstCard = page.locator(`[id="archived-${first.id}"]`);
  await firstCard.getByRole('button', { name: 'More link actions' }).focus();
  await h.ok({ type: 'UNARCHIVE_LINK', payload: { linkId: first.id } });
  await firstCard.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Archive');
  assert.equal((await h.raw()).links.find(link => link.id === first.id).status, 'parked');
  checks.push('A second extension document unarchives a record and the visible Archive reconciles by ID');

  await go(1);
  const pendingId = (await h.ok({ type: 'GET_ARCHIVED_LINKS' })).links[0].id;
  await page.evaluate(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async message => {
      const response = await send(message);
      if (message.type === 'UNARCHIVE_LINK') {
        await new Promise(resolve => { globalThis.releaseArchiveAction = resolve; });
      }
      return response;
    };
  });
  await page.locator(`[id="archived-${pendingId}"]`).getByRole('button', { name: 'More link actions' }).click();
  await page.getByRole('group', { name: 'Link actions' }).getByRole('button', { name: 'Return to project' }).click();
  await page.waitForFunction(() => typeof globalThis.releaseArchiveAction === 'function');
  await go(3);
  await page.evaluate(() => globalThis.releaseArchiveAction());
  await page.getByText(/Returned .* to its project/).waitFor();
  await nav.getByText(/Page 3 of/).waitFor();
  assert.equal((await h.raw()).links.find(link => link.id === pendingId).status, 'parked');
  checks.push('An action reply arriving after range navigation preserves the current range and original target identity');

  await navigateSidebar(page, 'Projects');
  await page.getByLabel('Project', { exact: true }).selectOption('project-0');
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  const more = page.getByRole('button', { name: /^Show \d+ more$/ }).first();
  await more.click();
  await page.getByRole('button', { name: 'Show all', exact: true }).first().click();
  await page.getByRole('button', { name: 'Compact view', exact: true }).click();
  await page.getByRole('button', { name: 'Comfortable view', exact: true }).click();
  await page.getByLabel('Session order').selectOption('oldest');
  await page.getByLabel('Filter this project').fill('item 100');
  await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
  checks.push('Projects expansion, Show More, Show All, filtering and sorting remain available');
  const file = path.join(h.output, 'rendering-results.json');
  await fs.writeFile(file, JSON.stringify({ checks, observations, chrome: h.context.browser().version() }, null, 2));
  console.log(JSON.stringify({ checks, file }));
} finally {
  await h.close();
}
