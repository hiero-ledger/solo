// SPDX-License-Identifier: Apache-2.0

import {after, describe} from 'mocha';
import {expect} from 'chai';
import each from 'mocha-each';

import {Flags as flags} from '../../../src/commands/flags.js';
import {
  type BootstrapResponse,
  endToEndTestSuite,
  getTestCluster,
  HEDERA_PLATFORM_VERSION_TAG,
  hederaPlatformSupportsNonZeroRealms,
} from '../../test-utility.js';
import * as version from '../../../version.js';
import {sleep} from '../../../src/core/helpers.js';
import {type RelayCommand} from '../../../src/commands/relay.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {type ArgvStruct} from '../../../src/types/aliases.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {RelayCommandDefinition} from '../../../src/commands/command-definitions/relay-command-definition.js';

const testName: string = 'relay-cmd-e2e';
const namespace: NamespaceName = NamespaceName.of(testName);
const argv: Argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);
argv.setArg(flags.relayReleaseTag, flags.relayReleaseTag.definition.defaultValue);

argv.setArg(flags.realm, hederaPlatformSupportsNonZeroRealms() ? 1 : 0);
argv.setArg(flags.shard, 0);

endToEndTestSuite(testName, argv, {}, (bootstrapResp: BootstrapResponse): void => {
  const {
    opts: {k8Factory, logger, commandInvoker},
  } = bootstrapResp;

  describe('RelayCommand', async (): Promise<void> => {
    let relayCommand: RelayCommand;
    const testLogger: SoloLogger = container.resolve(InjectTokens.SoloLogger);

    before(() => {
      relayCommand = container.resolve(InjectTokens.RelayCommand);
    });

    afterEach(async (): Promise<void> => {
      // wait for k8s to finish destroying containers from relay node destroy
      await sleep(Duration.ofMillis(5));
    });

    after(async function (): Promise<void> {
      this.timeout(Duration.ofMinutes(5).toMillis());
      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    });

    each(['node1', 'node1,node2']).describe(
      'relay and deploy and destroy for each',
      async (relayNodes: string): Promise<void> => {
        it(`relay node add and destroy should work with ${relayNodes}`, async function (): Promise<void> {
          testLogger.info(`#### Running relay node add for: ${relayNodes} ####`);
          this.timeout(Duration.ofMinutes(5).toMillis());

          argv.setArg(flags.nodeAliasesUnparsed, relayNodes);

          try {
            await commandInvoker.invoke({
              argv: argv,
              command: RelayCommandDefinition.COMMAND_NAME,
              subcommand: RelayCommandDefinition.NODE_SUBCOMMAND_NAME,
              action: RelayCommandDefinition.NODE_ADD,
              callback: async (argv: ArgvStruct): Promise<boolean> => relayCommand.add(argv),
            });
          } catch (error) {
            logger.showUserError(error);
            expect.fail();
          }
          await sleep(Duration.ofMillis(500));

          testLogger.info(`#### Running relay node destroy for: ${relayNodes} ####`);
          try {
            await commandInvoker.invoke({
              argv: argv,
              command: RelayCommandDefinition.COMMAND_NAME,
              subcommand: RelayCommandDefinition.NODE_SUBCOMMAND_NAME,
              action: RelayCommandDefinition.NODE_DESTROY,
              callback: async (argv: ArgvStruct): Promise<boolean> => relayCommand.destroy(argv),
            });
          } catch (error) {
            logger.showUserError(error);
            expect.fail();
          }
          testLogger.info(`#### Finished relay node add and destroy for: ${relayNodes} ####`);
        });
      },
    );
  });
});
