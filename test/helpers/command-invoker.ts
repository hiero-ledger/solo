// SPDX-License-Identifier: Apache-2.0

import {type Middlewares} from '../../src/core/middlewares.js';
import {Flags as flags} from '../../src/commands/flags.js';
import {type AnyObject, type ArgvStruct} from '../../src/types/aliases.js';
import {type Argv} from './argv-wrapper.js';
import {type ConfigManager} from '../../src/core/config-manager.js';
import {type SoloLogger} from '../../src/core/logging/solo-logger.js';
import {type K8Factory} from '../../src/integration/kube/k8-factory.js';
import {InjectTokens} from '../../src/core/dependency-injection/inject-tokens.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../src/core/dependency-injection/container-helper.js';
import {type RemoteConfigRuntimeStateApi} from '../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {ListrContext} from 'listr2';

@injectable()
export class CommandInvoker {
  public constructor(
    @inject(InjectTokens.Middlewares) private readonly middlewares?: Middlewares,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig?: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
  ) {
    this.middlewares = patchInject(middlewares, InjectTokens.Middlewares, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public async invoke({
    callback,
    argv,
    command,
    subcommand,
    action,
  }: {
    callback: (argv: ArgvStruct) => Promise<boolean | ListrContext>;
    argv: Argv;
    command: string;
    subcommand: string;
    action: string;
  }): Promise<void> {
    // unload the remote config from the manager
    // this.remoteConfig.unload(); // TODO: unload using runtime state

    if (!argv.getArg(flags.context)) {
      argv.setArg(flags.context, this.k8Factory.default().contexts().readCurrent());
    }

    const middlewares: ((Argv: ArgvStruct) => Promise<boolean | AnyObject>)[] = [this.updateConfigManager()];

    argv.setCommand(command, subcommand, action);

    for (const executable of middlewares) {
      await executable(argv.build());
    }

    try {
      await callback(argv.build());
    } catch (error) {
      this.logger.showUserError(error);
      throw error;
    }
  }

  private updateConfigManager(): (argv: ArgvStruct) => Promise<AnyObject> {
    return async (argv: ArgvStruct): Promise<AnyObject> => {
      this.configManager.update(argv);
      return argv;
    };
  }
}
