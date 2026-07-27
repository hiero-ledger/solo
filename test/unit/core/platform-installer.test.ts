// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as constants from '../../../src/core/constants.js';
import {type PlatformInstaller} from '../../../src/core/platform-installer.js';
import {IllegalArgumentError} from '../../../src/core/errors/classes/validation/illegal-argument-error.js';
import {MissingArgumentError} from '../../../src/core/errors/classes/validation/missing-argument-error.js';
import {PodName} from '../../../src/integration/kube/resources/pod/pod-name.js';
import {container} from 'tsyringe-neo';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {getTestCacheDirectory} from '../../test-utility.js';

describe('PackageInstaller', (): void => {
  let installer: PlatformInstaller;

  before((): void => {
    installer = container.resolve(InjectTokens.PlatformInstaller);
  });

  describe('validatePlatformReleaseDir', (): void => {
    it('should fail for missing path', (): void => {
      expect((): void => installer.validatePlatformReleaseDir('')).to.throw(MissingArgumentError);
    });

    it('should fail for invalid path', (): void => {
      expect((): void => installer.validatePlatformReleaseDir('/INVALID')).to.throw(IllegalArgumentError);
    });

    it('should fail if directory does not have data/apps directory', (): void => {
      const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-'));
      fs.mkdirSync(`${temporaryDirectory}/${constants.HEDERA_DATA_LIB_DIR}`, {recursive: true});
      expect((): void => installer.validatePlatformReleaseDir(temporaryDirectory)).to.throw(IllegalArgumentError);
      fs.rmSync(temporaryDirectory, {recursive: true});
    });

    it('should fail if directory does not have data/libs directory', (): void => {
      const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-'));
      fs.mkdirSync(`${temporaryDirectory}/${constants.HEDERA_DATA_APPS_DIR}`, {recursive: true});
      expect((): void => installer.validatePlatformReleaseDir(temporaryDirectory)).to.throw(IllegalArgumentError);
      fs.rmSync(temporaryDirectory, {recursive: true});
    });

    it('should fail if data/apps directory has no jar files', (): void => {
      const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-'));
      fs.mkdirSync(`${temporaryDirectory}/${constants.HEDERA_DATA_APPS_DIR}`, {recursive: true});
      fs.mkdirSync(`${temporaryDirectory}/${constants.HEDERA_DATA_LIB_DIR}`, {recursive: true});
      expect((): void => installer.validatePlatformReleaseDir(temporaryDirectory)).to.throw(IllegalArgumentError);
      fs.rmSync(temporaryDirectory, {recursive: true});
    });

    it('should fail if data/lib directory has no jar files', (): void => {
      const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-app-'));
      fs.mkdirSync(`${temporaryDirectory}/${constants.HEDERA_DATA_APPS_DIR}`, {recursive: true});
      fs.writeFileSync(`${temporaryDirectory}/${constants.HEDERA_DATA_APPS_DIR}/app.jar`, '');
      fs.mkdirSync(`${temporaryDirectory}/${constants.HEDERA_DATA_LIB_DIR}`, {recursive: true});
      expect((): void => installer.validatePlatformReleaseDir(temporaryDirectory)).to.throw(IllegalArgumentError);
      fs.rmSync(temporaryDirectory, {recursive: true});
    });

    it('should succeed with non-empty data/apps and data/libs directory', (): void => {
      const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-lib-'));
      fs.mkdirSync(`${temporaryDirectory}/${constants.HEDERA_DATA_APPS_DIR}`, {recursive: true});
      fs.writeFileSync(`${temporaryDirectory}/${constants.HEDERA_DATA_APPS_DIR}/app.jar`, '');
      fs.mkdirSync(`${temporaryDirectory}/${constants.HEDERA_DATA_LIB_DIR}`, {recursive: true});
      fs.writeFileSync(`${temporaryDirectory}/${constants.HEDERA_DATA_LIB_DIR}/lib-1.jar`, '');
      expect((): void => installer.validatePlatformReleaseDir(temporaryDirectory)).not.to.throw();
      fs.rmSync(temporaryDirectory, {recursive: true});
    });
  });

  describe('extractPlatform', (): void => {
    let zipPath: string;
    let checksumPath: string;
    const packageVersion: string = 'v0.42.5';

    before(async (): Promise<void> => {
      const testCacheDirectory: string = getTestCacheDirectory();
      [zipPath, checksumPath] = await installer.getPlatformRelease(testCacheDirectory, packageVersion);
    });

    it('should fail for missing pod name', async (): Promise<void> => {
      await expect(
        installer.fetchPlatform(null as PodReference, packageVersion, zipPath, checksumPath),
      ).to.be.rejectedWith(MissingArgumentError);
    });
    it('should fail for missing tag', async (): Promise<void> => {
      await expect(
        installer.fetchPlatform(
          PodReference.of(NamespaceName.of('platform-installer-test'), PodName.of('network-node1-0')),
          '',
          zipPath,
          checksumPath,
        ),
      ).to.be.rejectedWith(MissingArgumentError);
    });
  });

  describe('copyGossipKeys', (): void => {
    it('should fail for missing podName', async (): Promise<void> => {
      // @ts-expect-error - TS2554: Expected 3 arguments, but got 2
      await expect(installer.copyGossipKeys('', os.tmpdir())).to.be.rejectedWith(MissingArgumentError);
    });

    it('should fail for missing stagingDir path', async (): Promise<void> => {
      // @ts-expect-error - TS2554: Expected 3 arguments, but got 2
      await expect(installer.copyGossipKeys('node1', '')).to.be.rejectedWith(MissingArgumentError);
    });
  });
});
