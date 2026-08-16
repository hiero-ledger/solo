// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {resetForTest} from '../../../../test-container.js';
import {BrewPackageManager} from '../../../../../src/core/package-managers/brew-package-manager.js';

/**
 * Validates Solo's Linux container-runtime bootstrap end to end: Homebrew is installed when it is
 * absent, `brew install podman` lands a podman new enough for kind's podman provider, and that
 * podman actually runs a container rootfully — the mode Solo uses on Linux (`PodmanMode.ROOTFUL`).
 *
 * Every assertion targets the brew-installed binary specifically (see {@link resolvePodmanPath}),
 * never the distribution-native podman, which is too old for kind — installing podman through
 * Homebrew instead is precisely the behaviour under test.
 *
 * This mutates the host (it installs Homebrew and podman), so it only runs on disposable CI VM
 * runners when {@link SOLO_PODMAN_RUNTIME_VALIDATION} is set; every other run skips it.
 *
 * Creating the kind cluster on top of this podman is the workflow's job
 * (`.github/workflows/flow-install-validation-runtime.yaml`), not this harness's.
 *
 * Tracked by hiero-ledger/solo#4888 (per-distro install validation epic).
 */
const SOLO_PODMAN_RUNTIME_VALIDATION: string = 'SOLO_PODMAN_RUNTIME_VALIDATION';

/** Oldest podman release kind's podman provider supports, as `[major, minor]`. */
const MINIMUM_PODMAN_VERSION: [number, number] = [3, 0];

/** Quay is used rather than Docker Hub so shared CI runners do not hit anonymous pull-rate limits. */
const HELLO_IMAGE: string = 'quay.io/podman/hello';

/** Fixed prefix `BrewPackageManager` installs into, used when `brew --prefix` cannot be consulted. */
const LINUXBREW_PODMAN: string = '/home/linuxbrew/.linuxbrew/bin/podman';

/**
 * Returns the absolute path of the podman binary Homebrew just installed — never whatever the PATH
 * happens to resolve first. Debian/Ubuntu runners ship a distribution podman in `/usr/bin` that is
 * too old for kind, and it is exactly the brew-provided one this test exists to assert. Resolution
 * mirrors the `podman-directory` lookup in `.github/workflows/flow-install-validation-runtime.yaml`:
 * `brew --prefix podman`, then the fixed linuxbrew prefix, and only then the PATH.
 */
function resolvePodmanPath(): string {
  const candidates: string[] = [];
  try {
    // Short timeout + SIGKILL: `brew --prefix` is a local filesystem lookup and should be instant;
    // a hang here would block the event loop just like the podman run call below.
    const brewPrefix: string = execFileSync('brew', ['--prefix', 'podman'], {
      encoding: 'utf8',
      timeout: 10_000,
      killSignal: 'SIGKILL',
    }).trim();
    candidates.push(path.join(brewPrefix, 'bin', 'podman'));
  } catch {
    // brew is not resolvable from this process; fall through to the fixed linuxbrew prefix.
  }
  candidates.push(LINUXBREW_PODMAN);
  return (
    candidates.find((candidate: string): boolean => fs.existsSync(candidate)) ??
    execFileSync('sh', ['-c', 'command -v podman'], {
      encoding: 'utf8',
      timeout: 10_000,
      killSignal: 'SIGKILL',
    }).trim()
  );
}

/** Parses the `[major, minor]` of the `X.Y.Z` version reported by the given podman binary. */
function readPodmanVersion(podmanPath: string): [number, number] {
  // Short timeout + SIGKILL: `podman --version` should return instantly; if it hangs it would
  // block the event loop the same way as the podman run call below.
  const output: string = execFileSync(podmanPath, ['--version'], {
    encoding: 'utf8',
    timeout: 10_000,
    killSignal: 'SIGKILL',
  });
  const match: RegExpMatchArray | null = output.match(/(\d+)\.(\d+)\.(\d+)/);
  expect(match, `podman --version should report an X.Y.Z version, got: ${output}`).to.not.be.null;
  return [Number(match[1]), Number(match[2])];
}

