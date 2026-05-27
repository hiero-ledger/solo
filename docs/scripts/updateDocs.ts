// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {run, runCapture} from './utilities.js';
import chalk from 'chalk';

async function addCommandOutput(
  soloCommandOutput: Record<string, string>,
  key: string,
  command: string,
): Promise<void> {
  soloCommandOutput[key] = await runCapture(command, {}, true);
  console.log(chalk.green(`✅ Captured output for command: ${command}`));
}

export async function update(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(__dirname, '../../');
  process.chdir(projectRoot);

  const TARGET_DIR = 'docs/site/build';
  const TARGET_FILE = `${TARGET_DIR}/solo-command-output.json`;

  fs.mkdirSync(TARGET_DIR, {recursive: true});

  const CONSENSUS_NODE_VERSION = process.argv[2];
  const CONSENSUS_NODE_FLAG = CONSENSUS_NODE_VERSION ? `--release-tag ${CONSENSUS_NODE_VERSION}` : '';

  process.env.SOLO_CLUSTER_NAME = 'solo';
  process.env.SOLO_NAMESPACE = 'solo';
  process.env.SOLO_CLUSTER_SETUP_NAMESPACE = 'solo-cluster';
  process.env.SOLO_DEPLOYMENT = 'solo-deployment';

  await run(`kind delete cluster -n ${process.env.SOLO_CLUSTER_NAME} || true`);
  await run(`rm -Rf ~/.solo || true`);

  const soloCommandOutput = {};

  await addCommandOutput(
    soloCommandOutput,
    'kind-create-cluster',
    `kind create cluster -n ${process.env.SOLO_CLUSTER_NAME} --config resources/kind-config.yaml`,
  );

  await addCommandOutput(soloCommandOutput, 'solo-init', `solo init`);

  await addCommandOutput(
    soloCommandOutput,
    'solo-cluster-ref-connect',
    `solo cluster-ref config connect --cluster-ref kind-${process.env.SOLO_CLUSTER_NAME} --context kind-${process.env.SOLO_CLUSTER_NAME}`,
  );

  await addCommandOutput(
    soloCommandOutput,
    'solo-deployment-config-create',
    `solo deployment config create -n ${process.env.SOLO_NAMESPACE} --deployment ${process.env.SOLO_DEPLOYMENT}`,
  );

  await addCommandOutput(
    soloCommandOutput,
    'solo-deployment-cluster-attach',
    `solo deployment cluster attach --deployment ${process.env.SOLO_DEPLOYMENT} --cluster-ref kind-${process.env.SOLO_CLUSTER_NAME} --num-consensus-nodes 1`,
  );

  await addCommandOutput(
    soloCommandOutput,
    'solo-keys-consensus-generate',
    `solo keys consensus generate --gossip-keys --tls-keys --deployment ${process.env.SOLO_DEPLOYMENT}`,
  );

  await addCommandOutput(
    soloCommandOutput,
    'solo-cluster-ref-config-setup',
    `solo cluster-ref config setup -s ${process.env.SOLO_CLUSTER_SETUP_NAMESPACE}`,
  );

  await addCommandOutput(
    soloCommandOutput,
    'solo-block-node-add',
    `solo block node add --deployment ${process.env.SOLO_DEPLOYMENT} --cluster-ref kind-${process.env.SOLO_CLUSTER_NAME} ${CONSENSUS_NODE_FLAG}`,
  );

  await addCommandOutput(
    soloCommandOutput,
    'solo-consensus-network-deploy',
    `solo consensus network deploy --deployment ${process.env.SOLO_DEPLOYMENT} ${CONSENSUS_NODE_FLAG}`,
  );

  await addCommandOutput(
    soloCommandOutput,
    'solo-consensus-node-setup',
    `solo consensus node setup --deployment ${process.env.SOLO_DEPLOYMENT} ${CONSENSUS_NODE_FLAG}`,
  );

  await addCommandOutput(
    soloCommandOutput,
    'solo-consensus-node-start',
    `solo consensus node start --deployment ${process.env.SOLO_DEPLOYMENT}`,
  );

  await addCommandOutput(
    soloCommandOutput,
    'solo-mirror-node-add',
    `solo mirror node add --deployment ${process.env.SOLO_DEPLOYMENT} --cluster-ref kind-${process.env.SOLO_CLUSTER_NAME} --enable-ingress -q`,
  );

  await addCommandOutput(
    soloCommandOutput,
    'solo-explorer-node-add',
    `solo explorer node add --deployment ${process.env.SOLO_DEPLOYMENT} --cluster-ref kind-${process.env.SOLO_CLUSTER_NAME} -q`,
  );

  await addCommandOutput(
    soloCommandOutput,
    'solo-relay-node-add',
    `solo relay node add -i node1 --deployment ${process.env.SOLO_DEPLOYMENT} --cluster-ref kind-${process.env.SOLO_CLUSTER_NAME}`,
  );

  await addCommandOutput(
    soloCommandOutput,
    'solo-relay-node-destroy',
    `solo relay node destroy -i node1 --deployment ${process.env.SOLO_DEPLOYMENT} --cluster-ref kind-${process.env.SOLO_CLUSTER_NAME}`,
  );

  await addCommandOutput(
    soloCommandOutput,
    'solo-mirror-node-destroy',
    `solo mirror node destroy --deployment ${process.env.SOLO_DEPLOYMENT} --force -q`,
  );

  await addCommandOutput(
    soloCommandOutput,
    'solo-explorer-node-destroy',
    `solo explorer node destroy --deployment ${process.env.SOLO_DEPLOYMENT} --force -q`,
  );

  await addCommandOutput(
    soloCommandOutput,
    'solo-block-node-destroy',
    `solo block node destroy --deployment ${process.env.SOLO_DEPLOYMENT} --cluster-ref kind-${process.env.SOLO_CLUSTER_NAME}`,
  );

  await addCommandOutput(
    soloCommandOutput,
    'solo-consensus-network-destroy',
    `solo consensus network destroy --deployment ${process.env.SOLO_DEPLOYMENT} --force -q`,
  );

  const output: string = JSON.stringify(soloCommandOutput, null, 2);
  fs.writeFileSync(TARGET_FILE, output);

  console.log(chalk.cyan('✅ Script finished'));
}
