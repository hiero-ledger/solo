// SPDX-License-Identifier: Apache-2.0

import sinon, {type SinonStub} from 'sinon';
import {before, beforeEach, afterEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type DeploymentCommand} from '../../../src/commands/deployment.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {ValueContainer} from '../../../src/core/dependency-injection/value-container.js';
import {type InstanceOverrides} from '../../../src/core/dependency-injection/container-init.js';
import {K8Client} from '../../../src/integration/kube/k8-client/k8-client.js';
import {type Deployment} from '../../../src/business/runtime-state/config/local/deployment.js';

describe('DeploymentCommand unit tests', (): void => {
  type K8StubbedMethods = Pick<K8, 'namespaces' | 'configMaps' | 'contexts' | 'clusters' | 'leases'>;
  type K8FactoryStubbedMethods = K8Factory & {getK8: SinonStub; default: SinonStub};

  const namespace: NamespaceName = NamespaceName.of('solo-e2e');
  const deploymentName: string = 'deployment';

  const k8FactoryStub: K8Factory = sinon.stub() as unknown as K8Factory;
  let containerOverrides: InstanceOverrides;
  let realK8Factory: K8Factory;
  let namespacesStub: SinonStub;
  let configMapsStub: SinonStub;
  let k8Stub: K8StubbedMethods;

  before((): void => {
    realK8Factory = container.resolve(InjectTokens.K8Factory);
  });

  beforeEach(async (): Promise<void> => {
    namespacesStub = sinon.stub();
    configMapsStub = sinon.stub();
    k8Stub = {} as K8StubbedMethods;
    const factoryStubbed: K8FactoryStubbedMethods = k8FactoryStub as K8FactoryStubbedMethods;

    factoryStubbed.getK8 = sinon.stub().returns(k8Stub);
    factoryStubbed.default = sinon.stub().returns(k8Stub);
    k8Stub.namespaces = sinon.stub().returns({
      has: namespacesStub,
      list: sinon.stub().resolves([]),
    });
    k8Stub.configMaps = sinon.stub().returns({
      exists: configMapsStub,
      listForAllNamespaces: sinon.stub().resolves([]),
    });
    k8Stub.contexts = sinon.stub().returns({
      readCurrent: sinon
        .stub()
        .returns(new K8Client(undefined, realK8Factory.default().getKubectlExecutablePath()).contexts().readCurrent()),
    });
    k8Stub.clusters = sinon.stub().returns({
      readCurrent: sinon.stub().returns(realK8Factory.default().clusters().readCurrent()),
    });
    k8Stub.leases = sinon.stub().returns({
      read: sinon.stub().rejects(new Error('not found')),
      create: sinon.stub().resolves(),
      delete: sinon.stub().resolves(),
      update: sinon.stub().resolves(),
    });

    containerOverrides = new Map([[InjectTokens.K8Factory, new ValueContainer(InjectTokens.K8Factory, k8FactoryStub)]]);

    resetForTest(undefined, undefined, true, containerOverrides);
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('create() - stale local config detection', (): void => {
    it('should detect stale local config and clean up when namespace does not exist in cluster', async (): Promise<void> => {
      // The test data has a "deployment" entry with cluster-1 → context-1
      // Simulate namespace NOT existing in the cluster (stale local config scenario)
      namespacesStub.resolves(false);

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);
      const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);

      const argv: Argv = Argv.getDefaultArgv(namespace);
      argv.setArg(flags.deployment, deploymentName);
      argv.setArg(flags.namespace, namespace.name);

      // Should succeed - stale config is cleaned up automatically
      await expect(deploymentCommand.create(argv.build())).to.eventually.be.true;

      // Verify the deployment was re-created (still present in local config)
      await localConfig.load();
      const deployment: Deployment | undefined = localConfig.configuration.deployments.find(
        (d: Deployment): boolean => d.name === deploymentName,
      );
      expect(deployment).to.not.be.undefined;
      expect(deployment?.namespace).to.equal(namespace.name);
    });

    it('should detect stale local config and clean up when cluster connection fails', async (): Promise<void> => {
      // Simulate cluster connection failure (e.g., Kind cluster was deleted)
      k8Stub.namespaces = sinon.stub().returns({
        has: sinon.stub().rejects(new Error('connection refused - cluster no longer exists')),
        list: sinon.stub().rejects(new Error('connection refused')),
      });

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);

      const argv: Argv = Argv.getDefaultArgv(namespace);
      argv.setArg(flags.deployment, deploymentName);
      argv.setArg(flags.namespace, namespace.name);

      // Should succeed - stale config is cleaned up when cluster is unreachable
      await expect(deploymentCommand.create(argv.build())).to.eventually.be.true;
    });

    it('should throw "already exists" error when deployment genuinely exists in cluster', async (): Promise<void> => {
      // Simulate namespace AND remote config both existing (genuine deployment)
      namespacesStub.resolves(true);
      configMapsStub.resolves(true);

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);

      const argv: Argv = Argv.getDefaultArgv(namespace);
      argv.setArg(flags.deployment, deploymentName);
      argv.setArg(flags.namespace, namespace.name);

      // The outer error is "Error creating deployment" wrapping the actual cause
      await expect(deploymentCommand.create(argv.build())).to.be.rejectedWith('Error creating deployment');
    });

    it('should proceed normally when deployment does not exist in local config', async (): Promise<void> => {
      const newDeploymentName: string = 'brand-new-deployment';
      const newNamespace: NamespaceName = NamespaceName.of('brand-new-namespace');

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);

      const argv: Argv = Argv.getDefaultArgv(newNamespace);
      argv.setArg(flags.deployment, newDeploymentName);
      argv.setArg(flags.namespace, newNamespace.name);

      // Should succeed - new deployment, no conflict
      await expect(deploymentCommand.create(argv.build())).to.eventually.be.true;
    });
  });

  describe('create() - deployment with no cluster refs is treated as stale', (): void => {
    it('should clean up stale deployment with no cluster refs and create fresh', async (): Promise<void> => {
      // Manually add a deployment with no cluster refs to local config
      const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);
      await localConfig.load();
      const noClusterDeploymentName: string = 'no-cluster-deployment';
      const noClusterNamespace: NamespaceName = NamespaceName.of('no-cluster-ns');
      const staleDeployment: Deployment = localConfig.configuration.deployments.addNew();
      staleDeployment.name = noClusterDeploymentName;
      staleDeployment.namespace = noClusterNamespace.name;
      staleDeployment.realm = 0;
      staleDeployment.shard = 0;
      await localConfig.persist();

      const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);

      const argv: Argv = Argv.getDefaultArgv(noClusterNamespace);
      argv.setArg(flags.deployment, noClusterDeploymentName);
      argv.setArg(flags.namespace, noClusterNamespace.name);

      // Should succeed - deployment with no cluster refs is treated as stale
      await expect(deploymentCommand.create(argv.build())).to.eventually.be.true;
    });
  });
});
