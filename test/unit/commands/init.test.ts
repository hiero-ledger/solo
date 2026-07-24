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
import {type SoloListrTask, type SoloListrTaskWrapper} from '../../../src/types/index.js';

describe('InitCommand unit tests', (): void => {
  const COPY_TEMPLATES_TASK_INDEX: number = 2;
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
    const setupTasks: SoloListrTask<InitContext>[] = initCommand.setupSystemFilesTasks({debug: true});
    const copyTemplatesTask: SoloListrTask<InitContext> = setupTasks[COPY_TEMPLATES_TASK_INDEX];
    const context: InitContext = {
      repoURLs: ['https://example.com/charts'],
      dirs: ['/tmp/home-dir'],
      config: {username: ''},
    };
    const taskWrapper: SoloListrTaskWrapper<InitContext> = {} as SoloListrTaskWrapper<InitContext>;

    await copyTemplatesTask.task(context, taskWrapper);
    await copyTemplatesTask.task(context, taskWrapper);

    expect(showListStub.callCount).to.equal(2);
    expect(showListStub.firstCall.args[0]).to.equal('Home Directories');
    expect(showListStub.secondCall.args[0]).to.equal('Chart Repository');
  });
});
