// SPDX-License-Identifier: Apache-2.0

import net from 'node:net';
import * as constants from '../constants.js';
import {type SoloLogger} from '../logging/solo-logger.js';
import {type BaseStateSchema} from '../../data/schema/model/remote/state/base-state-schema.js';
import {ComponentTypes} from '../config/remote/enumerations/component-types.js';
import {type PodReference} from '../../integration/kube/resources/pod/pod-reference.js';
import {type K8} from '../../integration/kube/k8.js';
import {type ClusterReferenceName} from '../../types/index.js';
import semver from 'semver/preload.js';
import {type SemVer} from 'semver';
import {type RemoteConfigRuntimeStateApi} from '../../business/runtime-state/api/remote-config-runtime-state-api.js';

/**
 * Check if a TCP port is available on the local machine
 * @param port Port number to check
 * @returns Promise that resolves to true if port is available, false otherwise
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const server: net.Server = net.createServer();
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error(`Timeout while checking port ${port}`));
    }, 5000); // 5-second timeout

    server.once('error', error => {
      clearTimeout(timeout);
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        // Port is in use
        resolve(false);
      } else {
        // Unexpected error
        reject(error);
      }
    });

    server.once('listening', () => {
      clearTimeout(timeout);
      // Port is available
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, constants.LOCAL_HOST);
  });
}

/**
 * Find an available port starting from the given port
 * @param startPort Port number to start checking from
 * @param timeoutMs Timeout in milliseconds before giving up (default: 30000)
 * @param logger logger for debug messages
 * @returns Promise that resolves to the first available port or throws an error if timeout is reached
 * @throws Error if no available port is found within the timeout period
 */
export async function findAvailablePort(
  startPort: number,
  timeoutMs: number = 30_000,
  logger: SoloLogger,
): Promise<number> {
  let port: number = startPort;
  let attempts: number = 0;
  const startTime: number = Date.now();

  while (!(await isPortAvailable(port))) {
    logger.debug(`Port ${port} is not available, trying ${port + 1}`);
    port++;
    attempts++;

    if (Date.now() - startTime > timeoutMs) {
      const errorMessage: string = `Failed to find an available port after ${timeoutMs}ms timeout, starting from port ${startPort}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  return port;
}

/**
 * Manages port forwarding for a component, checking if it's already enabled and persisting configuration
 * @param clusterReference The cluster reference to forward to
 * @param podReference The pod reference to forward to
 * @param podPort The port on the pod to forward from
 * @param localPort The local port to forward to (starting port if not available)
 * @param k8Client The Kubernetes client to use for port forwarding
 * @param logger Logger for messages
 * @param componentType The component type for persistence
 * @param remoteConfig The remote config to use for persistence
 * @param label Label for the port forward
 * @param reuse Whether to reuse existing port forward if available
 * @returns The local port number that was used for port forwarding
 */
export async function managePortForward(
  clusterReference: ClusterReferenceName,
  podReference: PodReference,
  podPort: number,
  localPort: number,
  k8Client: K8,
  logger: SoloLogger,
  componentType: ComponentTypes,
  remoteConfig: RemoteConfigRuntimeStateApi,
  label: string,
  reuse: boolean = false,
  nodeId?: number,
): Promise<number> {
  const installedSoloVersion: SemVer = remoteConfig.configuration.versions.cli;
  if (semver.lte(installedSoloVersion, '0.41.0')) {
    if (ComponentTypes.RelayNodes === componentType) {
      logger.showUser('Previous version of remote config has no cluster reference field in relay component');
    }
    // old version does not have port forward config
    reuse = true;
    logger.showUser(`Port forward config not found for previous installed ${label}, reusing existing port forward`);
  }

  let component: BaseStateSchema;
  if (clusterReference) {
    const schemeComponents: BaseStateSchema[] =
      remoteConfig.configuration.components.getComponentsByClusterReference<BaseStateSchema>(
        componentType,
        clusterReference,
      );
    component = schemeComponents[0];
  } else {
    component = remoteConfig.configuration.components.getComponentById<BaseStateSchema>(componentType, nodeId);
  }

  if (component === undefined) {
    // it is possible we are upgrading a chart and previous version has no clusterReference save in configMap
    reuse = true;
  } else if (component.metadata.portForwardConfigs) {
    for (const portForwardConfig of component.metadata.portForwardConfigs) {
      if (portForwardConfig.podPort === podPort) {
        logger.showUser(`${label} Port forward already enabled at ${portForwardConfig.localPort}`);
        return portForwardConfig.localPort;
      }
    }
  }

  // Enable port forwarding
  const portForwardPortNumber: number = await k8Client
    .pods()
    .readByReference(podReference)
    .portForward(localPort, podPort, true, reuse);

  // Add message to logger
  logger.addMessageGroup(constants.PORT_FORWARDING_MESSAGE_GROUP, 'Port forwarding enabled');
  logger.addMessageGroupMessage(
    constants.PORT_FORWARDING_MESSAGE_GROUP,
    `${label} port forward enabled on localhost:${portForwardPortNumber}`,
  );

  // Update component configuration
  if (component) {
    if (!component.metadata.portForwardConfigs) {
      component.metadata.portForwardConfigs = [];
    }

    logger.info(`add port localPort=${portForwardPortNumber}, podPort=${podPort}`);
    // Save port forward config to component
    component.metadata.portForwardConfigs.push({
      localPort: portForwardPortNumber,
      podPort: podPort,
    });

    remoteConfig.configuration.components.addNewComponent(component, componentType, true);
    await remoteConfig.persist();
  }
  return portForwardPortNumber;
}
