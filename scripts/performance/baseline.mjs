import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dataset, describe, FIXTURE_SEED } from './fixtures.mjs';
import { statistics, eventSummary, verifiedReadbacks } from './stats.mjs';

const flags = process.argv.slice(2);
if (flags.includes('--help')) {
  console.log('Usage: npm run perf:baseline -- [--full]\nBuild first. Default runs a small Chrome smoke matrix.');
  process.exit(0);
}
if (flags.some(flag => flag !== '--full')) throw new Error('Unknown option. Use --help.');
const full = flags.includes('--full');
const sizes = full ? '100,1000,5000,10000' : '100';
const expensiveSizes = full ? '100,10000' : '100';
const output = path.resolve('.output/performance-baselines', new Date().toISOString().replaceAll(':', '-') + '-' + process.pid);
await fs.mkdir(output, { recursive: true });
const file = path.join(output, 'baseline.json');
const report = {
  format: 1, toolVersion: '2.6.2', matrix: full ? 'full' : 'smoke', startedAt: new Date().toISOString(),
  environment: {
    commit: execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: !!execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim(),
    node: process.version, os: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0].model,
    logicalCPUs: os.cpus().length, ramGiB: Math.round(os.totalmem() / 2 ** 30 * 10) / 10, headless: process.env.LINKSHELF_HEADED !== '1',
    backgroundSha256: await fs.readFile('.output/chrome-mv3/background.js')
      .then(bytes => createHash('sha256').update(bytes).digest('hex'), () => undefined),
  },
  jobs: [], operations: [],
};
const persist = () => fs.writeFile(file, JSON.stringify(report, null, 2));
const core = ['projects.warm', 'worker.coldProjects', 'validation.recheck', 'search.url', 'search.title', 'search.note',
  'search.project', 'search.none', 'search.broad', 'search.archived', 'search.bookmarks', 'export', 'backup.preview.replace', 'reminders.ordinary'];
const bulk = ['restore.one', 'restore.session10', 'restore.project10', 'restore.unloaded10', 'restore.copies10', 'reminders.schedule'];
const jobs = [
  ['core', 'run.mjs', [`--sizes=${sizes}`, `--distributions=${full ? 'few,many' : 'few'}`, '--repetitions=2', '--warmups=1', `--only=${core.join(',')}`]],
  ['storage-writes', 'run.mjs', ['--suite=storage-writes', '--diagnostic', `--sizes=${expensiveSizes}`, '--distributions=few', '--bulk-repetitions=2']],
  ['bulk', 'run.mjs', ['--suite=bulk', '--diagnostic', `--sizes=${expensiveSizes}`, '--distributions=few', '--bulk-repetitions=2', `--only=${bulk.join(',')}`]],
  ['search', 'search.mjs', ['--paged', '--diagnostic', ...(full ? [] : ['--smoke'])]],
  ['rendering', 'rendering.mjs', full ? [] : ['--smoke']],
];
const hashes = new Map();

function add(suite, distribution, size, definition, clock, mode, warmups, expectedSamples, samples, status, reason) {
  const fixtureKey = `${distribution}/${size}`;
  if (size && !hashes.has(fixtureKey)) hashes.set(fixtureKey, describe(dataset(size, distribution)).sha256);
  const stats = statistics(samples.map(sample => sample.ms));
  const metrics = {};
  const names = new Set(samples.flatMap(sample => Object.keys(sample.metrics)));
  for (const name of names) {
    const values = samples.flatMap(sample => sample.metrics[name] === undefined
      ? (name.endsWith('.calls') ? [0] : [])
      : [sample.metrics[name]]);
    metrics[name] = statistics(values).medianMs;
  }
  const resultCount = samples[0]?.metrics.total ?? samples[0]?.metrics.count;
  const validSamples = stats?.n === expectedSamples && samples.every(sample => Number.isFinite(sample.ms) && sample.ms >= 0 &&
    (sample.metrics.total ?? sample.metrics.count) === resultCount);
  report.operations.push({
    key: `${suite}/${distribution}/${size}/${definition}`, suite, definition, distribution, size, seed: FIXTURE_SEED, fixtureHash: hashes.get(fixtureKey),
    clock, mode, warmups, expectedSamples, resultCount, stats, metrics,
    status: status ?? (validSamples ? 'completed' : 'failed'), reason,
  });
}

function sample(ms, values, events) {
  const metrics = Object.fromEntries(Object.entries(values).filter(([, value]) => Number.isFinite(value)));
  for (const [label, event] of Object.entries(events ?? {})) {
    metrics[`${label}.calls`] = event.calls;
  }
  return { ms, metrics };
}

