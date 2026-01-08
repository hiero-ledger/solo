// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {type BootstrapResponse, getTemporaryDirectory, HEDERA_PLATFORM_VERSION_TAG} from '../../test-utility.js';
import {Duration} from '../../../src/core/time/duration.js';
import {HEDERA_HAPI_PATH, ROOT_CONTAINER} from '../../../src/core/constants.js';
import fs from 'node:fs';
import {Zippy} from '../../../src/core/zippy.js';
import {type NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../../../src/integration/kube/resources/container/container-reference.js';
import {type Argv} from '../../helpers/argv-wrapper.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {ConsensusCommandDefinition} from '../../../src/commands/command-definitions/consensus-command-definition.js';
import {TEST_UPGRADE_VERSION} from '../../../version-test.js';
import {main} from '../../../src/index.js';

export function testSeparateNodeUpgrade(argv: Argv, bootstrapResp: BootstrapResponse, namespace: NamespaceName): void {
  argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
  argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);

  const zipFile: string = 'upgrade.zip';

  const {
    opts: {k8Factory, logger},
  } = bootstrapResp;

  describe('Node upgrade', async (): Promise<void> => {
    it('should succeed with separate upgrade command', async (): Promise<void> => {
      // Create file version.txt at tmp directory
      const temporaryDirectory: string = getTemporaryDirectory();
      fs.writeFileSync(`${temporaryDirectory}/version.txt`, TEST_UPGRADE_VERSION);

      // Create upgrade.zip file from tmp directory using zippy.ts
      const zipper: Zippy = new Zippy(logger);
      await zipper.zip(temporaryDirectory, zipFile);

      const temporaryDirectory2: string = 'contextDir';

      const argvPrepare: Argv = argv.clone();
      argvPrepare.setArg(flags.upgradeZipFile, zipFile);
      argvPrepare.setArg(flags.outputDir, temporaryDirectory2);
      argvPrepare.setCommand(
        ConsensusCommandDefinition.COMMAND_NAME,
        ConsensusCommandDefinition.DEV_NODE_UPGRADE_SUBCOMMAND_NAME,
        ConsensusCommandDefinition.DEV_NODE_PREPARE,
      );
      await main(argvPrepare.asStringArray());

      const argvSubmit: Argv = argv.clone();
      argvSubmit.setArg(flags.inputDir, temporaryDirectory2);
      argvSubmit.setCommand(
        ConsensusCommandDefinition.COMMAND_NAME,
        ConsensusCommandDefinition.DEV_NODE_UPGRADE_SUBCOMMAND_NAME,
        ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
      );
      await main(argvSubmit.asStringArray());

      const argvExecute: Argv = argv.clone();
      argvExecute.setArg(flags.inputDir, temporaryDirectory2);
      argvExecute.setCommand(
        ConsensusCommandDefinition.COMMAND_NAME,
        ConsensusCommandDefinition.DEV_NODE_UPGRADE_SUBCOMMAND_NAME,
        ConsensusCommandDefinition.DEV_NODE_EXECUTE,
      );
      await main(argvExecute.asStringArray());
    }).timeout(Duration.ofMinutes(5).toMillis());

    it('network nodes version file was upgraded', async (): Promise<void> => {
      // Copy the version.txt file from the pod data/upgrade/current directory
      const temporaryDirectory: string = getTemporaryDirectory();
      const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
      const podReference: PodReference = pods[0].podReference;
      const containerReference: ContainerReference = ContainerReference.of(podReference, ROOT_CONTAINER);
      await k8Factory
        .default()
        .containers()
        .readByRef(containerReference)
        .copyFrom(`${HEDERA_HAPI_PATH}/data/upgrade/current/version.txt`, temporaryDirectory);

      // Compare the version.txt
      const version: string = fs.readFileSync(`${temporaryDirectory}/version.txt`, 'utf8');
      expect(version).to.equal(TEST_UPGRADE_VERSION);
    }).timeout(Duration.ofMinutes(5).toMillis());
  });
}
