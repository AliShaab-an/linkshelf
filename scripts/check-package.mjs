import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

// Small ZIP reader for WXT's single-disk ZIPs; compare every extracted byte with
// the production output rather than trusting filenames or an archive listing.
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const archive = process.argv[2] ?? `.output/${pkg.name}-${pkg.version}-chrome.zip`;
const zip = await fs.readFile(archive);
let end = zip.length - 22;
while (end >= Math.max(0, zip.length - 65557) && zip.readUInt32LE(end) !== 0x06054b50) end--;
assert.ok(end >= 0 && zip.readUInt32LE(end) === 0x06054b50, 'ZIP end record missing');
assert.equal(zip.readUInt16LE(end + 4), 0, 'Multi-disk ZIP unsupported');
const count = zip.readUInt16LE(end + 10);
let offset = zip.readUInt32LE(end + 16);
const entries = new Map();
for (let i = 0; i < count; i++) {
  assert.equal(zip.readUInt32LE(offset), 0x02014b50);
  const flags = zip.readUInt16LE(offset + 8);
  const method = zip.readUInt16LE(offset + 10);
  const compressed = zip.readUInt32LE(offset + 20);
  const size = zip.readUInt32LE(offset + 24);
  const nameLength = zip.readUInt16LE(offset + 28);
  const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
  assert.ok(!name.startsWith('/') && !name.includes('\\') && !name.split('/').includes('..'), `Unsafe path: ${name}`);
  assert.ok(!entries.has(name), `Duplicate ZIP entry: ${name}`);
  assert.equal(flags & 1, 0, 'Encrypted ZIP unsupported');
  const local = zip.readUInt32LE(offset + 42);
  assert.equal(zip.readUInt32LE(local), 0x04034b50);
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const data = zip.subarray(start, start + compressed);
  assert.ok(method === 0 || method === 8, 'Unsupported ZIP compression');
  const bytes = method === 8 ? inflateRawSync(data) : data;
  assert.equal(bytes.length, size);
  if (!name.endsWith('/')) entries.set(name, bytes);
  offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
}
const root = '.output/chrome-mv3';
const files = await fs.readdir(root, { recursive: true, withFileTypes: true });
const built = files.filter(file => file.isFile()).map(file => path.relative(root, path.join(file.parentPath, file.name)).replaceAll('\\', '/')).sort();
assert.deepEqual([...entries.keys()].sort(), built, 'Archive must contain exactly the built files');
for (const [name, bytes] of entries) {
  assert.ok(!/(^|\/)(\.env.*|node_modules|tests?|test-results|\.git)(\/|$)|\.(map|pem|key|ts|tsx|md|log)$/i.test(name), `Unexpected artifact: ${name}`);
  assert.deepEqual(bytes, await fs.readFile(path.join(root, name)), `Stale package file: ${name}`);
  if (/\.(js|html|css)$/.test(name)) assert.ok(!/sourceMappingURL=|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]{30,}/.test(bytes.toString()), `Unexpected source map or credential pattern: ${name}`);
}
const manifest = JSON.parse(entries.get('manifest.json'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, pkg.version);
assert.deepEqual([...manifest.permissions].sort(), ['alarms', 'bookmarks', 'notifications', 'sidePanel', 'storage', 'tabs'].sort());
assert.ok(!manifest.host_permissions?.length && !manifest.content_scripts?.length && !manifest.externally_connectable);
for (const name of [manifest.background.service_worker, manifest.action.default_popup, manifest.side_panel.default_path, 'onboarding.html', ...Object.values(manifest.icons)]) {
  assert.ok(entries.has(name.replace(/^\//, '')), `Missing entrypoint/asset: ${name}`);
}
console.log(JSON.stringify({ archive, version: manifest.version, files: built, bytes: zip.length, result: 'passed', note: 'Filename/pattern checks supplement human review; they are not a general secret scanner.' }, null, 2));
