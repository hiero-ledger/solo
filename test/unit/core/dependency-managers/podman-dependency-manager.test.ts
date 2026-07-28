// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import fs from 'node:fs';
import os from 'node:os';
import {container} from 'tsyringe-neo';

import {resetForTest} from '../../../test-container.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type PodmanDependencyManager} from '../../../../src/core/dependency-managers/index.js';
import {PodmanDependencyManager as PodmanDependencyManagerClass} from '../../../../src/core/dependency-managers/podman-dependency-manager.js';
import {OperatingSystem} from '../../../../src/business/utils/operating-system.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import * as constants from '../../../../src/core/constants.js';

describe('PodmanDependencyManager', (): void => {
  const savedContainersConfig: string | undefined = process.env.CONTAINERS_CONF;
  const savedRegistriesConfig: string | undefined = process.env.CONTAINERS_REGISTRIES_CONF;

  const restoreEnvironment: () => void = (): void => {
    if (savedContainersConfig === undefined) {
      delete process.env.CONTAINERS_CONF;
    } else {
      process.env.CONTAINERS_CONF = savedContainersConfig;
    }
    if (savedRegistriesConfig === undefined) {
      delete process.env.CONTAINERS_REGISTRIES_CONF;
    } else {
      process.env.CONTAINERS_REGISTRIES_CONF = savedRegistriesConfig;
    }
  };

  afterEach((): void => {
    sinon.restore();
    restoreEnvironment();
  });

  describe('containerConfigEnvironmentArguments', (): void => {
    let emptyHomeDirectory: string;

    beforeEach((): void => {
      emptyHomeDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-podman-home-'));
    });

    afterEach((): void => {
      fs.rmSync(emptyHomeDirectory, {recursive: true, force: true});
    });

    it('should return NAME=value pairs for the container configuration variables that are set', (): void => {
      process.env.CONTAINERS_CONF = '/solo/config/containers.conf';
      process.env.CONTAINERS_REGISTRIES_CONF = '/solo/config/registries.conf';

      const environmentArguments: string[] =
        PodmanDependencyManagerClass.containerConfigEnvironmentArguments(emptyHomeDirectory);

      expect(environmentArguments).to.deep.equal([
        'CONTAINERS_CONF=/solo/config/containers.conf',
        'CONTAINERS_REGISTRIES_CONF=/solo/config/registries.conf',
      ]);
    });

    it('should return an empty list when nothing is set and no configuration is persisted', (): void => {
      delete process.env.CONTAINERS_CONF;
      delete process.env.CONTAINERS_REGISTRIES_CONF;

      expect(PodmanDependencyManagerClass.containerConfigEnvironmentArguments(emptyHomeDirectory)).to.deep.equal([]);
    });

    it('should restore the variables from configuration persisted by an earlier run on Linux', (): void => {
      sinon.stub(OperatingSystem, 'isLinux').returns(true);
      delete process.env.CONTAINERS_CONF;
      delete process.env.CONTAINERS_REGISTRIES_CONF;

      const configDirectory: string = PathEx.join(emptyHomeDirectory, 'config');
      fs.mkdirSync(configDirectory, {recursive: true});
      const containersConfigPath: string = PathEx.join(configDirectory, 'containers.conf');
      const registriesConfigPath: string = PathEx.join(configDirectory, 'registries.conf');
      fs.writeFileSync(containersConfigPath, '[engine]\n');
      fs.writeFileSync(registriesConfigPath, 'unqualified-search-registries = ["docker.io"]\n');

      const environmentArguments: string[] =
        PodmanDependencyManagerClass.containerConfigEnvironmentArguments(emptyHomeDirectory);

      expect(environmentArguments).to.deep.equal([
        `CONTAINERS_CONF=${containersConfigPath}`,
        `CONTAINERS_REGISTRIES_CONF=${registriesConfigPath}`,
      ]);
    });
  });

  describe('setupConfig in rootful mode', (): void => {
    const runtimeBinaryDirectory: string = '/home/linuxbrew/.linuxbrew/bin';

    let homeDirectory: string;
    let cacheDirectory: string;
    let podmanDependencyManager: PodmanDependencyManager;

    beforeEach((): void => {
      resetForTest();
      sinon.stub(OperatingSystem, 'isLinux').returns(true);
      homeDirectory = container.resolve<string>(InjectTokens.HomeDirectory);
      cacheDirectory = container.resolve<string>(InjectTokens.CacheDir);
      podmanDependencyManager = container.resolve<PodmanDependencyManager>(InjectTokens.PodmanDependencyManager);

      const templatesDirectory: string = PathEx.join(cacheDirectory, 'templates', 'podman');
      fs.mkdirSync(templatesDirectory, {recursive: true});
      fs.copyFileSync(
        PathEx.join(constants.RESOURCES_DIR, 'templates', 'podman', 'containers-rootful.conf'),
        PathEx.join(templatesDirectory, 'containers-rootful.conf'),
      );
      fs.copyFileSync(
        PathEx.join(constants.RESOURCES_DIR, 'templates', 'podman', 'registries.conf'),
        PathEx.join(templatesDirectory, 'registries.conf'),
      );
    });

    it('should write containers.conf and registries.conf pointing at the runtime stack', async (): Promise<void> => {
      await podmanDependencyManager.setupConfig(runtimeBinaryDirectory);

      const containersConfigPath: string = PathEx.join(homeDirectory, 'config', 'containers.conf');
      const registriesConfigPath: string = PathEx.join(homeDirectory, 'config', 'registries.conf');

      const containersConfig: string = fs.readFileSync(containersConfigPath, 'utf8');
      expect(containersConfig).to.contain(`crun = ["${runtimeBinaryDirectory}/crun"]`);
      expect(containersConfig).to.contain(`conmon_path = ["${runtimeBinaryDirectory}/conmon"]`);
      expect(containersConfig).to.contain(`"${runtimeBinaryDirectory}"`);
      expect(containersConfig).to.not.contain('$CRUN_PATH');
      expect(containersConfig).to.not.contain('$CONMON_PATH');
      expect(containersConfig).to.not.contain('$PODMAN_BINARY_DIR');
      expect(containersConfig).to.not.contain('$HELPER_BINARIES_DIR');

      const registriesConfig: string = fs.readFileSync(registriesConfigPath, 'utf8');
      expect(registriesConfig).to.contain('unqualified-search-registries = ["docker.io"]');

      expect(process.env.CONTAINERS_CONF).to.equal(containersConfigPath);
      expect(process.env.CONTAINERS_REGISTRIES_CONF).to.equal(registriesConfigPath);
    });

    it('should reject when the runtime binary directory is missing', async (): Promise<void> => {
      await expect(podmanDependencyManager.setupConfig()).to.be.rejectedWith(
        'runtimeBinaryDirectory is required to configure rootful podman',
      );
    });
  });
});
