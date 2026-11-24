// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {Companions, MIRROR_NODE_MODULES, MIRROR_NODE_RUNNING_MODULES} from '../src/companions.mjs';
import {Failure} from '../src/contract.mjs';
import {Processes} from '../src/process.mjs';

const commit = 'b'.repeat(40);
const consensusVersion = '0.80.0-tck.38712.1';
const mirrorVersion = '0.166.0-tck.38712.1';
const mirrorImage = `gcr.io/mirrornode/hedera-mirror:${mirrorVersion}`;
const mirrorModules = MIRROR_NODE_MODULES.map(module => `gcr.io/mirrornode/hedera-mirror-${module}:${mirrorVersion}`);
const failure = (reason, pattern) => error =>
  error instanceof Failure && error.reason === reason && (!pattern || pattern.test(error.message));
const sha256 = text => createHash('sha256').update(text).digest('hex');

function consensusEntry(overrides = {}) {
  return {
    component: 'consensus-node',
    source: {repository: 'hiero-ledger/hiero-consensus-node', commit},
    version: consensusVersion,
    buildPath: 'cn/data',
    ...overrides,
  };
}

function mirrorEntry(overrides = {}) {
  return {
    component: 'mirror-node',
    source: {repository: 'hiero-ledger/hiero-mirror-node', commit},
    version: mirrorVersion,
    image: mirrorImage,
    archive: 'mn/images.tar',
    chartDir: 'mn/charts',
    ...overrides,
  };
}

async function archive(file, tags) {
  const source = mkdtempSync(path.join(tmpdir(), 'solo-tck-archive-'));
  writeFileSync(
    path.join(source, 'manifest.json'),
    JSON.stringify([{Config: 'config.json', RepoTags: tags, Layers: []}]),
  );
  await Processes.command('tar', ['-cf', file, '-C', source, 'manifest.json']);
  rmSync(source, {recursive: true, force: true});
}

