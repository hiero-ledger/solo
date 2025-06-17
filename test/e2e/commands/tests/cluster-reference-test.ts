// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {main} from '../../../../src/index.js';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type FacadeMap} from '../../../../src/business/runtime-state/collection/facade-map.js';
import {type StringFacade} from '../../../../src/business/runtime-state/facade/string-facade.js';
import {type ClusterReferenceName} from '../../../../src/types/index.js';
import {Flags} from '../../../../src/commands/flags.js';
import {container} from 'tsyringe-neo';
import {expect} from 'chai';

export class ClusterReferenceTest extends BaseCommandTest {
  private soloClusterReferenceConnectArgv(clusterReference: ClusterReferenceName, context: string): string[] {
    const {newArgv, optionFromFlag, argvPushGlobalFlags} = this;

    const argv: string[] = newArgv();
    argv.push(
      'cluster-ref',
      'connect',
      optionFromFlag(Flags.clusterRef),
      clusterReference,
      optionFromFlag(Flags.context),
      context,
    );
    argvPushGlobalFlags(argv);
    return argv;
  }

  public connect(): void {
    const {testName, testLogger, clusterReferences, clusterReferenceNameArray, contexts} = this.options;
    const {soloClusterReferenceConnectArgv} = this;

    it(`${testName}: solo cluster-ref connect`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo cluster-ref connect`);
      for (const [clusterReferenceName, context] of clusterReferences.entries()) {
        await main(soloClusterReferenceConnectArgv(clusterReferenceName, context));
      }
      const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
        InjectTokens.LocalConfigRuntimeState,
      );
      const clusterReferencesActual: FacadeMap<string, StringFacade, string> = localConfig.configuration.clusterRefs;
      expect(clusterReferencesActual.get(clusterReferenceNameArray[0])?.toString()).to.equal(contexts[0]);
      expect(clusterReferencesActual.get(clusterReferenceNameArray[1])?.toString()).to.equal(contexts[1]);
      testLogger.info(`${testName}: finished solo cluster-ref connect`);
    });
  }

  private soloClusterReferenceSetup(clusterReference: ClusterReferenceName): string[] {
    const {newArgv, optionFromFlag, argvPushGlobalFlags} = this;

    const argv: string[] = newArgv();
    argv.push('cluster-ref', 'setup', optionFromFlag(Flags.clusterRef), clusterReference);
    argvPushGlobalFlags(argv, false, true);
    return argv;
  }

  public setup(): void {
    const {testName, testLogger, clusterReferenceNameArray} = this.options;
    const {soloClusterReferenceSetup} = this;
    const soloClusterReferenceSetupBound: (clusterReferenceName: ClusterReferenceName) => string[] =
      soloClusterReferenceSetup.bind(this);

    it(`${testName}: solo cluster-ref setup`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo cluster-ref setup`);
      for (const clusterReferenceName of clusterReferenceNameArray) {
        await main(soloClusterReferenceSetupBound(clusterReferenceName));
      }
      testLogger.info(`${testName}: finishing solo cluster-ref setup`);
    });
  }
}
