// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../src/types/namespace/namespace-name.js';
import {type ClusterReferenceName, type ClusterReferences, type DeploymentName} from '../../src/types/index.js';
import {getTestCacheDirectory, getTestCluster, HEDERA_PLATFORM_VERSION_TAG} from '../test-utility.js';
import {type SoloLogger} from '../../src/core/logging/solo-logger.js';
import {InjectTokens} from '../../src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {Suite} from 'mocha';

export class EndToEndTestSuite extends Suite {
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

  public constructor(
    public readonly testName: string,
    public readonly testSuiteName: string,
    public readonly namespace: NamespaceName,
    public readonly deployment: DeploymentName,
    public readonly clusterCount: number,
    public readonly testSuiteCallback: (endToEndTestSuite: EndToEndTestSuite) => void,
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
      this.clusterReferenceNameArray.push(testClusterReferenceNames[1], secondContext);
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
  }

  public runTestSuite(): Suite {
    return describe(this.testSuiteName, function endToEndTestSuite(this: EndToEndTestSuite): void {
      this.bail(true);
      this.testSuiteCallback(this);
    });
  }
}
