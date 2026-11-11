import fs from 'node:fs/promises';
import { statistics } from './stats.mjs';

const files = process.argv.slice(2);
if (!files.length) throw new Error('Pass one or more generated performance.json paths');
const number = value => value === undefined ? '—' : value.toFixed(1);
for (const file of files) {
  const report = JSON.parse(await fs.readFile(file, 'utf8'));
  console.log(`\n## ${report.options.suite}${report.options.diagnostic ? ' (diagnostic)' : ''}: ${file}\n`);
  console.log('| Fixture | Operation | n | Median ms | p95 ms | Min ms | Max ms | Outer median ms |');
  console.log('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const row of report.datasets) for (const [operation, result] of Object.entries(row.measurements)) {
    const outer = result.samples?.some(sample => Number.isFinite(sample.transportMs)) ? result.transport?.medianMs : undefined;
    console.log(`| ${row.distribution}/${row.links} | ${operation} | ${result.n ?? 0} | ${number(result.medianMs)} | ${number(result.p95Ms)} | ${number(result.minMs)} | ${number(result.maxMs)} | ${number(outer)} |`);
    if (result.skipped) console.error(`Skipped ${row.distribution}/${row.links} ${operation}: ${result.reason}`);
  }
  for (const failure of report.failures) console.error('Failed:', JSON.stringify(failure));
  if (!report.finishedAt) console.error('Run is incomplete; do not interpret it as a completed baseline.');
  if (report.options.diagnostic) {
    console.log('\nWorker spans below are inclusive and may overlap.\n');
    console.log('| Fixture | Operation | Stage | Median calls | Median total ms |');
    console.log('| --- | --- | --- | ---: | ---: |');
    for (const row of report.datasets) for (const [operation, result] of Object.entries(row.measurements)) {
      if (!result.samples?.length) continue;
      const stages = new Set(result.samples.flatMap(sample => Object.keys(sample.events)));
      for (const stage of stages) {
        const calls = statistics(result.samples.map(sample => sample.events[stage]?.calls ?? 0));
        const time = statistics(result.samples.map(sample => sample.events[stage]?.ms ?? 0));
        console.log(`| ${row.distribution}/${row.links} | ${operation} | ${stage} | ${calls.medianMs} | ${number(time.medianMs)} |`);
      }
    }
  }
}
