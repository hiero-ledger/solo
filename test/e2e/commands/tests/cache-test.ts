// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {Flags} from '../../../../src/commands/flags.js';
import {main} from '../../../../src/index.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {type BaseTestOptions} from './base-test-options.js';
import {it} from 'mocha';
import {expect} from 'chai';
import fs from 'node:fs';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {type DeploymentName} from '../../../../src/types/index.js';
import {CacheCommandDefinition} from '../../../../src/commands/command-definitions/cache-command-definition.js';

/**
 * Adjust these if your command-definition constants use different names,
 * for example if the CLI path is `cache image pull`.
 */
export class CacheTest extends BaseCommandTest {
  public static soloCachePullArgv(testName: string): string[] {
    const {newArgv, argvPushGlobalFlags} = CacheTest;

    const argv: string[] = newArgv();
    argv.push(
      CacheCommandDefinition.COMMAND_NAME,
      CacheCommandDefinition.IMAGE_SUBCOMMAND_NAME,
      CacheCommandDefinition.IMAGE_PULL,
    );
    argvPushGlobalFlags(argv, testName, true, false);
    return argv;
  }

  public static soloCacheListArgv(testName: string): string[] {
    const {newArgv, argvPushGlobalFlags} = CacheTest;

    const argv: string[] = newArgv();
    argv.push(
      CacheCommandDefinition.COMMAND_NAME,
      CacheCommandDefinition.IMAGE_SUBCOMMAND_NAME,
      CacheCommandDefinition.IMAGE_LIST,
    );
    argvPushGlobalFlags(argv, testName, true, false);
    return argv;
  }

  public static soloCacheStatusArgv(testName: string): string[] {
    const {newArgv, argvPushGlobalFlags} = CacheTest;

    const argv: string[] = newArgv();
    argv.push(
      CacheCommandDefinition.COMMAND_NAME,
      CacheCommandDefinition.IMAGE_SUBCOMMAND_NAME,
      CacheCommandDefinition.IMAGE_STATUS,
    );
    argvPushGlobalFlags(argv, testName, true, false);
    return argv;
  }

  public static soloCacheClearArgv(testName: string): string[] {
    const {newArgv, argvPushGlobalFlags} = CacheTest;

    const argv: string[] = newArgv();
    argv.push(
      CacheCommandDefinition.COMMAND_NAME,
      CacheCommandDefinition.IMAGE_SUBCOMMAND_NAME,
      CacheCommandDefinition.IMAGE_CLEAR,
    );
    argvPushGlobalFlags(argv, testName, true, false);
    return argv;
  }

  public static soloCacheLoadArgv(testName: string, deployment: DeploymentName): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = CacheTest;

    const argv: string[] = newArgv();
    argv.push(
      CacheCommandDefinition.COMMAND_NAME,
      CacheCommandDefinition.IMAGE_SUBCOMMAND_NAME,
      CacheCommandDefinition.IMAGE_LOAD,
      optionFromFlag(Flags.deployment),
      deployment,
    );
    argvPushGlobalFlags(argv, testName, true, false);
    return argv;
  }

  public static pull(options: BaseTestOptions): void {
    const {testName} = options;

    it(`${testName}: cache pull`, async (): Promise<void> => {
      await main(CacheTest.soloCachePullArgv(testName));
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static list(options: BaseTestOptions): void {
    const {testName} = options;

    it(`${testName}: cache list`, async (): Promise<void> => {
      await main(CacheTest.soloCacheListArgv(testName));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  public static status(options: BaseTestOptions): void {
    const {testName} = options;

    it(`${testName}: cache status`, async (): Promise<void> => {
      await main(CacheTest.soloCacheStatusArgv(testName));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  public static load(options: BaseTestOptions): void {
    const {testName, deployment} = options;

    it(`${testName}: cache load`, async (): Promise<void> => {
      await main(CacheTest.soloCacheLoadArgv(testName, deployment));
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static clear(options: BaseTestOptions): void {
    const {testName} = options;

    it(`${testName}: cache clear`, async (): Promise<void> => {
      await main(CacheTest.soloCacheClearArgv(testName));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  public static pullListStatusClear(options: BaseTestOptions): void {
    const {testName, testCacheDirectory} = options;

    const cacheRoot: string = PathEx.join(testCacheDirectory, 'cache');

    it(`${testName}: cache pull/list/status/clear workflow`, async (): Promise<void> => {
      await main(CacheTest.soloCachePullArgv(testName));

      expect(fs.existsSync(cacheRoot), `expected cache directory to exist at ${cacheRoot}`).to.be.true;

      await main(CacheTest.soloCacheListArgv(testName));
      await main(CacheTest.soloCacheStatusArgv(testName));
      await main(CacheTest.soloCacheClearArgv(testName));

      expect(fs.existsSync(cacheRoot), `expected cache directory to be removed at ${cacheRoot}`).to.be.false;
    }).timeout(Duration.ofMinutes(15).toMillis());
  }

  public static pullAndVerifyArtifactsExist(options: BaseTestOptions): void {
    const {testName, testCacheDirectory} = options;

    it(`${testName}: cache pull creates archive artifacts`, async (): Promise<void> => {
      await main(CacheTest.soloCachePullArgv(testName));

      const cacheRoot: string = PathEx.join(testCacheDirectory, 'cache');
      expect(fs.existsSync(cacheRoot), `expected cache directory to exist at ${cacheRoot}`).to.be.true;

      const imageDirectory: string = PathEx.join(cacheRoot, 'IMAGE');
      const fallbackImageDirectory: string = PathEx.join(cacheRoot, 'image');

      const artifactDirectory: string | undefined = [imageDirectory, fallbackImageDirectory].find(
        (directory): boolean => fs.existsSync(directory),
      );

      expect(artifactDirectory, 'expected image cache artifact directory to exist').to.not.equal(undefined);

      const files: string[] = fs.readdirSync(artifactDirectory as string);
      expect(files.length, 'expected at least one cached image artifact').to.be.greaterThan(0);
      expect(files.some((fileName: string): boolean => fileName.endsWith('.tar'))).to.be.true;
    }).timeout(Duration.ofMinutes(15).toMillis());
  }

  public static loadAfterNetworkDeploy(options: BaseTestOptions): void {
    const {testName, deployment} = options;

    it(`${testName}: cache load into cluster`, async (): Promise<void> => {
      await main(CacheTest.soloCachePullArgv(testName));
      await main(CacheTest.soloCacheLoadArgv(testName, deployment));
    }).timeout(Duration.ofMinutes(15).toMillis());
  }
}
