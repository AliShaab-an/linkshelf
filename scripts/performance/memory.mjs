import fs from 'node:fs/promises';
import path from 'node:path';

export async function runMemory(h, row, { fixture, cpu, sample }) {
  await h.page.evaluate(value => globalThis.linkshelfCPU.setup(value), fixture);
  const cdp = await h.context.newCDPSession(h.page);
  try {
    for (const name of ['clone', 'schema', 'compare', 'backup.file']) await sample(row, 'memory.' + name, async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      const before = await cdp.send('Runtime.getHeapUsage');
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      const times = [];
      for (let i = 0; i < 3; i++) times.push((await cpu(name)).ms);
      const { profile } = await cdp.send('HeapProfiler.stopSampling');
      const after = await cdp.send('Runtime.getHeapUsage');
      const file = `${row.distribution}-${row.links}-${name}-allocation.json`;
      await fs.writeFile(path.join(h.output, file), JSON.stringify(profile));
      return { ms: times.reduce((a, b) => a + b, 0), before, after, allocationsSampled: profile.samples.length,
        sampledBytes: profile.samples.reduce((total, sample) => total + sample.size, 0), profile: file };
    }, { repetitions: 1, warmups: 0, capture: false });
  } finally { await cdp.detach(); }
}
