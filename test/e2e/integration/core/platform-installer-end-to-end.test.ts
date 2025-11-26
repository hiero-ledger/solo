// SPDX-License-Identifier: Apache-2.0

import {after, before, describe, it} from 'mocha';
import {expect} from 'chai';
import sinon from 'sinon';
import {endToEndTestSuite, getTestCacheDirectory, getTestCluster, getTestLogger} from '../../../test-utility.js';

import * as fs from 'node:fs';
import * as version from '../../../../version.js';
import * as constants from '../../../../src/core/constants.js';

import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../../../../src/integration/kube/resources/container/container-reference.js';
import {Argv} from '../../../helpers/argv-wrapper.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {type AccountManager} from '../../../../src/core/account-manager.js';
import {type PlatformInstaller} from '../../../../src/core/platform-installer.js';
import {type NetworkCommand} from '../../../../src/commands/network.js';

const defaultTimeout: number = Duration.ofSeconds(20).toMillis();

const namespace: NamespaceName = NamespaceName.of('pkg-installer-e2e');
const argv: Argv = Argv.getDefaultArgv(namespace);
const testCacheDirectory: string = getTestCacheDirectory();
argv.setArg(flags.cacheDir, testCacheDirectory);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);

const networkCmd: NetworkCommand = container.resolve<NetworkCommand>(InjectTokens.NetworkCommand);

// @ts-expect-error - to mock
networkCmd.ensurePodLogsCrd = sinon.stub().resolves();

endToEndTestSuite(namespace.name, argv, {startNodes: false, networkCmdArg: networkCmd}, ({opts}): void => {
  describe('Platform Installer E2E', async (): Promise<void> => {
    let k8Factory: K8Factory;
    let accountManager: AccountManager;
    let installer: PlatformInstaller;
    const podName: PodName = PodName.of('network-node1-0');
    const podReference: PodReference = PodReference.of(namespace, podName);
    const packageVersion: string = 'v0.42.5';

    before((): void => {
      k8Factory = opts.k8Factory;
      accountManager = opts.accountManager;
      installer = opts.platformInstaller;
    });

    after(async function (): Promise<void> {
      this.timeout(Duration.ofMinutes(3).toMillis());

      await k8Factory.default().namespaces().delete(namespace);
      await accountManager.close();
    });

    before(function (): void {
      this.timeout(defaultTimeout);

      if (!fs.existsSync(testCacheDirectory)) {
        fs.mkdirSync(testCacheDirectory);
      }
    });

    describe('fetchPlatform', (): void => {
      it('should fail with invalid pod', async (): Promise<void> => {
        try {
          await installer.fetchPlatform(undefined, packageVersion);
          throw new Error('fail-safe, should not reach here');
        } catch (error) {
          expect(error.message).to.include('podReference is required');
        }

        try {
          await installer.fetchPlatform(
            PodReference.of(NamespaceName.of('valid-namespace'), PodName.of('INVALID_POD')),
            packageVersion,
          );
          throw new Error('fail-safe, should not reach here');
        } catch (error) {
          expect(error.message).to.include('must be a valid RFC-1123 DNS label');
        }
      }).timeout(defaultTimeout);

      it('should fail with invalid tag', async (): Promise<void> => {
        try {
          await installer.fetchPlatform(podReference, 'INVALID');
          throw new Error('fail-safe, should not reach here');
        } catch (error) {
          expect(error).to.be.instanceOf(SoloError);
        }
      }).timeout(defaultTimeout);

      it('should succeed with valid tag and pod', async (): Promise<void> => {
        expect(await installer.fetchPlatform(podReference, packageVersion)).to.be.true;
        const outputs: string = await k8Factory
          .default()
          .containers()
          .readByRef(ContainerReference.of(podReference, constants.ROOT_CONTAINER))
          .execContainer(`ls -la ${constants.HEDERA_HAPI_PATH}`);

        getTestLogger().showUser(outputs);
      }).timeout(Duration.ofMinutes(1).toMillis());
    });
  });
});
