// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {DefaultOneShotCommand} from '../../../src/commands/one-shot/default-one-shot.js';
import {Flags} from '../../../src/commands/flags.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';

// Covers https://github.com/hiero-ledger/solo/issues/3296: `one-shot falcon deploy` must run without
// a values file, in which case it uses the same defaults as `one-shot single deploy`.
describe('DefaultOneShotCommand.FALCON_DEPLOY_FLAGS_LIST', (): void => {
  it('requires no flags, so the command runs without a values file', (): void => {
    expect(DefaultOneShotCommand.FALCON_DEPLOY_FLAGS_LIST.required).to.deep.equal([]);
  });

  it('accepts the values file as an optional flag with an empty default', (): void => {
    expect(DefaultOneShotCommand.FALCON_DEPLOY_FLAGS_LIST.optional).to.include(Flags.valuesFile);
    expect(Flags.valuesFile.definition.defaultValue).to.equal('');
  });

  it('accepts every deploy flag shared with one-shot single deploy', (): void => {
    const singleOnlyFlags: Set<string> = new Set<string>([Flags.minimalSetup.name, Flags.pinger.name]);
    const sharedSingleDeployFlags: string[] = DefaultOneShotCommand.DEPLOY_FLAGS_LIST.optional
      .map((flag: CommandFlag): string => flag.name)
      .filter((name: string): boolean => !singleOnlyFlags.has(name));
    const falconDeployFlags: string[] = DefaultOneShotCommand.FALCON_DEPLOY_FLAGS_LIST.optional.map(
      (flag: CommandFlag): string => flag.name,
    );

    expect(falconDeployFlags).to.include.members(sharedSingleDeployFlags);
  });
});
