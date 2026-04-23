// SPDX-License-Identifier: Apache-2.0

import {HelmExecution} from '../../../../../src/integration/helm/execution/helm-execution.js';
import {HelmExecutionException} from '../../../../../src/integration/helm/helm-execution-exception.js';
import {HelmParserException} from '../../../../../src/integration/helm/helm-parser-exception.js';
import {Repository} from '../../../../../src/integration/helm/model/repository.js';
import {Duration} from '../../../../../src/core/time/duration.js';
import {expect} from 'chai';
import sinon from 'sinon';
import {describe, it, beforeEach, afterEach} from 'mocha';

describe('HelmExecution', (): void => {
  let helmExecution: sinon.SinonStubbedInstance<HelmExecution>;

  beforeEach((): void => {
    helmExecution = sinon.createStubInstance(HelmExecution);
    // Set up the stub to throw an error with the expected message
    helmExecution.callTimeout.rejects(new HelmExecutionException(1, 'Process exited with code 1', '', ''));
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('Test call with timeout throws exception and logs warning message', async () => {
    const timeout: Duration = Duration.ofMillis(1000);

    try {
      await helmExecution.callTimeout(timeout);
    } catch (error) {
      expect(error).to.be.instanceOf(HelmExecutionException);
      expect(error.message).to.contain('Execution of the Helm command failed with exit code: 1');
    }
  });

  it('Test response as list throws exception and logs warning message', async () => {
    const timeout: Duration = Duration.ofMillis(1000);
    try {
      await helmExecution.responseAsListTimeout(Repository, timeout);
    } catch (error) {
      expect(error).to.be.instanceOf(HelmParserException);
      expect(error.message).to.contain('Failed to deserialize the output into a list of the specified class');
    }
  });

  it('Test response as throws exception and logs warning message', async () => {
    const timeout: Duration = Duration.ofMillis(1000);
    try {
      await helmExecution.responseAsTimeout(Repository, timeout);
    } catch (error) {
      expect(error).to.be.instanceOf(HelmParserException);
    }
  });

  describe('redactCommand', (): void => {
    it('should redact --password and its value', (): void => {
      const cmd: string[] = ['--password', 'mySecret'];
      const redacted: string[] = HelmExecution.redactCommand(cmd);
      expect(redacted).to.deep.equal(['--password', '******']);
    });

    it('should redact sensitive key=value pairs for --set, --set-string, --set-file', (): void => {
      const cmd: string[] = [
        '--set',
        'global.password=mySecret',
        '--set-string',
        'some-token=abc',
        '--set-file',
        'my_key=123',
        '--set',
        'normal=value',
      ];
      const redacted: string[] = HelmExecution.redactCommand(cmd);
      expect(redacted).to.deep.equal([
        '--set',
        'global.password=******',
        '--set-string',
        'some-token=******',
        '--set-file',
        'my_key=******',
        '--set',
        'normal=value',
      ]);
    });

    it('should not modify unrelated arguments', (): void => {
      const cmd: string[] = ['install', 'my-release', '--namespace', 'default', '--values', 'values.yaml'];
      const redacted: string[] = HelmExecution.redactCommand(cmd);
      expect(redacted).to.deep.equal(['install', 'my-release', '--namespace', 'default', '--values', 'values.yaml']);
    });

    it('should redact regex-matched sensitive keys like credential and auth', (): void => {
      const cmd: string[] = [
        '--set',
        'db.credential=secretValue',
        '--set',
        'global.auth=bearerXYZ',
        '--set',
        'tls.certificate=base64data',
        '--set',
        'normal=value',
      ];
      const redacted: string[] = HelmExecution.redactCommand(cmd);
      expect(redacted).to.deep.equal([
        '--set',
        'db.credential=******',
        '--set',
        'global.auth=******',
        '--set',
        'tls.certificate=******',
        '--set',
        'normal=value',
      ]);
    });

    it('should redact deeply nested dot-notation keys and privatekey', (): void => {
      const cmd: string[] = [
        '--set',
        'something.something.password=123456',
        '--set',
        'tls.privatekey=base64data',
        '--set',
        'config.replicas=3',
      ];
      const redacted: string[] = HelmExecution.redactCommand(cmd);
      expect(redacted).to.deep.equal([
        '--set',
        'something.something.password=******',
        '--set',
        'tls.privatekey=******',
        '--set',
        'config.replicas=3',
      ]);
    });
  });
});
