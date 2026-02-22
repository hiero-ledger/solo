// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {LocalConfigSource} from '../../../../data/configuration/impl/local-config-source.js';
import {YamlFileStorageBackend} from '../../../../data/backend/impl/yaml-file-storage-backend.js';
import {ObjectMapper} from '../../../../data/mapper/api/object-mapper.js';
import {patchInject} from '../../../../core/dependency-injection/container-helper.js';
import {ClassToObjectMapper} from '../../../../data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../data/key/config-key-formatter.js';
import {LocalConfigSchemaDefinition} from '../../../../data/schema/migration/impl/local/local-config-schema-definition.js';
import {LocalConfigSchema} from '../../../../data/schema/model/local/local-config-schema.js';
import {RefreshLocalConfigSourceError} from '../../../errors/refresh-local-config-source-error.js';
import {WriteLocalConfigFileError} from '../../../errors/write-local-config-file-error.js';
import {PathEx} from '../../../utils/path-ex.js';
import fs, {existsSync, mkdirSync} from 'node:fs';
import {LocalConfig} from './local-config.js';
import path from 'node:path';
import {Templates} from '../../../../core/templates.js';
import {type ConfigManager} from '../../../../core/config-manager.js';
import {Flags as flags} from '../../../../commands/flags.js';

@injectable()
export class LocalConfigRuntimeState {
  private readonly source: LocalConfigSource;
  private readonly backend: YamlFileStorageBackend;
  private readonly objectMapper: ObjectMapper;
  public isLoaded: boolean = false;

  private _localConfig: LocalConfig;

  public constructor(
    @inject(InjectTokens.HomeDirectory) private readonly basePath: string,
    @inject(InjectTokens.LocalConfigFileName) private readonly fileName: string,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
  ) {
    this.fileName = patchInject(fileName, InjectTokens.LocalConfigFileName, this.constructor.name);
    this.basePath = patchInject(basePath, InjectTokens.HomeDirectory, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.backend = new YamlFileStorageBackend(this.basePath);
    this.objectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());
    this.source = new LocalConfigSource(
      fileName,
      new LocalConfigSchemaDefinition(this.objectMapper),
      this.objectMapper,
      this.backend,
      LocalConfigSchema.EMPTY,
    );
  }

  public get configuration(): LocalConfig {
    if (!this.isLoaded) {
      throw new Error('configuration: Local configuration is not loaded yet. Please call load() first.');
    }

    return this._localConfig;
  }

  // Loads the source data and writes it back in case of migrations.
  public async load(): Promise<void> {
    // TODO this needs to be a migration, not a load
    // check if config from an old version exists under the cache directory
    const oldConfigPath: string = PathEx.join(this.basePath, 'cache');
    const oldConfigFile: string = PathEx.join(oldConfigPath, this.fileName);
    const oldConfigFileExists: boolean = existsSync(oldConfigFile);

    if (this.configFileExists() && oldConfigFileExists) {
      // if both files exist, remove the old one
      fs.rmSync(oldConfigFile);
    } else if (existsSync(oldConfigFile)) {
      // if only the old file exists, copy it to the new location
      mkdirSync(this.basePath, {recursive: true});
      fs.copyFileSync(oldConfigFile, PathEx.join(this.basePath, this.fileName));
      fs.rmSync(oldConfigFile);
    }

    this.refresh();
    if (!this.configFileExists()) {
      return await this.persist();
    }

    try {
      await this.source.refresh();
      this.refresh();
    } catch (error) {
      throw new RefreshLocalConfigSourceError('Failed to refresh local config source', error);
    }
    await this.persist();

    await this.migrateCacheDirectories();
    this.isLoaded = true;
  }

  /**
   * Migrates the cache directories to the new structure.
   * It will look for directories in the format 'v0.58/staging/v0.58.10' and move them to current staging directory.
   */
  private async migrateCacheDirectories(): Promise<void> {
    if (!this.isLoaded) {
      throw new Error('migrateCacheDirectories: Local configuration is not loaded yet. Please call load() first.');
    }
    const cacheDirectory: string = PathEx.join(this.basePath, 'cache').toString();
    const releaseTag: string = this.configManager.getFlag(flags.releaseTag);
    const currentStagingDirectory: string = Templates.renderStagingDir(cacheDirectory, releaseTag);

    if (fs.existsSync(currentStagingDirectory)) {
      return;
    }

    // migrate the staging directory if it exists
    const foundStagingDirectory: string[] = await this.findMatchingSoloCacheDirectories(
      PathEx.join(this.basePath, 'cache').toString(),
    );
    if (foundStagingDirectory && foundStagingDirectory.length > 0) {
      for (const stagingDirectory of foundStagingDirectory) {
        fs.cpSync(stagingDirectory, currentStagingDirectory, {recursive: true, force: true});
        // remove the old staging directory
        fs.rmSync(stagingDirectory, {recursive: true, force: true});
      }
    }
  }

  private async findMatchingSoloCacheDirectories(baseDirectory: string): Promise<string[]> {
    if (!this.isLoaded) {
      throw new Error(
        'findMatchingSoloCacheDirectories: Local configuration is not loaded yet. Please call load() first.',
      );
    }
    // Regex to match directory names like 'v0.58' or 'v0.60'
    // This will capture the version number.
    const versionDirectionRegex: RegExp = /^v(\d+\.\d+)$/;

    // Regex to match the full path structure like 'v0.58/staging/v0.58.10'
    // This captures the major.minor version and the patch version.
    const fullPathRegex: RegExp = /^v(\d+\.\d+)\/staging\/v(\d+\.\d+\.\d+)$/;
    const matchingDirectories: string[] = [];

    try {
      // 1. Read the contents of the baseCacheDir (e.g., '.solo/cache/')
      const versionDirectories: string[] = fs.readdirSync(baseDirectory);

      for (const versionDirectory of versionDirectories) {
        const versionMatch: string[] | null = versionDirectory.match(versionDirectionRegex);
        if (versionMatch) {
          // If the version directory matches (e.g., 'v0.58')
          const fullVersionPath: string = PathEx.join(baseDirectory, versionDirectory, 'staging');

          // Check if 'staging' directory exists within the version directory
          if (fs.existsSync(fullVersionPath)) {
            // Read the contents of the 'staging' directory
            const stagingContents: string[] = fs.readdirSync(fullVersionPath);

            for (const stagingItem of stagingContents) {
              const fullItemPath: string = PathEx.join(fullVersionPath, stagingItem);
              const relativeItemPath: string = path.relative(baseDirectory, fullItemPath); // Get path relative to baseCacheDir

              // Check if the full relative path matches the desired pattern
              if (fullPathRegex.test(relativeItemPath) && fs.existsSync(fullItemPath)) {
                matchingDirectories.push(fullItemPath);
              }
            }
          }
        }
      }
    } catch {
      // The Directory isn't found or any other error
      return undefined;
    }
    return matchingDirectories;
  }

  public async persist(): Promise<void> {
    try {
      await this.source.persist();
      this.isLoaded = true;
    } catch (error) {
      throw new WriteLocalConfigFileError('Failed to write local config file', error);
    }
  }

  private refresh(): void {
    this._localConfig = new LocalConfig(this.source.modelData);
  }

  public configFileExists(): boolean {
    try {
      return fs.existsSync(PathEx.join(this.basePath, this.fileName));
    } catch {
      return false;
    }
  }
}
