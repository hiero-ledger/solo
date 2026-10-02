// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../../core/errors/solo-errors.js';
import {type StorageBackend} from '../api/storage-backend.js';
import {StorageOperation} from '../api/storage-operation.js';
import {UnsupportedStorageOperationError} from '../api/unsupported-storage-operation-error.js';
import {StorageBackendError} from '../api/storage-backend-error.js';
import {Prefix} from '../../key/prefix.js';
import {EnvironmentKeyFormatter} from '../../key/environment-key-formatter.js';
import {EnvironmentKeyRegistry} from '../../key/environment-key-registry.js';
import {StringEx} from '../../../business/utils/string-ex.js';

export class EnvironmentStorageBackend implements StorageBackend {
  public constructor(public readonly prefix?: string) {}

  public isSupported(op: StorageOperation): boolean {
    switch (op) {
      case StorageOperation.List:
      case StorageOperation.ReadBytes: {
        return true;
      }
      default: {
        return false;
      }
    }
  }

  /**
   * Returns the config keys the environment currently sets, by looking up the name each declared key
   * generates — see {@link EnvironmentKeyRegistry} for why this direction is the only workable one.
   *
   * <p>An empty value is skipped: readBytes rejects it, so the key would be listed but unreadable.
   */
  public async list(): Promise<string[]> {
    const environment: NodeJS.ProcessEnv = process.env ?? {};

    return [...EnvironmentKeyRegistry.configKeys()].filter((key: string): boolean =>
      Boolean(environment[this.variableNameFor(key)]),
    );
  }

  /** The environment variable name a config key is read from, e.g. `helmChart.directory` -> `SOLO_HELM_CHART_DIRECTORY`. */
  public variableNameFor(key: string): string {
    return Prefix.add(key, this.prefix, EnvironmentKeyFormatter.instance());
  }

  public async readBytes(key: string): Promise<Buffer> {
    if (StringEx.isEmpty(key)) {
      throw new SoloErrors.validation.illegalArgument('key must not be null, undefined, or empty');
    }

    const environment: NodeJS.ProcessEnv = process.env ?? {};

    const value: string = environment[this.variableNameFor(key)];
    if (!value) {
      throw new StorageBackendError(`key not found: ${key}`);
    }

    return Buffer.from(value, 'utf8');
  }

  /**
   * Reads a fixed/legacy environment variable by its exact name,
   * without applying the `SOLO_` prefix or key formatting.
   * Returns undefined when the variable is missing or blank.
   * Used to resolve environment variable aliases.
   */
  public readRawValue(name: string): string | undefined {
    const environment: NodeJS.ProcessEnv = process.env ?? {};

    const value: string | undefined = environment[name];
    return value && value.trim() !== '' ? value : undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async writeBytes(_key: string, _data: Buffer): Promise<void> {
    throw new UnsupportedStorageOperationError('writeBytes is not supported by the environment storage backend');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async delete(_key: string): Promise<void> {
    throw new UnsupportedStorageOperationError('delete is not supported by the environment storage backend');
  }
}
