// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {Contract, Failure, PACKAGES, PROBES} from '../src/contract.mjs';
import {Processes} from '../src/process.mjs';
import {Packages} from '../src/packages.mjs';
import {PodState, PodWatcher} from '../src/pods.mjs';
import {Probe} from '../src/probe.mjs';

const sha = 'a'.repeat(40);
const arguments_ = ['--component', 'js-sdk', '--candidate-packages', '/candidate'];
const policy = {default: '0.93.0', supported: ['0.93.0']};
const failure = reason => error => error instanceof Failure && error.reason === reason;

function fixture(context) {
  const directory = mkdtempSync(path.join(tmpdir(), 'solo-tck-test-'));
  context.after(() => rmSync(directory, {recursive: true, force: true}));
  return directory;
}

test('release policy accepts only verified releases or a full SHA', () => {
  assert.equal(Contract.inputs(arguments_, policy)['solo-version'], '0.93.0');
  assert.equal(
    Contract.inputs([...arguments_, '--solo-version', sha], {default: null, supported: []}).unreleased,
    true,
  );
  for (const value of ['main', 'latest', '24dc1ffc', '0.94.0']) {
    assert.throws(() => Contract.inputs([...arguments_, '--solo-version', value], policy), failure('invalid'));
  }
  assert.throws(() => Contract.inputs(arguments_, {default: null, supported: []}), failure('invalid'));
});

test('lane inputs cannot add flags, unsupported lanes or silently claim a local tarball is released', () => {
  for (const extra of [
    ['--component', 'mirror-node'],
    ['--unknown', 'x'],
    ['--solo-tarball', '/build.tgz'],
    ['--cluster-name', 'production'],
    ['--mirror-node-version', 'latest'],
  ]) {
    assert.throws(() => Contract.inputs([...arguments_, ...extra], policy), failure('invalid'));
  }
  assert.equal(
    Contract.inputs(
      [...arguments_, '--cluster-name', 'solo-tck-local-1', '--solo-version', sha, '--solo-tarball', '/build.tgz'],
      policy,
    ).cluster,
    'solo-tck-local-1',
  );
});

test('deploy errors stay red without claiming the SDK caused a Solo bug', () => {
  const startup = {exitCode: 1, message: 'NodeAccountId not recognized: 0.0.2'};
  assert.equal(Contract.classifyDeploy(startup), 'unknown');
  assert.equal(Contract.classifyDeploy(startup, {pods: ['node-0'], candidate: false}), 'unknown');
  // The wording alone no longer decides; Solo's exit code does.
  assert.equal(Contract.classifyDeploy({exitCode: 1, message: 'Unsupported component version'}), 'unknown');
});

test('a deploy Solo rejected is invalid, and one that left the candidate unready names the candidate', () => {
  assert.equal(Contract.classifyDeploy({exitCode: 2}, {pods: ['mirror-importer'], candidate: true}), 'invalid');
  assert.equal(Contract.classifyDeploy({exitCode: 1}, {pods: ['mirror-importer'], candidate: true}), 'candidate');
  // A deploy the kit stopped at its deadline has no exit code; the candidate never becoming Ready still counts.
  assert.equal(Contract.classifyDeploy({}, {pods: ['mirror-importer'], candidate: true}), 'candidate');
});

test('missing probes cannot pass, and JUnit preserves failures and missing probes', () => {
  const result = {probes: {P1: {status: 'pass'}, P2: {status: 'fail', message: 'bad <image> & "tag"'}}};
  assert.throws(() => Contract.complete(result), failure('kit'));
  assert.match(Contract.junit(result), /failures="1" skipped="6"/);
  assert.match(Contract.junit(result), /bad &lt;image&gt; &amp; &quot;tag&quot;/);
  for (const id of PROBES) {
    result.probes[id] = {status: 'pass'};
  }
  Contract.complete(result);
  assert.throws(
    () => Contract.complete(result, new Failure('unknown', 'OOM observed while stopping watch')),
    failure('unknown'),
  );
  result.incomplete = true;
  assert.throws(() => Contract.complete(result), failure('unknown'));
});

