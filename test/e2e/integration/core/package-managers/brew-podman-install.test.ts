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
 * absent, and `brew install podman` lands a podman new enough for kind's podman provider.
 *
 * Every assertion targets the brew-installed binary specifically (see {@link resolvePodmanPath}),
 * never the distribution-native podman, which is too old for kind — installing podman through
 * Homebrew instead is precisely the behaviour under test.
 *
 * This mutates the host (it installs Homebrew and podman), so it only runs on disposable CI VM
 * runners when {@link SOLO_PODMAN_RUNTIME_VALIDATION} is set; every other run skips it.
 *
 * Proving that this podman can actually run a container rootfully is the workflow's job
 * (`.github/workflows/flow-install-validation-runtime.yaml`), via the kind cluster creation step,
 * not this harness's — a registry image pull inside a synchronous execFileSync call has no read
 * timeout and stalls indefinitely on CDN connectivity issues.
 *
 * Tracked by hiero-ledger/solo#4888 (per-distro install validation epic).
 */
const SOLO_PODMAN_RUNTIME_VALIDATION: string = 'SOLO_PODMAN_RUNTIME_VALIDATION';

/** Oldest podman release kind's podman provider supports, as `[major, minor]`. */
const MINIMUM_PODMAN_VERSION: [number, number] = [3, 0];

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
    const brewPrefix: string = execFileSync('brew', ['--prefix', 'podman'], {encoding: 'utf8'}).trim();
    candidates.push(path.join(brewPrefix, 'bin', 'podman'));
  } catch {
    // brew is not resolvable from this process; fall through to the fixed linuxbrew prefix.
  }
  candidates.push(LINUXBREW_PODMAN);
  return (
    candidates.find((candidate: string): boolean => fs.existsSync(candidate)) ??
    execFileSync('sh', ['-c', 'command -v podman'], {encoding: 'utf8'}).trim()
  );
}

/** Parses the `[major, minor]` of the `X.Y.Z` version reported by the given podman binary. */
function readPodmanVersion(podmanPath: string): [number, number] {
  const output: string = execFileSync(podmanPath, ['--version'], {encoding: 'utf8'});
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

  it('installs podman via Homebrew and meets the minimum version for kind', async (): Promise<void> => {
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
  });
}).timeout(600_000);
