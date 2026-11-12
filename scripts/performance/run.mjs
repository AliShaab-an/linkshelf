import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createHarness } from '../native/harness.mjs';
import { dataset, describe, envelope } from './fixtures.mjs';
import { prepare } from './build.mjs';
import { statistics, eventSummary } from './stats.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(arg => { const [name, value = 'true'] = arg.replace(/^--/, '').split('='); return [name, value]; }));
if (args.help) { console.log('Usage: npm run bench:performance -- --suite=core|bulk|ui|memory|fault|storage-writes --sizes=100,1000,5000,10000 --distributions=few,many --repetitions=7 --warmups=2 --bulk-repetitions=3 [--diagnostic] [--only=operation,...]'); process.exit(0); }
for (const flag of Object.keys(args)) assert.ok(['sizes', 'distributions', 'repetitions', 'warmups', 'bulk-repetitions', 'suite', 'diagnostic', 'only', 'profile'].includes(flag), `Unknown benchmark option: ${flag}`);
const options = {
  sizes: (args.sizes || '100,1000,5000,10000').split(',').map(Number),
  distributions: (args.distributions || 'few,many').split(','),
  repetitions: Number(args.repetitions || 7), warmups: Number(args.warmups || 2),
  bulkRepetitions: Number(args['bulk-repetitions'] || 3), suite: args.suite || 'core',
  diagnostic: args.diagnostic === 'true',
  only: args.only?.split(','),
  profile: args.profile === 'true',
};
for (const value of [options.repetitions, options.bulkRepetitions]) assert.ok(Number.isInteger(value) && value > 0 && value <= 50);
assert.ok(Number.isInteger(options.warmups) && options.warmups >= 0 && options.warmups <= 10);
assert.ok(['core', 'bulk', 'ui', 'memory', 'fault', 'storage-writes'].includes(options.suite));
assert.ok(!options.distributions.includes('phase16') || options.suite === 'core', 'Phase 1.6 comparison fixture is for the core suite');
const h = await createHarness({ pagePath: 'profiling.html', prepareBuild: dir => prepare(dir, options.diagnostic) });
for (const page of h.context.pages()) if (page !== h.page) await page.close();
const output = path.join(h.output, 'performance.json');
const result = {
  options, startedAt: new Date().toISOString(), environment: { chrome: h.context.browser().version(), node: process.version,
    os: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0].model, logicalCPUs: os.cpus().length, ramGiB: os.totalmem() / 2 ** 30,
    commit: execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() },
  datasets: [], failures: [],
};
const persist = () => fs.writeFile(output, JSON.stringify(result, null, 2));
let fixture;
async function seed(value = fixture) {
  const { bytes } = describe(value); assert.ok(bytes < 8 * 1024 * 1024, 'Fixture must retain quota headroom');
  const status = await h.seed(value); assert.equal(status.status.state, 'healthy', JSON.stringify(status));
  await h.ok({ type: 'GET_DUE_REMINDER_LINKS' }); // Reconcile outside measured samples.
}
async function rpc(type, payload, full = false) {
  const start = performance.now();
  const response = await h.page.evaluate(async ({ type, payload, full }) => {
    const start = performance.now();
    const response = await chrome.runtime.sendMessage({ type, ...(payload ? { payload } : {}) });
    const ms = performance.now() - start;
    if (!response?.success) throw new Error(JSON.stringify(response?.error || response));
    const count = response.results?.length ?? response.groups?.length ?? response.links?.length ?? response.projects?.length ?? response.openedLinkIds?.length ?? response.backup?.database?.links?.length ?? 0;
    return { ms, count, bookmarks: response.bookmarks?.length, warnings: response.warnings?.length ?? 0,
      ...(full ? { response } : {}), token: response.preview?.revisionToken,
      settings: type === 'UPDATE_SETTINGS' ? response.settings : undefined,
      importResult: type === 'IMPORT_DATA' ? response.result : undefined };
  }, { type, payload, full });
  const { response: _fullPayload, ...summary } = response;
  if (full && type === 'EXPORT_DATA') JSON.stringify(_fullPayload.backup); // Phase 1.6 transport comparison.
  return { ...summary, transportMs: performance.now() - start };
}
async function sample(row, name, action, { reset, verify, repetitions = options.repetitions, warmups = options.warmups, capture = options.diagnostic } = {}) {
  if (options.only && !options.only.includes(name)) return;
  const values = [], transport = [], samples = [];
  for (let i = -warmups; i < repetitions; i++) {
    let timer;
    try {
      const { item, events } = await Promise.race([(async () => {
        await reset?.();
        if (capture) await h.ok({ type: 'PERF_START' });
        const item = await action();
        const events = capture ? (await h.ok({ type: 'PERF_STOP' })).events : [];
        await verify?.(item);
        return { item, events };
      })(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Sample exceeded 90-second execution limit')), 90000); })]);
      assert.ok(Number.isFinite(item.ms) && item.ms >= 0);
      if (i >= 0) {
        values.push(item.ms);
        if (Number.isFinite(item.transportMs)) transport.push(item.transportMs);
        const { token: _syntheticPreviewToken, ...record } = item;
        samples.push({ ...record, events: eventSummary(events), ...(events.length ? { spans: events } : {}) });
      }
    } catch (error) {
      result.failures.push({ dataset: row.distribution + '/' + row.links, operation: name, iteration: i, error: String(error) });
      if (String(error).includes('90-second execution limit')) throw error; // Do not reuse a profile with an in-flight mutation.
      if (capture) await h.rpc({ type: 'PERF_STOP' }).catch(() => {});
      break;
    } finally { clearTimeout(timer); }
  }
  row.measurements[name] = { clock: 'browser performance.now; outer Playwright/Node only where measured', ...statistics(values), transport: statistics(transport), samples };
  console.log(`${row.distribution}/${row.links} ${name}: ${values.length ? statistics(values).medianMs.toFixed(2) : 'FAILED'} ms (${values.length} samples)`);
  await persist();
}
const cpu = name => h.page.evaluate(name => globalThis.linkshelfCPU.run(name), name);

async function core(row) {
  await h.page.evaluate(value => globalThis.linkshelfCPU.setup(value), fixture);
  for (const name of ['clone', 'schema', 'integrity', 'compare', 'stringify', 'parse', 'hash', 'groups', 'groups.project', 'group.serialize', 'group.map', 'session.list', 'sort.links', 'sort.sessions', 'reminder.group', 'backup.validate', 'backup.file']) {
    await sample(row, 'cpu.' + name, () => cpu(name));
  }
  for (const [name, type, payload] of [
    ['projects.warm', 'GET_PROJECTS'], ['groups.all', 'GET_PARKED_SESSION_GROUPS'],
    ['groups.project', 'GET_PARKED_SESSION_GROUPS', { projectId: fixture.settings.defaultProjectId }],
    ['search.url', 'SEARCH_LINKS', { query: fixture.links[1].url }], ['search.title', 'SEARCH_LINKS', { query: 'item 99 topic' }],
    ['search.note', 'SEARCH_LINKS', { query: 'reference-99' }], ['search.none', 'SEARCH_LINKS', { query: 'no-such-synthetic-record' }],
    ['search.broad', 'SEARCH_LINKS', { query: 'synthetic' }], ['search.archived', 'SEARCH_LINKS', { query: fixture.links.find(link => link.status === 'archived')?.title || 'topic' }],
    ['search.project', 'SEARCH_LINKS', { query: 'restoration probe' }], ['search.bookmarks', 'SEARCH_LINKS', { query: 'synthetic bookmark' }],
    ['export', 'EXPORT_DATA'], ['reminders.ordinary', 'GET_DUE_REMINDER_LINKS'],
  ]) await sample(row, name, () => rpc(type, payload));
  await sample(row, 'groups.fullTransport', () => rpc('GET_PARKED_SESSION_GROUPS', undefined, true), { repetitions: 3, warmups: 1 });
  await sample(row, 'chrome.bookmarks.getTree', () => h.page.evaluate(async () => { const start = performance.now(); await chrome.bookmarks.getTree(); return { ms: performance.now() - start }; }));
  if (row.distribution === 'phase16') await sample(row, 'export.fullTransport', () => rpc('EXPORT_DATA', undefined, true), { repetitions: 3, warmups: 1 });
  // Same real API in the bridge page, with no worker/repository or returned large object.
  let toggle = false;
  for (const method of ['get', 'set']) await sample(row, 'chrome.storage.' + method, () => h.page.evaluate(async ({ method, fixture }) => {
    const start = performance.now();
    if (method === 'get') await chrome.storage.local.get('linkshelfDatabase');
    else await chrome.storage.local.set({ linkshelfDatabase: fixture });
    return { ms: performance.now() - start };
  }, { method, fixture: method === 'set' ? { ...fixture, settings: { ...fixture.settings, displayDensity: (toggle = !toggle) ? 'comfortable' : 'compact' } } : null }));
  await sample(row, 'projects.afterExternalWrite', () => rpc('GET_PROJECTS'), { reset: async () => { toggle = !toggle; await h.page.evaluate(value => chrome.storage.local.set({ linkshelfDatabase: value }), { ...fixture, settings: { ...fixture.settings, displayDensity: toggle ? 'compact' : 'comfortable' } }); } });
  await sample(row, 'validation.recheck', () => rpc('RECHECK_STORAGE'));
  await sample(row, 'write.verified', () => rpc('UPDATE_SETTINGS', { ...fixture.settings, displayDensity: 'comfortable' }), { reset: () => seed() });
  const backup = envelope({ ...fixture, settings: { ...fixture.settings, displayDensity: 'comfortable' } });
  for (const mode of ['merge', 'replace']) {
    await sample(row, 'backup.preview.' + mode, () => rpc('PREVIEW_IMPORT_DATA', { backup, mode }));
    let token;
    await sample(row, 'backup.commit.' + mode, () => rpc('IMPORT_DATA', { backup, mode, revisionToken: token }), {
      reset: async () => { await seed(); token = (await rpc('PREVIEW_IMPORT_DATA', { backup, mode })).token; }, repetitions: options.bulkRepetitions, warmups: 1,
    });
  }
  await sample(row, 'worker.coldProjects', () => rpc('GET_PROJECTS'), { reset: () => h.stopWorker({ wake: false }), repetitions: 3, warmups: 1, capture: false });
}

async function reminders(row) {
  await sample(row, 'reminders.schedule', () => rpc('GET_DUE_REMINDER_LINKS'), {
    reset: async () => { await seed(); await h.page.evaluate(async () => { for (const alarm of await chrome.alarms.getAll()) await chrome.alarms.clear(alarm.name); }); }, repetitions: options.bulkRepetitions, warmups: 1,
  });
  await sample(row, 'reminders.delivery', async () => {
    const info = await rpc('GET_DUE_REMINDER_LINKS');
    assert.equal(info.warnings, 0);
    const stored = await h.page.evaluate(async () => (await chrome.storage.local.get('linkshelfDatabase')).linkshelfDatabase.links[1].reminderNotifiedAt);
    assert.ok(stored, 'Expected one persisted reminder acknowledgment');
    return info;
  }, { reset: async () => {
    await h.page.evaluate(async () => { for (const id of Object.keys(await chrome.notifications.getAll())) await chrome.notifications.clear(id); });
    const value = structuredClone(fixture); value.links[1].reminderAt = '2020-01-01T00:00:00.000Z'; delete value.links[1].reminderNotifiedAt;
    const status = await h.seed(value); assert.equal(status.status.state, 'healthy'); // No reconcile before the measured delivery.
  }, repetitions: options.bulkRepetitions, warmups: 1 });
}

async function cleanupTabs() {
  await h.page.evaluate(async base => {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) if ((tab.pendingUrl || tab.url || '').startsWith(base + '/item/')) await chrome.tabs.remove(tab.id);
  }, h.base);
}
async function bulk(row) {
  // Reset must be outside the measured interval AND before instrumentation starts.
  for (const [name, count, mode, copy, type] of [
    ['restore.one', 1, 'normal', false, 'RESTORE_LINK'], ['restore.three', 3, 'normal', false, 'RESTORE_LINK'],
    ['restore.ten', 10, 'normal', false, 'RESTORE_LINK'], ['restore.session10', 10, 'normal', false, 'RESTORE_SESSION'],
    ['restore.project10', 10, 'normal', false, 'RESTORE_PROJECT'], ['restore.unloaded10', 10, 'unloaded', false, 'RESTORE_PROJECT'],
    ['restore.copies10', 10, 'normal', true, 'RESTORE_PROJECT'],
  ]) {
    let value;
    await sample(row, name, async () => {
      const start = performance.now();
      const reply = await h.page.evaluate(async ({ type, count, mode }) => {
        const start = performance.now(); let total = 0, discarded = 0, fallback = 0;
        for (let i = 0; i < (type === 'RESTORE_LINK' ? count : 1); i++) {
          const payload = type === 'RESTORE_LINK' ? { linkId: `link-${i}` } : type === 'RESTORE_SESSION' ? { sessionId: 'restore-session' } : { projectId: 'restore-probe', mode };
          const response = await chrome.runtime.sendMessage({ type, payload });
          if (!response.success) throw new Error(JSON.stringify(response));
          total += response.openedLinkIds?.length ?? Number(response.opened);
          discarded += response.discardedLinkIds?.length || 0; fallback += response.fallbackLinkIds?.length || 0;
        }
        return { ms: performance.now() - start, count: total, discarded, fallback };
      }, { type, count, mode });
      assert.equal(reply.count, count);
      return { ...reply, transportMs: performance.now() - start };
    }, {
      reset: async () => {
        await cleanupTabs(); value = structuredClone(fixture); value.settings.defaultRestoreBehavior = copy ? 'open-copy' : 'restore-and-remove'; value.settings.defaultRestoreMode = mode; await seed(value);
      },
      verify: async item => {
        item.persisted = await h.page.evaluate(count => chrome.storage.local.get('linkshelfDatabase').then(({ linkshelfDatabase }) =>
          linkshelfDatabase.links.slice(0, count).filter(link => link.status === 'restored').length), count);
        assert.equal(item.persisted, copy ? 0 : count);
      },
      repetitions: options.bulkRepetitions, warmups: 1,
    });
  }
  await cleanupTabs();
}

try {
  // A fixed native-bookmark workload, separate from saved-link fixture size.
  await h.page.evaluate(async origin => { const folder = await chrome.bookmarks.create({ title: 'Synthetic benchmark bookmarks' }); for (let i = 0; i < 100; i++) await chrome.bookmarks.create({ parentId: folder.id, title: `Synthetic bookmark ${i}`, url: `${origin}/bookmark/${i}` }); }, h.base);
  for (const distribution of options.distributions) for (const size of options.sizes) {
    fixture = dataset(size, distribution, h.base);
    assert.deepEqual(fixture, dataset(size, distribution, h.base));
    const row = { distribution, ...describe(fixture), measurements: {} };
    result.datasets.push(row); await seed();
    row.chromeBytes = await h.page.evaluate(() => chrome.storage.local.getBytesInUse('linkshelfDatabase'));
    if (options.suite === 'core') await core(row);
    else if (options.suite === 'bulk') { await bulk(row); await reminders(row); }
    else if (options.suite === 'ui') { const suite = await import('./ui.mjs'); await suite.runUI(h, row, { fixture, seed, cleanupTabs, sample, options }); }
    else if (options.suite === 'memory') { const suite = await import('./memory.mjs'); await suite.runMemory(h, row, { fixture, cpu, sample, options }); }
    else if (options.suite === 'storage-writes') {
      const { runStorageWrites } = await import('./storage-writes.mjs');
      await runStorageWrites(h, row, { fixture, seed, sample, rpc, envelope, options });
    } else { const suite = await import('./fault.mjs'); await suite.runFault(h, row, { fixture, seed, sample, envelope }); }
    assert.ok(Object.keys(row.measurements).length, 'No benchmark operations matched --only');
    await persist();
  }
} catch (error) { result.failures.push({ fatal: true, error: error.stack }); process.exitCode = 1; }
finally {
  result.finishedAt = new Date().toISOString(); if (result.failures.length) process.exitCode = 1;
  await persist(); await h.close(); console.log(JSON.stringify({ output, failures: result.failures.length, datasets: result.datasets.length }));
}
