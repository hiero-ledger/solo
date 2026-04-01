// SPDX-License-Identifier: Apache-2.0

/**
 * Verifies the environment variable naming convention for the layered config system.
 *
 * The config key used by the YAML sources (via FlatKeyMapper) uses camelCase property names
 * joined by dots, e.g. `helmChart.directory`.  The EnvironmentStorageBackend must produce the
 * same keys so that EnvironmentConfigSource can override those YAML values.
 *
 * Forward direction  (list / strip):
 *   env var name  →  Prefix.strip(…, ConfigKeyFormatter)  →  config key
 *
 * Reverse direction  (readBytes / add):
 *   config key  →  Prefix.add(…, EnvironmentKeyFormatter)  →  env var name
 *
 * Both directions must be self-consistent AND the resulting config key must match the key
 * produced by FlatKeyMapper for the SoloConfigSchema class properties.
 */

import {expect} from 'chai';
import {EnvironmentStorageBackend} from '../../../../../src/data/backend/impl/environment-storage-backend.js';
import {EnvironmentConfigSource} from '../../../../../src/data/configuration/impl/environment-config-source.js';
import {ClassToObjectMapper} from '../../../../../src/data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../../src/data/key/config-key-formatter.js';
import {SoloConfigSchema} from '../../../../../src/data/schema/model/solo/solo-config-schema.js';
import {Prefix} from '../../../../../src/data/key/prefix.js';
import {EnvironmentKeyFormatter} from '../../../../../src/data/key/environment-key-formatter.js';

const mapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());

