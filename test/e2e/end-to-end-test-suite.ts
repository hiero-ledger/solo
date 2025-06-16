// SPDX-License-Identifier: Apache-2.0

import {type Suite} from 'mocha';
import {type NamespaceName} from '../../src/types/namespace/namespace-name.js';
import {type DeploymentName} from '../../src/types/index.js';

export class EndToEndTestSuite {
  public constructor(
    public readonly testName: string,
    public readonly testSuiteName: string,
    public readonly testSuiteCallback: () => void,
    public readonly namespace: NamespaceName,
    public readonly deployment: DeploymentName,
  ) {}
  public testSuite(): Suite {
    return describe(this.testSuiteName, function endToEndTestSuiteDescribe(): void {
      this.bail(true);
    });
  }
}
