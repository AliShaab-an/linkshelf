import { describe, expect, it } from 'vitest';
import { compareReports, formatComparison, parseReport } from './compare.mjs';

function fixture() {
  return {
    format: 1, toolVersion: '2.6.2',
    environment: { chrome: '157', node: '22', cpu: 'test', os: 'test', logicalCPUs: 4, ramGiB: 8, headless: true },
    operations: [{
      key: 'core/few/100/query', status: 'completed', definition: 'query',
      fixtureHash: 'a'.repeat(64), seed: 326, distribution: 'few', size: 100,
      clock: 'browser', mode: 'production', warmups: 1, expectedSamples: 2, resultCount: 10,
      stats: { medianMs: 10, p95Ms: 10, minMs: 10, maxMs: 10, n: 2 }, metrics: { cards: 10, bytes: 500 },
    }],
  };
}

function timing(ms) {
  return { medianMs: ms, p95Ms: ms, minMs: ms, maxMs: ms, n: 2 };
}

describe('performance report comparison', () => {
  it.each([
    [10, 'no meaningful change', 0], [8, 'observed improvement', -20], [12, 'review timing deviation', 20],
  ])('classifies a compatible median of %i ms', (ms, classification, percentage) => {
    const before = fixture(), after = fixture();
    after.operations[0].stats = timing(ms);
    after.operations[0].metrics.cards = 5;
    const rows = compareReports(before, after);
    expect(rows[0]).toMatchObject({ classification, percentage, workChanges: ['cards'] });
    expect(formatComparison(rows)).toContain('cards: 10 → 5');
  });

  it.each([
    ['fixtureHash', 'other'], ['distribution', 'many'], ['size', 1000], ['clock', 'outer'],
    ['mode', 'diagnostic'], ['definition', 'other'], ['resultCount', 9], ['warmups', 2],
  ])('withholds percentages when %s differs', (field, value) => {
    const before = fixture(), after = fixture();
    after.operations[0][field] = value;
    expect(compareReports(before, after)[0]).toMatchObject({ classification: 'incomparable', reasons: [field] });
    expect(compareReports(before, after)[0]).not.toHaveProperty('percentage');
  });

  it.each(['chrome', 'node', 'cpu'])('warns about differing %s environments', field => {
    const before = fixture(), after = fixture();
    after.environment[field] = 'other';
    expect(compareReports(before, after)[0]).toMatchObject({ classification: 'incomparable', reasons: [field] });
  });

  it('checks tooling version and retained sample methodology', () => {
    const before = fixture(), after = fixture();
    after.toolVersion = 'other';
    after.operations[0].expectedSamples = after.operations[0].stats.n = 3;
    expect(compareReports(before, after)[0]).toMatchObject({ classification: 'incomparable', reasons: ['toolVersion', 'expectedSamples'] });
  });

  it.each([0, 0.05])('does not invent percentages for a near-zero baseline of %s', ms => {
    const before = fixture();
    before.operations[0].stats = timing(ms);
    const rows = compareReports(before, fixture());
    expect(rows[0]).toMatchObject({ percentage: null, classification: 'review timing deviation' });
    expect(formatComparison(rows)).toContain(`| ${(10 - ms).toFixed(2)} ms | review timing deviation |`);
  });

  it('withholds deltas when matching reports both lack valid compatibility metadata', () => {
    const report = fixture();
    delete report.environment.chrome;
    report.operations[0].fixtureHash = 'invalid';
    report.operations[0].resultCount = -1;
    expect(compareReports(report, report)[0]).toMatchObject({
      classification: 'incomparable',
      reasons: ['missing or invalid chrome', 'missing or invalid fixtureHash', 'missing or invalid resultCount'],
    });
  });

  it('reports missing measurements and rejects incomplete timing samples', () => {
    const before = fixture(), after = fixture();
    after.operations[0].stats = { n: 1 };
    const rows = compareReports(before, after);
    expect(rows[0]).toMatchObject({ classification: 'unavailable', reasons: ['missing or invalid samples'] });
    expect(formatComparison(rows)).toContain('missing or invalid samples');
    after.operations = [];
    expect(compareReports(before, after)[0]).toMatchObject({ classification: 'missing' });
  });

  it.each(['failed', 'skipped', 'unsupported'])('does not compare a %s run as successful', status => {
    const after = fixture();
    after.operations[0].status = status;
    const rows = compareReports(fixture(), after);
    expect(rows[0]).toMatchObject({ classification: 'unavailable', reasons: ['completed', status] });
    expect(formatComparison(rows)).toContain(`| — | — | unavailable (completed, ${status}) |`);
    after.operations[0].reason = 'fixture did not expose the control';
    expect(formatComparison(compareReports(fixture(), after))).toContain(`${status}: fixture did not expose the control`);
  });

  it('rejects malformed, unsupported and duplicate input', () => {
    expect(() => parseReport('{')).toThrow();
    expect(() => parseReport('{}')).toThrow(/format/);
    const report = fixture();
    expect(parseReport(JSON.stringify(report))).toEqual(report);
    report.operations.push(report.operations[0]);
    expect(() => parseReport(JSON.stringify(report))).toThrow(/duplicate/);
  });
});
