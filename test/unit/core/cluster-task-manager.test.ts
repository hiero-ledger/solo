// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';
import path from 'node:path';
import fs from 'node:fs';
import * as yaml from 'yaml';
import {ClusterTaskManager} from '../../../src/core/cluster-task-manager.js';
import * as constants from '../../../src/core/constants.js';
import {resetForTest} from '../../test-container.js';
import {type OsPackageManager} from '../../../src/core/package-managers/os-package-manager.js';
import {type DefaultKindClientBuilder} from '../../../src/integration/kind/impl/default-kind-client-builder.js';
import {type DependencyManager} from '../../../src/core/dependency-managers/dependency-manager.js';
import {type KindDependencyManager} from '../../../src/core/dependency-managers/kind-dependency-manager.js';
import {type PodmanDependencyManager} from '../../../src/core/dependency-managers/podman-dependency-manager.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type GitClient} from '../../../src/integration/git/git-client.js';
import {type ContainerEngineClient} from '../../../src/integration/container-engine/container-engine-client.js';

function getConfigFilePath(manager: ClusterTaskManager, useSmallMemoryCluster: boolean): string {
  return (
    manager as unknown as {
      getConfigFilePath: (useSmallMemoryCluster: boolean) => string;
    }
  ).getConfigFilePath(useSmallMemoryCluster);
}

function createClusterTaskManager(): ClusterTaskManager {
  return new ClusterTaskManager(
    {} as unknown as OsPackageManager,
    {} as unknown as DefaultKindClientBuilder,
    {} as unknown as PodmanDependencyManager,
    {} as unknown as KindDependencyManager,
    '/tmp/podman',
    {} as unknown as K8Factory,
    {} as unknown as DependencyManager,
    '/tmp/kind',
    {} as unknown as GitClient,
    {} as unknown as ContainerEngineClient,
  );
}

describe('ClusterTaskManager', (): void => {
  before((): void => {
    resetForTest();
  });

  it('should return configured kind config for default cluster setup', (): void => {
    const manager: ClusterTaskManager = createClusterTaskManager();

    expect(getConfigFilePath(manager, false)).to.equal(constants.KIND_CLUSTER_CONFIG_FILE);
  });

  it('should stage small-memory kind config under the shared cache directory with an absolute patches hostPath', (): void => {
    const manager: ClusterTaskManager = createClusterTaskManager();
    const configPath: string = getConfigFilePath(manager, true);

    // The rendered config must live under SOLO_CACHE_DIR (~/.solo/cache), a path Docker Desktop
    // shares by default, rather than the install directory (e.g. /opt/homebrew/Cellar).
    const expectedStagedDirectory: string = path.join(constants.SOLO_CACHE_DIR, 'templates', 'small-memory');
    expect(path.isAbsolute(configPath)).to.equal(true);
    expect(configPath).to.equal(path.join(expectedStagedDirectory, 'kind-config.yaml'));
    expect(fs.existsSync(configPath)).to.equal(true);

    // The patches directory must be staged alongside the rendered config.
    const expectedPatchesDirectory: string = path.join(expectedStagedDirectory, 'patches');
    expect(fs.existsSync(expectedPatchesDirectory)).to.equal(true);

    // The patches mount must be rewritten to the absolute staged path (not the bundled relative one).
    const renderedConfig: {nodes?: {extraMounts?: {hostPath?: string; containerPath?: string}[]}[]} = yaml.parse(
      fs.readFileSync(configPath, 'utf8'),
    );
    const patchesMount: {hostPath?: string; containerPath?: string} | undefined = renderedConfig.nodes
      ?.flatMap((node): {hostPath?: string; containerPath?: string}[] => node.extraMounts ?? [])
      .find((mount): boolean => mount.containerPath === '/patches');
    expect(patchesMount, 'patches mount should be present').to.not.equal(undefined);
    expect(patchesMount?.hostPath).to.equal(expectedPatchesDirectory);
    expect(path.isAbsolute(patchesMount?.hostPath ?? '')).to.equal(true);
  });
});