test('a failed report-only probe is recorded but cannot fail the run', () => {
  const result = {probes: {}, reportOnly: ['P8']};
  for (const id of PROBES) {
    result.probes[id] = {status: 'pass'};
  }
  result.probes.P8 = {status: 'fail', message: 'slow'};
  Contract.complete(result);
  assert.match(Contract.junit(result), /failures="0" skipped="1"/);
  assert.match(Contract.junit(result), /Report-only probe failed: slow/);
  result.probes.P7 = {status: 'fail', message: 'required'};
  assert.throws(() => Contract.complete(result), failure('kit'));
});

test('JUnit excludes terminal control characters', () => {
  assert.ok(!Contract.junit({probes: {P2: {status: 'fail', message: '\u001B[31mfailed\u0000'}}}).includes('\u001B'));
  assert.ok(!Contract.junit({probes: {P2: {status: 'fail', message: '\u0000'}}}).includes('\u0000'));
});

test('load reads back the last submissions even when receipts arrive out of order', () => {
  const load = {successful: 0};
  Probe.recordLoadReceipt(load, 2399, {message: 'last'});
  Probe.recordLoadReceipt(load, 2397, {message: 'earlier'});
  Probe.recordLoadReceipt(load, 2398, {path: 'last transfer'});
  Probe.recordLoadReceipt(load, 2396, {path: 'earlier transfer'});
  assert.deepEqual(load.lastMessage, {message: 'last'});
  assert.deepEqual(load.lastTransfer, {path: 'last transfer'});
  assert.equal(load.successful, 4);
});

test('command deadline stops real child processes; absolute stage deadlines cannot reset', async () => {
  await assert.rejects(
    Processes.command(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {timeout: 40}),
    /deadline/,
  );
  await assert.rejects(
    Processes.command(process.execPath, ['-e', 'process.exit(0)'], {deadline: Date.now() - 1}),
    /deadline exhausted/,
  );
});

test('command cancellation propagates and a nonzero executable cannot become a pass', async () => {
  const controller = new AbortController();
  const work = Processes.command(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {signal: controller.signal});
  controller.abort(new Failure('unknown', 'cancelled by test'));
  await assert.rejects(work, /cancelled/);
  await assert.rejects(Processes.command(process.execPath, ['-e', 'process.exit(7)']), /exited 7/);
});

test('a command failure carries the exit code only when the program exited on its own', async () => {
  await assert.rejects(Processes.command(process.execPath, ['-e', 'process.exit(2)']), error => error.exitCode === 2);
  await assert.rejects(
    Processes.command(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {timeout: 40}),
    error => error.exitCode === undefined,
  );
});

test('test keys are redacted, including keys emitted by Solo', () => {
  const key = `302e020100300506032b657004220420${'a'.repeat(64)}`;
  assert.equal(Contract.redact(`key=${key}, custom=secret`, ['secret']), 'key=<REDACTED_TEST_KEY>, custom=<REDACTED>');
  assert.equal(Contract.redact(`{"privateKey":"${'a'.repeat(64)}"}`), '{"privateKey":"<REDACTED_TEST_KEY>"}');
  assert.equal(Contract.redact(`--ed25519-private-key ${'b'.repeat(64)}`), '--ed25519-private-key <REDACTED_TEST_KEY>');
});

function pod(overrides = {}) {
  return {
    kind: 'Pod',
    metadata: {name: 'node-0', uid: 'original'},
    spec: {containers: [{name: 'main', image: 'test:v1'}]},
    status: {
      phase: 'Running',
      conditions: [{type: 'Ready', status: 'True'}],
      containerStatuses: [{name: 'main', restartCount: 0, state: {running: {}}}],
    },
    ...overrides,
  };
}

test('watch parser handles chunk boundaries, escaped strings and multiple JSON objects', () => {
  const objects = [];
  const parse = PodWatcher.jsonObjects(value => objects.push(value));
  const source = `${JSON.stringify({type: 'ADDED', object: pod(), note: '{"quoted"}'})}\n${JSON.stringify({type: 'MODIFIED', object: pod()})}`;
  for (let offset = 0; offset < source.length; offset += 7) {
    parse(source.slice(offset, offset + 7));
  }
  assert.equal(objects.length, 2);
  assert.equal(objects[0].object.metadata.uid, 'original');
});

