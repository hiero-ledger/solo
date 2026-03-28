// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {SoloError} from './errors/solo-error.js';
import {MissingArgumentError} from './errors/missing-argument-error.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {Flags, Flags as flags} from '../commands/flags.js';
import type * as yargs from 'yargs';
import {type CommandFlag} from '../types/flag-types.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {StorageType} from './constants.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {type ArgvStruct, type AnyListrContext, type AnyObject, type AnyYargs} from '../types/aliases.js';
import {type Optional, type SoloListrTaskWrapper} from '../types/index.js';
import {PathEx} from '../business/utils/path-ex.js';
import {getSoloVersion} from '../../version.js';
import {isValidEnum} from './util/validation-helpers.js';
import {AsyncLocalStorage} from 'node:async_hooks';

/**
 * ConfigManager cache command flag values so that user doesn't need to enter the same values repeatedly.
 *
 * For example, 'namespace' is usually remains the same across commands once it is entered, and therefore user
 * doesn't need to enter it repeatedly. However, user should still be able to specify the flag explicitly for any command.
 */
@injectable()
export class ConfigManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public config!: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly _configMaps = new Map<string, any>();
  // Parallel subcommands used to mutate `this.config` directly, which made
  // argv/flag resolution nondeterministic. Each command flow now runs against
  // its own scoped config snapshot to keep reads/writes isolated.
  private readonly configScope: AsyncLocalStorage<Record<string, any>> = new AsyncLocalStorage<Record<string, any>>();

  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);

    this.reset();
  }

  /** Reset config */
  public reset(): void {
    this.config = {
      flags: {},
      version: getSoloVersion(),
      updatedAt: new Date().toISOString(),
    };
  }

  private getActiveConfig(): Record<string, any> {
    // If no scope exists (normal single-command path), fallback to legacy
    // process-wide config behavior.
    return this.configScope.getStore() ?? this.config;
  }

  public cloneActiveConfig(): Record<string, any> {
    // Snapshot current effective config so child command flows can mutate it
    // without affecting siblings. Use a shallow spread of the flags map rather
    // than structuredClone: structuredClone strips class prototypes (e.g.
    // NamespaceName becomes a plain {name} object that stringifies to
    // "[object Object]"). NamespaceName instances are immutable so sharing
    // them by reference across scopes is safe.
    const active = this.getActiveConfig();
    return {
      ...active,
      flags: {...active.flags},
    };
  }

  public runWithScopedConfig<T>(scopedConfig: Record<string, any>, callback: () => T): T {
    // Bind the scoped config to the entire async call chain.
    return this.configScope.run(scopedConfig, callback);
  }

  /**
   * Apply the command flags precedence
   *
   * It uses the below precedence for command flag values:
   *  1. User input of the command flag
   *  2. Default value of the command flag if the command is not 'init'.
   */
  public applyPrecedence(argv: yargs.Argv<AnyYargs>, aliases: AnyObject): yargs.Argv<AnyYargs> {
    const activeConfig: Record<string, any> = this.getActiveConfig();
    for (const key of Object.keys(aliases)) {
      const flag: CommandFlag = flags.allFlagsMap.get(key);
      if (flag) {
        if (argv[key] !== undefined) {
          // argv takes precedence, nothing to do
        } else if (this.hasFlag(flag)) {
          argv[key] = this.getFlag(flag);
        } else {
          argv[key] = flag.definition.defaultValue;
        }
      }
    }

    activeConfig.updatedAt = new Date().toISOString();
    return argv;
  }

  /** Update the config using the argv */
  public update(argv: ArgvStruct): void {
    const activeConfig: Record<string, any> = this.getActiveConfig();
    if (!argv || Object.keys(argv).length === 0) {
      return;
    }

    for (const flag of flags.allFlags) {
      if (argv[flag.name] === undefined) {
        continue;
      }

      let value = argv[flag.name];
      switch (flag.definition.type) {
        case 'string': {
          if (value && (flag.name === flags.chartDirectory.name || flag.name === flags.cacheDir.name)) {
            this.logger.debug(
              `Resolving directory path for '${flag.name}': ${value}, to: ${PathEx.resolve(value)}, note: ~/ is not supported`,
            );
            value = PathEx.resolve(value);
          }
          // if it is a namespace flag then convert it to NamespaceName
          else if (value && (flag.name === flags.namespace.name || flag.name === flags.clusterSetupNamespace.name)) {
            activeConfig.flags[flag.name] = value instanceof NamespaceName ? value : NamespaceName.of(value);
            break;
          }
          activeConfig.flags[flag.name] = `${value}`; // force convert to string
          break;
        }

        case 'number': {
          try {
            activeConfig.flags[flag.name] = flags.integerFlags.has(flag.name)
              ? Number.parseInt(value)
              : Number.parseFloat(value);
          } catch (error) {
            throw new SoloError(`invalid number value '${value}': ${error.message}`, error);
          }
          break;
        }

        case 'boolean': {
          activeConfig.flags[flag.name] = value === true || value === 'true'; // use comparison to enforce boolean value
          break;
        }

        case 'StorageType': {
          // @ts-expect-error: TS2475: const enums can only be used in property or index access expressions
          if (isValidEnum(`${value}`, StorageType)) {
            activeConfig.flags[flag.name] = value;
          } else {
            throw new SoloError(`Invalid storage type value '${value}'`);
          }
          break;
        }
        default: {
          throw new SoloError(`Unsupported field type for flag '${flag.name}': ${flag.definition.type}`);
        }
      }
    }

    // store last command that was run
    if (argv._) {
      activeConfig.lastCommand = argv._;
    }

    activeConfig.updatedAt = new Date().toISOString();

    const flagMessage: string = Object.entries(activeConfig.flags)
      .filter((entries): boolean => entries[1] !== undefined && entries[1] !== null)
      .map(([key, value]): `${string}=${string}` => {
        const flag: CommandFlag = flags.allFlagsMap.get(key);
        const dataMask: Optional<string> = flag.definition.dataMask;

        return `${key}=${dataMask || value}`;
      })
      .join(', ');

    if (flagMessage) {
      this.logger.debug(`Updated config with flags: ${flagMessage}`);
    }
  }

  /** Check if a flag value is set */
  public hasFlag(flag: CommandFlag): boolean {
    return this.getActiveConfig().flags[flag.name] !== undefined;
  }

  /**
   * Return the value of the given flag
   * @returns value of the flag or undefined if flag value is not available
   */
  public getFlag<T = string>(flag: CommandFlag): T {
    const activeConfig: Record<string, any> = this.getActiveConfig();
    return activeConfig.flags[flag.name] === undefined ? undefined : activeConfig.flags[flag.name];
  }

  /** Set value for the flag */
  public setFlag<T>(flag: CommandFlag, value: T): void {
    const activeConfig: Record<string, any> = this.getActiveConfig();
    if (!flag || !flag.name) {
      throw new MissingArgumentError('flag must have a name');
    }
    // if it is a namespace then convert it to NamespaceName
    if (flag.name === flags.namespace.name || flag.name === flags.clusterSetupNamespace.name) {
      if (value instanceof NamespaceName) {
        activeConfig.flags[flag.name] = value;
        return;
      }

      activeConfig.flags[flag.name] = NamespaceName.of(value as string);
      return;
    }
    activeConfig.flags[flag.name] = value;
  }

  /** Get package version */
  public getVersion(): string {
    return this.getActiveConfig().version;
  }

  /**
   * Run prompts for the given set of flags
   * @param task task object from listr2
   * @param flagList list of flag objects
   */
  public async executePrompt(task: SoloListrTaskWrapper<AnyListrContext>, flagList: CommandFlag[] = []): Promise<void> {
    for (const flag of flagList) {
      if (flag.definition.disablePrompt || flag.prompt === undefined) {
        continue;
      }

      if (this.getFlag(Flags.quiet)) {
        return;
      }
      const input = await flag.prompt(task, this.getFlag(flag));
      this.setFlag(flag, input);
    }
  }

  /**
   * Dynamically builds a class with properties from the provided list of flags
   * and extra properties, will keep track of which properties are used.  Call
   * getUnusedConfigs() to get an array of unused properties.
   */
  public getConfig(configName: string, flags: CommandFlag[], extraProperties: string[] = []): object {
    const getFlag = this.getFlag.bind(this);

    // build the dynamic class that will keep track of which properties are used
    const NewConfigClass = class {
      private usedConfigs: Map<string, number>;
      constructor() {
        // the map to keep track of which properties are used
        this.usedConfigs = new Map();

        // add the flags as properties to this class
        if (flags) {
          for (const flag of flags) {
            this[`_${flag.constName}`] = getFlag(flag);
            Object.defineProperty(this, flag.constName, {
              get() {
                this.usedConfigs.set(flag.constName, this.usedConfigs.get(flag.constName) + 1 || 1);
                return this[`_${flag.constName}`];
              },
              set(value) {
                this[`_${flag.constName}`] = value;
              },
            });
          }
        }

        // add the extra properties as properties to this class
        if (extraProperties) {
          for (const name of extraProperties) {
            this[`_${name}`] = '';
            Object.defineProperty(this, name, {
              get() {
                this.usedConfigs.set(name, this.usedConfigs.get(name) + 1 || 1);
                return this[`_${name}`];
              },
              set(value) {
                this[`_${name}`] = value;
              },
            });
          }
        }
      }

      /** Get the list of unused configurations that were not accessed */
      public getUnusedConfigs(): string[] {
        const unusedConfigs: string[] = [];

        // add the flag constName to the unusedConfigs array if it was not accessed
        if (flags) {
          for (const flag of flags) {
            if (!this.usedConfigs.has(flag.constName)) {
              unusedConfigs.push(flag.constName);
            }
          }
        }

        // add the extra properties to the unusedConfigs array if it was not accessed
        if (extraProperties) {
          for (const item of extraProperties) {
            if (!this.usedConfigs.has(item)) {
              unusedConfigs.push(item);
            }
          }
        }
        return unusedConfigs;
      }
    };

    const newConfigInstance = new NewConfigClass();

    // add the new instance to the configMaps so that it can be used to get the
    // unused configurations using the configName from the BaseCommand
    this._configMaps.set(configName, newConfigInstance);

    return newConfigInstance;
  }

  /**
   * Get the list of unused configurations that were not accessed
   * @returns an array of unused configurations
   */
  public getUnusedConfigs(configName: string): string[] {
    return this._configMaps.get(configName).getUnusedConfigs();
  }

  public getFlagFile(flag: CommandFlag): string {
    const value: string = this.getFlag(flag);
    if (value === flag.definition.defaultValue || !value) {
      const cacheDirectory: string =
        (this.getFlag(flags.cacheDir) as string) || (flags.cacheDir.definition.defaultValue as string);
      return PathEx.join(cacheDirectory, flag.definition.defaultValue as string);
    }
    return this.getFlag(flag);
  }
}
