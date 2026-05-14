// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {InitCommand} from '../../../src/commands/init/init.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {type InitContext} from '../../../src/commands/init/init-context.js';
import {type SoloListrTask} from '../../../src/types/index.js';

describe('InitCommand unit tests', (): void => {
  let initCommand: InitCommand;
  let showListStub: SinonStub;

  beforeEach((): void => {
    resetForTest();
    initCommand = container.resolve(InjectTokens.InitCommand);
    const logger: SoloLogger = container.resolve(InjectTokens.SoloLogger);
    showListStub = sinon.stub(logger, 'showList');

    // @ts-expect-error - test-only reset of private static state
    InitCommand.hasShownDevSystemFileLists = false;
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('should print dev system file lists only once per process', async (): Promise<void> => {
    const setupTasks: SoloListrTask<InitContext>[] = initCommand.setupSystemFilesTasks({dev: true});
    const copyTemplatesTask: SoloListrTask<InitContext> = setupTasks[2];
    const context: InitContext = {
      repoURLs: ['https://example.com/charts'],
      dirs: ['/tmp/home-dir'],
      config: {username: ''},
    };

    await copyTemplatesTask.task(context, undefined as never);
    await copyTemplatesTask.task(context, undefined as never);

    expect(showListStub.callCount).to.equal(2);
    expect(showListStub.firstCall.args[0]).to.equal('Home Directories');
    expect(showListStub.secondCall.args[0]).to.equal('Chart Repository');
  });
});
