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
   * itself generates for block node integration (the importer env vars of the old schema, the `blocknode` Spring
   * profile, and disabled downloaders). Solo-generated downloader settings are removed only when the current upgrade
   * does not use block-node integration; user-supplied values files are applied later and still take precedence.
   *
   * @param values - release values as returned by `helm get values`; not modified
   * @returns a migrated copy of the values
   */
  public static migrateBlockNodeEndpoints(
    values: Record<string, unknown>,
    removeGeneratedDownloaderSettings: boolean = false,
  ): Record<string, unknown> {
    const migrated: MutableRecord = structuredClone(values);
    const importer: MutableRecord | undefined = MirrorNodeValuesMigrator.asRecord(migrated['importer']);

    if (!importer) {
      return migrated;
    }

    const configuration: MutableRecord | undefined = MirrorNodeValuesMigrator.asRecord(importer['config']);
    const environment: MutableRecord | undefined = MirrorNodeValuesMigrator.asRecord(importer['env']);
    const hasLegacyBlockNodeEnvironment: boolean = MirrorNodeValuesMigrator.hasLegacyBlockNodeEnvironment(environment);
    for (const root of MirrorNodeValuesMigrator.CONFIGURATION_ROOTS) {
      const importerProperties: MutableRecord | undefined = MirrorNodeValuesMigrator.asRecord(
        MirrorNodeValuesMigrator.asRecord(MirrorNodeValuesMigrator.asRecord(configuration?.[root])?.['mirror'])?.[
          'importer'
        ],
      );

      const block: MutableRecord | undefined = MirrorNodeValuesMigrator.asRecord(importerProperties?.['block']);
      const hasLegacyBlockNodeValues: boolean = MirrorNodeValuesMigrator.hasLegacyBlockNodeValues(block);
      MirrorNodeValuesMigrator.migrateBlockNodes(block);
      if (removeGeneratedDownloaderSettings && (hasLegacyBlockNodeValues || hasLegacyBlockNodeEnvironment)) {
        MirrorNodeValuesMigrator.dropDisabledDownloaders(
          MirrorNodeValuesMigrator.asRecord(importerProperties?.['downloader']),
        );
      }
    }

    MirrorNodeValuesMigrator.dropBlockNodeEnvironment(environment);

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

  private static hasLegacyBlockNodeValues(block: MutableRecord | undefined): boolean {
    const nodes: unknown = block?.['nodes'];
    return (
      Array.isArray(nodes) &&
      nodes.some((node: unknown): boolean => {
        const blockNode: MutableRecord | undefined = MirrorNodeValuesMigrator.asRecord(node);
        return blockNode !== undefined && 'host' in blockNode;
      })
    );
  }

  private static hasLegacyBlockNodeEnvironment(environment: MutableRecord | undefined): boolean {
    return (
      environment !== undefined &&
      Object.keys(environment).some((key: string): boolean =>
        MirrorNodeValuesMigrator.LEGACY_BLOCK_NODE_ENVIRONMENT_KEY.test(key),
      )
    );
  }

  /** Removes downloader settings that Solo generated for block-node integration. */
  private static dropDisabledDownloaders(downloader: MutableRecord | undefined): void {
    for (const type of ['balance', 'record']) {
      const settings: MutableRecord | undefined = MirrorNodeValuesMigrator.asRecord(downloader?.[type]);

      if (settings?.['enabled'] === false) {
        delete settings['enabled'];
      }
    }
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
