import assert from 'node:assert/strict';
import { createHarness, navigateSidebar, poll } from './harness.mjs';

const h = await createHarness();
const { page } = h;
const checks = [];
const chooser = page.getByLabel('Choose backup file');

try {
  await page.setViewportSize({ width: 360, height: 800 });
  await navigateSidebar(page, 'Settings');

  // Unsupported files are rejected without touching data.
  const before = JSON.stringify(await h.raw());
  await chooser.setInputFiles({ name: 'random.txt', mimeType: 'text/plain', buffer: Buffer.from('hello world') });
  await page.getByText(/not a LinkShelf backup or a supported export/).waitFor();
  assert.equal(JSON.stringify(await h.raw()), before);
  checks.push('An unsupported file is rejected and nothing changes');

  // OneTab export: previewed, import-only (no Replace all), added as a new project.
  const oneTab = ['https://one.example/a | Alpha', 'https://one.example/b | Beta', '', 'https://two.example/c | Gamma', 'https://one.example/a | Alpha again'].join('\n');
  await chooser.setInputFiles({ name: 'onetab.txt', mimeType: 'text/plain', buffer: Buffer.from(oneTab) });
  await page.getByText(/OneTab export · 3 links in 2 groups · 1 skipped/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Replace all' }).count(), 0);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('region', { name: /Confirm merge import/ }).getByRole('button', { name: 'Cancel' }).click();
  assert.equal(JSON.stringify(await h.raw()), before, 'Cancel changes nothing');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm merge' }).click();
  await page.getByText(/Backup merged: 1 projects, 2 sessions, and 3 links added/).waitFor();
  const database = await poll(() => h.database(), db => db.links.length === 3, 'imported links stored');
  assert.ok(database.projects.some(project => project.name.startsWith('Imported from OneTab')));
  assert.deepEqual(database.links.map(link => link.title).sort(), ['Alpha', 'Beta', 'Gamma']);
  checks.push('OneTab import previews, cancels cleanly, then adds a new project with the right links');

  // Pocket HTML: tags and dates survive.
  const pocket = '<h1>Unread</h1><ul><li><a href="https://pocket.example/x" time_added="1700000000" tags="Read Later">Pocket item</a></li></ul>';
  await chooser.setInputFiles({ name: 'ril_export.html', mimeType: 'text/html', buffer: Buffer.from(pocket) });
  await page.getByText(/Pocket export · 1 links/).waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm merge' }).click();
  await page.getByText(/Backup merged/).waitFor();
  const imported = (await h.database()).links.find(link => link.title === 'Pocket item');
  assert.deepEqual(imported.tags, ['read later']);
  assert.equal(imported.createdAt, '2023-11-14T22:13:20.000Z');
  checks.push('Pocket import keeps tags and saved dates');

  assert.deepEqual(h.requests, []);
  console.log(JSON.stringify({ chrome: h.context.browser().version(), checks, output: h.output }));
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 1500));
  throw error;
} finally {
  await h.close();
}
