/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import {Flags as flags} from '../../../commands/flags.js';
import type {ToObject} from '../../../types/index.js';
import type {RemoteConfigCommonFlagsStruct} from './types.js';
import type {ConfigManager} from '../../config_manager.js';
import type {CommandFlag} from '../../../types/flag_types.js';
import type {AnyObject} from '../../../types/aliases.js';
import {select} from '@inquirer/prompts';

export class CommonFlagsDataWrapper implements ToObject<RemoteConfigCommonFlagsStruct> {
  private static readonly COMMON_FLAGS: CommandFlag[] = [
    flags.releaseTag,
    flags.chartDirectory,
    flags.relayReleaseTag,
    flags.soloChartVersion,
    flags.mirrorNodeVersion,
    flags.nodeAliasesUnparsed,
    flags.hederaExplorerVersion,
  ];

  private constructor(
    private readonly configManager: ConfigManager,
    private readonly flags: RemoteConfigCommonFlagsStruct,
  ) {}

  /**
   * Updates the flags or populates them inside the remote config
   */
  public async handleFlags(argv: AnyObject): Promise<void> {
    for (const flag of CommonFlagsDataWrapper.COMMON_FLAGS) {
      await this.checkFlag(flag, argv);
    }
  }

  private async handleFlag(flag: CommandFlag, argv: AnyObject): Promise<void> {
    const detectFlagMismatch = async () => {
      const oldValue = this.flags[flag.constName] as string;
      const newValue = this.configManager.getFlag<string>(flag);

      // if the old value is not present, override it with the new one
      if (!oldValue && newValue) {
        this.flags[flag.constName] = newValue;
        return;
      }

      // if its present but there is a mismatch warn user
      else if (oldValue && oldValue !== newValue) {
        const answer = await select<string>({
          message: 'Value in remote config differs with the one you are passing, choose which you want to use',
          choices: [
            {
              name: `[old value] ${oldValue}`,
              value: oldValue,
            },
            {
              name: `[new value] ${newValue}`,
              value: newValue,
            },
          ],
        });

        // Override if user chooses new the new value, else override and keep the old one
        if (answer === newValue) {
          this.flags[flag.constName] = newValue;
        } else {
          this.configManager.setFlag(flag, oldValue);
          argv[flag.constName] = oldValue;
        }
      }
    };

    // if the flag is set, inspect the value
    if (this.configManager.hasFlag(flag)) {
      await detectFlagMismatch();
    }

    // use remote config value if no user supplied value
    else if (this.flags[flag.constName]) {
      argv[flag.constName] = this.flags[flag.constName];
      this.configManager.setFlag(flag, this.flags[flag.constName]);
    }
  }

  public static async initializeEmpty(configManager: ConfigManager, argv: AnyObject): Promise<CommonFlagsDataWrapper> {
    const commonFlagsDataWrapper = new CommonFlagsDataWrapper(configManager, {});
    await commonFlagsDataWrapper.handleFlags(argv);
    return commonFlagsDataWrapper;
  }

  public static fromObject(configManager: ConfigManager, data: RemoteConfigCommonFlagsStruct): CommonFlagsDataWrapper {
    return new CommonFlagsDataWrapper(configManager, data);
  }

  public toObject(): RemoteConfigCommonFlagsStruct {
    return {
      nodeAliasesUnparsed: this.flags.nodeAliasesUnparsed,
      releaseTag: this.flags.releaseTag,
      relayReleaseTag: this.flags.relayReleaseTag,
      hederaExplorerVersion: this.flags.hederaExplorerVersion,
      mirrorNodeVersion: this.flags.mirrorNodeVersion,
    };
  }
}
