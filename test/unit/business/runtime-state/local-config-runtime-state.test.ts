// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {DeploymentNotFoundError} from '../../../../src/business/errors/deployment-not-found-error.js';
import {getTemporaryDirectory} from '../../../test-utility.js';
import fs from 'node:fs';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {type Realm, type Shard} from '../../../../src/types/index.js';
import {type Deployment} from '../../../../src/business/runtime-state/config/local/deployment.js';
import {type BackedArrayList} from '../../../../src/business/runtime-state/collection/backed-array-list.js';
import {type DeploymentSchema} from '../../../../src/data/schema/model/local/deployment-schema.js';

describe('LocalConfigRuntimeState', () => {
  let runtimeState: LocalConfigRuntimeState;
  let basePath: string;
  const testFileName: string = 'local-config.yaml';

  async function createDeployment(): Promise<void> {
    const deployment: Deployment = runtimeState.configuration.deployments.addNew();
    deployment.name = 'deployment-1';
    deployment.namespace = 'namespace-1';
    deployment.realm = 1;
    deployment.shard = 2;
    await runtimeState.persist();
    await runtimeState.load();
  }

  beforeEach((): void => {
    basePath = getTemporaryDirectory();
    runtimeState = new LocalConfigRuntimeState(basePath, testFileName);
  });

  it('should create a new configuration file', async (): Promise<void> => {
    await runtimeState.persist();
    expect(fs.existsSync(PathEx.join(basePath, testFileName))).to.be.true;
    expect(fs.readFileSync(PathEx.join(basePath, testFileName), 'utf8')).to.not.be.empty;
  });

  it('should load configuration successfully', async (): Promise<void> => {
    await runtimeState.persist();
    await runtimeState.load();
    expect(fs.existsSync(PathEx.join(basePath, testFileName))).to.be.true;
    expect(fs.readFileSync(PathEx.join(basePath, testFileName), 'utf8')).to.not.be.empty;
  });

  it('should return deployments', async (): Promise<void> => {
    await createDeployment();
    const deployments: BackedArrayList<Deployment, DeploymentSchema> = runtimeState.configuration.deployments;

    expect(deployments.find((d: Deployment): boolean => d.name === 'deployment-1')).to.not.be.undefined;
  });

  it('should throw DeploymentNotFoundError if deployment is not found', async (): Promise<void> => {
    expect((): Deployment => runtimeState.configuration.deploymentByName('non-existent-deployment')).to.throw(
      DeploymentNotFoundError,
    );
  });

  it('should return the realm of a deployment', async (): Promise<void> => {
    await createDeployment();
    const realm: Realm = runtimeState.configuration.realmForDeployment('deployment-1');
    expect(realm).to.equal(1);
  });

  it('should return the shard of a deployment', async (): Promise<void> => {
    await createDeployment();
    const shard: Shard = runtimeState.configuration.shardForDeployment('deployment-1');
    expect(shard).to.equal(2);
  });
});
