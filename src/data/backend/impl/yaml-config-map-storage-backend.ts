// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../../core/errors/solo-errors.js';
import yaml from 'yaml';
import {ConfigMapStorageBackend} from './config-map-storage-backend.js';
import {type ObjectStorageBackend} from '../api/object-storage-backend.js';
import {StorageBackendError} from '../api/storage-backend-error.js';
import {type ConfigMap} from '../../../integration/kube/resources/config-map/config-map.js';

/**
 * YamlConfigMapStorageBackend is a storage backend that uses a {@link ConfigMap} to store data.
 * The key will be the name of the property within the data object within the ConfigMap.
 */
export class YamlConfigMapStorageBackend extends ConfigMapStorageBackend implements ObjectStorageBackend {
  public async readObject(key: string): Promise<object> {
    // TODO(config-checks #7 — coded remote-config error family): these raw StorageBackendErrors
    //   (missing key / empty data / parse failure) carry no SOLO code, ownership, or remediation.
    //   Wrap them (here or at the remote-config load site) in a typed remote-config-corrupt error
    //   with guidance (inspect / recreate the ConfigMap). DECISION: single family code vs per-case.
    //   See docs/design/architecture/system/config-checks-to-add.md
    const data: Buffer = await this.readBytes(key);
    if (!data) {
      throw new StorageBackendError(`failed to read key: ${key} from config map`);
    }

    if (data.length === 0) {
      throw new StorageBackendError(`data is empty for key: ${key}`);
    }

    try {
      return yaml.parse(data.toString('utf8'));
    } catch (error) {
      throw new StorageBackendError(`error parsing yaml from key: ${key}`, error);
    }
  }

  public async writeObject(key: string, data: object): Promise<void> {
    if (!data) {
      throw new SoloErrors.validation.illegalArgument('data must not be null or undefined');
    }

    try {
      const yamlData: string = yaml.stringify(data, {sortMapEntries: true});
      await this.writeBytes(key, Buffer.from(yamlData, 'utf8'));
    } catch (error) {
      throw new StorageBackendError(`error writing yaml for key: ${key} to config map`, error);
    }
  }

  public getConfigMap(): ConfigMap {
    return this.configMap;
  }
}
