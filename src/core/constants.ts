// SPDX-License-Identifier: Apache-2.0

import {color, type ListrLogger, PRESET_TIMER} from 'listr2';
import path from 'node:path';
import url from 'node:url';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {ContainerName} from '../integration/kube/resources/container/container-name.js';
import {PathEx} from '../business/utils/path-ex.js';
import {PrivateKey} from '@hiero-ledger/sdk';
import 'dotenv/config';

export function getEnvironmentVariable(name: string): string {
  if (process.env[name]) {
    console.log(`>> environment variable '${name}' exists, using its value`);
    return process.env[name];
  }
  return undefined;
}
export const ROOT_DIR: string = PathEx.joinWithRealPath(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..');

// -------------------- solo related constants ---------------------------------------------------------------------
export const SOLO_HOME_DIR = getEnvironmentVariable('SOLO_HOME') || PathEx.join(process.env.HOME as string, '.solo');
export const SOLO_LOGS_DIR = PathEx.join(SOLO_HOME_DIR, 'logs');
export const SOLO_CACHE_DIR = getEnvironmentVariable('SOLO_CACHE_DIR') || PathEx.join(SOLO_HOME_DIR, 'cache');
export const SOLO_VALUES_DIR = PathEx.join(SOLO_CACHE_DIR, 'values-files');
export const SOLO_LOG_LEVEL = getEnvironmentVariable('SOLO_LOG_LEVEL') || 'info';
export const DEFAULT_NAMESPACE = NamespaceName.of('default');
export const DEFAULT_CERT_MANAGER_NAMESPACE = NamespaceName.of('cert-manager');
export const HELM = 'helm';
export const KIND = 'kind';
export const PODMAN = 'podman';
export const VFKIT = 'vfkit';
export const GVPROXY = 'gvproxy';
export const DOCKER = 'docker';
export const KUBECTL = 'kubectl';
export const DEFAULT_CLUSTER = 'solo-cluster';
export const RESOURCES_DIR = PathEx.joinWithRealPath(ROOT_DIR, 'resources');

export const SOLO_DEV_OUTPUT: boolean = Boolean(getEnvironmentVariable('SOLO_DEV_OUTPUT')) || false;

export const ROOT_CONTAINER = ContainerName.of('root-container');
export const SOLO_REMOTE_CONFIGMAP_NAME = 'solo-remote-config';
export const SOLO_REMOTE_CONFIGMAP_LABELS = {'solo.hedera.com/type': 'remote-config'};
export const SOLO_REMOTE_CONFIG_MAX_COMMAND_IN_HISTORY = 50;
export const SOLO_REMOTE_CONFIGMAP_LABEL_SELECTOR = 'solo.hedera.com/type=remote-config';
export const NODE_COPY_CONCURRENT = Number(getEnvironmentVariable('NODE_COPY_CONCURRENT')) || 4;
export const SKIP_NODE_PING = Boolean(getEnvironmentVariable('SKIP_NODE_PING')) || false;
export const DEFAULT_LOCK_ACQUIRE_ATTEMPTS = +getEnvironmentVariable('SOLO_LEASE_ACQUIRE_ATTEMPTS') || 10;
export const DEFAULT_LEASE_DURATION = +getEnvironmentVariable('SOLO_LEASE_DURATION') || 20;

export const SOLO_USER_AGENT_HEADER = 'Solo-User-Agent';
// --------------- Hedera network and node related constants --------------------------------------------------------------------
export const HEDERA_CHAIN_ID = getEnvironmentVariable('SOLO_CHAIN_ID') || '298';
export const HEDERA_HGCAPP_DIR = '/opt/hgcapp';
export const HEDERA_SERVICES_PATH = `${HEDERA_HGCAPP_DIR}/services-hedera`;
export const HEDERA_HAPI_PATH = `${HEDERA_SERVICES_PATH}/HapiApp2.0`;
export const HEDERA_DATA_APPS_DIR = 'data/apps';
export const HEDERA_DATA_LIB_DIR = 'data/lib';
export const HEDERA_USER_HOME_DIR = '/home/hedera';
export const HEDERA_APP_NAME = 'HederaNode.jar';
export const HEDERA_BUILDS_URL = 'https://builds.hedera.com';
export const HEDERA_NODE_INTERNAL_GOSSIP_PORT = getEnvironmentVariable('SOLO_NODE_INTERNAL_GOSSIP_PORT') || '50111';
export const HEDERA_NODE_EXTERNAL_GOSSIP_PORT = getEnvironmentVariable('SOLO_NODE_EXTERNAL_GOSSIP_PORT') || '50111';
export const HEDERA_NODE_DEFAULT_STAKE_AMOUNT = +getEnvironmentVariable('SOLO_NODE_DEFAULT_STAKE_AMOUNT') || 500;

// Pods with a name matching one of these strings will be ignored when collecting pod metrics
const ignorePodMetricsEnvironment: string = getEnvironmentVariable('IGNORE_POD_METRICS');
export const IGNORE_POD_METRICS: string[] = ignorePodMetricsEnvironment
  ? ignorePodMetricsEnvironment.split(',')
  : ['network-load-generator'];

export const HEDERA_NODE_SIDECARS = [
  'recordStreamUploader',
  'eventStreamUploader',
  'backupUploader',
  'accountBalanceUploader',
  'otelCollector',
  'blockstreamUploader',
];

// --------------- Charts related constants ----------------------------------------------------------------------------
export const SOLO_SETUP_NAMESPACE = NamespaceName.of('solo-setup');

// TODO: remove after migrated to resources/solo-config.yaml
export const SOLO_TESTING_CHART_URL = 'oci://ghcr.io/hashgraph/solo-charts';
// TODO: remove after migrated to resources/solo-config.yaml
export const SOLO_DEPLOYMENT_CHART = 'solo-deployment';
// TODO: remove after migrated to resources/solo-config.yaml
export const SOLO_CERT_MANAGER_CHART = 'solo-cert-manager';

export const JSON_RPC_RELAY_CHART_URL =
  getEnvironmentVariable('JSON_RPC_RELAY_CHART_URL') ?? 'https://hiero-ledger.github.io/hiero-json-rpc-relay/charts';
export const JSON_RPC_RELAY_CHART = 'hedera-json-rpc';
export const JSON_RPC_RELAY_RELEASE_NAME: string = 'relay';

export const MIRROR_NODE_CHART_URL =
  getEnvironmentVariable('MIRROR_NODE_CHART_URL') ?? 'https://hashgraph.github.io/hedera-mirror-node/charts';
export const MIRROR_NODE_CHART = 'hedera-mirror';
export const MIRROR_NODE_RELEASE_NAME = 'mirror';
export const MIRROR_NODE_PINGER_TPS: number = +getEnvironmentVariable('MIRROR_NODE_PINGER_TPS') || 5;
// Version boundary for mirror node upgrade behavior
// Versions <= v0.143.0 require skipping reuseValues to avoid RegularExpression rules conflicts
export const MIRROR_NODE_VERSION_BOUNDARY: string = 'v0.143.0';
export const PROMETHEUS_STACK_CHART_URL =
  getEnvironmentVariable('PROMETHEUS_STACK_CHART_URL') ?? 'https://prometheus-community.github.io/helm-charts';
export const PROMETHEUS_STACK_CHART = 'kube-prometheus-stack';
export const PROMETHEUS_RELEASE_NAME = 'kube-prometheus-stack';

export const GRAFANA_AGENT_CHART_URL =
  getEnvironmentVariable('GRAFANA_AGENT_CHART_URL') ?? 'https://grafana.github.io/helm-charts';
export const GRAFANA_AGENT_CHART = 'grafana-agent';
export const GRAFANA_AGENT_RELEASE_NAME = 'grafana-agent';

export const POD_MONITOR_ROLE = 'pod-monitor-role';

export const MINIO_OPERATOR_CHART_URL =
  getEnvironmentVariable('MINIO_OPERATOR_CHART_URL') ?? 'https://operator.min.io/';
export const MINIO_OPERATOR_CHART: string = 'operator';
export const MINIO_OPERATOR_RELEASE_NAME: string = 'operator';

export const EXPLORER_CHART_URL =
  getEnvironmentVariable('EXPLORER_CHART_URL') ??
  'oci://ghcr.io/hiero-ledger/hiero-mirror-node-explorer/hiero-explorer-chart';
export const EXPLORER_RELEASE_NAME = 'hiero-explorer';
export const SOLO_RELAY_LABEL = 'app=hedera-json-rpc';
export const SOLO_EXPLORER_LABEL = 'app.kubernetes.io/component=hiero-explorer';
export const OLD_SOLO_EXPLORER_LABEL = 'app.kubernetes.io/component=hedera-explorer';

// TODO: remove after migrated to resources/solo-config.yaml
export const INGRESS_CONTROLLER_CHART_URL =
  getEnvironmentVariable('INGRESS_CONTROLLER_CHART_URL') ?? 'https://haproxy-ingress.github.io/charts';
// TODO: remove after migrated to resources/solo-config.yaml
export const INGRESS_CONTROLLER_RELEASE_NAME = 'haproxy-ingress';
export const EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME = 'explorer-haproxy-ingress';
// TODO: remove after migrated to resources/solo-config.yaml
export const INGRESS_CONTROLLER_PREFIX = 'haproxy-ingress.github.io/controller/';

export const BLOCK_NODE_CHART_URL =
  getEnvironmentVariable('BLOCK_NODE_CHART_URL') ?? 'oci://ghcr.io/hiero-ledger/hiero-block-node';
export const BLOCK_NODE_CHART: string = getEnvironmentVariable('BLOCK_NODE_CHART') ?? 'block-node-server';
export const BLOCK_NODE_RELEASE_NAME = 'block-node';
export const BLOCK_NODE_CONTAINER_NAME: ContainerName = ContainerName.of(BLOCK_NODE_CHART);

export const NETWORK_LOAD_GENERATOR_CHART = 'network-load-generator';
export const NETWORK_LOAD_GENERATOR_RELEASE_NAME = 'network-load-generator';
export const NETWORK_LOAD_GENERATOR_CHART_URL =
  getEnvironmentVariable('NETWORK_LOAD_GENERATOR_CHART_URL') ??
  'oci://swirldslabs.jfrog.io/load-generator-helm-release-local';
export const NETWORK_LOAD_GENERATOR_POD_LABELS: string[] = [
  'app.kubernetes.io/instance=network-load-generator',
  'app.kubernetes.io/name=network-load-generator',
];

export const PROMETHEUS_OPERATOR_CRDS_RELEASE_NAME: string = 'prometheus-operator-crds';
export const PROMETHEUS_OPERATOR_CRDS_CHART: string = 'prometheus-operator-crds';
export const PROMETHEUS_OPERATOR_CRDS_REPO: string = 'prometheus-community';
export const PROMETHEUS_OPERATOR_CRDS_CHART_URL: string =
  getEnvironmentVariable('PROMETHEUS_OPERATOR_CRDS_CHART_URL') || 'https://prometheus-community.github.io/helm-charts';

export const NETWORK_LOAD_GENERATOR_CONTAINER: ContainerName = ContainerName.of('nlg');

// TODO: remove after migrated to resources/solo-config.yaml
export const CERT_MANAGER_NAME_SPACE = 'cert-manager';
export const SOLO_HEDERA_MIRROR_IMPORTER = [
  'app.kubernetes.io/component=importer',
  'app.kubernetes.io/instance=mirror',
];

// Component label selectors for pod discovery
export const SOLO_RELAY_NAME_LABEL = 'app.kubernetes.io/name=relay';
export const SOLO_MIRROR_IMPORTER_NAME_LABEL = 'app.kubernetes.io/name=importer';
export const SOLO_MIRROR_GRPC_NAME_LABEL = 'app.kubernetes.io/name=grpc';
export const SOLO_MIRROR_MONITOR_NAME_LABEL = 'app.kubernetes.io/name=monitor';
export const SOLO_MIRROR_REST_NAME_LABEL = 'app.kubernetes.io/name=rest';
export const SOLO_MIRROR_WEB3_NAME_LABEL = 'app.kubernetes.io/name=web3';
export const SOLO_MIRROR_POSTGRES_NAME_LABEL = 'app.kubernetes.io/name=postgres';
export const SOLO_MIRROR_REDIS_NAME_LABEL = 'app.kubernetes.io/name=redis';
export const SOLO_MIRROR_RESTJAVA_NAME_LABEL = 'app.kubernetes.io/name=rest-java';
export const SOLO_BLOCK_NODE_NAME_LABEL = 'app.kubernetes.io/name=block-node-1';
export const SOLO_INGRESS_CONTROLLER_NAME_LABEL = 'app.kubernetes.io/name=haproxy-ingress';

export const DEFAULT_CHART_REPO: Map<string, string> = new Map()
  .set(JSON_RPC_RELAY_CHART, JSON_RPC_RELAY_CHART_URL)
  .set(MIRROR_NODE_RELEASE_NAME, MIRROR_NODE_CHART_URL)
  .set(PROMETHEUS_RELEASE_NAME, PROMETHEUS_STACK_CHART_URL)
  .set(GRAFANA_AGENT_RELEASE_NAME, GRAFANA_AGENT_CHART_URL)
  .set(MINIO_OPERATOR_RELEASE_NAME, MINIO_OPERATOR_CHART_URL)
  .set(INGRESS_CONTROLLER_RELEASE_NAME, INGRESS_CONTROLLER_CHART_URL);

export const MIRROR_INGRESS_CLASS_NAME = 'mirror-ingress-class';
export const MIRROR_INGRESS_CONTROLLER = 'mirror-ingress-controller';
export const EXPLORER_INGRESS_CLASS_NAME = 'explorer-ingress-class';
export const EXPLORER_INGRESS_CONTROLLER = 'explorer-ingress-controller';
// ------------------- Hedera Account related ---------------------------------------------------------------------------------
export const DEFAULT_OPERATOR_ID_NUMBER = getEnvironmentVariable('SOLO_OPERATOR_ID') || 2;
export const OPERATOR_KEY =
  getEnvironmentVariable('SOLO_OPERATOR_KEY') ||
  '302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137';
export const OPERATOR_PUBLIC_KEY =
  getEnvironmentVariable('SOLO_OPERATOR_PUBLIC_KEY') ||
  '302a300506032b65700321000aa8e21064c61eab86e2a9c164565b4e7a9a4146106e0a6cd03a8c395a110e92';

export const DEFAULT_FREEZE_ID_NUMBER = +getEnvironmentVariable('FREEZE_ADMIN_ACCOUNT') || 58;
export const DEFAULT_TREASURY_ID_NUMBER = 2;
export const DEFAULT_START_ID_NUMBER = +getEnvironmentVariable('DEFAULT_START_ID_NUMBER') || 3;

export const DEFAULT_GENESIS_KEY =
  '302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137';
export const GENESIS_KEY = getEnvironmentVariable('GENESIS_KEY') || DEFAULT_GENESIS_KEY;
export const GENESIS_PUBLIC_KEY = PrivateKey.fromStringED25519(GENESIS_KEY).publicKey;
export const SYSTEM_ACCOUNTS = [
  [3, 100],
  [200, 349],
  [400, 750],
  [900, 1000],
]; // do account 0.0.2 last and outside the loop
export const SHORTER_SYSTEM_ACCOUNTS = [[3, 60]];
export const TREASURY_ACCOUNT = 2;
export const LOCAL_NODE_START_PORT = +getEnvironmentVariable('LOCAL_NODE_START_PORT') || 30_212;
export const ACCOUNT_UPDATE_BATCH_SIZE = +getEnvironmentVariable('ACCOUNT_UPDATE_BATCH_SIZE') || 10;

export const POD_PHASE_RUNNING = 'Running';

export const POD_CONDITION_INITIALIZED = 'Initialized';
export const POD_CONDITION_READY = 'Ready';

export const POD_CONDITION_POD_SCHEDULED = 'PodScheduled';
export const POD_CONDITION_STATUS_TRUE = 'True';

export const EXPLORER_VALUES_FILE = PathEx.joinWithRealPath(RESOURCES_DIR, 'hiero-explorer-values.yaml');
export const MIRROR_NODE_VALUES_FILE = PathEx.joinWithRealPath(RESOURCES_DIR, 'mirror-node-values.yaml');
export const MIRROR_NODE_VALUES_FILE_HEDERA = PathEx.joinWithRealPath(RESOURCES_DIR, 'mirror-node-values-hedera.yaml');
export const INGRESS_CONTROLLER_VALUES_FILE = PathEx.joinWithRealPath(RESOURCES_DIR, 'ingress-controller-values.yaml');
export const BLOCK_NODE_VALUES_FILE = PathEx.joinWithRealPath(RESOURCES_DIR, 'block-node-values.yaml');
export const POD_MONITOR_ROLE_TEMPLATE = PathEx.joinWithRealPath(RESOURCES_DIR, 'templates', 'pod-monitor-role.yaml');
export const CLEANUP_STATE_ROUNDS_SCRIPT = PathEx.joinWithRealPath(RESOURCES_DIR, 'cleanup-state-rounds.sh');
export const RENAME_STATE_NODE_ID_SCRIPT = PathEx.joinWithRealPath(RESOURCES_DIR, 'rename-state-node-id.sh');
export const NODE_LOG_FAILURE_MSG = 'failed to download logs from pod';
export const ONE_SHOT_WITH_BLOCK_NODE = getEnvironmentVariable('ONE_SHOT_WITH_BLOCK_NODE') || 'false';
export const RAPID_FIRE_VALUES_FILE = PathEx.joinWithRealPath(RESOURCES_DIR, 'rapid-fire', 'nlg-values.yaml');

export const CONTAINER_COPY_MAX_ATTEMPTS: number = +getEnvironmentVariable('CONTAINER_COPY_MAX_ATTEMPTS') || 3;
export const CONTAINER_COPY_BACKOFF_MS: number = +getEnvironmentVariable('CONTAINER_COPY_BACKOFF_MS') || 300;

/**
 * Listr related
 * @returns a object that defines the default color options
 */
export const LISTR_DEFAULT_RENDERER_TIMER_OPTION = {
  ...PRESET_TIMER,
  condition: (duration: number) => duration > 100,
  format: (duration: number) => {
    if (duration > 30_000) {
      return color.red;
    }

    return color.green;
  },
};

export const LISTR_DEFAULT_RENDERER_OPTION: {
  collapseSubtasks: boolean;
  timer: {
    condition: (duration: number) => boolean;
    format: (duration: number) => any;
    field: string | ((arguments_0: number) => string);
    args?: [number];
  };
  logger?: ListrLogger;
  persistentOutput: boolean;
  clearOutput: boolean;
  collapseErrors: boolean;
  showErrorMessage: boolean;
  formatOutput: 'wrap' | 'truncate';
} = {
  collapseSubtasks: false,
  timer: LISTR_DEFAULT_RENDERER_TIMER_OPTION,
  persistentOutput: true,
  clearOutput: false,
  collapseErrors: false,
  showErrorMessage: false,
  formatOutput: 'wrap',
};

type ListrOptionsType = {
  concurrent: boolean;
  rendererOptions: typeof LISTR_DEFAULT_RENDERER_OPTION;
  fallbackRendererOptions: {
    timer: typeof LISTR_DEFAULT_RENDERER_TIMER_OPTION;
  };
};

export const LISTR_DEFAULT_OPTIONS: {
  DEFAULT: ListrOptionsType;
  WITH_CONCURRENCY: ListrOptionsType;
} = {
  DEFAULT: {
    concurrent: false,
    rendererOptions: LISTR_DEFAULT_RENDERER_OPTION,
    fallbackRendererOptions: {
      timer: LISTR_DEFAULT_RENDERER_TIMER_OPTION,
    },
  },
  WITH_CONCURRENCY: {
    concurrent: true,
    rendererOptions: LISTR_DEFAULT_RENDERER_OPTION,
    fallbackRendererOptions: {
      timer: LISTR_DEFAULT_RENDERER_TIMER_OPTION,
    },
  },
};

export const SIGNING_KEY_PREFIX = 's';
export const CERTIFICATE_VALIDITY_YEARS = 100; // years

export const OS_WINDOWS = 'windows';
export const OS_WIN32 = 'win32';
export const OS_DARWIN = 'darwin';
export const OS_LINUX = 'linux';

export const LOCAL_HOST = '127.0.0.1';

export const PROFILE_LARGE = 'large';
export const PROFILE_MEDIUM = 'medium';
export const PROFILE_SMALL = 'small';
export const PROFILE_TINY = 'tiny';
export const PROFILE_LOCAL = 'local';

export const ALL_PROFILES = [PROFILE_LOCAL, PROFILE_TINY, PROFILE_SMALL, PROFILE_MEDIUM, PROFILE_LARGE];
export const DEFAULT_PROFILE_FILE = PathEx.join('profiles', 'custom-spec.yaml');

export const STANDARD_DATAMASK = '***';

// ------ Hedera SDK Related ------
export const NODE_CLIENT_MAX_ATTEMPTS = +getEnvironmentVariable('NODE_CLIENT_MAX_ATTEMPTS') || 600;
export const NODE_CLIENT_MIN_BACKOFF = +getEnvironmentVariable('NODE_CLIENT_MIN_BACKOFF') || 1000;
export const NODE_CLIENT_MAX_BACKOFF = +getEnvironmentVariable('NODE_CLIENT_MAX_BACKOFF') || 1000;
export const NODE_CLIENT_REQUEST_TIMEOUT = +getEnvironmentVariable('NODE_CLIENT_REQUEST_TIMEOUT') || 600_000;
export const NODE_CLIENT_SDK_PING_MAX_RETRIES = +getEnvironmentVariable('NODE_CLIENT_SDK_PING_MAX_RETRIES') || 5;
export const NODE_CLIENT_SDK_PING_RETRY_INTERVAL =
  +getEnvironmentVariable('NODE_CLIENT_SDK_PING_RETRY_INTERVAL') || 10_000;

// ---- New Node Related ----
export const ENDPOINT_TYPE_IP = 'IP';
export const ENDPOINT_TYPE_FQDN = 'FQDN';
export const DEFAULT_NETWORK_NODE_NAME = 'node1';

// file-id must be between 0.0.150 and 0.0.159
// file must be uploaded using FileUpdateTransaction in maximum of 5Kb chunks
export const UPGRADE_FILE_ID_NUM = 150;
export const UPGRADE_FILE_CHUNK_SIZE = 1024 * 5; // 5Kb

export const JVM_DEBUG_PORT = 5005;

export const PODS_RUNNING_MAX_ATTEMPTS = +getEnvironmentVariable('PODS_RUNNING_MAX_ATTEMPTS') || 60 * 15;
export const PODS_RUNNING_DELAY = +getEnvironmentVariable('PODS_RUNNING_DELAY') || 1000;
export const NETWORK_NODE_ACTIVE_MAX_ATTEMPTS = +getEnvironmentVariable('NETWORK_NODE_ACTIVE_MAX_ATTEMPTS') || 300;
export const NETWORK_NODE_ACTIVE_DELAY = +getEnvironmentVariable('NETWORK_NODE_ACTIVE_DELAY') || 1000;
export const NETWORK_NODE_ACTIVE_TIMEOUT = +getEnvironmentVariable('NETWORK_NODE_ACTIVE_TIMEOUT') || 1000;
export const NETWORK_PROXY_MAX_ATTEMPTS = +getEnvironmentVariable('NETWORK_PROXY_MAX_ATTEMPTS') || 300;
export const NETWORK_PROXY_DELAY = +getEnvironmentVariable('NETWORK_PROXY_DELAY') || 2000;
export const PODS_READY_MAX_ATTEMPTS = +getEnvironmentVariable('PODS_READY_MAX_ATTEMPTS') || 300;
export const PODS_READY_DELAY = +getEnvironmentVariable('PODS_READY_DELAY') || 2000;
export const RELAY_PODS_RUNNING_MAX_ATTEMPTS = +getEnvironmentVariable('RELAY_PODS_RUNNING_MAX_ATTEMPTS') || 900;
export const RELAY_PODS_RUNNING_DELAY = +getEnvironmentVariable('RELAY_PODS_RUNNING_DELAY') || 1000;
export const RELAY_PODS_READY_MAX_ATTEMPTS = +getEnvironmentVariable('RELAY_PODS_READY_MAX_ATTEMPTS') || 100;
export const RELAY_PODS_READY_DELAY = +getEnvironmentVariable('RELAY_PODS_READY_DELAY') || 1000;
export const BLOCK_NODE_PODS_RUNNING_MAX_ATTEMPTS: number =
  +getEnvironmentVariable('BLOCK_NODE_PODS_RUNNING_MAX_ATTEMPTS') || 900;
export const BLOCK_NODE_PODS_RUNNING_DELAY: number = +getEnvironmentVariable('BLOCK_NODE_PODS_RUNNING_DELAY') || 1000;
export const BLOCK_NODE_ACTIVE_MAX_ATTEMPTS: number = +getEnvironmentVariable('BLOCK_NODE_ACTIVE_MAX_ATTEMPTS') || 100;
export const BLOCK_NODE_ACTIVE_DELAY: number = +getEnvironmentVariable('BLOCK_NODE_ACTIVE_DELAY') || 60;
export const BLOCK_NODE_ACTIVE_TIMEOUT: number = +getEnvironmentVariable('BLOCK_NODE_ACTIVE_TIMEOUT') || 60;

export const BLOCK_NODE_PORT: number = +getEnvironmentVariable('BLOCK_NODE_PORT') || 40_840;
export const BLOCK_NODE_PORT_LEGACY: number = +getEnvironmentVariable('BLOCK_NODE_PORT_LEGACY') || 8080;

export const BLOCK_ITEM_BATCH_SIZE: number = +getEnvironmentVariable('BLOCK_ITEM_BATCH_SIZE') || 256;

export const NETWORK_LOAD_GENERATOR_POD_RUNNING_MAX_ATTEMPTS: number =
  +getEnvironmentVariable('NETWORK_LOAD_GENERATOR_PODS_RUNNING_MAX_ATTEMPTS') || 900;
export const NETWORK_LOAD_GENERATOR_POD_RUNNING_DELAY: number =
  +getEnvironmentVariable('NETWORK_LOAD_GENERATOR_PODS_RUNNING_DELAY') || 1000;

export const PORT_FORWARDING_MESSAGE_GROUP: string = 'port-forwarding';
export const GRPC_PORT: number = +getEnvironmentVariable('GRPC_PORT') || 50_211;
export const JSON_RPC_RELAY_PORT: number = +getEnvironmentVariable('JSON_RPC_RELAY_PORT') || 7546;
export const EXPLORER_PORT: number = +getEnvironmentVariable('EXPLORER_PORT') || 8080;
export const MIRROR_NODE_PORT: number = +getEnvironmentVariable('MIRROR_NODE_PORT') || 8081;
export const LOCAL_BUILD_COPY_RETRY = +getEnvironmentVariable('LOCAL_BUILD_COPY_RETRY') || 3;

export const LOAD_BALANCER_CHECK_DELAY_SECS = +getEnvironmentVariable('LOAD_BALANCER_CHECK_DELAY_SECS') || 5;
export const LOAD_BALANCER_CHECK_MAX_ATTEMPTS = +getEnvironmentVariable('LOAD_BALANCER_CHECK_MAX_ATTEMPTS') || 60;

export const NETWORK_DESTROY_WAIT_TIMEOUT = +getEnvironmentVariable('NETWORK_DESTROY_WAIT_TIMEOUT') || 120;

export const DEFAULT_LOCAL_CONFIG_FILE = 'local-config.yaml';
export const NODE_OVERRIDE_FILE = 'node-overrides.yaml';
export const IGNORED_NODE_ACCOUNT_ID = '0.0.0';

export const UPLOADER_SECRET_NAME = 'uploader-mirror-secrets';
export const MINIO_SECRET_NAME = 'minio-secrets';
export const BACKUP_SECRET_NAME = 'backup-uploader-secrets';
export const MIRROR_INGRESS_TLS_SECRET_NAME = 'ca-secret-mirror-node';
export const EXPLORER_INGRESS_TLS_SECRET_NAME = 'ca-secret-hiero-explorer';

export const BLOCK_STREAM_STREAM_MODE: string = getEnvironmentVariable('BLOCK_STREAM_STREAM_MODE') || 'BOTH';
export const BLOCK_STREAM_WRITER_MODE: string = getEnvironmentVariable('BLOCK_STREAM_WRITER_MODE') || 'FILE_AND_GRPC';

export const BLOCK_NODE_IMAGE_NAME: string = 'block-node-server';
export const BLOCK_NODES_JSON_FILE: string = 'block-nodes.json';
export const enum StorageType {
  MINIO_ONLY = 'minio_only',
  AWS_ONLY = 'aws_only',
  GCS_ONLY = 'gcs_only',
  AWS_AND_GCS = 'aws_and_gcs',
}

export const CERT_MANAGER_CRDS = [
  'certificaterequests.cert-manager.io',
  'certificates.cert-manager.io',
  'clusterissuers.cert-manager.io',
  'issuers.cert-manager.io',
];
