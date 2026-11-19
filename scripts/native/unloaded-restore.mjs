import assert from 'node:assert/strict';
import { createHarness, poll } from './harness.mjs';

const h = await createHarness();
const urlsOpen = () => h.page.evaluate(async () => (await chrome.tabs.query({})).map(tab => ({ url: tab.url, pending: tab.pendingUrl, discarded: tab.discarded, title: tab.title })));

try {
  const { project } = await h.ok({ type: 'CREATE_PROJECT', payload: { name: 'Unloaded restore' } });
  const labels = ['unloaded-1', 'unloaded-2', 'unloaded-3'];
  await h.park(labels, project.id);
  const result = await h.ok({ type: 'RESTORE_PROJECT', payload: { projectId: project.id, mode: 'unloaded' } });
  assert.equal(result.openedLinkIds.length, 3);
  assert.equal(result.discardedLinkIds.length + result.fallbackLinkIds.length, 3);

  // Regression: tabs discarded before their navigation committed came back blank (no URL, no title).
  const expected = labels.map(label => `${h.base}/${label}`);
  const tabs = await poll(urlsOpen, value => expected.every(url => value.some(tab => (tab.url || tab.pending) === url)), 'restored tabs keep their addresses');
  for (const url of expected) {
    const tab = tabs.find(item => (item.url || item.pending) === url);
    assert.ok(tab.title, `Restored tab ${url} has a title`);
  }
  assert.equal(tabs.filter(tab => tab.url === '' && !tab.pending).length, 0, 'No blank restored tabs');
  assert.ok(tabs.filter(tab => tab.discarded).length >= 1 || result.fallbackLinkIds.length === 3, 'Tabs were discarded or reported as fallback');
  console.log(JSON.stringify({ chrome: h.context.browser().version(), discarded: result.discardedLinkIds.length, fallback: result.fallbackLinkIds.length, output: h.output }));
} finally {
  await h.close();
}
