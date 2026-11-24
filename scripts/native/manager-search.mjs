import assert from 'node:assert/strict';
import path from 'node:path';
import { choose, createHarness, managerLink, poll } from './harness.mjs';

const h = await createHarness();
const { page } = h;
const checks = [];

try {
  const stamp = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const link = (id, projectId, title, extra = {}) => ({
    id, sessionId: `s-${id}`, projectId, title, url: `https://example.invalid/${id}`,
    normalizedUrl: `https://example.invalid/${id}`, domain: 'example.invalid', status: 'parked', pinnedBeforeParking: false,
    createdAt: stamp, updatedAt: stamp, ...extra,
  });
  const archived = (id, projectId, title, extra = {}) => link(id, projectId, title, { status: 'archived', archivedAt: stamp, ...extra });
  const links = [
    link('p1', 'inbox', 'Parked alpha guide'),
    link('p2', 'reading', 'Parked beta notes'),
    archived('a1', 'inbox', 'Archived alpha recipe', { note: 'Grandma soup' }),
    archived('a2', 'reading', 'Archived beta essay', { tags: ['longread'] }),
    archived('a3', 'reading', 'Archived gamma essay'),
    link('r1', 'inbox', 'Already removed', { status: 'removed', removedAt: stamp }),
  ];
  await h.seed({
    projects: [
      { id: 'inbox', name: 'Inbox', isInbox: true, createdAt: stamp, updatedAt: stamp },
      { id: 'reading', name: 'Reading list', isInbox: false, createdAt: stamp, updatedAt: stamp },
    ],
    sessions: links.map(item => ({ id: item.sessionId, projectId: item.projectId, createdAt: stamp, updatedAt: stamp })),
    links,
    settings: { schemaVersion: 3, defaultProjectId: 'inbox', includePinnedTabsByDefault: false, confirmBeforeBulkClose: true, notificationsEnabled: false, defaultRestoreBehavior: 'restore-and-remove', displayDensity: 'comfortable', defaultRestoreMode: 'normal', trackingParamsToRemove: [] },
  });
  const status = async id => (await h.raw()).links.find(item => item.id === id)?.status;
  const rows = () => page.locator('[data-link-row]');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(new URL('/manager.html#archive', page.url()).href);
  await page.getByRole('heading', { name: 'Archive', exact: true }).waitFor();

  // Navigation badges count what waits in Review and the Bin.
  await poll(() => managerLink(page, 'Review').textContent(), value => value.includes('2'), 'Review count');
  assert.match(await managerLink(page, 'Review').getAttribute('aria-current') ?? '', /^$/);
  assert.match(await managerLink(page, 'Bin').textContent(), /1/);
  checks.push('The navigation shows how many links wait in Review and the Bin');

  // Archive search matches notes and tags; the project filter narrows further.
  await rows().first().waitFor();
  assert.equal(await rows().count(), 3);
  const search = page.getByRole('searchbox', { name: 'Search the archive' });
  await search.fill('soup');
  await page.getByText('1 link found').waitFor();
  assert.equal(await rows().count(), 1);
  await search.fill('longread');
  await page.getByText('1 link found').waitFor();
  await search.fill('essay');
  await page.getByText('2 links found').waitFor();
  await search.fill('');
  await choose(page.getByLabel('Project', { exact: true }), 'reading');
  await page.getByText('2 links found').waitFor();
  checks.push('Archive search matches titles, notes and tags, and the project filter narrows the list');

  // Bulk: return both Reading list links to their project.
  await page.getByLabel('Select all').check();
  await page.getByText('2 selected').waitFor();
  await page.getByRole('button', { name: 'Return to projects', exact: true }).click();
  await page.getByText('Returned 2 links.').waitFor();
  assert.equal(await status('a2'), 'parked');
  assert.equal(await status('a3'), 'parked');
  await poll(() => managerLink(page, 'Review').textContent(), value => value.includes('4'), 'Review count follows');
  checks.push('Selected archived links return to their projects together, and the Review count follows');

  // Bulk remove asks first and sends links to the Bin.
  await page.getByLabel('Select all').check();
  await page.getByRole('button', { name: 'Remove selected', exact: true }).click();
  await page.getByRole('group', { name: 'Remove selected links' }).getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByText('Removed 1 link.').waitFor();
  assert.equal(await status('a1'), 'removed');
  await poll(() => managerLink(page, 'Bin').textContent(), value => value.includes('2'), 'Bin count follows');
  checks.push('Remove selected sends archived links to the Bin');

  // Top-bar search opens the Search page and finds saved links from anywhere.
  await page.goto(new URL('/manager.html#home', page.url()).href);
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
  await page.keyboard.press('/');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'manager-search');
  await page.keyboard.type('beta');
  await page.getByRole('heading', { name: 'Search', exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, '#search');
  assert.equal(await page.title(), 'Search · LinkShelf Manager');
  await page.getByRole('status').filter({ hasText: /^2 results$/ }).waitFor();
  assert.equal(await page.locator('#link-search').count(), 0, 'the page uses the top-bar box instead of drawing its own');
  await page.screenshot({ path: path.join(h.output, 'manager-search.png') });
  checks.push('"/" focuses the top-bar search, typing opens the Search page, and results appear');

  for (const width of [768, 360]) {
    await page.setViewportSize({ width, height: 800 });
    for (const hash of ['archive', 'search']) {
      await page.goto(new URL(`/manager.html#${hash}`, page.url()).href);
      await page.getByRole('heading', { level: 2 }).first().waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${hash} overflows at ${width}px`);
    }
  }
  checks.push('Archive and Search do not overflow at 768px or 360px');

  assert.deepEqual(h.requests, []);
} catch (error) {
  console.error('SNAP', await page.getByRole('navigation', { name: 'Manager sections' }).ariaSnapshot());
  throw error;
} finally {
  await h.close();
}

console.log(JSON.stringify({ checks }));