for (const [name, status, reason] of [
  ['OOM now', {state: {terminated: {reason: 'OOMKilled'}}, restartCount: 0}, 'unknown'],
  ['OOM earlier', {lastState: {terminated: {reason: 'OOMKilled'}}, restartCount: 1}, 'unknown'],
  ['image missing', {state: {waiting: {reason: 'ErrImageNeverPull'}}, restartCount: 0}, 'environment'],
  ['invalid image', {state: {waiting: {reason: 'InvalidImageName'}}, restartCount: 0}, 'environment'],
  ['crash loop', {state: {waiting: {reason: 'CrashLoopBackOff'}}, restartCount: 2}, 'unknown'],
]) {
  test(`pod negative control: ${name} fails during deploy`, () => {
    const value = pod();
    value.status.containerStatuses = [{name: 'main', ...status}];
    assert.throws(() => new PodState().observe(value), failure(reason));
  });

  test(`pod negative control: ${name} in a candidate container names the candidate`, () => {
    const value = pod();
    value.status.containerStatuses = [{name: 'main', ...status}];
    assert.throws(() => new PodState(['test:v1']).observe(value), failure('candidate'));
    // A candidate elsewhere in the deployment does not make this container's failure the candidate's.
    assert.throws(() => new PodState(['other:v1']).observe(value), failure(reason));
  });
}

test('a candidate image matches whether or not the runtime reports the implicit Docker Hub prefix', () => {
  for (const [candidate, reported] of [
    ['hiero/importer:1.0.0', 'docker.io/hiero/importer:1.0.0'],
    ['postgres:16', 'docker.io/library/postgres:16'],
    ['docker.io/hiero/importer:1.0.0', 'hiero/importer:1.0.0'],
  ]) {
    const value = pod();
    value.spec.containers[0].image = reported;
    value.status.containerStatuses[0] = {name: 'main', restartCount: 2, state: {waiting: {reason: 'CrashLoopBackOff'}}};
    assert.throws(() => new PodState([candidate]).observe(value), failure('candidate'));
  }
});

test('post-deploy restart, UID replacement, deletion and NotReady all fail stability', () => {
  for (const change of ['restart', 'replace', 'delete', 'notReady']) {
    const state = new PodState();
    state.observe(pod());
    state.deployed();
    const next = pod();
    if (change === 'restart') {
      next.status.containerStatuses[0].restartCount = 1;
    }
    if (change === 'replace') {
      next.metadata.uid = 'replacement';
    }
    if (change === 'delete') {
      assert.throws(() => state.observe({type: 'DELETED', object: next}), failure('unknown'));
    } else if (change === 'notReady') {
      next.status.conditions[0].status = 'False';
      state.observe(next);
      assert.throws(() => state.stable(), failure('unknown'));
    } else {
      assert.throws(() => state.observe(next), failure('unknown'));
    }
  }
});

test('a persistent noncandidate image pull failure fails after five minutes', () => {
  const state = new PodState();
  const value = pod();
  value.status.containerStatuses[0].state = {waiting: {reason: 'ImagePullBackOff'}};
  state.observe(value, 1000);
  assert.throws(() => state.observe(value, 301_000), failure('environment'));
  const candidate = new PodState(['test:v1']);
  candidate.observe(value, 1000);
  assert.throws(() => candidate.observe(value, 301_000), failure('candidate'));
});

function unreadyPod(name, image, ready) {
  return pod({
    metadata: {name, uid: name},
    spec: {containers: [{name: 'main', image}]},
    status: {
      phase: 'Running',
      conditions: [{type: 'Ready', status: ready ? 'True' : 'False'}],
      containerStatuses: [{name: 'main', ready, restartCount: 0, state: {running: {}}}],
    },
  });
}

