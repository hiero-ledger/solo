// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {container} from 'tsyringe-neo';
import {resetTestContainer} from '../test-container.js';
import {ArgumentProcessor} from '../../src/argument-processor.js';
import {MissingRemoteConfigRecovery} from '../../src/missing-remote-config-recovery.js';
import {Flags as flags} from '../../src/commands/flags.js';
import {type ConfigManager} from '../../src/core/config-manager.js';
import {InjectTokens} from '../../src/core/dependency-injection/inject-tokens.js';
import {SoloError} from '../../src/core/errors/solo-error.js';
import {SoloErrors} from '../../src/core/errors/solo-errors.js';
import {UserBreak} from '../../src/core/errors/user-break.js';
import {type AnyObject} from '../../src/types/aliases.js';

describe('MissingRemoteConfigRecovery', (): void => {
  const originalArgv: string[] = ['${PATH}/node', '${SOLO_ROOT}/solo.ts', 'mirror', 'node', 'add'];

  let processStub: SinonStub;
  let originalIsTty: boolean;

  beforeEach((): void => {
    resetTestContainer();

    // `--quiet` keeps confirmCleanup from prompting, so the tests never block on stdin.
    const configManager: ConfigManager = container.resolve<ConfigManager>(InjectTokens.ConfigManager);
    configManager.setFlag(flags.quiet, true);

    originalIsTty = process.stdin.isTTY;
    processStub = sinon.stub(ArgumentProcessor, 'process');
  });

  afterEach((): void => {
    processStub.restore();
    process.stdin.isTTY = originalIsTty;
  });

  function missingRemoteConfigError(): SoloError {
    return new SoloErrors.config.remoteConfigMissingOnKindCluster('solo-deployment', 'solo', 'kind-solo');
  }

  it('returns the command result when the command succeeds', async (): Promise<void> => {
    const expected: AnyObject = {ok: true};
    processStub.resolves(expected);

    const result: AnyObject = await MissingRemoteConfigRecovery.processWithRecovery(originalArgv);

    expect(result).to.equal(expected);
    expect(processStub.callCount).to.equal(1);
  });

  it('rethrows an unrelated failure without cleaning up', async (): Promise<void> => {
    const failure: SoloError = new SoloError('something else went wrong');
    processStub.rejects(failure);

    await expect(MissingRemoteConfigRecovery.processWithRecovery(originalArgv)).to.be.rejectedWith(failure.message);
    expect(processStub.callCount).to.equal(1);
  });

  it('cleans up the leftover state and runs the command again', async (): Promise<void> => {
    const expected: AnyObject = {ok: true};
    processStub.onCall(0).rejects(missingRemoteConfigError());
    processStub.onCall(1).resolves({});
    processStub.onCall(2).resolves(expected);

    const result: AnyObject = await MissingRemoteConfigRecovery.processWithRecovery(originalArgv);

    expect(result).to.equal(expected);
    expect(processStub.callCount).to.equal(3);

    const destroyArgv: string[] = processStub.getCall(1).args[0] as string[];
    expect(destroyArgv.join(' ')).to.contain('one-shot single destroy');
    expect(destroyArgv).to.contain('--deployment');
    expect(destroyArgv).to.contain('solo-deployment');

    expect(processStub.getCall(2).args[0]).to.deep.equal(originalArgv);
  });

  it('finds the recoverable error when a command wraps it', async (): Promise<void> => {
    const wrapped: SoloError = new SoloErrors.component.oneShotDeployFailed(missingRemoteConfigError());
    processStub.onCall(0).rejects(wrapped);
    processStub.onCall(1).resolves({});
    processStub.onCall(2).resolves({});

    await MissingRemoteConfigRecovery.processWithRecovery(originalArgv);

    expect(processStub.callCount).to.equal(3);
    expect(processStub.getCall(1).args[0].join(' ')).to.contain('one-shot single destroy');
  });

  it('surfaces the original error when the cleanup fails', async (): Promise<void> => {
    const original: SoloError = missingRemoteConfigError();
    processStub.onCall(0).rejects(original);
    processStub.onCall(1).rejects(new SoloError('destroy blew up'));

    await expect(MissingRemoteConfigRecovery.processWithRecovery(originalArgv)).to.be.rejectedWith(original.message);
    expect(processStub.callCount).to.equal(2);
  });

  it('aborts without cleaning up when the user declines the confirmation', async (): Promise<void> => {
    const configManager: ConfigManager = container.resolve<ConfigManager>(InjectTokens.ConfigManager);
    configManager.setFlag(flags.quiet, false);
    configManager.setFlag(flags.force, false);
    // No TTY would auto-confirm, so pretend there is one and let the prompt fail on the closed stdin.
    process.stdin.isTTY = true;

    processStub.onCall(0).rejects(missingRemoteConfigError());

    await expect(MissingRemoteConfigRecovery.processWithRecovery(originalArgv)).to.be.rejected;
    expect(processStub.callCount).to.equal(1);
  });

  it('auto-confirms the cleanup when there is no TTY to prompt on', async (): Promise<void> => {
    const configManager: ConfigManager = container.resolve<ConfigManager>(InjectTokens.ConfigManager);
    configManager.setFlag(flags.quiet, false);
    configManager.setFlag(flags.force, false);
    process.stdin.isTTY = false;

    processStub.onCall(0).rejects(missingRemoteConfigError());
    processStub.onCall(1).resolves({});
    processStub.onCall(2).resolves({});

    await MissingRemoteConfigRecovery.processWithRecovery(originalArgv);

    expect(processStub.callCount).to.equal(3);
  });

  it('does not report a UserBreak as a recoverable condition', async (): Promise<void> => {
    processStub.rejects(new UserBreak('Aborted by user'));

    await expect(MissingRemoteConfigRecovery.processWithRecovery(originalArgv)).to.be.rejectedWith('Aborted by user');
    expect(processStub.callCount).to.equal(1);
  });
});
