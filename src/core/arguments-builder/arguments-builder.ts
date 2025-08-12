// SPDX-License-Identifier: Apache-2.0

import {type CommandFlag} from '../../types/flag-types.js';
import {Flags as flags} from '../../commands/flags.js';
import {SoloError} from '../errors/solo-error.js';

export class ArgumentsBuilder {
  protected constructor(protected readonly argv: string[]) {}

  public static initialize(command: string): ArgumentsBuilder {
    return new ArgumentsBuilder(['${PATH}/node', '${SOLO_ROOT}/solo.ts', ...command.split(' ')]);
  }

  public build(cacheDirectory?: string): string[] {
    this.setDevMode();
    this.setQuiet();
    if (cacheDirectory) {
      this.argv.push(this.optionFromFlag(flags.cacheDir), cacheDirectory);
    }
    return this.argv;
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
      this.argv.push(this.optionFromFlag(flag), value);
    } else {
      if (flag.definition.type !== 'boolean') {
        throw new SoloError(`Flag ${flag.name} is not a boolean flag and can't work with supplied value: ${value}`);
      }
      this.argv.push(this.optionFromFlag(flag));
    }
    return this;
  }

  public setForce(): ArgumentsBuilder {
    this.argv.push(this.optionFromFlag(flags.force));
    return this;
  }

  protected setQuiet(): void {
    if (!this.argv.includes(this.optionFromFlag(flags.quiet))) {
      this.argv.push(this.optionFromFlag(flags.quiet));
    }
  }

  protected setDevMode(): void {
    if (!this.argv.includes(this.optionFromFlag(flags.devMode))) {
      this.argv.push(this.optionFromFlag(flags.devMode));
    }
  }

  protected optionFromFlag: (flag: CommandFlag) => string = (flag: CommandFlag): string => `--${flag.name}`;
}
