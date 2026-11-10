// SPDX-License-Identifier: Apache-2.0

type MutableRecord = Record<string, unknown>;

/**
 * Migrates the user-supplied values of an existing mirror node release across chart version boundaries,
 * so an upgrade can keep the values set at install time instead of dropping them.
 */
export class MirrorNodeValuesMigrator {
  private static readonly CONFIGURATION_ROOTS: string[] = ['hiero', 'hedera'];
  private static readonly DEFAULT_BLOCK_NODE_PORT: number = 40_840;

  // Solo generated these importer env vars before block node endpoints existed; the importer rejects them afterwards.
  private static readonly LEGACY_BLOCK_NODE_ENVIRONMENT_KEY: RegExp =
    /^(HIERO|HEDERA)_MIRROR_IMPORTER_BLOCK_NODES_\d+_(HOST|PORT)$/;

  /**
   * Mirror node v0.157.0 moved block node importer properties from `nodes[].host/port` to
   * `nodes[].endpoints[].host/port`. Rewrites the old schema in place of the old keys and drops the importer
   * env vars Solo generated for it.
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
      const mirror: MutableRecord | undefined = MirrorNodeValuesMigrator.asRecord(configuration?.[root]);
      const block: MutableRecord | undefined = MirrorNodeValuesMigrator.asRecord(
        MirrorNodeValuesMigrator.asRecord(MirrorNodeValuesMigrator.asRecord(mirror?.['mirror'])?.['importer'])?.[
          'block'
        ],
      );
      const nodes: unknown = block?.['nodes'];

      if (Array.isArray(nodes)) {
        for (const node of nodes) {
          MirrorNodeValuesMigrator.migrateBlockNode(MirrorNodeValuesMigrator.asRecord(node));
        }
      }
    }

    const environment: MutableRecord | undefined = MirrorNodeValuesMigrator.asRecord(importer['env']);
    if (environment) {
      for (const key of Object.keys(environment)) {
        if (MirrorNodeValuesMigrator.LEGACY_BLOCK_NODE_ENVIRONMENT_KEY.test(key)) {
          delete environment[key];
        }
      }
    }

    return migrated;
  }

  private static migrateBlockNode(node: MutableRecord | undefined): void {
    if (!node || !('host' in node)) {
      return;
    }

    node['endpoints'] = [
      {
        host: node['host'],
        port: node['port'] ?? MirrorNodeValuesMigrator.DEFAULT_BLOCK_NODE_PORT,
        requiresTls: node['requiresTls'] ?? false,
      },
    ];
    delete node['host'];
    delete node['port'];
    delete node['requiresTls'];
  }

  private static asRecord(value: unknown): MutableRecord | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as MutableRecord) : undefined;
  }
}
