// Captures every sidebar section at several widths and themes for UI review.
// Usage: node scripts/native/ui-audit.mjs [outputDirectory]
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHarness, navigateSidebar } from './harness.mjs';

const h = await createHarness();
const { page } = h;
const out = path.resolve(process.argv[2] ?? '.output/ui-audit');
await fs.mkdir(out, { recursive: true });
const day = n => new Date(Date.UTC(2026, 10, 1 + n, 9, 30)).toISOString();
const sections = ['Park', 'Saved', 'Search', 'Today', 'Review', 'Archive', 'Settings'];
const widths = [320, 400, 800];
const titles = [
  'Coastal habitat survey: field guide, methods, and reference material for the next visit to the estuary',
  'Sampling locations and tide tables', 'Annotated shoreline maps', 'Fieldwork checklist',
  'مرحبا بالعالم: دليل الميدان', 'A very-long-unbroken-title-' + 'x'.repeat(90), 'Short', 'Weekly reading list',
];

try {
  const links = titles.flatMap((title, index) => ['legacy-project', 'legacy-inbox'].map((projectId, projectIndex) => {
    const id = `audit-${index}-${projectIndex}`;
    const archived = index >= 6;
    const link = {
      id, sessionId: `audit-session-${projectIndex}`, projectId, title, url: `https://example.invalid/audit/${id}`,
      normalizedUrl: `https://example.invalid/audit/${id}`, domain: 'example.invalid', status: archived ? 'archived' : 'parked',
      pinnedBeforeParking: false, originalIndex: index, createdAt: day(index), updatedAt: day(index),
    };
    if (index % 2 === 0) link.note = 'Check the field methods before the next low-tide visit and compare them with last year.';
    if (index % 3 === 0) link.tags = ['research', 'read later', 'coastal', 'maps', 'priority'].slice(0, 1 + (index % 5));
    if (index === 1) link.reminderAt = '2026-11-02T08:00:00.000Z';
    if (archived) link.archivedAt = day(index);
    return link;
  }));
  const database = {
    projects: [
      { id: 'legacy-inbox', name: 'Inbox', isInbox: true, createdAt: day(0), updatedAt: day(0) },
      { id: 'legacy-project', name: 'Field research and reading for the coastal habitat survey', isInbox: false, createdAt: day(0), updatedAt: day(0) },
    ],
    sessions: [0, 1].map(index => ({ id: `audit-session-${index}`, projectId: index ? 'legacy-inbox' : 'legacy-project', note: index ? undefined : 'Estuary trip preparation', createdAt: day(index * 3), updatedAt: day(index * 3) })),
    links,
    settings: {
      schemaVersion: 3, defaultProjectId: 'legacy-inbox', includePinnedTabsByDefault: false, confirmBeforeBulkClose: true,
      notificationsEnabled: false, defaultRestoreBehavior: 'restore-and-remove', displayDensity: 'comfortable',
      defaultRestoreMode: 'normal', trackingParamsToRemove: ['utm_source'],
    },
  };
  await h.seed(database);
  for (const title of ['Audit tab one', 'Audit tab two']) await h.tab(`audit-open-${title.split(' ').pop()}`);

  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => localStorage.setItem('linkshelf-interface-theme', value), theme);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 800 });
      await page.reload();
      for (const section of sections) {
        await navigateSidebar(page, section);
        if (section === 'Saved') await page.getByLabel('Project', { exact: true }).selectOption('legacy-project').catch(() => undefined);
        if (section === 'Search') await page.getByLabel('Search saved links').fill('coastal').catch(() => undefined);
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(out, `${theme}-${width}-${section.toLowerCase()}.png`) });
        if (section === 'Search') await page.getByLabel('Search saved links').fill('').catch(() => undefined);
      }
    }
  }
  console.log(JSON.stringify({ output: out }));
} finally {
  await h.close();
}
