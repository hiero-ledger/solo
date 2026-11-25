// SPDX-License-Identifier: Apache-2.0

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Contract, Failure, EXIT, LIMITS, REPORT_ONLY, SCHEMA_VERSION} from './contract.mjs';
import {Processes} from './process.mjs';
import {Packages} from './packages.mjs';
import {PodWatcher} from './pods.mjs';

const kit = fileURLToPath(new URL('..', import.meta.url));
const version = JSON.parse(readFileSync(path.join(kit, 'package.json'), 'utf8')).version;

async function run(arguments_) {
  const root = mkdtempSync(path.join(process.env.RUNNER_TEMP || tmpdir(), 'solo-tck-'));
  const artifacts = path.join(root, 'artifacts');
  const state = path.join(root, 'state');
  const soloDirectory = path.join(root, 'solo');
  for (const directory of [artifacts, state, soloDirectory, path.join(root, 'home')]) {
    mkdirSync(directory, {mode: 0o700});
  }
  const kubeconfig = path.join(root, 'kubeconfig');
  writeFileSync(
    kubeconfig,
    'apiVersion: v1\nkind: Config\nclusters: []\ncontexts: []\nusers: []\ncurrent-context: ""\n',
    {mode: 0o600},
  );
  const started = Date.now();
  const controller = new AbortController();
  const result = {
    schemaVersion: SCHEMA_VERSION,
    kitVersion: version,
    lane: 'js-sdk',
    outcome: 'fail',
    reason: '',
    probes: {},
    reportOnly: REPORT_ONLY,
    stages: {},
    cleanup: {},
    startedAt: new Date(started).toISOString(),
  };
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        !name.startsWith('SOLO_') &&
        ![
          'KUBECONFIG',
          'ONE_SHOT_WITH_BLOCK_NODE',
          'SKIP_NODE_PING',
          'CONSENSUS_NODE_VERSION',
          'MIRROR_NODE_VERSION',
        ].includes(name),
    ),
  );
  Object.assign(environment, {
    SOLO_HOME: path.join(root, 'home'),
    KUBECONFIG: kubeconfig,
    NO_COLOR: '1',
    PATH: `${path.join(root, 'home/bin')}${path.delimiter}${process.env.PATH}`,
  });
  const runtime = {env: environment, cwd: root, signal: controller.signal};
  let options;
  let watcher;
  let soloBinary;
  let attemptedDeploy = false;
  let currentStage = 'inputs';
  let stageDeadline;
  let primary;
  const cancel = signal => {
    result.incomplete = true;
    primary ||= new Failure('unknown', `Run interrupted by ${signal}`);
    result.outcome = 'fail';
    result.reason = primary.reason;
    result.error = Contract.redact(primary.message);
    result.failedStage = currentStage;
    controller.abort(primary);
  };
  const interrupt = () => cancel('SIGINT');
  const terminate = () => cancel('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  const remaining = () => Math.max(1, Math.min(stageDeadline, started + LIMITS.total - LIMITS.cleanup) - Date.now());
  const execute = (program, commandArguments, extra = {}) =>
    Processes.command(program, commandArguments, {
      ...runtime,
      timeout: remaining(),
      log: path.join(artifacts, `${currentStage}.log`),
      ...extra,
    });
  const mark = (id, before) => {
    result.probes[id] = {status: 'pass', milliseconds: Date.now() - before};
  };
  const stage = async (name, limit, operation) => {
    currentStage = name;
    const before = Date.now();
    stageDeadline = Math.min(before + limit, started + LIMITS.total - LIMITS.cleanup);
    runtime.deadline = stageDeadline;
    console.log(`Solo TCK: ${name}`);
    try {
      return await operation();
    } finally {
      result.stages[name] = {milliseconds: Date.now() - before};
    }
  };
  const readProbes = () => {
    const file = path.join(state, 'probe-results.json');
    if (existsSync(file)) {
      const value = JSON.parse(readFileSync(file, 'utf8'));
      Object.assign(result.probes, value.probes);
      result.sdk = value;
    }
  };
  try {
    options = Contract.inputs(arguments_, JSON.parse(readFileSync(path.join(kit, 'solo-versions.json'), 'utf8')));
    result.requested = options;
    await stage('setup', LIMITS.setup, async () => {
      const before = Date.now();
      result.candidates = await Packages.candidates(path.resolve(options['candidate-packages']), {
        ...runtime,
        timeout: remaining(),
      });
      mark('P1', before);
      if (process.versions.node.split('.', 1)[0] !== '22' || !['linux', 'darwin'].includes(process.platform)) {
        throw new Failure('environment', 'This lane requires Node 22.x on Linux or macOS.');
      }
      const docker = JSON.parse(await execute('docker', ['info', '--format', '{{json .}}']));
      if (docker.NCPU < 6 || docker.MemTotal < 12 * 1024 ** 3) {
        throw new Failure('environment', 'Docker requires at least 6 CPUs and 12 GiB memory');
      }
      const disk = statfsSync(root);
      if (disk.bavail * disk.bsize < 20 * 1024 ** 3) {
        throw new Failure('environment', 'At least 20 GiB free disk is required');
      }
      const clusterList = await execute('kind', ['get', 'clusters']);
      const clusters = clusterList.trim().split('\n');
      if (clusters.includes(options.cluster)) {
        throw new Failure(
          'environment',
          `Kind cluster ${options.cluster} already exists; it will not be reused or deleted`,
        );
      }
      await execute('kubectl', ['version', '--client', '-o', 'json']);
      for (const port of [38_080, 38_081, 37_546, 35_211, 30_004]) {
        await Processes.freePort(port);
      }
      let source = options['solo-version'];
      if (options['solo-tarball']) {
        source = path.resolve(options['solo-tarball']);
        const metadata = JSON.parse(await execute('tar', ['-xOf', source, 'package/package.json']));
        if (metadata.name !== '@hiero-ledger/solo') {
          throw new Failure('invalid', 'solo-tarball is not a Solo package');
        }
        result.soloSource = {
          kind: 'local-tarball',
          sourceSha: options['solo-version'],
          integrity: Packages.integrity(source),
          sourceShaVerified: false,
        };
      } else if (options.unreleased) {
        const checkout = path.join(root, 'source');
        mkdirSync(checkout);
        await execute('git', ['init', '--quiet', checkout]);
        await execute('git', [
          '-C',
          checkout,
          'fetch',
          '--depth=1',
          'https://github.com/hiero-ledger/solo.git',
          source,
        ]);
        await execute('git', ['-C', checkout, 'checkout', '--detach', 'FETCH_HEAD']);
        const head = await execute('git', ['-C', checkout, 'rev-parse', 'HEAD']);
        if (head.trim() !== source) {
          throw new Failure('kit', 'Solo checkout SHA mismatch');
        }
        await execute('npm', ['ci', '--no-audit', '--no-fund'], {cwd: checkout});
        await execute(path.join(checkout, 'node_modules/.bin/tsc'), [], {cwd: checkout});
        await execute(process.execPath, [path.join(checkout, 'resources/post-build-script.js')], {cwd: checkout});
        const packed = path.join(root, 'solo-pack');
        mkdirSync(packed);
        source = await Packages.packSolo(checkout, packed, {
          ...runtime,
          timeout: remaining(),
          log: path.join(artifacts, 'setup.log'),
        });
        result.soloSource = {
          kind: 'commit',
          sourceSha: options['solo-version'],
          integrity: Packages.integrity(source),
          sourceShaVerified: true,
        };
      } else {
        result.soloSource = {kind: 'release', version: source};
      }
      try {
        await Packages.install(soloDirectory, options.unreleased ? `file:${source}` : source, result.candidates, {
          ...runtime,
          timeout: remaining(),
          log: path.join(artifacts, 'setup.log'),
        });
      } catch (error) {
        throw new Failure('environment', `Solo install failed: ${error.message}`, {cause: error});
      }
      result.identity = await Packages.identity(soloDirectory, result.candidates, {...runtime, timeout: remaining()});
      mark('P3', before);
      soloBinary = path.join(soloDirectory, 'node_modules/.bin/solo');
      writeFileSync(
        path.join(state, 'configuration.json'),
        JSON.stringify({
          sdkEntry: result.identity.imported,
          soloBinary,
          candidateSha: process.env.GITHUB_SHA || result.candidates['@hiero-ledger/sdk'].integrity,
        }),
      );
    });
    await stage('deploy', LIMITS.deploy, async () => {
      const before = Date.now();
      // Local-only mode creates a fresh named cluster; Falcon reuses this isolated kubeconfig.
      if (options.cluster !== 'solo-cluster') {
        try {
          await execute('kind', [
            'create',
            'cluster',
            '--name',
            options.cluster,
            '--image',
            'kindest/node:v1.31.9',
            '--config',
            path.join(soloDirectory, 'node_modules/@hiero-ledger/solo/resources/kind-config.yaml'),
            '--kubeconfig',
            kubeconfig,
          ]);
        } catch (error) {
          // Nothing of the candidate exists before its cluster does.
          throw controller.signal.aborted
            ? error
            : new Failure('environment', `Kind cluster creation failed: ${error.message}`, {cause: error});
        }
      }
      const values = path.join(root, 'falcon-values.yaml');
      writeFileSync(values, 'mirrorNode:\n  --pinger: false\n');
      watcher = new PodWatcher(runtime, error => controller.abort(error));
      watcher.start();
      const commandArguments = [
        'one-shot',
        'falcon',
        'deploy',
        '--values-file',
        values,
        '--deployment',
        'solo-tck',
        '--namespace',
        'solo-tck',
        '--deploy-explorer=false',
        '--deploy-relay=false',
        '--metrics-server',
        '--quiet-mode',
      ];
      for (const flag of ['consensus-node-version', 'mirror-node-version']) {
        if (options[flag]) {
          commandArguments.push(`--${flag}`, options[flag]);
        }
      }
      attemptedDeploy = true;
      try {
        await execute(soloBinary, commandArguments);
      } catch (error) {
        // An interrupted deploy did not run to its end, so its pod state names nothing.
        if (watcher.error || controller.signal.aborted) {
          throw watcher.error || error;
        }
        const notReady = watcher.state.notReady();
        const reason = Contract.classifyDeploy(error, notReady);
        throw new Failure(
          reason,
          reason === 'candidate' ? `Candidate not Ready: ${notReady.pods.join(', ')}. ${error.message}` : error.message,
          {cause: error},
        );
      }
      mark('P2', before);
      await watcher.snapshot();
      watcher.state.deployed();
      result.observed = {pods: [...watcher.state.pods.values()]};
      // Solo records deployed chart versions in its own remote configuration.
      const configMaps = JSON.parse(await execute('kubectl', ['get', 'configmaps', '-n', 'solo-tck', '-o', 'json']));
      result.observed.soloConfiguration = configMaps.items
        .filter(item => item.metadata.name.includes('remote-config'))
        .map(item => ({
          name: item.metadata.name,
          versionLines: Object.values(item.data || {}).flatMap(value =>
            value
              .split('\n')
              .filter(line =>
                /^\s*(?:consensusNode|mirrorNodeChart|blockNodeChart|relayChart|soloChart|explorerChart):\s*["']?v?\d/.test(
                  line,
                ),
              )
              .map(line => line.trim()),
          ),
        }));
    });
    for (const [mode, limit] of [
      ['probes', LIMITS.probes],
      ['load', LIMITS.load],
    ]) {
      await stage(mode, limit, async () => {
        try {
          await execute(process.execPath, [path.join(kit, 'src/probe.mjs'), mode, state]);
        } catch (error) {
          readProbes();
          throw (
            watcher.error ||
            new Failure(result.sdk?.reason || 'unknown', result.sdk?.error || error.message, {cause: error})
          );
        }
        readProbes();
        await watcher.snapshot();
        watcher.state.stable();
        if (watcher.error) {
          throw watcher.error;
        }
      });
    }
    mark('P4', started + result.stages.setup.milliseconds + result.stages.deploy.milliseconds);
    Contract.complete(result);
    result.outcome = 'pass';
  } catch (error) {
    readProbes();
    primary = watcher?.error || (error instanceof Failure ? error : new Failure('kit', error.message));
    result.reason = primary.reason;
    result.error = Contract.redact(primary.message);
    result.failedStage = currentStage;
    if (watcher?.error) {
      result.probes.P4 = {status: 'fail', message: result.error};
    } else if (currentStage === 'inputs' || !result.probes.P1) {
      result.probes.P1 = {status: 'fail', message: result.error};
    } else if (currentStage === 'deploy' && !result.probes.P2) {
      result.probes.P2 = {status: 'fail', message: result.error};
    } else if (currentStage === 'setup') {
      result.probes.P3 = {status: 'fail', message: result.error};
    } else if (!Object.values(result.probes).some(probe => probe.status === 'fail')) {
      result.probes[currentStage === 'load' ? 'P8' : 'P7'] = {status: 'fail', message: result.error};
    }
  } finally {
    await watcher?.stop();
    currentStage = 'cleanup';
    if (result.outcome === 'pass') {
      try {
        Contract.complete(result, watcher?.error);
      } catch (error) {
        primary = error;
        result.outcome = 'fail';
        result.reason = error.reason || 'kit';
        result.error = Contract.redact(error.message);
        result.failedStage = 'stability';
        result.probes.P4 = {status: 'fail', message: result.error};
      }
    }
    result.resources = watcher?.metrics;
    if (watcher) {
      result.finalPods = [...watcher.state.pods.values()];
    }
    const cleanupEnd = Math.min(Date.now() + LIMITS.cleanup, started + LIMITS.total);
    const cleanupCommand = async (name, program, commandArguments, cap) => {
      try {
        await Processes.command(program, commandArguments, {
          env: environment,
          cwd: root,
          timeout: Math.max(1, Math.min(cap, cleanupEnd - Date.now())),
          log: path.join(artifacts, `${name}.log`),
        });
        result.cleanup[name] = {passed: true};
      } catch (error) {
        result.cleanup[name] = {passed: false, error: Contract.redact(error.message)};
      }
    };
    let ownsCluster = false;
    if (options) {
      try {
        const context = await Processes.command('kubectl', ['config', 'current-context'], {
          env: environment,
          timeout: 5000,
        });
        ownsCluster = context.trim() === `kind-${options.cluster}`;
      } catch {
        /* An untouched empty kubeconfig owns no cluster. */
      }
    }
    if (ownsCluster) {
      if (result.outcome !== 'pass' && attemptedDeploy) {
        await cleanupCommand('pods', 'kubectl', ['get', 'pods', '-n', 'solo-tck', '-o', 'wide'], 5000);
        await cleanupCommand(
          'events',
          'kubectl',
          ['get', 'events', '-n', 'solo-tck', '--sort-by=.lastTimestamp'],
          5000,
        );
        await cleanupCommand(
          'diagnostics',
          soloBinary,
          ['deployment', 'diagnostics', 'all', '--deployment', 'solo-tck'],
          25_000,
        );
      }
      if (attemptedDeploy) {
        await cleanupCommand(
          'destroy',
          soloBinary,
          ['one-shot', 'falcon', 'destroy', '--deployment', 'solo-tck', '--quiet-mode'],
          90_000,
        );
      }
      await cleanupCommand('deleteCluster', 'kind', ['delete', 'cluster', '--name', options.cluster], 45_000);
    } else {
      result.cleanup.cluster = {passed: true, detail: 'No owned cluster was created; nothing deleted'};
    }
    const logs = path.join(root, 'home/logs');
    if (existsSync(logs)) {
      mkdirSync(path.join(artifacts, 'solo-logs'));
      for (const filename of readdirSync(logs).filter(name => name.endsWith('.log'))) {
        writeFileSync(
          path.join(artifacts, 'solo-logs', filename),
          Contract.redact(readFileSync(path.join(logs, filename), 'utf8')),
        );
      }
    }
    result.elapsedMilliseconds = Date.now() - started;
    result.completedAt = new Date().toISOString();
    const resultFile = path.join(artifacts, 'tck-result.json');
    writeFileSync(resultFile, Contract.redact(JSON.stringify(result, null, 2)) + '\n');
    writeFileSync(path.join(artifacts, 'junit.xml'), Contract.junit(result));
    const summary =
      `## Solo TCK js-sdk\n\nOutcome: **${result.outcome}**${result.reason ? ` (${result.reason})` : ''}\n\n` +
      '| Probe | Result | Milliseconds |\n| --- | --- | --- |\n' +
      Object.entries(result.probes)
        .toSorted()
        .map(([id, probe]) => `| ${id} | ${probe.status} | ${probe.milliseconds ?? ''} |`)
        .join('\n') +
      `\n\nSolo: \`${options?.['solo-version'] || 'not selected'}\`\n\nElapsed: ${result.elapsedMilliseconds}ms. Cleanup: ${JSON.stringify(result.cleanup)}\n` +
      (result.error
        ? `\nFailure at ${result.failedStage}: ${result.error}\n\n### Issue draft for manual triage\n\n` +
          `Title: Solo TCK js-sdk fails at ${result.failedStage}\n\n` +
          `Run the js-sdk lane with the candidate tarballs identified in tck-result.json and Solo ${options?.['solo-version'] || '(not selected)'}. ` +
          `Expected: P1-P8 pass. Observed: ${result.error}. Reason: ${result.reason}. Attach tck-result.json, junit.xml and the collected logs.\n`
        : '');
    writeFileSync(path.join(artifacts, 'summary.md'), summary);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    }
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `outcome=${result.outcome}\nreason=${result.reason}\nresult-file=${resultFile}\nresult-dir=${artifacts}\n`,
      );
    }
    console.log(`Solo TCK: ${result.outcome}${result.reason ? ` (${result.reason})` : ''}. Result: ${resultFile}`);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  }
  return result.outcome === 'pass' ? 0 : EXIT[primary?.reason || 'kit'];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    console.error(`Solo TCK kit failure: ${Contract.redact(error.message)}`);
    process.exitCode = EXIT.kit;
  }
}
