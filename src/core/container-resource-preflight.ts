// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import * as constants from './constants.js';
import {type ContainerEngineResourceInspector} from '../integration/container-engine/container-engine-resource-inspector.js';
import {type ContainerEngineResources} from '../integration/container-engine/container-engine-resources.js';
import {type SoloLogger} from './logging/solo-logger.js';

/**
 * Best-effort pre-flight check that warns when the local container engine (Docker/Podman) reports
 * fewer resources than Solo recommends, so users learn about likely problems before a long deploy.
 *
 * This never throws and never blocks: detection failures and low-resource situations only produce a
 * user-facing warning.
 */
export class ContainerResourcePreflight {
  private static readonly BYTES_PER_GIBIBYTE: number = 1024 * 1024 * 1024;

  public static async warnIfInsufficient(
    inspector: ContainerEngineResourceInspector,
    logger: SoloLogger,
  ): Promise<void> {
    let resources: ContainerEngineResources | undefined;
    try {
      resources = await inspector.getAvailableResources();
    } catch {
      return; // Best-effort: never block the run on a detection failure.
    }

    if (!resources) {
      return;
    }

    const memoryInsufficient: boolean = resources.memoryBytes < constants.MINIMUM_RECOMMENDED_MEMORY_BYTES;
    const cpuInsufficient: boolean = resources.cpuCount < constants.MINIMUM_RECOMMENDED_CPU_CORES;
    if (!memoryInsufficient && !cpuInsufficient) {
      return;
    }

    const detectedMemory: string = (resources.memoryBytes / ContainerResourcePreflight.BYTES_PER_GIBIBYTE).toFixed(1);
    const recommendedMemory: number = Math.round(
      constants.MINIMUM_RECOMMENDED_MEMORY_BYTES / ContainerResourcePreflight.BYTES_PER_GIBIBYTE,
    );

    logger.showUser(
      chalk.yellow(
        [
          '⚠ Container engine resources look low for a Solo deployment:',
          `  detected:    ${detectedMemory}GB memory, ${resources.cpuCount} CPU(s)`,
          `  recommended: >=${recommendedMemory}GB memory, >=${constants.MINIMUM_RECOMMENDED_CPU_CORES} CPU(s)`,
          '  The deployment may fail or run slowly. Increase the memory/CPU allocated to',
          '  Docker/Podman (or free up resources) before continuing.',
        ].join('\n'),
      ),
    );
  }
}
