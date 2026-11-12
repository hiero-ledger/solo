// SPDX-License-Identifier: Apache-2.0

import * as constants from '../../core/constants.js';

type MutableRecord = Record<string, unknown>;

/**
 * Migrates the user-supplied values of an existing mirror node release across chart version boundaries,
 * so an upgrade can keep the values set at install time instead of dropping them.
 */
export class MirrorNodeValuesMigrator {
  private static readonly CONFIGURATION_ROOTS: string[] = ['hiero', 'hedera'];

  // Solo generated these importer env vars before block node endpoints existed; the importer rejects them afterwards.
  private static readonly LEGACY_BLOCK_NODE_ENVIRONMENT_KEY: RegExp =
    /^(HIERO|HEDERA)_MIRROR_IMPORTER_BLOCK_NODES_\d+_(HOST|PORT)$/;

  /**
   * Mirror node v0.157.0 moved block node importer properties from `nodes[].host/port` to
   * `nodes[].endpoints[].host/port`. Rewrites the old schema in place of the old keys, and drops the values Solo
   * itself generates for block node integration (the importer env vars of the old schema and the `blocknode` Spring
   * profile). Solo generates them again on every upgrade that still resolves a block node, so dropping them keeps an
   * upgrade without block node integration from running the `blocknode` profile with no nodes. Downloader settings
   * are intentionally preserved: Helm does not retain whether `enabled: false` came from Solo or a user values file.
   *
   * @param values - release values as returned by `helm get values`; not modified
   * @returns a migrated copy of the values
   */
  public static migrateBlockNodeEndpoints(values: Record<string, unknown>): Record<string, unknown> {
    const migrated: MutableRecord = structuredClone(values);
    const importer: MutableRecord | undefined = MirrorNodeValuesMigrator.asRecord(migrated['importer']);

    if (!importer) {
      return migrated;
    }

    const configuration: MutableRecord | undefined = MirrorNodeValuesMigrator.asRecord(importer['config']);
    for (const root of MirrorNodeValuesMigrator.CONFIGURATION_ROOTS) {
      const importerProperties: MutableRecord | undefined = MirrorNodeValuesMigrator.asRecord(
        MirrorNodeValuesMigrator.asRecord(MirrorNodeValuesMigrator.asRecord(configuration?.[root])?.['mirror'])?.[
          'importer'
        ],
      );

      MirrorNodeValuesMigrator.migrateBlockNodes(MirrorNodeValuesMigrator.asRecord(importerProperties?.['block']));
    }

    MirrorNodeValuesMigrator.dropBlockNodeEnvironment(MirrorNodeValuesMigrator.asRecord(importer['env']));

    return migrated;
  }

  private static migrateBlockNodes(block: MutableRecord | undefined): void {
    const nodes: unknown = block?.['nodes'];

    if (!Array.isArray(nodes)) {
      return;
    }

    for (const node of nodes) {
      MirrorNodeValuesMigrator.migrateBlockNode(MirrorNodeValuesMigrator.asRecord(node));
    }
  }

  private static migrateBlockNode(node: MutableRecord | undefined): void {
    if (!node || !('host' in node)) {
      return;
    }

    // the importer defaults the port and requiresTls of an endpoint, so only carry over what the node sets
    const endpoint: MutableRecord = {host: node['host']};
    for (const key of ['port', 'requiresTls']) {
      if (key in node) {
        endpoint[key] = node[key];
      }
    }

    node['endpoints'] = [endpoint];
    delete node['host'];
    delete node['port'];
    delete node['requiresTls'];
  }

  private static dropBlockNodeEnvironment(environment: MutableRecord | undefined): void {
    if (!environment) {
      return;
    }

    for (const key of Object.keys(environment)) {
      if (MirrorNodeValuesMigrator.LEGACY_BLOCK_NODE_ENVIRONMENT_KEY.test(key)) {
        delete environment[key];
      }
    }

    if (environment['SPRING_PROFILES_ACTIVE'] === constants.SPRING_PROFILES_ACTIVE) {
      delete environment['SPRING_PROFILES_ACTIVE'];
    }
  }

  private static asRecord(value: unknown): MutableRecord | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as MutableRecord) : undefined;
  }
}
