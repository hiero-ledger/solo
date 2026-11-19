// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {SoloErrors} from '../errors/solo-errors.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {SelfUpdateReleaseClient} from './self-update-release-client.js';
import {Duration} from '../time/duration.js';

/**
 * Replaces the running Solo SEA binary with a verified release, the same way `installers/linux/install.sh` does:
 * stage next to the binary, check the hash, run the staged copy, then rename it over the original. Until the
 * rename the current binary is never touched, and the rename is atomic because both files share a folder.
 */
export class SelfUpdateBinarySwapper {
  private static readonly STAGED_PREFIX: string = '.solo.update.';
  private static readonly PROBE_TIMEOUT: Duration = Duration.ofSeconds(60);

  private constructor() {}

  /** Returns the release asset name for this machine, for example `solo-linux-x64-musl`. */
  public static assetName(): string {
    const architecture: string = SelfUpdateBinarySwapper.resolveArchitecture();
    const libc: string = SelfUpdateBinarySwapper.isMusl() ? '-musl' : '';
    const extension: string = process.platform === 'win32' ? '.exe' : '';
    return `solo-${process.platform}-${architecture}${libc}${extension}`;
  }

  /** The real file the running binary was started from, so a symlink to it keeps working. */
  public static currentBinaryPath(): string {
    return fs.realpathSync(process.execPath);
  }

  /** The install-script command a user runs when the binary's folder needs elevated rights. */
  public static installScriptCommand(folder: string, tag: string): string {
    return (
      `curl -fsSL ${SelfUpdateReleaseClient.RELEASES_URL}/latest/download/install.sh | ` +
      `sudo sh -s -- --prefix ${folder} --version ${tag}`
    );
  }

  /** Stops before any download when the folder holding the binary cannot be written. */
  public static assertFolderWritable(binaryPath: string, tag: string): void {
    const folder: string = PathEx.dirname(binaryPath);
    try {
      fs.accessSync(folder, fs.constants.W_OK);
    } catch (error) {
      throw new SoloErrors.system.selfUpdateFolderNotWritable(
        folder,
        SelfUpdateBinarySwapper.installScriptCommand(folder, tag),
        error as Error,
      );
    }
  }

  /**
   * Downloads, verifies, probes and swaps in the release binary.
   *
   * @param expectedSha256 the hash from the signature-verified manifest
   * @param version the version the staged binary must report, without a leading `v`
   */
  public static async install(
    tag: string,
    assetName: string,
    expectedSha256: string,
    binaryPath: string,
    version: string,
  ): Promise<void> {
    SelfUpdateBinarySwapper.removeAbandonedStagedFiles(PathEx.dirname(binaryPath));
    const staged: string = PathEx.join(
      PathEx.dirname(binaryPath),
      `${SelfUpdateBinarySwapper.STAGED_PREFIX}${process.pid}`,
    );

    const removeStaged: () => void = (): void => fs.rmSync(staged, {force: true});
    // Ctrl-C: delete the staged file before leaving, so an interrupted update leaves nothing behind.
    const onSignal: (signal: NodeJS.Signals) => void = (signal: NodeJS.Signals): void => {
      removeStaged();
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      process.kill(process.pid, signal);
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    try {
      await SelfUpdateReleaseClient.downloadAsset(tag, assetName, staged);

      const actual: string = await SelfUpdateReleaseClient.sha256(staged);
      if (actual !== expectedSha256) {
        throw new SoloErrors.system.selfUpdateVerificationFailed(
          tag,
          `${assetName} has SHA-256 ${actual}, but the signed manifest lists ${expectedSha256}`,
        );
      }

      fs.chmodSync(staged, 0o755);
      SelfUpdateBinarySwapper.probe(tag, staged, version);

      try {
        fs.renameSync(staged, binaryPath);
      } catch (error) {
        throw new SoloErrors.system.selfUpdateInstallFailed(tag, (error as Error).message, error as Error);
      }
    } finally {
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      removeStaged();
    }
  }

  /**
   * Deletes the unpacked `sea-resources` of every version except the two given: the one just replaced, which
   * processes still running it may be reading, and the new one.
   */
  public static pruneSeaResources(resourcesRoot: string, keepVersions: string[]): void {
    if (!fs.existsSync(resourcesRoot)) {
      return;
    }
    for (const entry of fs.readdirSync(resourcesRoot)) {
      if (!keepVersions.includes(entry)) {
        fs.rmSync(PathEx.join(resourcesRoot, entry), {recursive: true, force: true});
      }
    }
  }

  /** Runs the staged binary with `--version`, stdin closed. It also unpacks the new version's resources. */
  private static probe(tag: string, staged: string, version: string): void {
    let output: string;
    try {
      output = execFileSync(staged, ['--version', '--output', 'wide'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        timeout: SelfUpdateBinarySwapper.PROBE_TIMEOUT.toMillis(),
        encoding: 'utf8',
      });
    } catch (error) {
      throw new SoloErrors.system.selfUpdateInstallFailed(
        tag,
        `the downloaded release does not run on this machine (${(error as Error).message})`,
        error as Error,
      );
    }
    if (!output.includes(version)) {
      throw new SoloErrors.system.selfUpdateInstallFailed(
        tag,
        `the downloaded release reports '${output.trim()}' instead of ${version}`,
      );
    }
  }

  /** Removes staged files left by an earlier `solo update` that was killed (its process no longer exists). */
  private static removeAbandonedStagedFiles(folder: string): void {
    for (const entry of fs.readdirSync(folder)) {
      if (!entry.startsWith(SelfUpdateBinarySwapper.STAGED_PREFIX)) {
        continue;
      }
      const pid: number = Number(entry.slice(SelfUpdateBinarySwapper.STAGED_PREFIX.length));
      if (!Number.isInteger(pid) || SelfUpdateBinarySwapper.isProcessAlive(pid)) {
        continue;
      }
      fs.rmSync(PathEx.join(folder, entry), {force: true});
    }
  }

  private static isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // EPERM means the process exists but belongs to someone else; any other error means it is gone.
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  }

  /** `process.arch`, except an x64 binary translated by Rosetta on Apple Silicon moves to the native arm64 one. */
  private static resolveArchitecture(): string {
    if (process.platform === 'darwin' && process.arch === 'x64') {
      try {
        const translated: string = execFileSync('/usr/sbin/sysctl', ['-n', 'sysctl.proc_translated'], {
          encoding: 'utf8',
          timeout: Duration.ofSeconds(5).toMillis(),
          stdio: ['ignore', 'pipe', 'ignore'],
          shell: false,
        });
        if (translated.trim() === '1') {
          return 'arm64';
        }
      } catch {
        // Intel Macs do not have this key; keep process.arch.
      }
    }
    return process.arch;
  }

  /** Node reports glibc in the process report; without it a Linux system runs musl. */
  private static isMusl(): boolean {
    if (process.platform !== 'linux') {
      return false;
    }
    const report: {header?: {glibcVersionRuntime?: string}} = process.report.getReport() as {
      header?: {glibcVersionRuntime?: string};
    };
    return !report.header?.glibcVersionRuntime;
  }
}