test('a candidate that stays unready while everything else is Ready names the candidate', () => {
  const state = new PodState(['importer:v1']);
  state.observe(unreadyPod('postgres', 'postgres:16', true), 0);
  state.observe(unreadyPod('importer', 'importer:v1', false), 0);
  // Still starting: red, but not yet the candidate's.
  assert.deepEqual(state.notReady(179_999), {pods: ['importer'], candidate: false});
  assert.throws(() => state.stable(179_999), failure('unknown'));
  assert.deepEqual(state.notReady(180_000), {pods: ['importer'], candidate: true});
  assert.throws(() => state.stable(180_000), failure('candidate'));
  // Becoming Ready resets the clock.
  state.observe(unreadyPod('importer', 'importer:v1', true), 180_000);
  assert.equal(state.notReady(180_000), undefined);
  state.observe(unreadyPod('importer', 'importer:v1', false), 200_000);
  assert.equal(state.notReady(380_000 - 1).candidate, false);
  assert.equal(state.notReady(380_000).candidate, true);
});

test('a candidate waiting on an unready dependency, or an unready non-candidate, does not name the candidate', () => {
  const state = new PodState(['importer:v1']);
  state.observe(unreadyPod('postgres', 'postgres:16', false), 0);
  state.observe(unreadyPod('importer', 'importer:v1', false), 0);
  assert.deepEqual(state.notReady(600_000), {pods: ['postgres', 'importer'], candidate: false});
  assert.throws(() => state.stable(600_000), failure('unknown'));
  // A pending pod with no container statuses yet cannot name anything.
  const pending = new PodState(['importer:v1']);
  pending.observe(pod({metadata: {name: 'importer', uid: 'a'}, status: {phase: 'Pending'}}), 0);
  assert.equal(pending.notReady(600_000).candidate, false);
  // A completed init container is not unready.
  const initialized = new PodState(['importer:v1']);
  const value = unreadyPod('importer', 'importer:v1', false);
  value.spec.initContainers = [{name: 'migrate', image: 'busybox:1.36.1'}];
  value.status.initContainerStatuses = [
    {name: 'migrate', ready: false, restartCount: 0, state: {terminated: {exitCode: 0}}},
  ];
  initialized.observe(value, 0);
  assert.equal(initialized.notReady(180_000).candidate, true);
});

test('pod evidence records which containers run a candidate image', () => {
  const state = new PodState(['importer:v1']);
  state.observe(unreadyPod('importer', 'importer:v1', true), 0);
  state.observe(unreadyPod('postgres', 'postgres:16', true), 0);
  assert.equal(state.pods.get('importer').containers[0].candidate, true);
  assert.equal(state.pods.get('postgres').containers[0].candidate, false);
});

test('empty workload cannot pass stability and metrics are converted without inventing zero samples', () => {
  assert.throws(() => new PodState().stable(), failure('unknown'));
  assert.deepEqual(PodWatcher.quantities('25m', '120Mi'), {cpuCores: 0.025, memoryBytes: 125_829_120});
  assert.deepEqual(PodWatcher.quantities('2', '1Gi'), {cpuCores: 2, memoryBytes: 1_073_741_824});
});

test('mirror readback waits for the exact transaction data; mismatched topic content fails', async context => {
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify(
        request.url === '/transfer'
          ? {
              transactions: [
                {
                  result: 'SUCCESS',
                  transfers: [
                    {account: '0.0.2', amount: 1000},
                    {account: '0.0.1012', amount: -2000},
                  ],
                },
              ],
            }
          : {sequence_number: 1, message: Buffer.from('wrong').toString('base64')},
      ),
    );
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  await Probe.mirror(base, '/transfer', body => Probe.transferMatches(body, {amount: 1000, account: '0.0.1012'}), 100);
  await assert.rejects(
    Probe.mirror(base, '/topic', body => Probe.messageMatches(body, {sequence: '1', message: 'expected'}), 50),
    failure('candidate'),
  );
  assert.equal(
    Probe.transactionPath({accountId: '0.0.1012', validStart: {seconds: 1234, nanos: 50}}),
    '/api/v1/transactions/0.0.1012-1234-000000050',
  );
  await assert.rejects(Processes.freePort(server.address().port), failure('environment'));
});

