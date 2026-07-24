// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';
import sinon from 'sinon';

import {type ConfigManager} from '../../../src/core/config-manager.js';
import {K8Client} from '../../../src/integration/kube/k8-client/k8-client.js';
import {type CertificateManager} from '../../../src/core/certificate-manager.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {K8ClientSecrets} from '../../../src/integration/kube/k8-client/resources/secret/k8-client-secrets.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type NodeAlias} from '../../../src/types/aliases.js';

describe('Certificate Manager', (): void => {
  const argv: Argv = Argv.initializeEmpty();
  const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);

  const k8InitSpy: K8Client = new K8Client(undefined, k8Factory.default().getKubectlExecutablePath());

  let certificateManager: CertificateManager;

  before(async (): Promise<void> => {
    resetForTest();
    sinon.stub(K8Client.prototype, 'init').returns(k8InitSpy);
    sinon.stub(K8ClientSecrets.prototype, 'create').resolves(true);
    argv.setArg(flags.namespace, 'namespace');
    const configManager: ConfigManager = container.resolve(InjectTokens.ConfigManager);
    configManager.update(argv.build());
    certificateManager = container.resolve(InjectTokens.CertificateManager);
    const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
      InjectTokens.LocalConfigRuntimeState,
    );
    await localConfig.load();
  });

  after((): void => {
    sinon.restore();
  });

  it('should throw if and error if nodeAlias is not provided', async (): Promise<void> => {
    const input: string = '=/usr/bin/fake.cert';

    expect((): {nodeAlias: NodeAlias; filePath: string}[] =>
      // @ts-expect-error - TS2341: to access private property
      certificateManager.parseAndValidate(input, 'testing'),
    ).to.throw(SoloError, 'Failed to parse testing input');
  });

  it('should throw if and error if path is not provided', async (): Promise<void> => {
    const input: string = 'node=';

    expect((): {nodeAlias: NodeAlias; filePath: string}[] =>
      // @ts-expect-error - TS2341: to access private property
      certificateManager.parseAndValidate(input, 'testing'),
    ).to.throw(SoloError, 'Failed to parse testing input');
  });

  it('should throw if and error if type is not valid', (): void => {
    const input: string = 'node=/invalid/path';

    expect((): {nodeAlias: NodeAlias; filePath: string}[] =>
      // @ts-expect-error - TS2341: to access private property
      certificateManager.parseAndValidate(input, 'testing'),
    ).to.throw(SoloError, 'Certificate file not found at path');
  });
});
