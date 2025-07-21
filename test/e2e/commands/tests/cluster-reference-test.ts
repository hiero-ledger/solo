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
import {type BaseTestOptions} from './base-test-options.js';
import {ClusterReferenceCommandDefinition} from '../../../../src/commands/command-definitions/cluster-reference-command-definition.js';

export class ClusterReferenceTest extends BaseCommandTest {
  private static soloClusterReferenceConnectArgv(
    testName: string,
    clusterReference: ClusterReferenceName,
    context: string,
  ): string[] {
    const {newArgv, optionFromFlag, argvPushGlobalFlags} = ClusterReferenceTest;

    const argv: string[] = newArgv();
    argv.push(
      ClusterReferenceCommandDefinition.COMMAND_NAME,
      ClusterReferenceCommandDefinition.CONFIG_SUBCOMMAND_NAME,
      ClusterReferenceCommandDefinition.CONFIG_CONNECT,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
      optionFromFlag(Flags.context),
      context,
    );
    argvPushGlobalFlags(argv, testName);
    return argv;
  }

  public static connect(options: BaseTestOptions): void {
    const {testName, testLogger, clusterReferences, clusterReferenceNameArray, contexts} = options;
    const {soloClusterReferenceConnectArgv} = ClusterReferenceTest;

    it(`${testName}: solo cluster-ref config connect`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo cluster-ref config connect`);
      for (const [clusterReferenceName, context] of clusterReferences.entries()) {
        await main(soloClusterReferenceConnectArgv(testName, clusterReferenceName, context));
      }
      const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
        InjectTokens.LocalConfigRuntimeState,
      );
      const clusterReferencesActual: FacadeMap<string, StringFacade, string> = localConfig.configuration.clusterRefs;
      expect(clusterReferencesActual.get(clusterReferenceNameArray[0])?.toString()).to.equal(contexts[0]);
      expect(clusterReferencesActual.get(clusterReferenceNameArray[1])?.toString()).to.equal(contexts[1]);
      testLogger.info(`${testName}: finished solo cluster-ref config connect`);
    });
  }

  private static soloClusterReferenceSetup(testName: string, clusterReference: ClusterReferenceName): string[] {
    const {newArgv, optionFromFlag, argvPushGlobalFlags} = ClusterReferenceTest;

    const argv: string[] = newArgv();
    argv.push(
      ClusterReferenceCommandDefinition.COMMAND_NAME,
      ClusterReferenceCommandDefinition.CONFIG_SUBCOMMAND_NAME,
      ClusterReferenceCommandDefinition.CONFIG_SETUP,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
    );
    argvPushGlobalFlags(argv, testName, false, true);
    return argv;
  }

  public static setup(options: BaseTestOptions): void {
    const {testName, testLogger, clusterReferenceNameArray} = options;
    const {soloClusterReferenceSetup} = ClusterReferenceTest;

    it(`${testName}: solo cluster-ref config setup`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning solo cluster-ref config setup`);
      for (const clusterReferenceName of clusterReferenceNameArray) {
        await main(soloClusterReferenceSetup(testName, clusterReferenceName));
      }
      // TODO add some verification that the setup was successful
      testLogger.info(`${testName}: finishing solo cluster-ref config setup`);
    });
  }
}