function collect(suite, raw) {
  if (raw.datasets) {
    for (const row of raw.datasets) for (const [operation, value] of Object.entries(row.measurements)) {
      const failed = raw.failures.some(f => f.dataset === `${row.distribution}/${row.links}` && f.operation === operation);
      add(suite, row.distribution, row.links, operation, 'extension-page browser RPC', raw.options.diagnostic ? 'diagnostic' : 'production',
        1, operation === 'worker.coldProjects' ? 3 : 2,
        (value.samples ?? []).map(s => sample(s.ms, {
          count: s.count, bookmarks: s.bookmarks, persisted: s.persisted, discarded: s.discarded, fallback: s.fallback,
          readbacks: raw.options.diagnostic ? verifiedReadbacks(s.spans ?? []) : undefined,
          'chrome.storage.local.get.calls': raw.options.diagnostic ? s.events['chrome.storage.local.get']?.calls ?? 0 : undefined,
          'chrome.storage.local.set.calls': raw.options.diagnostic ? s.events['chrome.storage.local.set']?.calls ?? 0 : undefined,
        }, s.events)),
        failed ? 'failed' : value.skipped ? 'skipped' : undefined);
    }
  } else if (raw.rows) {
    for (const row of raw.rows) {
      const addSearch = (operation, clock, time, bytes) => add(suite, row.distribution, row.size, `${row.name}.${operation}`,
        clock, 'diagnostic', 1, 3, row.samples.map(s => sample(s[time], {
          total: s.total, firstCount: s.firstCount, bytes: s[bytes], continuations: s.continuations.length,
        }, eventSummary(s.events))));
      addSearch('first', 'first browser RPC', 'firstMs', 'firstBytes');
      if (row.name === 'broad') {
        addSearch('all', 'sum of all browser RPCs', 'fullMs', 'fullBytes');
        add(suite, row.distribution, row.size, 'broad.continuation', 'per-run median subsequent browser RPC',
          'diagnostic', 1, 3, row.samples.map(s => sample(statistics(s.continuations)?.medianMs, {
            total: s.total, continuations: s.continuations.length,
          })));
      }
    }
  } else {
    const addRendering = (distribution, size, operation, rows, warmups, expected, skipped) => add(suite, distribution, size, operation,
      'input to observed frame with Playwright interaction', 'production', warmups, expected, rows.map(s => sample(s.ms, {
        cards: s.cards, elements: s.elements, longTaskMs: s.longTaskMs, heapBytes: s.heapBytes,
        layoutCount: s.layoutCount, responseToFrameMs: s.responseToFrameMs,
      })), skipped ? 'skipped' : undefined, skipped);
    for (const row of raw.archive) addRendering(row.distribution, row.size, 'archive', row.samples, 1, 3);
    for (const name of ['initial', 'loaded', 'bookmarks']) {
      if (raw.search.length) addRendering('few', 1000, `search.${name}`, raw.search.map(row => row[name]), 0, 3);
    }
    for (const row of raw.projects) for (const name of ['expanded', 'showMore', 'showAll']) {
      addRendering(row.distribution, 10000, `projects.${name}`, row[name] ? [row[name]] : [], 0, 1,
        row[name] ? undefined : row.skipped);
    }
  }
  for (const failure of raw.failures ?? (raw.failure ? [raw.failure] : [])) {
    if (failure.operation && !report.operations.some(row => row.suite === suite && row.definition === failure.operation &&
      `${row.distribution}/${row.size}` === (failure.dataset ?? `${failure.distribution}/${failure.size}`))) {
      add(suite, failure.distribution ?? failure.dataset?.split('/')[0] ?? 'unknown',
        failure.size ?? (Number(failure.dataset?.split('/')[1]) || undefined),
        failure.operation, 'unknown', 'unknown', 0, 0, [], 'failed');
    }
  }
}

for (const [suite, script, args] of jobs) {
  console.log(`Running ${suite} (${report.matrix})`);
  const child = spawnSync(process.execPath, [path.resolve('scripts/performance', script), ...args],
    { encoding: 'utf8', timeout: 600_000, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, LINKSHELF_DISCARD_PROFILE: '1' } });
  const lines = (child.stdout ?? '').trim().split(/\r?\n/).reverse();
  const line = lines.find(item => item.endsWith('performance.json') || item.startsWith('{"output":'));
  const job = { suite, args, status: 'failed' };
  report.jobs.push(job);
  try {
    const rawPath = line?.startsWith('{') ? JSON.parse(line).output : line;
    if (rawPath) {
      const raw = JSON.parse(await fs.readFile(rawPath, 'utf8'));
      job.rawReport = path.relative(process.cwd(), rawPath);
      const chrome = raw.environment?.chrome ?? raw.chrome;
      if (report.environment.chrome && report.environment.chrome !== chrome) throw new Error('Chrome version changed between suites');
      report.environment.chrome = chrome;
      const offset = report.operations.length;
      collect(suite, raw);
      const measurements = report.operations.slice(offset);
      if (child.status === 0 && !raw.failure && !raw.failures?.length && measurements.length > 0 &&
          measurements.every(row => row.status === 'completed' || row.status === 'skipped')) job.status = 'completed';
    } else if (/Install Playwright separately|executable doesn't exist/i.test(child.stderr ?? '')) {
      job.status = 'unsupported';
    }
  } catch {
    job.status = 'failed';
  }
  if (job.status !== 'completed') {
    job.exitCode = child.status;
    job.reason = child.error?.code ?? (line ? 'measurement or report failed' : 'no browser report was produced');
    add(suite, 'unknown', undefined, 'suite', 'unknown', 'unknown', 0, 0, [], job.status);
    process.exitCode = 1;
  }
  console.log(`${suite}: ${job.status}`);
  await persist();
}
report.finishedAt = new Date().toISOString();
await persist();
console.log(file);
