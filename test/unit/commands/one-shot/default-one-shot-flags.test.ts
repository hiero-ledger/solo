// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';

import {DefaultOneShotCommand} from '../../../../src/commands/one-shot/default-one-shot.js';
import {Flags as flags} from '../../../../src/commands/flags.js';

describe('DefaultOneShotCommand flag lists', (): void => {
  it('should include edge flag in falcon deploy flags list', (): void => {
    expect(DefaultOneShotCommand.FALCON_DEPLOY_FLAGS_LIST.optional).to.include(flags.edgeEnabled);
  });
});
