import assert from 'node:assert/strict';
import { createHarness, navigateSidebar, poll } from './harness.mjs';

const h = await createHarness();
const { page } = h;
const checks = [];
const KEY = 'linkshelfRatePrompt';
const stored = () => page.evaluate(async key => (await chrome.storage.local.get(key))[key], KEY);
const card = page.getByRole('region', { name: 'Enjoying LinkShelf?' });

try {
  await page.setViewportSize({ width: 320, height: 800 });

  // A fresh install starts counting and shows nothing.
  const fresh = await poll(stored, value => value !== undefined, 'rate prompt record created on install');
  assert.equal(fresh.status, 'counting');
  assert.equal(fresh.parked, 0);
  await navigateSidebar(page, 'Saved');
  await page.waitForTimeout(500);
  assert.equal(await card.count(), 0);
  checks.push('A new install counts parked tabs and does not ask yet');

  const { project } = await h.ok({ type: 'CREATE_PROJECT', payload: { name: 'Rate prompt' } });
  const park = labels => h.park(labels, project.id);

  // Four parked tabs are not enough; the fifth shows the card without a reload.
  await park(['rate-1', 'rate-2', 'rate-3', 'rate-4']);
  assert.equal((await poll(stored, value => value.parked === 4, 'four tabs counted')).status, 'counting');
  await page.bringToFront();
  await page.waitForTimeout(300);
  assert.equal(await card.count(), 0);
  await park(['rate-5']);
  await card.waitFor();
  assert.equal((await stored()).status, 'due');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${h.output}/rate-prompt-320.png` });
  checks.push('The card appears after the fifth parked tab');

  // It is not shown on Settings, and "Maybe later" hides it until twenty more tabs are parked.
  await navigateSidebar(page, 'Settings');
  assert.equal(await card.count(), 0);
  await navigateSidebar(page, 'Park');
  await card.getByRole('button', { name: 'Maybe later' }).click();
  await card.waitFor({ state: 'detached' });
  const later = await stored();
  assert.equal(later.status, 'later');
  assert.equal(later.askAgainAt, 25);
  checks.push('"Maybe later" hides the card and schedules one more ask after 20 tabs');

  // Pretend twenty more tabs were parked, then rate: the store opens and the card is gone for good.
  await page.evaluate(async ({ key, value }) => chrome.storage.local.set({ [key]: value }), { key: KEY, value: { ...later, parked: 24 } });
  await park(['rate-6']);
  await page.bringToFront();
  await card.waitFor();
  await card.getByRole('button', { name: 'Rate LinkShelf' }).click();
  await card.waitFor({ state: 'detached' });
  const tabUrls = await poll(() => page.evaluate(async () => (await chrome.tabs.query({})).map(tab => tab.pendingUrl || tab.url)),
    urls => urls.some(url => url.startsWith('https://chromewebstore.google.com/detail/gjalnaecjpapffifhlcnhomnehcdlmgm/reviews')), 'store review tab opened');
  assert.ok(tabUrls.length > 0);
  assert.equal((await stored()).status, 'done');
  await park(['rate-7']);
  await page.bringToFront();
  await page.waitForTimeout(500);
  assert.equal(await card.count(), 0);
  checks.push('"Rate LinkShelf" opens the Chrome Web Store reviews page and the card never returns');

  // An existing user (simulated by the record an update creates) is asked right away, and can opt out.
  await page.evaluate(key => chrome.storage.local.set({ [key]: { version: 1, parked: 0, status: 'due', laterCount: 0 } }), KEY);
  await card.waitFor();
  await card.getByRole('button', { name: 'Don’t ask again' }).click();
  await card.waitFor({ state: 'detached' });
  assert.equal((await stored()).status, 'done');
  checks.push('"Don’t ask again" ends the prompt');

  // Only the review page was requested over the network, and only by the user's choice.
  assert.ok(h.requests.every(url => url.startsWith('https://chromewebstore.google.com/')), JSON.stringify(h.requests));
  console.log(JSON.stringify({ chrome: h.context.browser().version(), checks, output: h.output }));
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 1500));
  throw error;
} finally {
  await h.close();
}
