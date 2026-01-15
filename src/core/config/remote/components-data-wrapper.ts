// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../errors/solo-error.js';
import {ComponentTypes} from './enumerations/component-types.js';
import {BaseStateSchema} from '../../../data/schema/model/remote/state/base-state-schema.js';
import {isValidEnum} from '../../util/validation-helpers.js';
import {type DeploymentPhase} from '../../../data/schema/model/remote/deployment-phase.js';
import {type ClusterReferenceName, type ComponentId} from '../../../types/index.js';
import {type ComponentsDataWrapperApi} from './api/components-data-wrapper-api.js';
import {type DeploymentStateSchema} from '../../../data/schema/model/remote/deployment-state-schema.js';
import {type ConsensusNodeStateSchema} from '../../../data/schema/model/remote/state/consensus-node-state-schema.js';
import {type ComponentIdsStructure} from '../../../data/schema/model/remote/interfaces/components-ids-structure.js';
import {type PodReference} from '../../../integration/kube/resources/pod/pod-reference.js';
import {type K8} from '../../../integration/kube/k8.js';
import {type SoloLogger} from '../../logging/solo-logger.js';
import {ShellRunner} from '../../../core/shell-runner.js';
import * as constants from '../../constants.js';
import {Templates} from '../../templates.js';

export class ComponentsDataWrapper implements ComponentsDataWrapperApi {
  public constructor(public state: DeploymentStateSchema) {}

