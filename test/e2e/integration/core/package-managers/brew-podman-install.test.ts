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
    // nf_tables refcount: should be near 0 after stopping Docker + nft flush ruleset.
    runDiagnostic('kernel modules — nf_tables / br_netfilter / veth refcounts', 'sh', [
      '-c',
      'lsmod | grep -E "nf_tables|ip_tables|iptable_|nft_compat|br_netfilter|^veth" | sort || echo "(no matching modules)"',
    ]);
    // Tables must be empty — any residual Docker ip/ip6 tables cause netavark to deadlock.
    runDiagnostic('nftables tables (pre-run — must be empty)', 'sudo', ['nft', 'list', 'tables']);
    runDiagnostic('iptables filter chains (pre-run)', 'sudo', ['iptables', '-L', '-n', '--line-numbers']);
    runDiagnostic('iptables nat chains (pre-run)', 'sudo', ['iptables', '-t', 'nat', '-L', '-n']);
    runDiagnostic('sysctl ip_forward + bridge nf-call flags', 'sh', [
      '-c',
      'sysctl net.ipv4.ip_forward; sysctl net.bridge.bridge-nf-call-iptables 2>/dev/null || echo "(br_netfilter not loaded)"; sysctl net.bridge.bridge-nf-call-ip6tables 2>/dev/null || true',
    ]);
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
    runDiagnostic('helper binaries (netavark / aardvark-dns versions)', 'sh', [
      '-c',
      '/opt/podman-helpers/netavark --version 2>&1; /opt/podman-helpers/aardvark-dns --version 2>&1',
    ]);

    // crun: verify which binary podman will actually use. The system crun (typically at
    // /usr/bin/crun or /usr/local/bin/crun) is an older version incompatible with the OCI
    // bundle that brew podman 6.x generates — it hangs inside conmon waiting for a ready
    // signal that the old runtime never sends. The brew crun must be present and selected.
    runDiagnostic('crun binaries (system vs brew — must match containers.conf)', 'sh', [
      '-c',
      [
        'for p in /usr/bin/crun /usr/local/bin/crun /home/linuxbrew/.linuxbrew/bin/crun; do',
        '  if [ -x "$p" ]; then echo "$p: $($p --version 2>&1 | head -n1)"; else echo "$p: not found"; fi;',
        'done;',
        'echo "find brew crun:"; find /home/linuxbrew/.linuxbrew -name "crun" -type f 2>/dev/null || echo "(none)";',
        'echo "root PATH crun:"; sudo env PATH=/home/linuxbrew/.linuxbrew/bin:/usr/local/bin:/usr/bin which crun 2>&1 || echo "(not found)"',
      ].join(' '),
    ]);

    // conmon version: must be compatible with brew podman 6.x. Never appeared in prior diagnostics.
    runDiagnostic('conmon version + cgroup manager + dbus state', 'sh', [
      '-c',
      [
        'echo "conmon:"; /home/linuxbrew/.linuxbrew/bin/conmon --version 2>&1 || echo "(failed)";',
        'echo "cgroup root:"; cat /proc/1/cgroup 2>&1 | head -5;',
        'echo "cgroupfs layout:"; ls /sys/fs/cgroup/ 2>&1 | head -10;',
        'echo "systemd status:"; systemctl is-system-running 2>&1 || true;',
        'echo "dbus socket:"; ls -la /run/dbus/system_bus_socket 2>&1 || echo "(absent)"',
      ].join(' '),
    ]);

    // fuse-overlayfs: the system binary at /usr/local/bin/fuse-overlayfs hangs when mounting
    // container rootfs layers with brew podman 6.x. storage.conf must select native overlay
    // (no mount_program) and the overlay/.has-mount-program marker must be absent so podman
    // does not revert to fuse-overlayfs. Both are set up in the workflow's Normalize step.
    runDiagnostic('fuse-overlayfs binaries + storage.conf + overlay marker', 'sh', [
      '-c',
      [
        'for p in /usr/bin/fuse-overlayfs /usr/local/bin/fuse-overlayfs /home/linuxbrew/.linuxbrew/bin/fuse-overlayfs; do',
        '  if [ -x "$p" ]; then echo "$p: $($p --version 2>&1 | head -n1)"; else echo "$p: not found"; fi;',
        'done;',
        'echo "--- /etc/containers/storage.conf ---"; sudo cat /etc/containers/storage.conf 2>&1 || echo "(absent)";',
        'echo "--- /root/.config/containers/storage.conf ---"; sudo cat /root/.config/containers/storage.conf 2>&1 || echo "(absent)";',
        'echo "--- overlay/.has-mount-program ---"; sudo ls -la /var/lib/containers/storage/overlay/.has-mount-program 2>&1 || echo "(absent — correct)";',
        'echo "--- overlay storage layout ---"; sudo ls -la /var/lib/containers/storage/overlay/ 2>&1 || echo "(absent)"',
      ].join(' '),
    ]);

    // ── Step 5: podman info — initialises libpod without creating a container ───
    // Use sudo timeout (not Node.js timeout) so SIGKILL is guaranteed and the process
    // cannot linger as an orphan holding the libpod lock when the next command runs.
    console.log('[podman-validation] running: sudo podman info (libpod init probe, 30 s timeout)');
    runDiagnostic(
      'sudo podman info',
      'sudo',
      ['-n', 'timeout', '--kill-after=5', '30', 'env', sudoEnvironmentPath, 'podman', 'info'],
      40_000,
    );

    // ── Step 6: podman network ls ────────────────────────────────────────────────
    console.log('[podman-validation] running: sudo podman network ls (30 s timeout)');
    runDiagnostic(
      'sudo podman network ls',
      'sudo',
      ['-n', 'env', sudoEnvironmentPath, 'podman', 'network', 'ls'],
      30_000,
    );

    // Brew crun path: containers.conf points here; if the file is absent podman silently
    // falls back to /usr/local/bin/crun (system crun) which hangs with brew conmon 6.x.
    const brewCrun: string = '/home/linuxbrew/.linuxbrew/bin/crun';

    // ── Step 7: network=none probe — container runtime without netavark ──────────
    // If this succeeds but bridge networking (step 8) hangs, the issue is
    // definitively in netavark's bridge/nftables setup, not the container runtime.
    console.log('[podman-validation] running: sudo podman run --network=none (runtime probe, 60 s timeout)');
    runDiagnostic(
      'sudo podman run --network=none (runtime probe)',
      'sudo',
      [
        '-n',
        'timeout',
        '--kill-after=10',
        '60',
        'env',
        sudoEnvironmentPath,
        'podman',
        'run',
        '--rm',
        '--network=none',
        `--runtime=${brewCrun}`,
        HELLO_IMAGE,
      ],
      75_000,
    );

    // ── Step 8: run the hello container with bridge networking + debug logging ──
    // --log-level=debug prints each internal podman/netavark step so the exact
    // hang point is visible in CI logs even when the process is killed by timeout.
    // Uses system `timeout` to guarantee SIGKILL after 130 s.
    // --runtime forces the brew crun; without it podman falls back to the system
    // crun (/usr/local/bin/crun) which hangs inside conmon with brew podman 6.x.
    console.log(
      '[podman-validation] running: sudo timeout --kill-after=10 120 podman run --log-level=debug --rm quay.io/podman/hello',
    );
    const output: string = execFileSync(
      'sudo',
      [
        '-n',
        'timeout',
        '--kill-after=10',
        '120',
        'env',
        sudoEnvironmentPath,
        'podman',
        '--log-level=debug',
        'run',
        '--rm',
        `--runtime=${brewCrun}`,
        HELLO_IMAGE,
      ],
      {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 150_000},
    );
    console.log('[podman-validation] podman run completed successfully');
    expect(output, `${HELLO_IMAGE} should print its greeting`).to.contain('Podman');
  });
}).timeout(600_000);
