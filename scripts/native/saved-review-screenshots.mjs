import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHarness, navigateSidebar, poll } from './harness.mjs';
import { dataset } from '../performance/fixtures.mjs';

const stage = process.argv[2];
assert.ok(['before', 'after'].includes(stage), 'Pass before or after for the current production build');
const destination = path.resolve('.output/ui-refinement-1', stage);
const h = await createHarness();
const { page } = h;

try {
  const fixture = dataset(100, 'few', h.base);
  const project = fixture.projects.find(project => project.id === 'restore-probe');
  project.name = 'Field research and reading for the coastal habitat survey';
  const first = fixture.sessions[0];
  const newest = { ...first, id: 'follow-up', createdAt: '2026-11-06T09:30:00.000Z' };
  fixture.projects = fixture.projects.filter(project => project.isInbox || project.id === first.projectId);
  fixture.sessions = [first, newest];
  fixture.settings.defaultProjectId = 'inbox';
  fixture.settings.displayDensity = 'comfortable';
  fixture.settings.notificationsEnabled = false;
  const titles = [
    'Coastal habitat survey: field guide, methods, and reference material for the next visit',
    'Sampling locations and tide tables',
    'Annotated shoreline maps',
    'Fieldwork checklist and sample inventory',
  ];
  fixture.links = fixture.links.slice(0, titles.length).map((link, index) => {
    const session = index < 2 ? first : newest;
    const url = `${h.base}/coastal-survey/${'reading-material-and-field-notes/'.repeat(5)}${index}`;
    const { reminderAt, reminderNotifiedAt, ...record } = link;
    return { ...record, sessionId: session.id, createdAt: session.createdAt, title: titles[index],
      url, normalizedUrl: url, note: index === 0 ? 'Check the field methods before the next low-tide visit.' : 'Synthetic fieldwork reference.' };
  });
  assert.equal((await h.seed(fixture)).status.state, 'healthy');
  await page.reload();
  await fs.mkdir(destination, { recursive: true });
  const zoom = factor => page.evaluate(async value => chrome.tabs.setZoom((await chrome.tabs.getCurrent()).id, value), factor);
  async function capture(screen, label) {
    await page.evaluate(() => scrollTo(0, 0));
    if (stage === 'after') {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
        `${screen} fits the viewport at ${label}`);
    }
    await page.screenshot({ path: path.join(destination, `${screen}-${label}.png`), animations: 'disabled' });
  }

  for (const [label, width, factor] of [['320', 320, 1], ['400', 400, 1], ['200-percent', 640, 2]]) {
    await zoom(1);
    await page.setViewportSize({ width, height: 760 * factor });
    await zoom(factor);
    await poll(() => page.evaluate(() => innerWidth), value => value === width / factor, 'effective CSS viewport width');
    await navigateSidebar(page, 'Saved');
    await page.getByLabel('Project', { exact: true }).selectOption(project.id);
    await page.getByRole('button', { name: 'Restore session', exact: true }).first().waitFor();
    await capture('saved', label);
    await navigateSidebar(page, 'Review');
    await page.getByText(titles[0], { exact: true }).waitFor();
    await capture('review', label);
  }
  console.log(JSON.stringify({ chrome: h.context.browser().version(), destination }));
} finally {
  await h.close();
}
