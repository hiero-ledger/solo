// SPDX-License-Identifier: Apache-2.0

import os from 'node:os';
import readline from 'node:readline';
import {isSea} from 'node:sea';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {Flags as flags} from './flags.js';
import {PathEx} from '../business/utils/path-ex.js';
import {SemanticVersion} from '../business/utils/semantic-version.js';
import {getSoloVersion} from '../../version.js';
import {HomebrewDeprecationNotifier} from '../core/homebrew-deprecation-notifier.js';
import {SoloErrors} from '../core/errors/solo-errors.js';
import {SelfUpdateReleaseClient} from '../core/self-update/self-update-release-client.js';
import {SelfUpdateBinarySwapper} from '../core/self-update/self-update-binary-swapper.js';
import {type SoloLogger} from '../core/logging/solo-logger.js';
import {type CommandFlags} from '../types/flag-types.js';
import {type ArgvStruct} from '../types/aliases.js';

/**
 * `solo update`: replaces the running Solo SEA binary with a signed GitHub release.
 *
 * See docs/design/installers/self-upgrade.md. npm, Homebrew and Windows installs are not replaced in place;
 * for those the command prints what to run instead and changes nothing.
 */
@injectable()
export class UpdateCommand {
  public static readonly FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.targetVersion, flags.quiet],
  };

  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public async update(argv: ArgvStruct): Promise<boolean> {
    const current: string = getSoloVersion();
    const requested: string = (argv[flags.targetVersion.constName] as string | undefined)?.trim() ?? '';

    if (!isSea()) {
      this.showUnsupportedChannel(requested);
      return true;
    }

    const tag: string = requested ? UpdateCommand.toTag(requested) : await SelfUpdateReleaseClient.resolveLatestTag();
    const target: string = tag.slice(1);

    if (target === current) {
      this.logger.showUser(`Solo ${current} is the latest release`);
      return true;
    }
    if (!requested && !new SemanticVersion<string>(target).greaterThan(current)) {
      this.logger.showUser(`Solo ${current} is the latest release`);
      return true;
    }
    if (new SemanticVersion<string>(target).lessThan(current)) {
      this.logger.showUser(
        `Warning: ${target} is older than ${current}; it may not read config written by the newer version.`,
      );
    }

    if (process.platform === 'win32') {
      this.logger.showUser(
        `Download Solo ${target} from ${SelfUpdateReleaseClient.RELEASES_URL}/tag/${tag}; a bare solo.exe is not updated in place.`,
      );
      return true;
    }

    this.logger.showUser(`Solo ${target} is available (you have ${current}).`);
    this.logger.showUser(`Release notes: ${SelfUpdateReleaseClient.RELEASES_URL}/tag/${tag}`);
    if (!argv[flags.quiet.constName] && !(await UpdateCommand.confirm('Update now? (y/N) '))) {
      this.logger.showUser('Update cancelled');
      return true;
    }

    const binaryPath: string = SelfUpdateBinarySwapper.currentBinaryPath();
    SelfUpdateBinarySwapper.assertFolderWritable(binaryPath, tag);

    const assetName: string = SelfUpdateBinarySwapper.assetName();
    const checksums: Map<string, string> = await SelfUpdateReleaseClient.fetchVerifiedChecksums(tag);
    const expectedSha256: string | undefined = checksums.get(assetName);
    if (!expectedSha256) {
      throw new SoloErrors.system.selfUpdateAssetUnavailable(tag, assetName);
    }

    this.logger.showUser(`Downloading ${assetName} ${tag}...`);
    await SelfUpdateBinarySwapper.install(tag, assetName, expectedSha256, binaryPath, target);
    SelfUpdateBinarySwapper.pruneSeaResources(PathEx.join(os.homedir(), '.solo', 'sea-resources'), [current, target]);

    this.logger.showUser(`Updated Solo ${current} to ${target}`);
    return true;
  }

  private showUnsupportedChannel(requested: string): void {
    const version: string = requested ? requested.replace(/^v/, '') : '<version>';
    if (HomebrewDeprecationNotifier.isInstalledViaHomebrew()) {
      this.logger.showUser(
        'This Solo came from Homebrew, which is deprecated. Install the standalone binary: ' +
          `curl -fsSL ${SelfUpdateReleaseClient.RELEASES_URL}/latest/download/install.sh | sh`,
      );
    } else {
      this.logger.showUser(
        `This Solo was installed with npm. Update it with: npm install -g @hiero-ledger/solo@${version}`,
      );
    }
  }

  /** Reads one line, so it works for a person at a terminal and for `echo y | solo update` alike. */
  private static async confirm(question: string): Promise<boolean> {
    const lines: readline.Interface = readline.createInterface({input: process.stdin, output: process.stdout});
    return new Promise<boolean>((resolve: (answer: boolean) => void): void => {
      // stdin closed before an answer (EOF): the default answer is no.
      lines.once('close', (): void => resolve(false));
      lines.question(question, (answer: string): void => {
        resolve(/^y(es)?$/i.test(answer.trim()));
        lines.close();
      });
    });
  }

  private static toTag(version: string): string {
    return version.startsWith('v') ? version : `v${version}`;
  }
}