// A workspace holding a CN build, an MN archive and chart, and the manifest that references them.
async function workspace(context) {
  const directory = mkdtempSync(path.join(tmpdir(), 'solo-tck-companions-'));
  context.after(() => rmSync(directory, {recursive: true, force: true}));
  for (const [file, text] of [
    ['cn/data/apps/HederaNode.jar', 'node'],
    ['cn/data/lib/first.jar', 'first'],
    ['cn/data/lib/second.jar', 'second'],
    ['cn/data/lib/notes.txt', 'not a jar'],
    ['cn/apps-only/apps/HederaNode.jar', 'node'],
    ['mn/charts/hedera-mirror/Chart.yaml', 'name: hedera-mirror\nversion: 0.166.0\n'],
    ['mn/charts/hedera-mirror/templates/importer.yaml', 'kind: Deployment\n'],
  ]) {
    mkdirSync(path.dirname(path.join(directory, file)), {recursive: true});
    writeFileSync(path.join(directory, file), text);
  }
  await archive(path.join(directory, 'mn/images.tar'), mirrorModules);
  const write = (manifest, name = 'companions.json') => {
    const file = path.join(directory, name);
    writeFileSync(file, typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
    return file;
  };
  return {directory, write};
}

test('a valid manifest resolves paths against its own directory and records declared sources and artifact hashes', async context => {
  const {directory, write} = await workspace(context);
  const file = write({schemaVersion: 1, components: [consensusEntry(), mirrorEntry()]});
  const loaded = await Companions.load(file, 'js-sdk');
  assert.deepEqual(loaded.manifest, {path: file, sha256: sha256(readFileSync(file))});
  const [consensus, mirror] = loaded.components;
  assert.deepEqual(consensus.source, {repository: 'hiero-ledger/hiero-consensus-node', commit});
  assert.equal(consensus.sourceShaVerified, false);
  assert.equal(consensus.artifacts.buildPath.path, path.join(directory, 'cn/data'));
  assert.deepEqual(consensus.artifacts.buildPath.jars, {
    'apps/HederaNode.jar': sha256('node'),
    'lib/first.jar': sha256('first'),
    'lib/second.jar': sha256('second'),
  });
  const listing = `${sha256('node')}  apps/HederaNode.jar\n${sha256('first')}  lib/first.jar\n${sha256('second')}  lib/second.jar\n`;
  assert.equal(consensus.artifacts.buildPath.sha256, sha256(listing));
  assert.deepEqual(mirror.artifacts.image, {reference: mirrorImage, images: mirrorModules});
  assert.equal(mirror.artifacts.archive.path, path.join(directory, 'mn/images.tar'));
  assert.equal(mirror.artifacts.archive.sha256, sha256(readFileSync(path.join(directory, 'mn/images.tar'))));
  assert.equal(mirror.artifacts.chartDir.files, 2);
  assert.match(mirror.artifacts.chartDir.sha256, /^[\da-f]{64}$/);
});

test('Falcon wiring adds only the artifact section keys and version flags, as YAML-safe scalars', () => {
  const components = [
    {component: 'consensus-node', version: consensusVersion, artifacts: {buildPath: {path: '/w/cn "x"\nsetup: y'}}},
    {
      component: 'mirror-node',
      version: mirrorVersion,
      artifacts: {image: {reference: mirrorImage}, archive: {path: '/w/mn.tar'}, chartDir: {path: '/w/charts'}},
    },
  ];
  const falcon = Companions.falcon(components, {mirrorNode: {'--pinger': false}});
  assert.equal(
    falcon.values,
    'mirrorNode:\n' +
      '  --pinger: false\n' +
      `  --component-image: "${mirrorImage}"\n` +
      '  --component-image-archive: "/w/mn.tar"\n' +
      '  --mirror-node-chart-dir: "/w/charts"\n' +
      'setup:\n' +
      '  --local-build-path: "/w/cn \\"x\\"\\nsetup: y"\n',
  );
  assert.deepEqual(falcon.flags, [
    '--consensus-node-version',
    `v${consensusVersion}`,
    '--mirror-node-version',
    `v${mirrorVersion}`,
  ]);
  assert.deepEqual(Companions.falcon([], {mirrorNode: {'--pinger': false}}), {
    values: 'mirrorNode:\n  --pinger: false\n',
    flags: [],
  });
});

const rejections = [
  ['unsupported schema version 2', {schemaVersion: 2}, /unsupported schemaVersion 2/],
  ['schema version as a string', {schemaVersion: '1'}, /unsupported schemaVersion "1"/],
  ['missing schema version', {schemaVersion: undefined}, /unsupported schemaVersion/],
  ['unknown top-level field', {helmValues: {replicas: 2}}, /manifest has unknown field\(s\) helmValues/],
  ['no components', {components: []}, /non-empty array/],
  ['components not an array', {components: {component: 'consensus-node'}}, /non-empty array/],
  ['unknown component', {components: [consensusEntry({component: 'explorer'})]}, /unsupported component "explorer"/],
  ['component that is not an object', {components: ['consensus-node']}, /unsupported component/],
  ['duplicate component', {components: [consensusEntry(), consensusEntry()]}, /duplicates component consensus-node/],
  [
    'component outside the lane topology',
    {components: [mirrorEntry({component: 'block-node', chartDir: undefined})]},
    /js-sdk lane does not deploy block-node/,
  ],
  ['Helm values in an entry', {components: [consensusEntry({values: {replicas: 2}})]}, /unknown field\(s\) values/],
  ['CLI flags in an entry', {components: [consensusEntry({flags: ['--dev']})]}, /not a passthrough/],
  [
    'artifact field of another component type',
    {components: [consensusEntry({image: mirrorImage})]},
    /unknown field\(s\) image/,
  ],
  ['missing source', {components: [consensusEntry({source: undefined})]}, /source must be a JSON object/],
  [
    'unknown source field',
    {components: [consensusEntry({source: {repository: 'hiero-ledger/hiero-consensus-node', commit, branch: 'main'}})]},
    /source has unknown field\(s\) branch/,
  ],
  [
    'repository that is not owner/name',
    {components: [consensusEntry({source: {repository: 'https://github.com/x', commit}})]},
    /source.repository must be owner\/name/,
  ],
  [
    'short commit',
    {components: [consensusEntry({source: {repository: 'hiero-ledger/hiero-consensus-node', commit: 'abc1234'}})]},
    /full 40-character commit SHA/,
  ],
  [
    'mutable ref as commit',
    {components: [consensusEntry({source: {repository: 'hiero-ledger/hiero-consensus-node', commit: 'main'}})]},
    /full 40-character commit SHA/,
  ],
  ['version that is not semver', {components: [consensusEntry({version: 'latest'})]}, /version must be a semver/],
  ['version with a v prefix', {components: [consensusEntry({version: 'v0.80.0'})]}, /version must be a semver/],
  ['missing CN buildPath', {components: [consensusEntry({buildPath: undefined})]}, /missing artifact buildPath/],
  ['empty CN buildPath', {components: [consensusEntry({buildPath: ' '})]}, /buildPath must be a non-empty string/],
  ['non-string CN buildPath', {components: [consensusEntry({buildPath: 42})]}, /buildPath must be a non-empty string/],
  ['absent CN buildPath directory', {components: [consensusEntry({buildPath: 'cn/missing'})]}, /has no apps\/\*\.jar/],
  ['CN buildPath above the data folder', {components: [consensusEntry({buildPath: 'cn'})]}, /has no apps\/\*\.jar/],
  ['CN buildPath without lib jars', {components: [consensusEntry({buildPath: 'cn/apps-only'})]}, /has no lib\/\*\.jar/],
  ['missing MN image', {components: [mirrorEntry({image: undefined})]}, /missing artifact image/],
  ['missing MN archive', {components: [mirrorEntry({archive: undefined})]}, /missing artifact archive/],
  ['missing MN chartDir', {components: [mirrorEntry({chartDir: undefined})]}, /missing artifact chartDir/],
  ['absent MN archive file', {components: [mirrorEntry({archive: 'mn/absent.tar'})]}, /archive .* is not a file/],
  ['absent MN chartDir', {components: [mirrorEntry({chartDir: 'mn/absent'})]}, /chartDir .* is not a directory/],
  [
    'archive that is not a docker save archive',
    {components: [mirrorEntry({archive: 'mn/charts/hedera-mirror/Chart.yaml'})]},
    /is not a docker save archive/,
  ],
  [
    'image tag that differs from version',
    {components: [mirrorEntry({image: 'gcr.io/mirrornode/hedera-mirror:0.166.0'})]},
    /image tag 0.166.0 must equal version/,
  ],
  ['untagged image', {components: [mirrorEntry({image: 'gcr.io/mirrornode/hedera-mirror'})]}, /not a tagged image/],
  [
    'image digest',
    {components: [mirrorEntry({image: `gcr.io/mirrornode/hedera-mirror@sha256:${'c'.repeat(64)}`})]},
    /not a tagged image/,
  ],
  ['flag smuggled as an image', {components: [mirrorEntry({image: `--set=a:${mirrorVersion}`})]}, /not a tagged image/],
  [
    'single MN module image instead of the prefix',
    {components: [mirrorEntry({image: `gcr.io/mirrornode/hedera-mirror-importer:${mirrorVersion}`})]},
    /prefix Solo expands/,
  ],
];

for (const [name, change, pattern] of rejections) {
  test(`manifest rejection: ${name}`, async context => {
    const {write} = await workspace(context);
    const manifest = {schemaVersion: 1, components: [consensusEntry()], ...change};
    await assert.rejects(Companions.load(write(manifest), 'js-sdk'), failure('invalid', pattern));
  });
}

test('manifest rejection: an MN archive without the full module set', async context => {
  const {directory, write} = await workspace(context);
  await archive(path.join(directory, 'mn/partial.tar'), mirrorModules.slice(0, 5));
  const file = write({schemaVersion: 1, components: [mirrorEntry({archive: 'mn/partial.tar'})]});
  await assert.rejects(
    Companions.load(file, 'js-sdk'),
    failure('invalid', /does not hold gcr.io\/mirrornode\/hedera-mirror-monitor:.*full module set/),
  );
});

test('manifest rejection: the candidate component, a conflicting version override and unreadable JSON', async context => {
  const {write} = await workspace(context);
  await assert.rejects(
    Companions.load(write({schemaVersion: 1, components: [mirrorEntry()]}), 'mirror-node'),
    failure('invalid', /is the mirror-node candidate/),
  );
  await assert.rejects(
    Companions.load(write({schemaVersion: 1, components: [consensusEntry()]}), 'js-sdk', {
      'consensus-node-version': 'v0.79.0',
    }),
    failure('invalid', /--consensus-node-version overrides consensus-node, which the manifest already supplies/),
  );
  await Companions.load(write({schemaVersion: 1, components: [consensusEntry()]}), 'js-sdk', {
    'mirror-node-version': 'v0.165.0',
  });
  await assert.rejects(Companions.load(write('{"schemaVersion": 1,'), 'js-sdk'), failure('invalid', /cannot read/));
  await assert.rejects(Companions.load('/absent/companions.json', 'js-sdk'), failure('invalid', /cannot read/));
});

function mirrorPods(overrides = {}) {
  return MIRROR_NODE_RUNNING_MODULES.map(module => ({
    name: `mirror-1-${module}-0`,
    ready: true,
    containers: [
      {
        name: module,
        image: `gcr.io/mirrornode/hedera-mirror-${module}:${mirrorVersion}`,
        imagePullPolicy: 'Never',
        imageID: `sha256:${module}`,
        ...overrides[module],
      },
    ],
  }));
}

const mirrorCompanion = {
  component: 'mirror-node',
  artifacts: {image: {reference: mirrorImage, images: mirrorModules}},
};

test('a Mirror Node companion is observed only when every running module runs its loaded image', () => {
  const pods = [
    ...mirrorPods(),
    {
      name: 'postgres-0',
      ready: true,
      containers: [{name: 'postgres', image: 'postgres:17.2', imagePullPolicy: 'Always'}],
    },
  ];
  const observed = Companions.observeImages(mirrorCompanion, pods);
  assert.equal(observed.containers.length, MIRROR_NODE_RUNNING_MODULES.length);
  assert.deepEqual(observed.containers[0], {
    pod: 'mirror-1-importer-0',
    container: 'importer',
    image: mirrorModules[0],
    imageID: 'sha256:importer',
  });
  const unobserved = failure('unknown', /never observed running/);
  for (const [name, scenario] of [
    ['missing module', mirrorPods().filter(pod => !pod.name.includes('web3'))],
    ['released fallback', mirrorPods({importer: {image: 'gcr.io/mirrornode/hedera-mirror-importer:0.164.2'}})],
    ['pullable image', mirrorPods({rest: {imagePullPolicy: 'IfNotPresent'}})],
    ['pod not Ready', mirrorPods().map(pod => ({...pod, ready: !pod.name.includes('grpc')}))],
    ['no pods', []],
  ]) {
    assert.throws(() => Companions.observeImages(mirrorCompanion, scenario), unobserved, name);
    assert.throws(
      () => Companions.observeImages(mirrorCompanion, scenario),
      error => error.probe === 'P3',
      name,
    );
  }
});

test('a consensus node companion is observed only when every node pod holds exactly the buildPath jars', () => {
  const expected = {'apps/HederaNode.jar': sha256('node'), 'lib/first.jar': sha256('first')};
  const output = `${sha256('node')}  apps/HederaNode.jar\n${sha256('first')} *lib/first.jar\n`;
  const observed = Companions.parseChecksums(output, 'consensus-node');
  assert.deepEqual(observed, expected);
  Companions.compareJars(expected, observed, 'network-node1-0');
  for (const [name, jars, pattern] of [
    ['released jar', {...expected, 'lib/first.jar': sha256('released')}, /different lib\/first.jar/],
    ['missing jar', {'apps/HederaNode.jar': sha256('node')}, /missing lib\/first.jar/],
    ['extra jar', {...expected, 'lib/stale.jar': sha256('stale')}, /unexpected lib\/stale.jar/],
  ]) {
    assert.throws(
      () => Companions.compareJars(expected, jars, 'network-node1-0'),
      error => failure('unknown', pattern)(error) && error.probe === 'P3',
      name,
    );
  }
  assert.throws(
    () => Companions.parseChecksums('sha256sum: apps/*.jar: No such file or directory', 'consensus-node'),
    failure('unknown', /unexpected checksum output/),
  );
});

test('CLI rejects an invalid manifest and a conflicting override before touching a cluster', async context => {
  const {directory, write} = await workspace(context);
  const script = fileURLToPath(new URL('../src/run.mjs', import.meta.url));
  const runner = (...extra) =>
    spawnSync(
      process.execPath,
      [
        script,
        '--component',
        'js-sdk',
        '--candidate-packages',
        '/candidate',
        '--solo-version',
        'a'.repeat(40),
        ...extra,
      ],
      {env: {...process.env, RUNNER_TEMP: directory}, shell: false, encoding: 'utf8', timeout: 10_000},
    );
  for (const [extra, pattern] of [
    [['--companion-builds', write({schemaVersion: 2, components: [consensusEntry()]}, 'bad.json')], /schemaVersion 2/],
    [
      [
        '--companion-builds',
        write({schemaVersion: 1, components: [consensusEntry()]}, 'good.json'),
        '--consensus-node-version',
        'v0.79.0',
      ],
      /already supplies/,
    ],
  ]) {
    const run = runner(...extra);
    assert.equal(run.status, 2, run.stderr);
    const result = JSON.parse(readFileSync(/Result: (.+tck-result.json)/.exec(run.stdout)[1], 'utf8'));
    assert.equal(result.reason, 'invalid');
    assert.equal(result.failedStage, 'setup');
    assert.equal(result.probes.P1.status, 'fail');
    assert.match(result.probes.P1.message, pattern);
    assert.equal(result.companions, undefined);
    assert.equal(result.cleanup.cluster.detail, 'No owned cluster was created; nothing deleted');
  }
});
