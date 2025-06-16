// SPDX-License-Identifier: Apache-2.0

import {EndToEndTestSuite} from './end-to-end-test-suite.js';
import {NamespaceName} from '../../src/types/namespace/namespace-name.js';
import {type DeploymentName} from '../../src/types/index.js';

export class EndToEndTestSuiteBuilder {
  private testName: string;
  private testSuiteName: string;
  private testSuiteCallback: () => void;
  private namespace: NamespaceName;
  private deployment: DeploymentName;

  public withTestName(testName: string): this {
    this.testName = testName;
    return this;
  }

  public withTestSuiteName(testSuiteName: string): this {
    this.testSuiteName = testSuiteName;
    return this;
  }

  public withTestSuiteCallback(testSuiteCallback: () => void): this {
    this.testSuiteCallback = testSuiteCallback;
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

  public build(): EndToEndTestSuite {
    if (!this.testName || !this.testSuiteName || !this.testSuiteCallback) {
      throw new Error('Missing required properties to build EndToEndTestSuite');
    }
    return new EndToEndTestSuite(
      this.testName,
      this.testSuiteName,
      this.testSuiteCallback,
      this.namespace,
      this.deployment,
    );
  }
}
