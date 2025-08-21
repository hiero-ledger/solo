// SPDX-License-Identifier: Apache-2.0
'use strict';

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { run, runAndSave, envsubst } from './utilities';
import { cyan } from 'kleur';

export async function update () {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(__dirname, "../../../");
  process.chdir(projectRoot);

  const TARGET_DIR = 'docs/site/content/en';
  const TARGET_DIR_DOCS = 'docs/site/content/en/docs';
  const TEMPLATE_DIR = 'docs/site/content/en/templates';
  const TARGET_FILE = `${TARGET_DIR_DOCS}/step-by-step-guide.md`;
  const TEMPLATE_FILE = `${TEMPLATE_DIR}/step-by-step-guide.template.md`;
  const TEMPLATE_EXAMPLES_FILE = `${TEMPLATE_DIR}/examples-index.template.md`;
  const BUILD_DIR = 'docs/site/build';
  const EXAMPLES_DIR = 'examples';

  mkdirSync(BUILD_DIR, { recursive: true });

  // TBD, need to use at least version v0.62.6 for block node commands to work
  const CONSENSUS_NODE_VERSION = process.argv[2] || 'v0.63.9';
  const CONSENSUS_NODE_FLAG = CONSENSUS_NODE_VERSION ? `--release-tag ${CONSENSUS_NODE_VERSION}` : '';

  process.env.SOLO_CLUSTER_NAME = 'solo';
  process.env.SOLO_NAMESPACE = 'solo';
  process.env.SOLO_CLUSTER_SETUP_NAMESPACE = 'solo-cluster';
  process.env.SOLO_DEPLOYMENT = 'solo-deployment';

  await run(`kind delete cluster -n ${process.env.SOLO_CLUSTER_NAME} || true`);
  await run(`rm -Rf ~/.solo/cache || true`);
  await run(`rm ~/.solo/local-config.yaml || true`);

  await runAndSave(
    `kind create cluster -n ${process.env.SOLO_CLUSTER_NAME}`,
    'KIND_CREATE_CLUSTER_OUTPUT',
    `${BUILD_DIR}/create-cluster.log`,
  );

  await runAndSave(`solo init`, 'SOLO_INIT_OUTPUT', `${BUILD_DIR}/init.log`);

  await runAndSave(
    `solo cluster-ref connect --cluster-ref kind-${process.env.SOLO_CLUSTER_NAME} --context kind-${process.env.SOLO_CLUSTER_NAME}`,
    'SOLO_CLUSTER_REF_CONNECT_OUTPUT',
    `${BUILD_DIR}/cluster-ref-connect.log`,
  );

  await runAndSave(
    `solo deployment create -n ${process.env.SOLO_NAMESPACE} --deployment ${process.env.SOLO_DEPLOYMENT}`,
    'SOLO_DEPLOYMENT_CREATE_OUTPUT',
    `${BUILD_DIR}/deployment-create.log`,
  );

  await runAndSave(
    `solo deployment add-cluster --deployment ${process.env.SOLO_DEPLOYMENT} --cluster-ref kind-${process.env.SOLO_CLUSTER_NAME} --num-consensus-nodes 1`,
    'SOLO_DEPLOYMENT_ADD_CLUSTER_OUTPUT',
    `${BUILD_DIR}/deployment-add-cluster.log`,
  );

  await runAndSave(
    `solo node keys --gossip-keys --tls-keys --deployment ${process.env.SOLO_DEPLOYMENT}`,
    'SOLO_NODE_KEY_PEM_OUTPUT',
    `${BUILD_DIR}/keys.log`,
  );

  await runAndSave(
    `solo cluster-ref setup -s ${process.env.SOLO_CLUSTER_SETUP_NAMESPACE}`,
    'SOLO_CLUSTER_SETUP_OUTPUT',
    `${BUILD_DIR}/cluster-setup.log`,
  );

  await runAndSave(
    `solo block node add --deployment ${process.env.SOLO_DEPLOYMENT} --cluster-ref kind-${process.env.SOLO_CLUSTER_NAME} ${CONSENSUS_NODE_FLAG}`,
    'SOLO_BLOCK_NODE_ADD_OUTPUT',
    `${BUILD_DIR}/block-node-add.log`,
  );

  await runAndSave(
    `solo network deploy --deployment ${process.env.SOLO_DEPLOYMENT} ${CONSENSUS_NODE_FLAG}`,
    'SOLO_NETWORK_DEPLOY_OUTPUT',
    `${BUILD_DIR}/network-deploy.log`,
  );

  await runAndSave(
    `solo node setup --deployment ${process.env.SOLO_DEPLOYMENT} ${CONSENSUS_NODE_FLAG}`,
    'SOLO_NODE_SETUP_OUTPUT',
    `${BUILD_DIR}/node-setup.log`,
  );

  await runAndSave(
    `solo node start --deployment ${process.env.SOLO_DEPLOYMENT}`,
    'SOLO_NODE_START_OUTPUT',
    `${BUILD_DIR}/node-start.log`,
  );

  await runAndSave(
    `solo mirror-node deploy --deployment ${process.env.SOLO_DEPLOYMENT} --cluster-ref kind-${process.env.SOLO_CLUSTER_NAME} --enable-ingress -q`,
    'SOLO_MIRROR_NODE_DEPLOY_OUTPUT',
    `${BUILD_DIR}/mirror-node-deploy.log`,
  );

  await runAndSave(
    `solo explorer deploy --deployment ${process.env.SOLO_DEPLOYMENT} --cluster-ref kind-${process.env.SOLO_CLUSTER_NAME} -q`,
    'SOLO_EXPLORER_DEPLOY_OUTPUT',
    `${BUILD_DIR}/explorer-deploy.log`,
  );

  await runAndSave(
    `solo relay deploy -i node1 --deployment ${process.env.SOLO_DEPLOYMENT} --cluster-ref kind-${process.env.SOLO_CLUSTER_NAME}`,
    'SOLO_RELAY_DEPLOY_OUTPUT',
    `${BUILD_DIR}/relay-deploy.log`,
  );

  await runAndSave(
    `solo relay destroy -i node1 --deployment ${process.env.SOLO_DEPLOYMENT} --cluster-ref kind-${process.env.SOLO_CLUSTER_NAME}`,
    'SOLO_RELAY_DESTROY_OUTPUT',
    `${BUILD_DIR}/relay-destroy.log`,
  );

  await runAndSave(
    `solo mirror-node destroy --deployment ${process.env.SOLO_DEPLOYMENT} --force -q`,
    'SOLO_MIRROR_NODE_DESTROY_OUTPUT',
    `${BUILD_DIR}/mirror-node-destroy.log`,
  );

  await runAndSave(
    `solo explorer destroy --deployment ${process.env.SOLO_DEPLOYMENT} --force -q`,
    'SOLO_EXPLORER_DESTROY_OUTPUT',
    `${BUILD_DIR}/explorer-destroy.log`,
  );

  await runAndSave(
    `solo block node destroy --deployment ${process.env.SOLO_DEPLOYMENT} --cluster-ref kind-${process.env.SOLO_CLUSTER_NAME}`,
    'SOLO_BLOCK_NODE_DESTROY_OUTPUT',
    `${BUILD_DIR}/block-node-destroy.log`,
  );

  await runAndSave(
    `solo network destroy --deployment ${process.env.SOLO_DEPLOYMENT} --force -q`,
    'SOLO_NETWORK_DESTROY_OUTPUT',
    `${BUILD_DIR}/network-destroy.log`,
  );

  // -----------------------------------------------------------------------------
  // File generation
  // -----------------------------------------------------------------------------

  console.log(cyan(`Generating ${TARGET_FILE} from ${TEMPLATE_FILE}`));

  const templateContent = readFileSync(TEMPLATE_FILE, 'utf8');
  const substituted = envsubst(templateContent, process.env);
  writeFileSync(TARGET_FILE, substituted);

  // Extract the entire content from examples/README.md (excluding first line)
  console.log(cyan('Extracting content from examples README'));

  process.env.EXAMPLES_CONTENT = readFileSync(`${EXAMPLES_DIR}/README.md`, 'utf8');

  // Create examples directory if it doesn't exist
  mkdirSync(`${TARGET_DIR}/examples`, { recursive: true });

  // Generate examples index page from template
  const examplesTemplate = readFileSync(TEMPLATE_EXAMPLES_FILE, 'utf8');
  const examplesPage = envsubst(examplesTemplate, process.env);
  writeFileSync(`${TARGET_DIR}/examples/_index.md`, examplesPage);

  // Cleanup: strip color codes
  console.log(cyan('Remove color codes and symbols from target file'));

  let cleaned = readFileSync(TARGET_FILE, 'utf8');
  cleaned = cleaned
    .replace(/\[32m|\[33m|\[39m/g, '')
    .replace(/[↓❯•]/g, '');

  writeFileSync(TARGET_FILE, cleaned);

  console.log(cyan('✅ Script finished'));
}
