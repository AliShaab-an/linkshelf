import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHarness } from './harness.mjs';
import { dataset } from '../performance/fixtures.mjs';

const h = await createHarness();
const report = { chrome: h.context.browser().version(), cases: [] };
const worker = () => h.worker();
const session = { type: 'RESTORE_SESSION', payload: { sessionId: 'restore-session' } };
const project = mode => ({ type: 'RESTORE_PROJECT', payload: { projectId: 'restore-probe', mode } });
const listTabs = () => h.page.evaluate(() => chrome.tabs.query({}));
const counts = () => worker().evaluate(() => globalThis.bulkProbe.counts);
let previousTabIds = [];

async function prepare(size, behavior = 'restore-and-remove') {
  const base = dataset(100, 'few', h.base);
  base.links = base.links.filter(link => link.projectId !== 'restore-probe');
  const example = dataset(100, 'few', h.base).links[1];
  const targets = Array.from({ length: size }, (_, i) => {
    const url = `${h.base}/native-bulk/${i}`;
    return { ...example, id: `native-bulk-${i}`, title: `Bulk record ${i}`, originalIndex: i, url, normalizedUrl: url,
      note: `Synthetic note ${i}`, reminderAt: '2099-01-01T10:00:00.000Z' };
  });
  base.links.push(...targets);
  base.settings.defaultRestoreBehavior = behavior;
  await h.page.evaluate(async ({ origin, ids }) => {
    for (const tab of await chrome.tabs.query({})) {
      if (ids.includes(tab.id) || (tab.pendingUrl || tab.url || '').startsWith(origin + '/native-bulk/')) await chrome.tabs.remove(tab.id);
    }
  }, { origin: h.base, ids: previousTabIds });
  previousTabIds = [];
  assert.equal((await h.seed(base)).status.state, 'healthy');
  await h.ok({ type: 'GET_DUE_REMINDER_LINKS' });
  return targets;
}

async function probe({ failWrite, failCreate, holdWrite, holdCreate } = {}) {
  await worker().evaluate(({ failWrite, failCreate, holdWrite, holdCreate }) => {
    globalThis.bulkProbe?.cleanup();
    const counts = { get: 0, set: 0, readback: 0, create: 0, discard: 0 };
    const created = [];
    let awaitingReadback = false;
    let signal;
    const entered = new Promise(resolve => { signal = resolve; });
    const never = new Promise(() => {});
    const storage = chrome.storage.local;
    const tabs = chrome.tabs;
    const original = { get: storage.get, set: storage.set, create: tabs.create, discard: tabs.discard };
    storage.get = async key => {
      if (key === 'linkshelfDatabase') {
        counts.get++;
        if (awaitingReadback) { counts.readback++; awaitingReadback = false; }
      }
      return original.get.call(storage, key);
    };
    storage.set = async patch => {
      if (Object.hasOwn(patch, 'linkshelfDatabase')) {
        counts.set++;
        if (counts.set === holdWrite) { signal(); await never; }
        awaitingReadback = true;
        if (counts.set === failWrite) throw new Error('Injected native checkpoint failure');
      }
      return original.set.call(storage, patch);
    };
    tabs.create = async input => {
      counts.create++;
      if (counts.create === holdCreate) { signal(); await never; }
      if (counts.create === failCreate) throw new Error('Injected native tab-open failure');
      const tab = await original.create.call(tabs, input);
      created.push({ id: tab.id, url: input.url });
      return tab;
    };
    tabs.discard = async id => {
      const result = await original.discard.call(tabs, id);
      if (result?.discarded) {
        counts.discard++;
        const tab = created.find(tab => tab.id === id);
        if (tab && result.id !== undefined) tab.id = result.id;
      }
      return result;
    };
    globalThis.bulkProbe = { counts, created, entered, cleanup() {
      storage.get = original.get; storage.set = original.set; tabs.create = original.create; tabs.discard = original.discard;
    } };
  }, { failWrite, failCreate, holdWrite, holdCreate });
}

async function assertStored(targets, restored) {
  const database = await h.raw();
  for (const target of targets) {
    const record = database.links.find(link => link.id === target.id);
    assert.equal(record.status, restored.includes(target.id) ? 'restored' : 'parked');
    assert.equal(record.note, target.note);
    assert.equal(record.reminderAt, target.reminderAt);
    if (record.status === 'restored') assert.equal(record.restoredAt, record.updatedAt);
  }
}

