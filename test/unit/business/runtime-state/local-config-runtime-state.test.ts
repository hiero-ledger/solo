// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {LocalConfigRuntimeState} from '../../../../src/business/runtime-state/local-config-runtime-state.js';
import {DeploymentNotFoundError} from '../../../../src/business/errors/deployment-not-found-error.js';
import {YamlFileStorageBackend} from '../../../../src/data/backend/impl/yaml-file-storage-backend.js';
import {LocalConfigSource} from '../../../../src/data/configuration/impl/local-config-source.js';
import {UserIdentity} from '../../../../src/data/schema/model/common/user-identity.js';
import {LocalConfig} from '../../../../src/data/schema/model/local/local-config.js';
import {ReadLocalConfigBeforeLoadError} from '../../../../src/business/errors/read-local-config-before-load-error.js';
import {WriteLocalConfigBeforeLoadError} from '../../../../src/business/errors/write-local-config-before-load-error.js';
import {type Deployment} from '../../../../src/data/schema/model/local/deployment.js';

describe('LocalConfigRuntimeState', () => {
  let sandbox: sinon.SinonSandbox;
  let mockedBackend: sinon.SinonStubbedInstance<YamlFileStorageBackend>;
  let mockedSource: sinon.SinonStubbedInstance<LocalConfigSource>;
  let runtimeState: LocalConfigRuntimeState;
  const testBasePath: string = 'test/data/tmp';
  const testFileName: string = 'local-config.yaml';

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockedBackend = sandbox.createStubInstance(YamlFileStorageBackend);
    mockedSource = sandbox.createStubInstance(LocalConfigSource);

    runtimeState = new LocalConfigRuntimeState(testBasePath, testFileName);

    // Inject mocks
    // @ts-expect-error Accessing private property for testing
    runtimeState.backend = mockedBackend;
    // @ts-expect-error Accessing private property for testing
    runtimeState.source = mockedSource;
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should throw an error if accessed before loading', async () => {
    expect(() => runtimeState.userIdentity).to.throw(ReadLocalConfigBeforeLoadError);
    expect(() => runtimeState.versions).to.throw(ReadLocalConfigBeforeLoadError);
    expect(() => runtimeState.deployments).to.throw(ReadLocalConfigBeforeLoadError);
    await expect(runtimeState.modify(async (): Promise<void> => {})).to.be.rejectedWith(
      WriteLocalConfigBeforeLoadError,
    );
  });

  it('should load configuration successfully', async () => {
    mockedBackend.readObject.resolves({});
    mockedSource.refresh.resolves();
    mockedSource.persist.resolves();

    await runtimeState.load();

    sinon.assert.calledOnce(mockedSource.refresh);
    sinon.assert.calledOnce(mockedSource.persist);
  });

  it('should create a new configuration file if it does not exist', async () => {
    mockedBackend.readObject.rejects(new Error('File not found'));
    mockedBackend.writeObject.resolves();

    await runtimeState.load();

    sinon.assert.calledOnce(mockedBackend.writeObject);
    sinon.assert.calledWith(mockedBackend.writeObject, testFileName, {});
  });

  it('should return deployments', async () => {
    // @ts-expect-error Accessing private property for testing
    mockedSource.modelData = new LocalConfig(null, null, [{name: 'deployment-1'}]);
    // @ts-expect-error Accessing private property for testing
    mockedSource.properties.returns(true);
    // @ts-expect-error Accessing private property for testing
    const deployments: Deployment[] = runtimeState.deployments;

    expect(deployments).to.deep.equal([{name: 'deployment-1'}]);
  });

  it('should throw DeploymentNotFoundError if deployment is not found', async () => {
    // @ts-expect-error Accessing private property for testing
    mockedSource.modelData = new LocalConfig(null, null, []);
    // @ts-expect-error Accessing private property for testing
    mockedSource.properties.returns(true);
    expect(() => runtimeState.getDeployment('non-existent-deployment')).to.throw(DeploymentNotFoundError);
  });

  it('should modify configuration data', async () => {
    mockedSource.persist.resolves();
    // @ts-expect-error Accessing private property for testing
    mockedSource.properties.returns(true);
    // @ts-expect-error Accessing private property for testing
    mockedSource.modelData = new LocalConfig();
    await runtimeState.modify(async (data: LocalConfig) => {
      data.userIdentity = new UserIdentity('john', 'doe');
    });

    sinon.assert.calledOnce(mockedSource.persist);
  });

  it('should check if config file exists', async () => {
    mockedBackend.readObject.resolves({});
    const exists: boolean = await runtimeState.configFileExists();
    expect(exists).to.be.true;
    sinon.assert.calledOnce(mockedBackend.readObject);
    sinon.assert.calledWith(mockedBackend.readObject, testFileName);
  });

  it('should return the realm of a deployment', () => {
    // @ts-expect-error Accessing private property for testing
    mockedSource.modelData = new LocalConfig(null, null, [{name: 'deployment-1', realm: 1}]);
    // @ts-expect-error Accessing private property for testing
    mockedSource.properties.returns(true);

    const realm = runtimeState.getRealm('deployment-1');
    expect(realm).to.equal(1);
  });

  it('should return the shard of a deployment', () => {
    // @ts-expect-error Accessing private property for testing
    mockedSource.modelData = new LocalConfig(null, null, [{name: 'deployment-1', shard: 2}]);
    // @ts-expect-error Accessing private property for testing
    mockedSource.properties.returns(true);

    const shard = runtimeState.getShard('deployment-1');
    expect(shard).to.equal(2);
  });

  it('should create a new configuration file', async () => {
    mockedBackend.writeObject.resolves();

    await runtimeState.create();

    sinon.assert.calledOnce(mockedBackend.writeObject);
    sinon.assert.calledWith(mockedBackend.writeObject, testFileName, {});
  });
});
