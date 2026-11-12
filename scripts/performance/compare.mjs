import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const statuses = new Set(['completed', 'failed', 'skipped', 'unsupported']);
const summaryFields = ['medianMs', 'p95Ms', 'minMs', 'maxMs', 'n'];
const workloadFields = ['fixtureHash', 'seed', 'distribution', 'size', 'clock', 'mode', 'definition', 'warmups', 'expectedSamples', 'resultCount'];
const environmentFields = ['chrome', 'node', 'os', 'cpu', 'logicalCPUs', 'ramGiB', 'headless'];

function invalidEnvironment(environment) {
  return environmentFields.filter(key => {
    const value = environment[key];
    if (key === 'headless') return typeof value !== 'boolean';
    if (key === 'logicalCPUs') return !Number.isInteger(value) || value < 1;
    if (key === 'ramGiB') return !Number.isFinite(value) || value <= 0;
    return typeof value !== 'string' || !value.trim();
  });
}

function invalidWorkload(row) {
  const invalid = [];
  if (typeof row.fixtureHash !== 'string' || !/^[0-9a-f]{64}$/.test(row.fixtureHash)) invalid.push('fixtureHash');
  if (!Number.isSafeInteger(row.seed)) invalid.push('seed');
  if (!['few', 'many', 'phase16'].includes(row.distribution)) invalid.push('distribution');
  if (!Number.isSafeInteger(row.size) || row.size < 1) invalid.push('size');
  if (typeof row.clock !== 'string' || !row.clock.trim()) invalid.push('clock');
  if (!['production', 'diagnostic'].includes(row.mode)) invalid.push('mode');
  if (typeof row.definition !== 'string' || !row.definition.trim()) invalid.push('definition');
  if (!Number.isSafeInteger(row.warmups) || row.warmups < 0) invalid.push('warmups');
  const measuredCount = row.metrics?.total ?? row.metrics?.count;
  if ((row.resultCount !== undefined && (!Number.isSafeInteger(row.resultCount) || row.resultCount < 0)) ||
      (measuredCount !== undefined && row.resultCount !== measuredCount)) invalid.push('resultCount');
  return invalid;
}

export function parseReport(text) {
  const report = JSON.parse(text);
  if (report?.format !== 1 || typeof report.toolVersion !== 'string' || !Array.isArray(report.operations) || !report.operations.length ||
      !report.environment || typeof report.environment !== 'object') throw new Error('Invalid or unsupported baseline report format');
  const keys = new Set();
  for (const row of report.operations) {
    if (typeof row?.key !== 'string' || keys.has(row.key) || !statuses.has(row.status)) {
      throw new Error('Invalid or duplicate operation in report');
    }
    keys.add(row.key);
  }
  return report;
}

function complete(row) {
  const stats = row.stats;
  return stats && summaryFields.every(key => Number.isFinite(stats[key]) && stats[key] >= 0) &&
    Number.isInteger(stats.n) && stats.n > 0 && stats.n === row.expectedSamples &&
    stats.minMs <= stats.medianMs && stats.medianMs <= stats.maxMs &&
    stats.medianMs <= stats.p95Ms && stats.p95Ms <= stats.maxMs;
}

export function compareReports(before, after) {
  const changes = (a, b, keys) => keys.filter(key => a[key] !== b[key]);
  const environment = changes(before.environment, after.environment, environmentFields);
  for (const key of new Set([...invalidEnvironment(before.environment), ...invalidEnvironment(after.environment)])) {
    if (!environment.includes(key)) environment.push(`missing or invalid ${key}`);
  }
  if (before.toolVersion !== after.toolVersion) environment.push('toolVersion');
  const old = new Map(before.operations.map(row => [row.key, row]));
  const current = new Map(after.operations.map(row => [row.key, row]));
  return [...new Set([...old.keys(), ...current.keys()])].sort().map(key => {
    const baseline = old.get(key);
    const candidate = current.get(key);
    const result = { key, baseline, candidate };
    if (!baseline || !candidate) return { ...result, classification: 'missing' };
    if (baseline.status !== 'completed' || candidate.status !== 'completed') {
      const outcome = row => row.reason ? `${row.status}: ${row.reason}` : row.status;
      return { ...result, classification: 'unavailable', reasons: [outcome(baseline), outcome(candidate)] };
    }
    if (!complete(baseline) || !complete(candidate)) {
      return { ...result, classification: 'unavailable', reasons: ['missing or invalid samples'] };
    }
    const differences = changes(baseline, candidate, workloadFields);
    const invalid = [...new Set([...invalidWorkload(baseline), ...invalidWorkload(candidate)])];
    const reasons = [...environment, ...differences,
      ...invalid.filter(key => !differences.includes(key)).map(key => `missing or invalid ${key}`)];
    if (reasons.length) return { ...result, classification: 'incomparable', reasons };
    const deltaMs = candidate.stats.medianMs - baseline.stats.medianMs;
    const percentage = baseline.stats.medianMs >= 0.1 ? 100 * deltaMs / baseline.stats.medianMs : null;
    const classification = Math.abs(deltaMs) < 1 || (percentage !== null && Math.abs(percentage) < 15)
      ? 'no meaningful change'
      : deltaMs < 0 ? 'observed improvement' : 'review timing deviation';
    const workChanges = changes(baseline.metrics ?? {}, candidate.metrics ?? {},
      [...new Set([...Object.keys(baseline.metrics ?? {}), ...Object.keys(candidate.metrics ?? {})])]);
    return { ...result, classification, deltaMs, percentage, workChanges };
  });
}

export function formatComparison(rows) {
  const timing = row => row?.status === 'completed' && complete(row)
    ? summaryFields.map(key => row.stats[key].toFixed(key === 'n' ? 0 : 2)).join(' / ') : '—';
  const lines = [
    '| Operation | Baseline median / p95 / min / max / n | Candidate median / p95 / min / max / n | Median change | Status |',
    '| --- | ---: | ---: | ---: | --- |',
  ];
  for (const row of rows) {
    const delta = row.deltaMs === undefined ? '—' : `${row.deltaMs.toFixed(2)} ms`;
    const change = row.percentage == null ? delta : `${delta} (${row.percentage.toFixed(1)}%)`;
    const notes = row.reasons?.length ? ` (${row.reasons.join(', ')})` : '';
    lines.push(`| ${row.key} | ${timing(row.baseline)} | ${timing(row.candidate)} | ${change} | ${row.classification}${notes} |`);
  }
  for (const row of rows) for (const metric of row.workChanges ?? []) {
    lines.push(`- ${row.key} · ${metric}: ${row.baseline.metrics?.[metric] ?? '—'} → ${row.candidate.metrics?.[metric] ?? '—'}`);
  }
  lines.push('', 'Timing labels describe observed sample changes. Use repeated measurements to investigate deviations.');
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: npm run perf:compare -- <baseline.json> <candidate.json> [--json]');
  } else {
    try {
      const paths = args.filter(arg => arg !== '--json');
      if (paths.length !== 2) throw new Error('Supply baseline and candidate report paths. Use --help for usage.');
      const [before, after] = await Promise.all(paths.map(async file => parseReport(await fs.readFile(file, 'utf8'))));
      const rows = compareReports(before, after);
      console.log(args.includes('--json') ? JSON.stringify(rows, null, 2) : formatComparison(rows));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