// ---------------------------------------------------------------------------
// Helper: save / restore process.env around each test
// ---------------------------------------------------------------------------
function withEnv(vars: Record<string, string>, fn: () => Promise<void>): () => Promise<void> {
  return async (): Promise<void> => {
    const saved: NodeJS.ProcessEnv = {...process.env};
    try {
      for (const [k, v] of Object.entries(vars)) {
        process.env[k] = v;
      }
      await fn();
    } finally {
      // Remove added keys and restore original values
      for (const k of Object.keys(vars)) {
        if (k in saved) {
          process.env[k] = saved[k];
        } else {
          delete process.env[k];
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Section 1 – EnvironmentStorageBackend key-strip direction
//   Verifies: env var name  →  stripped config key
// ---------------------------------------------------------------------------
describe('EnvironmentStorageBackend – key stripping (env var → config key)', () => {
  it('all-underscore SOLO_HELM_CHART_DIRECTORY strips to flat dot key helm.chart.directory', async () => {
    const envVar = 'SOLO_HELM_CHART_DIRECTORY';
    const stripped = Prefix.strip(envVar, 'SOLO');
    expect(stripped).to.equal('helm.chart.directory');
  });

  it('hyphenated SOLO_HELM-CHART_DIRECTORY strips to camelCase key helmChart.directory', async () => {
    const envVar = 'SOLO_HELM-CHART_DIRECTORY';
    const stripped = Prefix.strip(envVar, 'SOLO');
    expect(stripped).to.equal('helmChart.directory');
  });

  it('all-underscore SOLO_TSS_READY_MAX_ATTEMPTS strips to flat key tss.ready.max.attempts', () => {
    const stripped = Prefix.strip('SOLO_TSS_READY_MAX_ATTEMPTS', 'SOLO');
    expect(stripped).to.equal('tss.ready.max.attempts');
  });

  it('hyphenated SOLO_TSS_READY-MAX-ATTEMPTS strips to camelCase key tss.readyMaxAttempts', () => {
    const stripped = Prefix.strip('SOLO_TSS_READY-MAX-ATTEMPTS', 'SOLO');
    expect(stripped).to.equal('tss.readyMaxAttempts');
  });

  it('all-underscore SOLO_TSS_WRAPS_LIBRARY_DOWNLOAD_URL strips to flat key tss.wraps.library.download.url', () => {
    const stripped = Prefix.strip('SOLO_TSS_WRAPS_LIBRARY_DOWNLOAD_URL', 'SOLO');
    expect(stripped).to.equal('tss.wraps.library.download.url');
  });

  it('hyphenated SOLO_TSS_WRAPS_LIBRARY-DOWNLOAD-URL strips to camelCase key tss.wraps.libraryDownloadUrl', () => {
    const stripped = Prefix.strip('SOLO_TSS_WRAPS_LIBRARY-DOWNLOAD-URL', 'SOLO');
    expect(stripped).to.equal('tss.wraps.libraryDownloadUrl');
  });
});

// ---------------------------------------------------------------------------
// Section 2 – EnvironmentStorageBackend readBytes direction
//   Verifies: config key  →  env var name that readBytes looks up
// ---------------------------------------------------------------------------
describe('EnvironmentStorageBackend – readBytes lookup (config key → env var)', () => {
  it('readBytes("helmChart.directory") with prefix SOLO looks up SOLO_HELM-CHART_DIRECTORY', async () => {
    const expectedEnvVar = 'SOLO_HELM-CHART_DIRECTORY';
    // Verify what Prefix.add produces for the camelCase key
    const envVarName = Prefix.add('helmChart.directory', 'SOLO', EnvironmentKeyFormatter.instance());
    expect(envVarName).to.equal(expectedEnvVar);
  });

  it('readBytes("helm.chart.directory") with prefix SOLO looks up SOLO_HELM_CHART_DIRECTORY', () => {
    const envVarName = Prefix.add('helm.chart.directory', 'SOLO', EnvironmentKeyFormatter.instance());
    expect(envVarName).to.equal('SOLO_HELM_CHART_DIRECTORY');
  });

  it('readBytes("tss.readyMaxAttempts") with prefix SOLO looks up SOLO_TSS_READY-MAX-ATTEMPTS', () => {
    const envVarName = Prefix.add('tss.readyMaxAttempts', 'SOLO', EnvironmentKeyFormatter.instance());
    expect(envVarName).to.equal('SOLO_TSS_READY-MAX-ATTEMPTS');
  });

  it('readBytes("tss.ready.max.attempts") with prefix SOLO looks up SOLO_TSS_READY_MAX_ATTEMPTS', () => {
    const envVarName = Prefix.add('tss.ready.max.attempts', 'SOLO', EnvironmentKeyFormatter.instance());
    expect(envVarName).to.equal('SOLO_TSS_READY_MAX_ATTEMPTS');
  });

  it('readBytes("tss.wraps.libraryDownloadUrl") with prefix SOLO looks up SOLO_TSS_WRAPS_LIBRARY-DOWNLOAD-URL', () => {
    const envVarName = Prefix.add('tss.wraps.libraryDownloadUrl', 'SOLO', EnvironmentKeyFormatter.instance());
    expect(envVarName).to.equal('SOLO_TSS_WRAPS_LIBRARY-DOWNLOAD-URL');
  });

  it(
    'roundtrip: strip then add returns the same env var for the hyphenated format',
    withEnv({'SOLO_HELM-CHART_DIRECTORY': '/tmp/charts'}, async () => {
      const backend = new EnvironmentStorageBackend('SOLO');
      const keys = await backend.list();
      const found = keys.includes('helmChart.directory');
      expect(found, 'SOLO_HELM-CHART_DIRECTORY should appear as helmChart.directory in list()').to.be.true;

      const value = Buffer.from(await backend.readBytes('helmChart.directory')).toString('utf8');
      expect(value).to.equal('/tmp/charts');
    }),
  );

  it(
    'roundtrip: all-underscore SOLO_HELM_CHART_DIRECTORY appears as helm.chart.directory NOT helmChart.directory',
    withEnv({'SOLO_HELM_CHART_DIRECTORY': '/tmp/charts'}, async () => {
      const backend = new EnvironmentStorageBackend('SOLO');
      const keys = await backend.list();
      expect(keys.includes('helmChart.directory'), 'should NOT appear as helmChart.directory').to.be.false;
      expect(keys.includes('helm.chart.directory'), 'should appear as helm.chart.directory').to.be.true;
    }),
  );
});

// ---------------------------------------------------------------------------
// Section 3 – EnvironmentConfigSource + SoloConfigSchema end-to-end
//   Verifies: which env var format actually overrides schema properties
// ---------------------------------------------------------------------------
describe('EnvironmentConfigSource + SoloConfigSchema – end-to-end override', () => {
  it(
    'SOLO_HELM-CHART_DIRECTORY (hyphenated) overrides helmChart.directory',
    withEnv({'SOLO_HELM-CHART_DIRECTORY': '/tmp/solo-charts'}, async () => {
      const source = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      const schema = source.asObject(SoloConfigSchema);
      expect(schema).to.not.be.null;
      expect(schema?.helmChart?.directory).to.equal('/tmp/solo-charts');
    }),
  );

  it(
    'SOLO_HELM_CHART_DIRECTORY (all-underscore) does NOT override helmChart.directory',
    withEnv({'SOLO_HELM_CHART_DIRECTORY': '/tmp/solo-charts'}, async () => {
      const source = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      const schema = source.asObject(SoloConfigSchema);
      // The schema property helmChart.directory is undefined because the env var
      // mapped to helm.chart.directory, which is not an exposed SoloConfigSchema property.
      expect(schema?.helmChart?.directory).to.not.equal('/tmp/solo-charts');
    }),
  );

  it(
    'SOLO_TSS_READY-MAX-ATTEMPTS (hyphenated) overrides tss.readyMaxAttempts',
    withEnv({'SOLO_TSS_READY-MAX-ATTEMPTS': '99'}, async () => {
      const source = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      const schema = source.asObject(SoloConfigSchema);
      expect(schema?.tss?.readyMaxAttempts).to.equal(99);
    }),
  );

  it(
    'SOLO_TSS_READY_MAX_ATTEMPTS (all-underscore) does NOT override tss.readyMaxAttempts',
    withEnv({'SOLO_TSS_READY_MAX_ATTEMPTS': '99'}, async () => {
      const source = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      const schema = source.asObject(SoloConfigSchema);
      expect(schema?.tss?.readyMaxAttempts).to.not.equal(99);
    }),
  );

  it(
    'SOLO_TSS_WRAPS_LIBRARY-DOWNLOAD-URL (hyphenated) overrides tss.wraps.libraryDownloadUrl',
    withEnv({'SOLO_TSS_WRAPS_LIBRARY-DOWNLOAD-URL': 'https://example.com/wraps.tar.gz'}, async () => {
      const source = new EnvironmentConfigSource(mapper, 'SOLO');
      await source.load();
      const schema = source.asObject(SoloConfigSchema);
      expect(schema?.tss?.wraps?.libraryDownloadUrl).to.equal('https://example.com/wraps.tar.gz');
    }),
  );
});