try {
  const targetWindow = await h.page.evaluate(async () => (await chrome.tabs.getCurrent()).windowId);
  for (const [name, size, message, copies] of [
    ['session-3', 3, session, false], ['project-10', 10, project('normal'), false],
    ['unloaded-10', 10, project('unloaded'), false], ['project-25', 25, project('normal'), false],
    ['copies-10', 10, project('normal'), true],
  ]) {
    const targets = await prepare(size, copies ? 'open-copy' : undefined);
    await probe();
    const { result, ms } = await h.page.evaluate(async message => {
      const start = performance.now();
      const result = await chrome.runtime.sendMessage(message);
      return { result, ms: performance.now() - start };
    }, message);
    assert.equal(result.success, true);
    const ids = targets.map(link => link.id);
    assert.deepEqual(result.openedLinkIds, ids);
    assert.deepEqual(result.restoredLinkIds, copies ? [] : ids);
    assert.equal(result.complete, true);
    const trace = await counts();
    const checkpoints = copies ? 0 : Math.ceil(size / 2);
    assert.equal(trace.create, size);
    assert.equal(trace.set, checkpoints);
    assert.equal(trace.readback, checkpoints);
    assert.ok(trace.get >= 2 * checkpoints);
    assert.equal(trace.discard, result.discardedLinkIds.length);
    if (name === 'unloaded-10') assert.equal(result.discardedLinkIds.length + result.fallbackLinkIds.length, size);
    await assertStored(targets, result.restoredLinkIds);
    // Follow the actual tab ID returned by Chrome, including discard replacements.
    const created = await worker().evaluate(() => globalThis.bulkProbe.created);
    previousTabIds = created.map(tab => tab.id);
    const tabs = (await listTabs()).filter(tab => previousTabIds.includes(tab.id)).sort((a, b) => a.index - b.index);
    assert.deepEqual(created.map(tab => tab.url), targets.map(link => link.url));
    assert.deepEqual(tabs.map(tab => tab.id), previousTabIds);
    assert.ok(tabs.every(tab => tab.windowId === targetWindow && !tab.active));
    report.cases.push({ name, ms, trace, opened: size, restored: result.restoredLinkIds.length, fallback: result.fallbackLinkIds.length });
  }

  const partialTargets = await prepare(3);
  await probe({ failCreate: 2 });
  const partial = await h.ok(session);
  assert.deepEqual(partial.failedLinkIds, [partialTargets[1].id]);
  await assertStored(partialTargets, [partialTargets[0].id, partialTargets[2].id]);
  report.cases.push({ name: 'browser-open-failure', trace: await counts(), opened: 2, restored: 2 });

  const failed = await prepare(5);
  await probe({ failWrite: 2 });
  const first = await h.rpc(project('normal'));
  assert.equal(first.error.code, 'STORAGE_FAILED');
  assert.deepEqual(first.progress.openedLinkIds, failed.slice(0, 4).map(link => link.id));
  assert.deepEqual(first.progress.restoredLinkIds, failed.slice(0, 2).map(link => link.id));
  await assertStored(failed, first.progress.restoredLinkIds);
  const failureTrace = await counts();
  await probe();
  const retry = await h.ok(project('normal'));
  assert.equal(retry.restoredLinkIds.length, 3);
  assert.equal((await counts()).create, 1);
  assert.equal((await listTabs()).filter(tab => (tab.pendingUrl || tab.url || '').includes('/native-bulk/')).length, 5);
  report.cases.push({ name: 'checkpoint-failure-and-retry', failureTrace, retryTrace: await counts(), firstOpened: 4, firstRestored: 2 });
  await h.restart();
  await assertStored(failed, failed.map(link => link.id));

  for (const interruptedBeforeCommit of [false, true]) {
    const targets = await prepare(4);
    await probe(interruptedBeforeCommit ? { holdWrite: 1 } : { holdCreate: 3 });
    const pending = h.rpc(project('normal')).catch(() => undefined);
    await worker().evaluate(() => globalThis.bulkProbe.entered);
    // A collection must first read its selection. At a held storage set, use
    // the single-link entry point, which checks its reservation before reading.
    const overlapping = await h.rpc(interruptedBeforeCommit
      ? { type: 'RESTORE_LINK', payload: { linkId: targets[0].id } }
      : session);
    assert.equal(overlapping.error.code, 'OPERATION_IN_PROGRESS');
    await h.stopWorker();
    await pending;
    const committed = interruptedBeforeCommit ? [] : targets.slice(0, 2).map(link => link.id);
    await assertStored(targets, committed);
    assert.equal((await listTabs()).filter(tab => (tab.pendingUrl || tab.url || '').includes('/native-bulk/')).length, 2);
    if (!interruptedBeforeCommit) {
      assert.equal((await h.ok(project('normal'))).restoredLinkIds.length, 2);
      assert.equal((await listTabs()).filter(tab => (tab.pendingUrl || tab.url || '').includes('/native-bulk/')).length, 4);
    }
    report.cases.push({ name: interruptedBeforeCommit ? 'worker-stopped-before-first-set' : 'worker-stopped-between-checkpoints', openedAtStop: 2, committedAtStop: committed.length, overlapping: overlapping.error.code });
  }
  const file = path.join(h.output, 'bulk-restore-results.json');
  await fs.writeFile(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ file, cases: report.cases }));
} finally {
  await h.close();
}
