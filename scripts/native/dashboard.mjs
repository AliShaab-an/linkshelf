import assert from 'node:assert/strict';
import path from 'node:path';
import { createHarness, managerLink, navigateSidebar, poll } from './harness.mjs';

const h = await createHarness();
const { page } = h;
const checks = [];
const iso = offsetMs => new Date(Date.now() + offsetMs).toISOString();
const DAY = 86_400_000;

try {
  const stamp = iso(-10 * DAY);
  const link = (id, projectId, extra = {}) => ({
    id, sessionId: `s-${id}`, projectId, title: `Link ${id}`, url: `https://example.invalid/${id}`,
    normalizedUrl: `https://example.invalid/${id}`, domain: 'example.invalid', status: 'parked', pinnedBeforeParking: false,
    createdAt: stamp, updatedAt: stamp, ...extra,
  });
  const links = [
    link('a', 'reading', { createdAt: iso(-12 * DAY) }),
    link('b', 'inbox'),
    link('c', 'reading', { reminderAt: iso(-3_600_000), reminderNotifiedAt: iso(-3_600_000) }),
    link('d', 'reading'),
    link('e', 'inbox', { status: 'archived', archivedAt: stamp }),
  ];
  await h.seed({
    projects: [
      { id: 'inbox', name: 'Inbox', isInbox: true, createdAt: stamp, updatedAt: stamp },
      { id: 'reading', name: 'Reading list', isInbox: false, createdAt: stamp, updatedAt: stamp },
      { id: 'empty', name: 'Nothing here', isInbox: false, createdAt: stamp, updatedAt: stamp },
    ],
    sessions: links.map(item => ({ id: item.sessionId, projectId: item.projectId, createdAt: stamp, updatedAt: stamp })),
    links,
    settings: { schemaVersion: 3, defaultProjectId: 'inbox', includePinnedTabsByDefault: false, confirmBeforeBulkClose: true, notificationsEnabled: false, defaultRestoreBehavior: 'restore-and-remove', displayDensity: 'comfortable', defaultRestoreMode: 'normal', trackingParamsToRemove: [] },
  });

  await page.goto(new URL('/manager.html', page.url()).href);
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
  assert.equal(await managerLink(page, 'Home').getAttribute('aria-current'), 'page');
  assert.equal(await page.title(), 'Home · LinkShelf Manager');

  const tile = name => page.getByRole('link', { name: new RegExp(`^${name}`) });
  await tile('To review').waitFor();
  assert.match(await tile('To review').innerText(), /4\b/);
  assert.match(await tile('To review').innerText(), /Oldest has waited 12 days/);
  assert.match(await tile('Archived').innerText(), /1\b/);
  const due = page.locator('div', { hasText: /^Reminders due/ }).first();
  assert.match(await due.innerText(), /1\b/);
  checks.push('Home counts parked, due, and archived links and shows how long the oldest has waited');

  const rows = await page.getByRole('region', { name: 'Waiting by project' }).getByRole('listitem').allInnerTexts();
  assert.deepEqual(rows.map(row => row.replace(/\s+/g, ' ').trim()), ['Reading list 3 links', 'Inbox 1 link']);
  checks.push('Projects are listed by waiting links, and empty projects are left out');

  await page.getByRole('main').screenshot({ path: path.join(h.output, 'home-dashboard.png') });

  await tile('To review').click();
  await page.getByRole('heading', { name: 'Review', exact: true }).waitFor();
  await poll(() => managerLink(page, 'Review').getAttribute('aria-current'), value => value === 'page', 'Review opened from Home');
  await managerLink(page, 'Home').click();
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
  await page.getByRole('link', { name: /^Archived/ }).click();
  await page.getByRole('heading', { name: 'Archive', exact: true }).waitFor();
  checks.push('The To review and Archived tiles open their lists');

  // Home follows the data: archive-free, empty state when nothing is waiting.
  await h.seed({
    projects: [{ id: 'inbox', name: 'Inbox', isInbox: true, createdAt: stamp, updatedAt: stamp }],
    sessions: [], links: [],
    settings: { schemaVersion: 3, defaultProjectId: 'inbox', includePinnedTabsByDefault: false, confirmBeforeBulkClose: true, notificationsEnabled: false, defaultRestoreBehavior: 'restore-and-remove', displayDensity: 'comfortable', defaultRestoreMode: 'normal', trackingParamsToRemove: [] },
  });
  await page.goto(new URL('/manager.html#home', page.url()).href);
  await page.getByRole('heading', { name: 'All caught up' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Start reviewing' }).count(), 0);
  assert.match(await page.getByRole('link', { name: /^To review/ }).innerText(), /Nothing is waiting/);
  checks.push('An empty shelf shows All caught up and no review prompt');

  assert.deepEqual(h.requests, []);
} finally {
  await h.close();
}

console.log(JSON.stringify({ checks }));