// eslint-disable-next-line prefer-arrow-callback
describe('BrewPackageManager podman runtime validation', function (this: Mocha.Suite): void {
  before(function (this: Mocha.Context): void {
    if (process.env[SOLO_PODMAN_RUNTIME_VALIDATION] !== 'true') {
      // eslint-disable-next-line unicorn/no-this-outside-of-class
      this.skip();
    }
    resetForTest();
  });

  it('installs podman via Homebrew and runs a container rootfully', async (): Promise<void> => {
    const brewPackageManager: BrewPackageManager = new BrewPackageManager();
    if (!(await brewPackageManager.isAvailable())) {
      expect(await brewPackageManager.install(), 'Homebrew bootstrap should succeed').to.be.true;
    }
    await brewPackageManager.installPackages(['podman']);

    const podmanPath: string = resolvePodmanPath();
    expect(fs.existsSync(podmanPath), `brew install podman should have produced ${podmanPath}`).to.be.true;

    const [major, minor]: [number, number] = readPodmanVersion(podmanPath);
    const [minimumMajor, minimumMinor]: [number, number] = MINIMUM_PODMAN_VERSION;
    expect(
      major > minimumMajor || (major === minimumMajor && minor >= minimumMinor),
      `podman ${major}.${minor} is older than kind's minimum of ${minimumMajor}.${minimumMinor}`,
    ).to.be.true;

    const podmanDirectory: string = path.dirname(podmanPath);
    // sudo resets the PATH and brew's podman is not on root's PATH, so it is passed explicitly
    // through `sudo env PATH=…`, the same shape ClusterTaskManager uses to create the kind cluster.
    // `-n` fails fast rather than hanging on a password prompt; CI runners grant passwordless sudo.
    const sudoEnvironmentArguments: string[] = [
      '-n',
      'env',
      `PATH=${podmanDirectory}${path.delimiter}${process.env.PATH}`,
    ];

    // Pull the image before the timed `podman run` so the 60-second window is spent only on
    // container start and execution, not on the network round-trip from quay.io. On cold
    // GitHub-hosted runners the image download can consume the entire 60-second budget,
    // leaving no time for the container to start. `--quiet` suppresses the per-layer progress
    // lines that would otherwise scroll past; the pull either succeeds or is killed.
    execFileSync('sudo', [...sudoEnvironmentArguments, 'podman', 'pull', '--quiet', HELLO_IMAGE], {
      encoding: 'utf8',
      timeout: 120_000,
      killSignal: 'SIGKILL',
    });

    // `--pull=never` skips the registry check since the image was just pulled above, keeping
    // the full 60-second budget for container start and execution.
    const output: string = execFileSync(
      'sudo',
      [
        ...sudoEnvironmentArguments,
        'podman',
        'run',
        '--rm',
        '--pull=never',
        // Skip network setup: the hello container does not need network access, and on
        // cold GitHub-hosted runners the default podman network (backed by netavark +
        // nftables) takes long enough to initialise that rootful `podman run` exceeds
        // our 60-second timeout.  Full network validation — including netavark and the
        // podman provider — happens in the "Create Kind Cluster With Podman" step.
        '--network=none',
        HELLO_IMAGE,
      ],
      // execFileSync is synchronous — it blocks the event loop entirely while the child runs.
      // Without a hard kill, a hung `podman run` freezes mocha indefinitely: timeout: 60_000
      // sends SIGTERM to sudo, but sudo waits for podman before exiting, and a stuck podman
      // ignores SIGTERM; killSignal: 'SIGKILL' makes the OS kill sudo immediately so
      // waitpid() returns and the event loop unblocks within 60 seconds.
      {encoding: 'utf8', timeout: 60_000, killSignal: 'SIGKILL'},
    );
    expect(output, `${HELLO_IMAGE} should print its greeting`).to.contain('Podman');
  });
}).timeout(600_000);
