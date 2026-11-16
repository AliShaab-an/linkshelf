import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { instrumentBuild } from './instrument.mjs';

export async function prepare(extensionPath, diagnostic = false) {
  await fs.writeFile(path.join(extensionPath, 'profiling.html'), '<!doctype html><meta charset="utf-8"><title>LinkShelf synthetic benchmark bridge</title><script src="cpu-bench.js"></script>');
  await build({ configFile: false, logLevel: 'error', mode: 'production',
    resolve: { alias: { '@': process.cwd() } },
    build: { outDir: extensionPath, emptyOutDir: false, target: 'esnext', minify: true, sourcemap: false,
      lib: { entry: path.resolve('scripts/performance/cpu-entry.ts'), name: 'LinkShelfCPU', formats: ['iife'], fileName: () => 'cpu-bench.js' } },
  });
  if (diagnostic) await instrumentBuild(extensionPath);
}