async function tarball(directory, name, metadata, files = {}) {
  const source = path.join(directory, name);
  mkdirSync(path.join(source, 'package'), {recursive: true});
  writeFileSync(path.join(source, 'package/package.json'), JSON.stringify(metadata));
  for (const [filename, text] of Object.entries(files)) {
    writeFileSync(path.join(source, 'package', filename), text);
  }
  const archive = path.join(directory, `${name}.tgz`);
  await Processes.command('tar', ['-czf', archive, '-C', source, 'package']);
  return archive;
}

test('real npm install proves tarball integrity and both Solo SDK resolutions; tampering fails', async context => {
  const root = fixture(context);
  const packs = path.join(root, 'packs');
  mkdirSync(packs);
  for (const [index, name] of PACKAGES.entries()) {
    await tarball(
      packs,
      String(index),
      {
        name,
        version: '1.0.0',
        ...(index === 0
          ? {
              exports: {import: './index.mjs', require: './index.cjs'},
              dependencies: {
                '@hiero-ledger/proto': '1.0.0',
                '@hiero-ledger/cryptography': '1.0.0',
              },
            }
          : {}),
      },
      {'index.mjs': 'export const candidate = true;', 'index.cjs': 'exports.candidate = true;'},
    );
  }
  const solo = await tarball(root, 'solo', {
    name: '@hiero-ledger/solo',
    version: '1.0.0',
    dependencies: {'@hiero-ledger/sdk': '1.0.0'},
  });
  const found = await Packages.candidates(packs);
  const directory = path.join(root, 'installed');
  mkdirSync(directory);
  await Packages.install(directory, `file:${solo}`, found, {timeout: 30_000});
  const proof = await Packages.identity(directory, found);
  assert.equal(proof.packages.length, 3);
  assert.match(proof.required, /index.cjs$/);
  assert.match(proof.imported, /index.mjs$/);
  const lockfile = path.join(directory, 'package-lock.json');
  const lock = JSON.parse(readFileSync(lockfile, 'utf8'));
  lock.packages['node_modules/@hiero-ledger/sdk'].integrity = 'sha512-wrong';
  writeFileSync(lockfile, JSON.stringify(lock));
  await assert.rejects(Packages.identity(directory, found), failure('candidate'));
  await tarball(packs, 'duplicate', {name: '@hiero-ledger/sdk', version: '1.0.0'});
  await assert.rejects(Packages.candidates(packs), failure('invalid'));
});

test('CLI rejects unverified releases and writes a final failing result and JUnit without touching a cluster', context => {
  const directory = fixture(context);
  const script = fileURLToPath(new URL('../src/run.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [script, ...arguments_, '--solo-version', '0.93.0'], {
    env: {...process.env, RUNNER_TEMP: directory},
    shell: false,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(run.status, 2, run.stderr);
  const file = /Result: (.+tck-result.json)/.exec(run.stdout)[1];
  const result = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(result.outcome, 'fail');
  assert.equal(result.reason, 'invalid');
  assert.equal(result.schemaVersion, 1);
  assert.deepEqual(result.reportOnly, []);
  assert.equal(result.cleanup.cluster.detail, 'No owned cluster was created; nothing deleted');
  assert.match(readFileSync(path.join(path.dirname(file), 'junit.xml'), 'utf8'), /failures="1"/);
});

test('packing a Solo source tree tolerates lifecycle output before the npm result', async context => {
  const directory = fixture(context);
  const checkout = path.join(directory, 'checkout');
  const destination = path.join(directory, 'packed');
  mkdirSync(checkout);
  mkdirSync(destination);
  writeFileSync(
    path.join(checkout, 'package.json'),
    JSON.stringify({
      name: '@hiero-ledger/solo',
      version: '1.0.0',
      scripts: {prepare: 'node -e "console.log(\'Removing existing symlink\')"'},
    }),
  );
  const archive = await Packages.packSolo(checkout, destination);
  const metadata = JSON.parse(await Processes.command('tar', ['-xOf', archive, 'package/package.json']));
  assert.equal(metadata.name, '@hiero-ledger/solo');
});
