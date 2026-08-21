import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const dataIndex = args.indexOf('--data');
assert.ok(dataIndex >= 0 && args[dataIndex + 1], 'Usage: --data <eve-fit-engine data directory>');
const enginePackageIndex = args.indexOf('--engine-package');

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const enginePackageRoot = enginePackageIndex >= 0 && args[enginePackageIndex + 1]
  ? resolve(args[enginePackageIndex + 1])
  : resolve(projectRoot, 'fox_ui');
const requireFromDesktop = createRequire(resolve(enginePackageRoot, 'package.json'));
const { loadBundledDataset, buildAllVSkillProfile } = requireFromDesktop('eve-fit-engine/node');
const { buildNameIndex, computeFit, parseEft } = requireFromDesktop('eve-fit-engine');

const dataset = await loadBundledDataset(resolve(args[dataIndex + 1]));
await Promise.all([
  'ships',
  'modules',
  'charges',
  'drones',
  'fighters',
  'implants',
  'subsystems',
  'skills',
].map(bucket => dataset.loadBucket(bucket)));

assert.ok(dataset.typesByBucket.ships.size >= 423, 'the remote dataset must retain the complete ship tree');
const equipmentCount = ['modules', 'charges', 'drones', 'fighters', 'implants', 'subsystems']
  .reduce((sum, bucket) => sum + dataset.typesByBucket[bucket].size, 0);
assert.ok(equipmentCount >= 6596, 'the remote dataset must retain the complete equipment tree');

const names = buildNameIndex(dataset).map;
const gilaId = names.get('gila');
assert.equal(gilaId, 17715, 'canonical type IDs must remain compatible with saved fits');
const parsed = parseEft('[Gila, Remote data check]', dataset);
assert.deepEqual(parsed.warnings, []);
const result = computeFit(parsed.fit, dataset, { skillProfile: buildAllVSkillProfile(dataset) });
assert.ok(result.derived.fitting.cpuMax > 0);
assert.ok(result.derived.fitting.powerMax > 0);

console.log(
  `[upstream-fitting-compatibility] current Alpha engine loaded dataset ${dataset.version}: ${dataset.typesByBucket.ships.size} ships, ${equipmentCount} equipment`,
);