  /**
   * Check if a port forward process is actually running and functional for the given local port
   * @param localPort - The local port to check
   * @param logger - Logger instance for debugging
   * @returns Promise resolving to true if port forward is functional, false otherwise
   */
  private async isPortForwardProcessRunning(localPort: number, logger: SoloLogger): Promise<boolean> {
    try {
      const shellRunner = new ShellRunner(logger);

      // First check: Look for the kubectl process
      const result = await shellRunner.run(`ps -ef | grep port-forward | grep "${localPort}:"`, [], true, false);

      logger.debug(`Port forward process check for port ${localPort}: ${result ? result.length : 0} processes found`);
      if (result && result.length > 0) {
        logger.debug(`Raw ps output for port ${localPort}: ${JSON.stringify(result)}`);
      }

      if (!result || result.length === 0) {
        return false;
      }

      // Additional validation: make sure the process line contains kubectl and port-forward
      const validProcesses = result.filter(
        line => line.includes('kubectl') && line.includes('port-forward') && line.includes(`${localPort}:`),
      );

      logger.debug(`Valid port forward processes for port ${localPort}: ${validProcesses.length}`);
      if (validProcesses.length > 0) {
        logger.debug(`Valid processes for port ${localPort}: ${JSON.stringify(validProcesses)}`);
      }

      if (validProcesses.length === 0) {
        return false;
      }

      // Second check: Test if the port is actually accessible (connection test)
      // This verifies the port forward is actually working, not just the process exists
      try {
        // Use curl to test actual HTTP connectivity to metrics endpoint
        const connectivityTest = await shellRunner.run(
          `timeout 2 curl -s --connect-timeout 1 http://localhost:${localPort}/metrics >/dev/null 2>&1 && echo "PORT_OPEN" || echo "PORT_CLOSED"`,
          [],
          true,
          false,
        );

        logger.debug(`Port ${localPort} connectivity test raw output: "${JSON.stringify(connectivityTest)}"`);
        logger.debug(`Port ${localPort} connectivity test output type: ${typeof connectivityTest}`);
        logger.debug(
          `Port ${localPort} connectivity test output length: ${connectivityTest ? connectivityTest.length : 'null'}`,
        );

        // Handle both string and array output from shellRunner
        let output: string;
        if (Array.isArray(connectivityTest)) {
          output = connectivityTest.join(' ');
        } else if (typeof connectivityTest === 'string') {
          output = connectivityTest;
        } else {
          output = String(connectivityTest || '');
        }

        const isPortAccessible = output.includes('PORT_OPEN');
        logger.debug(`Port ${localPort} connectivity test processed output: "${output}"`);
        logger.debug(`Port ${localPort} connectivity test: ${isPortAccessible ? 'OPEN' : 'CLOSED'}`);

        return isPortAccessible;
      } catch (connectivityError) {
        logger.debug(
          `Port ${localPort} connectivity test failed: ${connectivityError instanceof Error ? connectivityError.message : String(connectivityError)}`,
        );

        // If connectivity test fails, try an alternative test with curl
        try {
          const curlTest = await shellRunner.run(
            `timeout 2 curl -s --connect-timeout 1 http://localhost:${localPort} >/dev/null 2>&1 && echo "CURL_SUCCESS" || echo "CURL_FAILED"`,
            [],
            true,
            false,
          );

          const isCurlSuccessful = curlTest.includes('CURL_SUCCESS');
          logger.debug(`Port ${localPort} curl test: ${isCurlSuccessful ? 'SUCCESS' : 'FAILED'}`);
          return isCurlSuccessful;
        } catch (curlError) {
          logger.debug(
            `Port ${localPort} curl test also failed: ${curlError instanceof Error ? curlError.message : String(curlError)}`,
          );
          return false;
        }
      }
    } catch (error) {
      logger.debug(
        `Failed to check port forward process for port ${localPort}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // If command fails, assume port forward is not running
      return false;
    }
  }

  public get componentIds(): ComponentIdsStructure {
    return this.state.componentIds;
  }

  /* -------- Modifiers -------- */

  /** Used to add new component to their respective group. */
  public addNewComponent(component: BaseStateSchema, type: ComponentTypes, isReplace?: boolean): void {
    const componentId: ComponentId = component.metadata.id;

    if (typeof componentId !== 'number') {
      throw new SoloError(`Component id is required ${componentId}`);
    }

    if (!(component instanceof BaseStateSchema)) {
      throw new SoloError('Component must be instance of BaseState', undefined, BaseStateSchema);
    }

    const addComponentCallback: (components: BaseStateSchema[]) => void = (components): void => {
      if (this.checkComponentExists(components, component) && !isReplace) {
        throw new SoloError('Component exists', undefined, component);
      }
      components.push(component);
    };

    this.applyCallbackToComponentGroup(type, addComponentCallback, componentId);

    // Increment the component id counter for the specified type when adding
    this.componentIds[type] += 1;
  }

  public changeNodePhase(componentId: ComponentId, phase: DeploymentPhase): void {
    if (!this.state.consensusNodes.some((component): boolean => +component.metadata.id === +componentId)) {
      throw new SoloError(`Consensus node ${componentId} doesn't exist`);
    }

    const component: ConsensusNodeStateSchema = this.state.consensusNodes.find(
      (component): boolean => +component.metadata.id === +componentId,
    );

    component.metadata.phase = phase;
  }

  /** Used to remove specific component from their respective group. */
  public removeComponent(componentId: ComponentId, type: ComponentTypes): void {
    if (typeof componentId !== 'number') {
      throw new SoloError(`Component id is required ${componentId}`);
    }

    if (!isValidEnum(type, ComponentTypes)) {
      throw new SoloError(`Invalid component type ${type}`);
    }

    const removeComponentCallback: (components: BaseStateSchema[]) => void = (components): void => {
      const index: number = components.findIndex((component): boolean => component.metadata.id === componentId);
      if (index === -1) {
        throw new SoloError(`Component ${componentId} of type ${type} not found while attempting to remove`);
      }

      components.splice(index, 1);
    };

    this.applyCallbackToComponentGroup(type, removeComponentCallback, componentId);
  }

  /* -------- Utilities -------- */

  public getComponent<T extends BaseStateSchema>(type: ComponentTypes, componentId: ComponentId): T {
    let component: T;

    const getComponentCallback: (components: BaseStateSchema[]) => void = (components): void => {
      component = components.find((component): boolean => component.metadata.id === componentId) as T;

      if (!component) {
        throw new SoloError(`Component ${componentId} of type ${type} not found while attempting to read`);
      }
    };

    this.applyCallbackToComponentGroup(type, getComponentCallback, componentId);

    return component;
  }

  public getComponentByType<T extends BaseStateSchema>(type: ComponentTypes): T[] {
    let components: T[] = [];

    const getComponentsByTypeCallback: (comps: BaseStateSchema[]) => void = (comps): void => {
      components = comps as T[];
    };

    this.applyCallbackToComponentGroup(type, getComponentsByTypeCallback);

    return components;
  }

  public getComponentsByClusterReference<T extends BaseStateSchema>(
    type: ComponentTypes,
    clusterReference: ClusterReferenceName,
  ): T[] {
    let filteredComponents: T[] = [];

    const getComponentsByClusterReferenceCallback: (components: T[]) => void = (components): void => {
      filteredComponents = components.filter((component): boolean => component.metadata.cluster === clusterReference);
    };

    this.applyCallbackToComponentGroup(type, getComponentsByClusterReferenceCallback);

    return filteredComponents;
  }

  public getComponentById<T extends BaseStateSchema>(type: ComponentTypes, id: number): T {
    let filteredComponent: T;

    const getComponentByIdCallback: (components: T[]) => void = (components): void => {
      filteredComponent = components.find((component): boolean => +component.metadata.id === +id);
    };

    this.applyCallbackToComponentGroup(type, getComponentByIdCallback);

    if (!filteredComponent) {
      throw new SoloError(`Component of type ${type} with id ${id} was not found in remote config`);
    }

    return filteredComponent;
  }

  /**
   * Method used to map the type to the specific component group
   * and pass it to a callback to apply modifications
   */
  private applyCallbackToComponentGroup(
    componentType: ComponentTypes,
    callback: (components: BaseStateSchema[]) => void,
    componentId?: ComponentId,
  ): void {
    switch (componentType) {
      case ComponentTypes.RelayNodes: {
        callback(this.state.relayNodes);
        break;
      }

      case ComponentTypes.HaProxy: {
        callback(this.state.haProxies);
        break;
      }

      case ComponentTypes.MirrorNode: {
        callback(this.state.mirrorNodes);
        break;
      }

      case ComponentTypes.EnvoyProxy: {
        callback(this.state.envoyProxies);
        break;
      }

      case ComponentTypes.ConsensusNode: {
        callback(this.state.consensusNodes);
        break;
      }

      case ComponentTypes.Explorer: {
        callback(this.state.explorers);
        break;
      }

      case ComponentTypes.BlockNode: {
        callback(this.state.blockNodes);
        break;
      }

      default: {
        throw new SoloError(`Unknown component type ${componentType}, component id: ${componentId}`);
      }
    }
  }

  /** checks if component exists in the respective group */
  private checkComponentExists(components: BaseStateSchema[], newComponent: BaseStateSchema): boolean {
    return components.some((component): boolean => component.metadata.id === newComponent.metadata.id);
  }

  public getNewComponentId(componentType: ComponentTypes): number {
    return this.componentIds[componentType];
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
   * @param label Label for the port forward
   * @param reuse Whether to reuse existing port forward if available
   * @param nodeId Optional node ID for finding component when cluster reference is not available
   * @returns The local port number that was used for port forwarding
   */
  public async managePortForward(
    clusterReference: ClusterReferenceName,
    podReference: PodReference,
    podPort: number,
    localPort: number,
    k8Client: K8,
    logger: SoloLogger,
    componentType: ComponentTypes,
    label: string,
    reuse: boolean = false,
    nodeId?: number,
  ): Promise<number> {
    // found component by cluster reference or nodeId
    let component: BaseStateSchema;
    if (clusterReference) {
      const schemeComponents: BaseStateSchema[] = this.getComponentsByClusterReference<BaseStateSchema>(
        componentType,
        clusterReference,
      );
      component = schemeComponents[0];
    } else {
      const componentId: ComponentId = Templates.renderComponentIdFromNodeId(nodeId);
      component = this.getComponentById<BaseStateSchema>(componentType, componentId);
    }

    if (component === undefined) {
      // it is possible we are upgrading a chart and previous version has no clusterReference save in configMap
      // so we will not be able to find component by clusterReference
      reuse = true;
      logger.showUser(`Port forward config not found for previous installed ${label}, reusing existing port forward`);

      // Even when component is undefined, we should check if port is actually in use
      // to avoid reusing dead port forwards
      const isProcessRunning = await this.isPortForwardProcessRunning(localPort, logger);
      if (!isProcessRunning) {
        logger.showUser(`Port ${localPort} appears to be free, will create new port forward`);
        reuse = false;
      }
    } else {
      logger.debug(`Found component for ${label}, checking port forward configs...`);
      if (component.metadata.portForwardConfigs) {
        logger.debug(`Component ${label} has ${component.metadata.portForwardConfigs.length} port forward configs`);
        for (const portForwardConfig of component.metadata.portForwardConfigs) {
          logger.debug(
            `Checking port forward config for ${label}: localPort=${portForwardConfig.localPort}, podPort=${portForwardConfig.podPort}`,
          );
          if (reuse === true && portForwardConfig.podPort === podPort) {
            // Check if the port forward process is actually still running
            logger.debug(`About to check port forward process for ${label} at port ${portForwardConfig.localPort}`);
            const isProcessRunning = await this.isPortForwardProcessRunning(portForwardConfig.localPort, logger);

            if (isProcessRunning) {
              logger.showUser(`${label} Port forward already enabled at ${portForwardConfig.localPort}`);
              return portForwardConfig.localPort;
            } else {
              logger.showUser(
                `${label} Port forward config found at ${portForwardConfig.localPort} but process is not running, will recreate`,
              );
              // Remove the stale config entry
              const configIndex = component.metadata.portForwardConfigs.indexOf(portForwardConfig);
              if (configIndex !== -1) {
                component.metadata.portForwardConfigs.splice(configIndex, 1);
                logger.debug(`Removed stale port forward config for localPort ${portForwardConfig.localPort}`);
              }
              // Don't return, let the method create a new port forward
              break;
            }
          }
        }
      } else {
        logger.debug(`Component ${label} has no port forward configs`);
      }
    }

    // Check if this is a metrics port forward and verify Java process is running
    if (podPort === 9999) {
      logger.debug('Checking if Java/HapiApp process is running in pod for metrics port forward');
      try {
        const shellRunner = new ShellRunner(logger);
        const javaProcessCheck = await shellRunner.run(
          `kubectl exec -n ${podReference.namespace} --context ${clusterReference} ${podReference.name} -c root-container -- bash -c "pgrep -f java >/dev/null 2>&1 && echo 'JAVA_RUNNING' || echo 'JAVA_NOT_RUNNING'"`,
          [],
          true,
          false,
        );

        const javaRunning = javaProcessCheck && javaProcessCheck.includes('JAVA_RUNNING');

        if (!javaRunning) {
          logger.showUser(
            `❌ ${label} Java/HapiApp process is not running in pod. Cannot create metrics port forward.`,
          );
          logger.showUser(
            '💡 Please check if node is properly started. The metrics server (port 9999) is not available.',
          );
          throw new Error(
            `Java/HapiApp process not running in pod ${podReference.name}. Cannot create metrics port forward.`,
          );
        }

        logger.debug('✅ Java/HapiApp process is running in pod, proceeding with port forward creation');
      } catch (javaCheckError) {
        logger.debug(
          `Failed to check Java process in pod: ${javaCheckError instanceof Error ? javaCheckError.message : String(javaCheckError)}`,
        );
        logger.showUser(
          '⚠️  Could not verify Java/HapiApp process status in pod. Proceeding with port forward creation...',
        );
      }
    }

    // Enable port forwarding
    const portForwardPortNumber: number = await k8Client
      .pods()
      .readByReference(podReference)
      .portForward(localPort, podPort, reuse);

    logger.addMessageGroup(constants.PORT_FORWARDING_MESSAGE_GROUP, 'Port forwarding enabled');
    logger.addMessageGroupMessage(
      constants.PORT_FORWARDING_MESSAGE_GROUP,
      `${label} port forward enabled on localhost:${portForwardPortNumber}`,
    );

    if (component !== undefined) {
      if (component.metadata.portForwardConfigs === undefined) {
        component.metadata.portForwardConfigs = [];
      }

      // Check if this exact podPort and localPort pair already exists
      const existingConfig = component.metadata.portForwardConfigs.find(
        config => config.podPort === podPort && config.localPort === portForwardPortNumber,
      );

      if (existingConfig) {
        logger.info(`port forward config already exists: localPort=${portForwardPortNumber}, podPort=${podPort}`);
      } else {
        logger.info(`add port localPort=${portForwardPortNumber}, podPort=${podPort}`);
        // Save port forward config to component
        component.metadata.portForwardConfigs.push({
          podPort: podPort,
          localPort: portForwardPortNumber,
        });
      }
    }

    return portForwardPortNumber;
  }
}
