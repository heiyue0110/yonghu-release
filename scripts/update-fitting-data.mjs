import { createHash } from 'node:crypto';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const REQUIRED_FILES = [
  'attributes.json',
  'units.json',
  'effects.json',
  'meta-groups.json',
  'categories.json',
  'groups.json',
  'market-groups.json',
  'clone-grades.json',
  'dbuff-collections.json',
  'dynamic-attributes.json',
  'types/ships.json',
  'types/modules.json',
  'types/charges.json',
  'types/drones.json',
  'types/fighters.json',
  'types/implants.json',
  'types/subsystems.json',
  'types/skills.json',
];

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value == null) throw new Error(`Invalid argument near ${String(key)}`);
    values[key.slice(2)] = value;
  }
  for (const required of ['source', 'output', 'base-url', 'engine-version']) {
    if (!values[required]?.trim()) throw new Error(`Missing --${required}`);
  }
  return values;
}

function safeRelativePath(value) {
  const normalized = String(value || '').replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('..') || !normalized.endsWith('.json')) {
    throw new Error(`Unsafe fitting-data path: ${value}`);
  }
  return normalized;
}

function jsonEntries(value, path) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  throw new Error(`Fitting-data file must contain an object or array: ${path}`);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fileDescriptor(path, expected = {}) {
  const bytes = await readFile(path);
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`Fitting-data file contains invalid JSON: ${path}`);
  }
  const entries = jsonEntries(parsed, path);
  if (expected.bytes != null && Number(expected.bytes) !== bytes.byteLength) {
    throw new Error(`Source manifest byte count mismatch: ${path}`);
  }
  if (expected.entries != null && Number(expected.entries) !== entries) {
    throw new Error(`Source manifest entry count mismatch: ${path}`);
  }
  return {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    entries,
  };
}

async function verifyExistingImmutableDataset(targetRoot, sourceRoot, descriptors) {
  if (!(await exists(targetRoot))) return false;
  for (const [relative, expected] of Object.entries(descriptors)) {
    const target = join(targetRoot, ...relative.split('/'));
    if (!(await exists(target))) {
      throw new Error(`Immutable dataset is incomplete and will not be overwritten: ${targetRoot}`);
    }
    const actual = await fileDescriptor(target);
    if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256 || actual.entries !== expected.entries) {
      throw new Error(`Immutable dataset content differs for ${relative}; refusing overwrite`);
    }
    const source = await fileDescriptor(join(sourceRoot, ...relative.split('/')));
    if (source.sha256 !== expected.sha256) throw new Error(`Source changed while preparing ${relative}`);
  }
  return true;
}

const args = parseArgs(process.argv.slice(2));
const sourceRoot = resolve(args.source);
const outputRoot = resolve(args.output);
const sourceManifest = JSON.parse(await readFile(join(sourceRoot, 'manifest.json'), 'utf8'));
const version = String(sourceManifest.version || '').trim();
if (!/^[a-zA-Z0-9._-]{4,80}$/.test(version)) throw new Error('Source manifest has an invalid version');
if (!sourceManifest.files || typeof sourceManifest.files !== 'object' || Array.isArray(sourceManifest.files)) {
  throw new Error('Source manifest has no files');
}
for (const required of REQUIRED_FILES) {
  if (!Object.hasOwn(sourceManifest.files, required)) throw new Error(`Source manifest is missing ${required}`);
}

const baseUrl = new URL(args['base-url']);
if (baseUrl.protocol !== 'https:') throw new Error('Public fitting-data base URL must use HTTPS');
if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';

const sourceVersionRoot = join(sourceRoot, `v${version}`);
const descriptors = {};
let totalBytes = 0;
for (const [rawPath, expected] of Object.entries(sourceManifest.files)) {
  const relative = safeRelativePath(rawPath);
  const descriptor = await fileDescriptor(join(sourceVersionRoot, ...relative.split('/')), expected);
  descriptors[relative] = descriptor;
  totalBytes += descriptor.bytes;
}

const targetVersionRoot = join(outputRoot, 'datasets', `v${version}`);
const alreadyPublished = await verifyExistingImmutableDataset(
  targetVersionRoot,
  sourceVersionRoot,
  descriptors,
);
if (!alreadyPublished) {
  const stagingRoot = `${targetVersionRoot}.tmp-${process.pid}-${Date.now()}`;
  for (const relative of Object.keys(descriptors)) {
    const source = join(sourceVersionRoot, ...relative.split('/'));
    const destination = join(stagingRoot, ...relative.split('/'));
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  await mkdir(dirname(targetVersionRoot), { recursive: true });
  await rename(stagingRoot, targetVersionRoot);
}

const manifest = {
  contract: 'everfox-fitting-data',
  contractVersion: 1,
  schemaVersion: 1,
  engine: {
    name: 'eve-fit-engine',
    dataContract: '0.1',
    version: args['engine-version'],
  },
  version,
  builtAt: typeof sourceManifest.builtAt === 'string' ? sourceManifest.builtAt : '',
  datasetUrl: new URL(`datasets/v${version}/`, baseUrl).toString(),
  totalBytes,
  files: descriptors,
};
const stableRoot = join(outputRoot, 'stable');
await mkdir(stableRoot, { recursive: true });
const manifestPath = join(stableRoot, 'manifest.json');
const temporaryManifest = `${manifestPath}.tmp-${process.pid}`;
await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await rename(temporaryManifest, manifestPath);

if (args['engine-root']?.trim()) {
  const engineRoot = resolve(args['engine-root']);
  for (const [sourceRelative, targetName] of [
    ['LICENSE', 'ENGINE-LICENSE.txt'],
    ['NOTICE', 'ENGINE-NOTICE.txt'],
    ['data/SDE-LICENSE.md', 'SDE-LICENSE.md'],
  ]) {
    const source = join(engineRoot, ...sourceRelative.split('/'));
    if (!(await exists(source))) throw new Error(`Required license file is missing: ${source}`);
    await copyFile(source, join(outputRoot, targetName));
  }
}

const targetStats = await stat(targetVersionRoot);
if (!targetStats.isDirectory()) throw new Error('Published fitting-data version is not a directory');
console.log(
  `[fitting-data-feed] ${alreadyPublished ? 'verified' : 'published'} engine ${args['engine-version']}, dataset ${version}, ${Object.keys(descriptors).length} files, ${totalBytes} bytes`,
);
