// SPDX-License-Identifier: Apache-2.0

import {EndToEndTestSuite} from './end-to-end-test-suite.js';
import {NamespaceName} from '../../src/types/namespace/namespace-name.js';
import {type DeploymentName} from '../../src/types/index.js';

export class EndToEndTestSuiteBuilder {
  private testName: string;
  private testSuiteName: string;
  private namespace: NamespaceName;
  private deployment: DeploymentName;
  private clusterCount: number;
  private consensusNodesCount: number;
  private loadBalancerEnabled: boolean;
  private pinger: boolean;
  private realm: number;
  private shard: number;

  private testSuiteCallback: (endToEndTestSuite: EndToEndTestSuite) => void;

  public withTestName(testName: string): this {
    this.testName = testName;
    return this;
  }

  public withTestSuiteName(testSuiteName: string): this {
    this.testSuiteName = testSuiteName;
    return this;
  }

  public withNamespace(namespace: string): this {
    this.namespace = NamespaceName.of(namespace);
    return this;
  }

  public withDeployment(deployment: DeploymentName): this {
    this.deployment = deployment;
    return this;
  }

  public withClusterCount(clusterCount: number): this {
    this.clusterCount = clusterCount;
    return this;
  }

  public withConsensusNodesCount(consensusNodesCount: number): this {
    this.consensusNodesCount = consensusNodesCount;
    return this;
  }

  public withLoadBalancerEnabled(loadBalancerEnabled: boolean): this {
    this.loadBalancerEnabled = loadBalancerEnabled;
    return this;
  }

  public withPinger(pinger: boolean): this {
    this.pinger = pinger;
    return this;
  }

  withRealm(realm: number): this {
    this.realm = realm;
    return this;
  }

  withShard(shard: number): this {
    this.shard = shard;
    return this;
  }

  public withTestSuiteCallback(testSuiteCallback: (endToEndTestSuite: EndToEndTestSuite) => void): this {
    this.testSuiteCallback = testSuiteCallback;
    return this;
  }

  public build(): EndToEndTestSuite {
    if (!this.testName || !this.testSuiteName || !this.testSuiteCallback) {
      throw new Error('Missing required properties to build EndToEndTestSuite');
    }
    return new EndToEndTestSuite(
      this.testName,
      this.testSuiteName,
      this.namespace,
      this.deployment,
      this.clusterCount || 1, // Default to 1 if not specified
      this.consensusNodesCount || 1,
      this.loadBalancerEnabled || false,
      this.pinger || false,
      this.realm || 0,
      this.shard || 0,
      this.testSuiteCallback,
    );
  }
}
