// SPDX-License-Identifier: Apache-2.0

import {type SchemaMigration} from '../../api/schema-migration.js';
import {VersionRange} from '../../../../../business/utils/version-range.js';
import {Version} from '../../../../../business/utils/version.js';

import {IllegalArgumentError} from '../../../../../business/errors/illegal-argument-error.js';
import {InvalidSchemaVersionError} from '../../api/invalid-schema-version-error.js';

export class RemoteConfigV2Migration implements SchemaMigration {
  public get range(): VersionRange<number> {
    return VersionRange.fromIntegerVersion(1);
  }

  public get version(): Version<number> {
    return new Version(2);
  }

  public migrate(source: object): Promise<object> {
    if (!source) {
      // We should never pass null or undefined to this method, if this happens we should throw an error
      throw new IllegalArgumentError('source must not be null or undefined');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clone: any = structuredClone(source);

    if (clone.schemaVersion && clone.schemaVersion !== 1) {
      throw new InvalidSchemaVersionError(clone.schemaVersion, 1);
    }

    // Update metadata with lastUpdated information
    if (!clone.metadata) {
      clone.metadata = {};
    }

    clone.metadata = {
      ...clone.metadata,
      lastUpdatedAt: new Date(),
      lastUpdatedBy: {
        name: 'system',
        hostname: 'migration',
      },
    };

    // Add portForwardConfigs to each component state metadata if it doesn't exist
    const initializePortForwardConfigs: (componentArray: any[]) => void = (componentArray: any[]): void => {
      if (!componentArray) {
        return;
      }

      for (const component of componentArray) {
        if (component.metadata && !component.metadata.portForwardConfigs) {
          component.metadata.portForwardConfigs = [];
        }
      }
    };

    // Initialize portForwardConfigs for all component types
    if (clone.state) {
      initializePortForwardConfigs(clone.state.consensusNodes);
      initializePortForwardConfigs(clone.state.blockNodes);
      initializePortForwardConfigs(clone.state.mirrorNodes);
      initializePortForwardConfigs(clone.state.relayNodes);
      initializePortForwardConfigs(clone.state.haProxies);
      initializePortForwardConfigs(clone.state.envoyProxies);
      initializePortForwardConfigs(clone.state.explorers);
    }

    // Set the schema version to the new version
    clone.schemaVersion = this.version.value;

    return Promise.resolve(clone);
  }
}
