import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHarness, navigateSidebar, poll } from './harness.mjs';

const checks = [];
const keepGroupsSwitch = page => page.getByRole('switch', { name: 'Keep tab groups', exact: true });

/** The same extension with the optional permission already granted, standing in for the person accepting Chrome's prompt. */
async function grantTabGroups(destination) {
  const file = path.join(destination, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(manifest.optional_permissions, ['tabGroups'], 'tabGroups must ship as an optional permission');
  assert.equal(manifest.permissions.includes('tabGroups'), false, 'tabGroups must not be a required permission');
  manifest.permissions.push('tabGroups');
  delete manifest.optional_permissions;
  await fs.writeFile(file, JSON.stringify(manifest));
}

const groupTabs = (page, tabIds, properties) => page.evaluate(async ({ tabIds, properties }) => {
  const groupId = await chrome.tabs.group({ tabIds });
  await chrome.tabGroups.update(groupId, properties);
  return groupId;
}, { tabIds, properties });

const tabsAt = (page, urls) => page.evaluate(async urls => {
  const all = await chrome.tabs.query({});
  return Promise.all(urls.map(async url => {
    const tab = all.find(candidate => candidate.url === url);
    const group = tab && tab.groupId >= 0 ? await chrome.tabGroups.get(tab.groupId) : undefined;
    return { url, found: Boolean(tab), groupId: tab?.groupId, title: group?.title, color: group?.color, windowId: tab?.windowId };
  }));
}, urls);

/** Restored tabs get their address only once they commit, so wait until every one is listed. */
const openedTabs = (page, urls) => poll(() => tabsAt(page, urls), tabs => tabs.every(tab => tab.found), 'restored tabs listed');

// Without the permission: nothing is read, nothing is stored, and restoring still works.
{
  const h = await createHarness();
  try {
    await h.ok({ type: 'GET_STORAGE_STATUS' });
    assert.equal(await h.page.evaluate(() => typeof chrome.tabGroups), 'undefined');
    const [one, two] = [await h.tab('plain-one'), await h.tab('plain-two')];
    // Group them if Chrome allows it without the permission; either way nothing may be saved.
    await h.page.evaluate(async ids => { try { await chrome.tabs.group({ tabIds: ids }); } catch { /* ungrouped is fine */ } }, [one.id, two.id]);
    const parked = await h.ok({ type: 'PARK_SELECTED_TABS', payload: { tabIds: [one.id, two.id], projectId: 'inbox' } });
    const stored = (await h.raw()).links.filter(link => parked.linkIds.includes(link.id));
    assert.equal(stored.length, 2);
    assert.ok(stored.every(link => link.originalGroup === undefined), 'no group is saved without the permission');
    await h.ok({ type: 'RESTORE_SESSION', payload: { sessionId: parked.sessionId } });
    const restored = await openedTabs(h.page, [`${h.base}/plain-one`, `${h.base}/plain-two`]);
    assert.ok(restored.every(tab => tab.found && tab.groupId === -1), 'tabs reopen ungrouped');

    await navigateSidebar(h.page, 'Settings');
    const toggle = keepGroupsSwitch(h.page);
    await toggle.waitFor();
    await poll(() => toggle.isChecked(), checked => checked === false, 'Keep tab groups starts off');
    await toggle.locator('xpath=ancestor::section[1]').screenshot({ path: path.join(h.output, 'tab-groups-off.png') });
    await navigateSidebar(h.page, 'About');
    assert.equal(await h.page.getByRole('region', { name: 'Why these permissions?' }).getByText('Tab groups (optional)').count(), 1);
    checks.push('Without the permission, parking saves no group, restoring reopens tabs ungrouped, and Keep tab groups starts off');
    assert.deepEqual(h.requests, []);
  } finally { await h.close(); }
}

// With the permission: groups are saved with each link and recreated on restore.
{
  const h = await createHarness({ prepareBuild: grantTabGroups });
  try {
    await h.ok({ type: 'GET_STORAGE_STATUS' });
    const tabs = [];
    for (const label of ['group-a', 'group-b', 'group-c', 'group-d', 'group-e']) tabs.push(await h.tab(label));
    const [tabA, tabB, tabC, tabD, tabE] = tabs;
    const urls = ['group-a', 'group-b', 'group-c', 'group-d'].map(label => `${h.base}/${label}`);
    await groupTabs(h.page, [tabA.id, tabB.id], { title: 'Research', color: 'green' });
    await groupTabs(h.page, [tabC.id], { title: 'Reading', color: 'purple' });
    await groupTabs(h.page, [tabE.id], { title: 'Research', color: 'green' });

    // Park the first four as one session and the fifth on its own.
    const parked = await h.ok({ type: 'PARK_SELECTED_TABS', payload: { tabIds: [tabA.id, tabB.id, tabC.id, tabD.id], projectId: 'inbox' } });
    const single = await h.ok({ type: 'PARK_SELECTED_TABS', payload: { tabIds: [tabE.id], projectId: 'inbox' } });
    const links = (await h.raw()).links;
    const groupOf = url => links.find(link => link.url === url)?.originalGroup;
    assert.deepEqual(groupOf(urls[0]), { title: 'Research', color: 'green' });
    assert.deepEqual(groupOf(urls[1]), { title: 'Research', color: 'green' });
    assert.deepEqual(groupOf(urls[2]), { title: 'Reading', color: 'purple' });
    assert.equal(groupOf(urls[3]), undefined, 'an ungrouped tab saves no group');
    assert.deepEqual(groupOf(`${h.base}/group-e`), { title: 'Research', color: 'green' });
    // The saved record still passes the full storage validation on a fresh read.
    assert.equal((await h.ok({ type: 'EXPORT_DATA' })).backup.database.links.filter(link => link.originalGroup).length, 4);
    checks.push('Parking saves each tab’s group name and colour, and nothing for an ungrouped tab');

    // Restoring a session regroups its tabs: two share one group, one has its own, one stays ungrouped.
    await h.ok({ type: 'RESTORE_SESSION', payload: { sessionId: parked.sessionId } });
    const restored = await openedTabs(h.page, urls);
    assert.notEqual(restored[0].groupId, -1);
    assert.equal(restored[0].groupId, restored[1].groupId, 'tabs from one group share a group again');
    assert.deepEqual([restored[0].title, restored[0].color], ['Research', 'green']);
    assert.notEqual(restored[2].groupId, -1);
    assert.notEqual(restored[2].groupId, restored[0].groupId);
    assert.deepEqual([restored[2].title, restored[2].color], ['Reading', 'purple']);
    assert.equal(restored[3].groupId, -1, 'an ungrouped tab reopens ungrouped');
    assert.equal(new Set(restored.map(tab => tab.windowId)).size, 1);
    checks.push('Restoring a session recreates its groups with their names and colours');

    // Restoring a single link joins the matching group that is already open instead of making a copy.
    await h.ok({ type: 'RESTORE_LINK', payload: { linkId: single.linkIds[0] } });
    const [joined] = await openedTabs(h.page, [`${h.base}/group-e`]);
    assert.equal(joined.groupId, restored[0].groupId, 'the link joins the open Research group');
    const groupCount = await h.page.evaluate(async () => (await chrome.tabGroups.query({})).length);
    assert.equal(groupCount, 2, 'no duplicate Research group is created');
    checks.push('Restoring one link joins the matching open group');

    // Settings shows the setting on, backed by the real permission.
    await navigateSidebar(h.page, 'Settings');
    const toggle = keepGroupsSwitch(h.page);
    await toggle.waitFor();
    await poll(() => toggle.isChecked(), Boolean, 'Keep tab groups on when permitted');
    await toggle.locator('xpath=ancestor::section[1]').screenshot({ path: path.join(h.output, 'tab-groups-on.png') });
    checks.push('Settings shows Keep tab groups on when Chrome has granted the permission');
    assert.deepEqual(h.requests, []);
  } finally { await h.close(); }
}

console.log(JSON.stringify({ checks }));
