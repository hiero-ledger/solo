// SPDX-License-Identifier: Apache-2.0

import sinon, {type SinonStub} from 'sinon';
import {describe, it, beforeEach} from 'mocha';
import {expect} from 'chai';
import * as Base64 from 'js-base64';

import {RelayCommand} from '../../../src/commands/relay.js';
import {SecretType} from '../../../src/integration/kube/resources/secret/secret-type.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import * as constants from '../../../src/core/constants.js';
import {type Secret} from '../../../src/integration/kube/resources/secret/secret.js';

describe('RelayCommand unit tests', (): void => {
  const namespace: NamespaceName = NamespaceName.of('relay-cmd-unit');
  const context: string = 'relay-cmd-unit-context';
  const releaseName: string = 'relay-0';
  const operatorSecretName: string = `${releaseName}-operator`;

  let instance: RelayCommand;
  let secretsListStub: SinonStub;
  let secretsCreateOrReplaceStub: SinonStub;
  let loggerStub: {info: SinonStub; debug: SinonStub};

  function baseConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      valuesFile: undefined,
      nodeAliases: ['node1'],
      chainId: undefined,
      relayReleaseTag: undefined,
      replicaCount: undefined,
      operatorId: '0.0.2',
      operatorKey: undefined,
      namespace,
      domainName: undefined,
      context,
      releaseName,
      deployment: 'deployment',
      mirrorNamespace: 'mirror-ns',
      ...overrides,
    };
  }

  beforeEach((): void => {
    secretsListStub = sinon.stub().resolves([]);
    secretsCreateOrReplaceStub = sinon.stub().resolves(true);
    loggerStub = {info: sinon.stub(), debug: sinon.stub()};

    const secretsStub: object = {
      list: secretsListStub,
      createOrReplace: secretsCreateOrReplaceStub,
    };
    const k8Stub: object = {secrets: sinon.stub().returns(secretsStub)};
    const k8FactoryStub: object = {getK8: sinon.stub().returns(k8Stub)};

    instance = Object.create(RelayCommand.prototype) as RelayCommand;
    (instance as unknown as {k8Factory: object}).k8Factory = k8FactoryStub;
    (instance as unknown as {logger: object}).logger = loggerStub;

    sinon
      .stub(instance as unknown as {prepareNetworkJsonString: () => Promise<string>}, 'prepareNetworkJsonString')
      .resolves('{}');
  });

  it('never passes operator id or key via helm --set, and creates a k8s secret instead', async (): Promise<void> => {
    const operatorKey: string = 'test-operator-key';
    const config: Record<string, unknown> = baseConfig({operatorKey});

    const valuesArgument: string = await (
      instance as unknown as {prepareValuesArgForRelay: (config: Record<string, unknown>) => Promise<string>}
    ).prepareValuesArgForRelay(config);

    expect(valuesArgument).to.not.include('OPERATOR_ID_MAIN=0.0.2');
    expect(valuesArgument).to.not.include(`OPERATOR_KEY_MAIN=${operatorKey}`);
    expect(valuesArgument).to.not.include('relay.config.OPERATOR_ID_MAIN');
    expect(valuesArgument).to.not.include('relay.config.OPERATOR_KEY_MAIN');
    expect(valuesArgument).to.not.include('ws.config.OPERATOR_ID_MAIN');
    expect(valuesArgument).to.not.include('ws.config.OPERATOR_KEY_MAIN');
    expect(valuesArgument).to.not.include(operatorKey);

    expect(valuesArgument).to.include(`--set relay.existingSecret=${operatorSecretName}`);
    expect(valuesArgument).to.include(`--set ws.existingSecret=${operatorSecretName}`);

    expect(secretsCreateOrReplaceStub.calledOnce).to.be.true;
    const [calledNamespace, calledName, calledType, calledData] = secretsCreateOrReplaceStub.firstCall.args as [
      NamespaceName,
      string,
      SecretType,
      Record<string, string>,
    ];
    expect(calledNamespace).to.equal(namespace);
    expect(calledName).to.equal(operatorSecretName);
    expect(calledType).to.equal(SecretType.OPAQUE);
    expect(calledData.OPERATOR_ID_MAIN).to.equal(Base64.encode('0.0.2'));
    expect(calledData.OPERATOR_KEY_MAIN).to.equal(Base64.encode(operatorKey));
  });

  it('uses the operator key from an existing k8s secret when the flag is not provided', async (): Promise<void> => {
    const existingKey: string = 'key-from-secret';
    const foundSecret: Secret = {
      data: {privateKey: Base64.encode(existingKey)},
      name: 'account-secret',
      namespace: namespace.name,
      type: SecretType.OPAQUE,
      labels: {},
    };
    secretsListStub.resolves([foundSecret]);

    const config: Record<string, unknown> = baseConfig();

    const valuesArgument: string = await (
      instance as unknown as {prepareValuesArgForRelay: (config: Record<string, unknown>) => Promise<string>}
    ).prepareValuesArgForRelay(config);

    expect(valuesArgument).to.not.include(existingKey);

    const calledData: Record<string, string> = secretsCreateOrReplaceStub.firstCall.args[3];
    expect(calledData.OPERATOR_KEY_MAIN).to.equal(Base64.encode(existingKey));
  });

  it('falls back to the default operator key when no flag or k8s secret is available', async (): Promise<void> => {
    const config: Record<string, unknown> = baseConfig();

    await (
      instance as unknown as {prepareValuesArgForRelay: (config: Record<string, unknown>) => Promise<string>}
    ).prepareValuesArgForRelay(config);

    const calledData: Record<string, string> = secretsCreateOrReplaceStub.firstCall.args[3];
    expect(calledData.OPERATOR_KEY_MAIN).to.equal(Base64.encode(constants.OPERATOR_KEY));
  });
});
