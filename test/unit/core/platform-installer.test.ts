// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as constants from '../../../src/core/constants.js';
import {type PlatformInstaller} from '../../../src/core/platform-installer.js';
import {IllegalArgumentError} from '../../../src/core/errors/illegal-argument-error.js';
import {MissingArgumentError} from '../../../src/core/errors/missing-argument-error.js';
import {PodName} from '../../../src/integration/kube/resources/pod/pod-name.js';
import {container} from 'tsyringe-neo';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {getTestCacheDirectory} from '../../test-utility.js';

describe('PackageInstaller', () => {
  let installer: PlatformInstaller;

  before(() => {
    installer = container.resolve(InjectTokens.PlatformInstaller);
  });

  describe('validatePlatformReleaseDir', () => {
    it('should fail for missing path', () => {
      expect(() => installer.validatePlatformReleaseDir('')).to.throw(MissingArgumentError);
    });

    it('should fail for invalid path', () => {
      expect(() => installer.validatePlatformReleaseDir('/INVALID')).to.throw(IllegalArgumentError);
    });

    it('should fail if directory does not have data/apps directory', () => {
      const temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-'));
      fs.mkdirSync(`${temporaryDirectory}/${constants.HEDERA_DATA_LIB_DIR}`, {recursive: true});
      expect(() => installer.validatePlatformReleaseDir(temporaryDirectory)).to.throw(IllegalArgumentError);
      fs.rmSync(temporaryDirectory, {recursive: true});
    });

    it('should fail if directory does not have data/libs directory', () => {
      const temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-'));
      fs.mkdirSync(`${temporaryDirectory}/${constants.HEDERA_DATA_APPS_DIR}`, {recursive: true});
      expect(() => installer.validatePlatformReleaseDir(temporaryDirectory)).to.throw(IllegalArgumentError);
      fs.rmSync(temporaryDirectory, {recursive: true});
    });

    it('should fail if data/apps directory has no jar files', () => {
      const temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-'));
      fs.mkdirSync(`${temporaryDirectory}/${constants.HEDERA_DATA_APPS_DIR}`, {recursive: true});
      fs.mkdirSync(`${temporaryDirectory}/${constants.HEDERA_DATA_LIB_DIR}`, {recursive: true});
      expect(() => installer.validatePlatformReleaseDir(temporaryDirectory)).to.throw(IllegalArgumentError);
      fs.rmSync(temporaryDirectory, {recursive: true});
    });

    it('should fail if data/lib directory has no jar files', () => {
      const temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-app-'));
      fs.mkdirSync(`${temporaryDirectory}/${constants.HEDERA_DATA_APPS_DIR}`, {recursive: true});
      fs.writeFileSync(`${temporaryDirectory}/${constants.HEDERA_DATA_APPS_DIR}/app.jar`, '');
      fs.mkdirSync(`${temporaryDirectory}/${constants.HEDERA_DATA_LIB_DIR}`, {recursive: true});
      expect(() => installer.validatePlatformReleaseDir(temporaryDirectory)).to.throw(IllegalArgumentError);
      fs.rmSync(temporaryDirectory, {recursive: true});
    });

    it('should succeed with non-empty data/apps and data/libs directory', () => {
      const temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-lib-'));
      fs.mkdirSync(`${temporaryDirectory}/${constants.HEDERA_DATA_APPS_DIR}`, {recursive: true});
      fs.writeFileSync(`${temporaryDirectory}/${constants.HEDERA_DATA_APPS_DIR}/app.jar`, '');
      fs.mkdirSync(`${temporaryDirectory}/${constants.HEDERA_DATA_LIB_DIR}`, {recursive: true});
      fs.writeFileSync(`${temporaryDirectory}/${constants.HEDERA_DATA_LIB_DIR}/lib-1.jar`, '');
      expect(() => installer.validatePlatformReleaseDir(temporaryDirectory)).not.to.throw();
      fs.rmSync(temporaryDirectory, {recursive: true});
    });
  });

  describe('extractPlatform', () => {
    let zipPath: string;
    let checksumPath: string;
    const packageVersion: string = 'v0.42.5';

    before(async (): Promise<void> => {
      const testCacheDirectory: string = getTestCacheDirectory();
      [zipPath, checksumPath] = await installer.getPlatformRelease(testCacheDirectory, packageVersion);
    });

    it('should fail for missing pod name', async () => {
      await expect(
        installer.fetchPlatform(null as PodReference, packageVersion, zipPath, checksumPath),
      ).to.be.rejectedWith(MissingArgumentError);
    });
    it('should fail for missing tag', async () => {
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

  describe('copyGossipKeys', () => {
    it('should fail for missing podName', async () => {
      // @ts-expect-error - TS2554: Expected 3 arguments, but got 2
      await expect(installer.copyGossipKeys('', os.tmpdir())).to.be.rejectedWith(MissingArgumentError);
    });

    it('should fail for missing stagingDir path', async () => {
      // @ts-expect-error - TS2554: Expected 3 arguments, but got 2
      await expect(installer.copyGossipKeys('node1', '')).to.be.rejectedWith(MissingArgumentError);
    });
  });
});
