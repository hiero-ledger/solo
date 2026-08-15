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

/**
 * Runs a shell diagnostic command and prints its output with a label prefix. Failures are
 * swallowed so that a broken diagnostic never masks the real test failure.
 */
function runDiagnostic(label: string, command: string, arguments_: string[], timeoutMs: number = 15_000): void {
  console.log(`[podman-validation] === ${label} ===`);
  try {
    const output: string = execFileSync(command, arguments_, {encoding: 'utf8', timeout: timeoutMs});
    console.log(output.trim() || '(no output)');
  } catch (error: unknown) {
    // best-effort diagnostic; swallow failures so the test result is not obscured
    console.log(`(failed: ${error instanceof Error ? error.message : String(error)})`);
  }
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
    // ── Step 1: Homebrew ────────────────────────────────────────────────────────
    console.log('[podman-validation] checking if Homebrew is available');
    const brewPackageManager: BrewPackageManager = new BrewPackageManager();
    if (await brewPackageManager.isAvailable()) {
      console.log('[podman-validation] Homebrew already available');
    } else {
      console.log('[podman-validation] Homebrew not found — installing');
      expect(await brewPackageManager.install(), 'Homebrew bootstrap should succeed').to.be.true;
      console.log('[podman-validation] Homebrew install complete');
    }

    // ── Step 2: podman via brew ─────────────────────────────────────────────────
    console.log('[podman-validation] running: brew install podman');
    await brewPackageManager.installPackages(['podman']);
    console.log('[podman-validation] brew install podman complete');

    // ── Step 3: verify binary ───────────────────────────────────────────────────
    const podmanPath: string = resolvePodmanPath();
    console.log(`[podman-validation] resolved podman binary: ${podmanPath}`);
    expect(fs.existsSync(podmanPath), `brew install podman should have produced ${podmanPath}`).to.be.true;

    const [major, minor]: [number, number] = readPodmanVersion(podmanPath);
    const [minimumMajor, minimumMinor]: [number, number] = MINIMUM_PODMAN_VERSION;
    console.log(
      `[podman-validation] podman version: ${major}.${minor} (minimum required: ${minimumMajor}.${minimumMinor})`,
    );
    expect(
      major > minimumMajor || (major === minimumMajor && minor >= minimumMinor),
      `podman ${major}.${minor} is older than kind's minimum of ${minimumMajor}.${minimumMinor}`,
    ).to.be.true;

    const podmanDirectory: string = path.dirname(podmanPath);
    // sudo resets PATH; brew's podman is not on root's PATH so it is passed explicitly.
    const sudoEnvironmentPath: string = `PATH=${podmanDirectory}${path.delimiter}${process.env.PATH}`;

    // ── Step 4: kernel / firewall diagnostics ───────────────────────────────────
    // Run before any podman invocation so that we know the state of the system
    // when the potential hang occurs — each block is independently timed out so
    // one hung diagnostic does not block the rest.
    // nf_tables refcount: Docker's iptables-nft backend (nft_compat) holds the netlink mutex.
    // If the refcount on nf_tables is high (Docker is running), netavark will deadlock.
    // The workflow stops Docker before this test; the refcount should be near 0 here.
    runDiagnostic('kernel modules — nf_tables refcount (should be near 0; high means Docker is contending)', 'sh', [
      '-c',
      'lsmod | grep -E "nf_tables|ip_tables|iptable_|nft_compat|docker" | sort || echo "(no matching modules)"',
    ]);
    runDiagnostic('nftables tables (pre-run)', 'sudo', ['nft', 'list', 'tables']);
    runDiagnostic('iptables filter chains (pre-run)', 'sudo', ['iptables', '-L', '-n', '--line-numbers']);
    runDiagnostic('iptables nat chains (pre-run)', 'sudo', ['iptables', '-t', 'nat', '-L', '-n']);
    runDiagnostic('/var/lib/containers/storage layout', 'sudo', [
      'find',
      '/var/lib/containers/storage',
      '-maxdepth',
      '2',
      '-ls',
    ]);
    runDiagnostic('/etc/containers/containers.conf (effective)', 'sudo', ['cat', '/etc/containers/containers.conf']);
    runDiagnostic('/root/.config/containers/containers.conf (root user config)', 'sudo', [
      'cat',
      '/root/.config/containers/containers.conf',
    ]);

    // ── Step 5: podman info — initialises libpod without creating a container ───
    // If this hangs it points to a libpod database migration issue.
    // If it succeeds, the hang (if any) is specific to network setup in podman run.
    console.log('[podman-validation] running: sudo podman info (libpod init probe, 60 s timeout)');
    runDiagnostic('sudo podman info', 'sudo', ['-n', 'env', sudoEnvironmentPath, 'podman', 'info'], 60_000);

    // ── Step 6: podman network ls — lists networks without creating a container ─
    // If this hangs but podman info succeeded, the issue is in netavark init.
    console.log('[podman-validation] running: sudo podman network ls (30 s timeout)');
    runDiagnostic(
      'sudo podman network ls',
      'sudo',
      ['-n', 'env', sudoEnvironmentPath, 'podman', 'network', 'ls'],
      30_000,
    );

    // ── Step 7: run the hello container ────────────────────────────────────────
    // Uses system `timeout` as the outer command so that SIGKILL is guaranteed
    // after 130 s regardless of whether sudo or podman responds to SIGTERM.
    // Node's execFileSync timeout (150 s) is a belt-and-suspenders backstop only.
    console.log('[podman-validation] running: sudo timeout --kill-after=10 120 podman run --rm quay.io/podman/hello');
    const output: string = execFileSync(
      'sudo',
      ['-n', 'timeout', '--kill-after=10', '120', 'env', sudoEnvironmentPath, 'podman', 'run', '--rm', HELLO_IMAGE],
      {encoding: 'utf8', timeout: 150_000},
    );
    console.log('[podman-validation] podman run completed successfully');
    expect(output, `${HELLO_IMAGE} should print its greeting`).to.contain('Podman');
  });
}).timeout(600_000);
