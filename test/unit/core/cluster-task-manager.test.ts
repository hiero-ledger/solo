// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';
import path from 'node:path';
import {ClusterTaskManager} from '../../../src/core/cluster-task-manager.js';
import * as constants from '../../../src/core/constants.js';
import {resetForTest} from '../../test-container.js';
import {type BrewPackageManager} from '../../../src/core/package-managers/brew-package-manager.js';
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
    {} as unknown as BrewPackageManager,
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

  it('should resolve small-memory kind config to an absolute path', (): void => {
    const manager: ClusterTaskManager = createClusterTaskManager();
    const configPath: string = getConfigFilePath(manager, true);

    expect(path.isAbsolute(configPath)).to.equal(true);
    expect(configPath).to.equal(path.join(constants.RESOURCES_DIR, 'templates', 'small-memory', 'kind-config.yaml'));
    expect(configPath).to.not.equal('resources/templates/small-memory/kind-config.yaml');
  });
});
