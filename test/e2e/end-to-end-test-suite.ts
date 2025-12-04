// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../src/types/namespace/namespace-name.js';
import {type ClusterReferenceName, type ClusterReferences, type DeploymentName} from '../../src/types/index.js';
import {getTestCacheDirectory, getTestCluster, HEDERA_PLATFORM_VERSION_TAG} from '../test-utility.js';
import {type SoloLogger} from '../../src/core/logging/solo-logger.js';
import {InjectTokens} from '../../src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {Suite} from 'mocha';
import {type BaseTestOptions} from './commands/tests/base-test-options.js';

export class EndToEndTestSuite extends Suite {
  private readonly endToEndTestSuiteInstance: EndToEndTestSuite;
  public readonly testCacheDirectory: string;
  public readonly contexts: string[];
  public readonly testLogger: SoloLogger;
  public readonly createdAccountIds: string[] = [];
  public readonly enableLocalBuildPathTesting: boolean =
    process.env.SOLO_LOCAL_BUILD_PATH_TESTING?.toLowerCase() === 'true';
  public readonly localBuildPath: string =
    process.env.SOLO_LOCAL_BUILD_PATH || '../hiero-consensus-node/hedera-node/data';
  public readonly localBuildReleaseTag: string =
    process.env.SOLO_LOCAL_BUILD_RELEASE_TAG || HEDERA_PLATFORM_VERSION_TAG;
  public readonly clusterReferenceNameArray: ClusterReferenceName[] = [];
  public readonly clusterReferences: ClusterReferences = new Map<string, string>();
  public readonly options: BaseTestOptions;

  public constructor(
    public readonly testName: string,
    public readonly testSuiteName: string,
    public readonly namespace: NamespaceName,
    public readonly deployment: DeploymentName,
    public readonly clusterCount: number,
    public readonly consensusNodesCount: number,
    public readonly loadBalancerEnabled: boolean,
    public readonly pinger: boolean,
    public readonly realm: number = 0,
    public readonly shard: number = 0,
    public readonly serviceMonitor: boolean = false,
    public readonly podLog: boolean = false,
    public readonly minimalSetup: boolean = false,
    public readonly releaseTag: string = HEDERA_PLATFORM_VERSION_TAG,
    public readonly testSuiteCallback: (options: BaseTestOptions) => void,
  ) {
    super(testName);
    const soloTestClusterName: string = getTestCluster();
    const testClusterName: string =
      soloTestClusterName.includes('c1') || soloTestClusterName.includes('c2')
        ? soloTestClusterName
        : `${soloTestClusterName}-c1`;
    const testClusterReferenceNames: ClusterReferenceName[] = ['e2e-cluster-alpha', 'e2e-cluster-beta'];

    if (clusterCount === 1) {
      this.clusterReferences.set(testClusterReferenceNames[0], testClusterName);
      this.contexts = [testClusterName];
      this.clusterReferenceNameArray.push(testClusterReferenceNames[0]);
    } else if (clusterCount === 2) {
      this.clusterReferences.set(testClusterReferenceNames[0], testClusterName);
      const secondContext: string = `${testClusterName.replace(soloTestClusterName.includes('-c1') ? '-c1' : '-c2', soloTestClusterName.includes('-c1') ? '-c2' : '-c1')}`;
      this.clusterReferences.set(testClusterReferenceNames[1], secondContext);
      this.clusterReferenceNameArray.push(testClusterReferenceNames[0], testClusterReferenceNames[1]);
      this.contexts = [testClusterName, secondContext];
    } else {
      throw new Error(`Unsupported cluster count: ${clusterCount}. Only 1 or 2 clusters are supported.`);
    }

    const testClusterReferences: ClusterReferences = new Map<string, string>();
    for (let index: number = 0; index < clusterCount; index++) {
      testClusterReferences.set(testClusterReferenceNames[index], this.contexts[index]);
    }
    this.testCacheDirectory = getTestCacheDirectory(testName);

    this.testLogger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);
    this.endToEndTestSuiteInstance = this;
    this.options = {
      testName,
      testLogger: this.testLogger,
      clusterReferences: this.clusterReferences,
      clusterReferenceNameArray: this.clusterReferenceNameArray,
      contexts: this.contexts,
      deployment,
      namespace,
      testCacheDirectory: this.testCacheDirectory,
      enableLocalBuildPathTesting: this.enableLocalBuildPathTesting,
      localBuildReleaseTag: this.localBuildReleaseTag,
      localBuildPath: this.localBuildPath,
      createdAccountIds: this.createdAccountIds,
      consensusNodesCount: this.consensusNodesCount,
      loadBalancerEnabled: this.loadBalancerEnabled,
      pinger: this.pinger,
      realm: this.realm,
      shard: this.shard,
      serviceMonitor: this.serviceMonitor,
      podLog: this.podLog,
      minimalSetup: this.minimalSetup,
      releaseTag: this.releaseTag,
    } as BaseTestOptions;
  }

  public runTestSuite(): void {
    const endToEndTestSuiteInstance: EndToEndTestSuite = this.endToEndTestSuiteInstance;
    describe(endToEndTestSuiteInstance.testSuiteName, function endToEndTestSuiteCallback(): void {
      this.bail(true);
      endToEndTestSuiteInstance.testSuiteCallback(endToEndTestSuiteInstance.options);
    });
  }
}
