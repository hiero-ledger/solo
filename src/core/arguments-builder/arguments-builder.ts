// SPDX-License-Identifier: Apache-2.0

import {type CommandFlag, type CommandFlags} from '../../types/flag-types.js';
import {Flags as flags} from '../../commands/flags.js';
import {SoloError} from '../errors/solo-error.js';

export type FlagName = string;

export class ArgumentsBuilder {
  private readonly baseParams: string[] = ['${PATH}/node', '${SOLO_ROOT}/solo.ts'];
  private flagList?: CommandFlag[];

  protected constructor(
    private readonly command: string[],
    public readonly flagArguments: Record<FlagName, any> = {},
  ) {}

  public static initialize(command: string): ArgumentsBuilder {
    return new ArgumentsBuilder(command.split(' '));
  }

  public setCommandFlags(flags: CommandFlags): this {
    this.flagList = [...flags.optional, ...flags.required];
    return this;
  }

  public build(cacheDirectory?: string): string[] {
    const argv: string[] = [...this.baseParams, ...this.command];
    this.setDevMode();
    this.setQuiet();

    if (cacheDirectory) {
      this.setArg(flags.cacheDir, cacheDirectory);
    }

    // Remove common flags if they are not allowed
    const commonFlags: CommandFlag[] = [flags.devMode, flags.quiet, flags.cacheDir, flags.chartDirectory];

    for (const commonFlag of commonFlags) {
      if (this.flagList && !this.flagList.some((flag): boolean => flag.name === commonFlag.name)) {
        delete this.flagArguments[commonFlag.name];
      }
    }

    for (const [flagName, value] of Object.entries(this.flagArguments)) {
      if (this.flagList && !this.flagList.some((flag): boolean => flag.name === flagName)) {
        throw new SoloError(
          `Flag ${flagName} is not a valid flag for command ${this.command.join(' ')}. ` +
            `Allowed flags [ ${this.flagList.map((flag): string => flag.name).join(', ')} ] ` +
            `Supplied flags [ ${Object.keys(this.flagArguments).join(', ')} ] `,
        );
      }

      if (typeof value === 'boolean') {
        argv.push(this.optionFromFlag(flagName));
      } else {
        argv.push(this.optionFromFlag(flagName), value);
      }
    }

    return argv;
  }

  public setArg(flag: CommandFlag): this;
  public setArg(flag: CommandFlag, value: any): this;
  public setArg(flag: CommandFlag, value?: any): this {
    if (value !== undefined && value !== null) {
      if (typeof value !== flag.definition.type) {
        throw new SoloError(
          `Flag ${flag.name} requires a value of type ${flag.definition.type} but got ${typeof value}`,
        );
      }

      this.flagArguments[flag.name] = value;
    } else {
      if (flag.definition.type !== 'boolean') {
        throw new SoloError(`Flag ${flag.name} is not a boolean flag and can't work with supplied value: ${value}`);
      }

      this.flagArguments[flag.name] = true;
    }
    return this;
  }

  public setForce(): ArgumentsBuilder {
    this.setArg(flags.force);
    return this;
  }

  public setQuiet(): ArgumentsBuilder {
    this.setArg(flags.quiet);
    return this;
  }

  public setDevMode(): ArgumentsBuilder {
    this.setArg(flags.devMode);
    return this;
  }

  protected optionFromFlag: (flagName: FlagName) => string = (flagName: FlagName): string => `--${flagName}`;
}
