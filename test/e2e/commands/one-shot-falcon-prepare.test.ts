// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, afterEach} from 'mocha';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'yaml';

import {main} from '../../../src/index.js';
import {Flags} from '../../../src/commands/flags.js';
import {OneShotCommandDefinition} from '../../../src/commands/command-definitions/one-shot-command-definition.js';

const expectedSections: readonly string[] = [
  'network',
  'setup',
  'consensusNode',
  'mirrorNode',
  'relayNode',
  'blockNode',
  'explorerNode',
];

/**
 * Build an argv array for `solo one-shot falcon prepare` with `--default`
 * (accepts all defaults non-interactively).
 *
 * This helper does NOT use `BaseCommandTest` from `./tests/base-command-test.ts`
 * because that class transitively imports `test/test-utility.ts`, which in turn
 * imports `keys-test.ts`. `keys-test.ts` extends `BaseCommandTest`, creating a
 * circular dependency that triggers an ES-module TDZ error when this test file
 * is loaded in isolation (e.g. by the dedicated `test-e2e-one-shot-falcon-prepare`
 * task that targets only this file).
 *
 * Since we only need the two trivial helpers (`newArgv` and `--flag.name`),
 * inlining them here keeps the test self-contained and dependency-free.
 */
function buildPrepareArgv(outputPath: string): string[] {
  return [
    '${PATH}/node',
    '${SOLO_ROOT}/solo.ts',
    OneShotCommandDefinition.COMMAND_NAME,
    OneShotCommandDefinition.FALCON_SUBCOMMAND_NAME,
    OneShotCommandDefinition.FALCON_PREPARE,
    `--${Flags.acceptDefaults.name}`,
    `--${Flags.outputValuesFile.name}`,
    outputPath,
  ];
}

/**
 * E2E coverage for `solo one-shot falcon prepare`.
 *
 * Unlike the other one-shot e2e tests, this suite does **not** require a
 * Kubernetes cluster: the prepare command only generates a values file and
 * exits. It exercises the full `main(argv)` path with `--default` so that any
 * regression in argv handling, `configManager.getFlag` wiring, or YAML
 * generation surfaces here rather than in the unit tests alone.
 */
describe('One Shot Falcon Prepare E2E', (): void => {
  const generatedFiles: string[] = [];

  function trackOutputPath(suffix: string): string {
    const filePath: string = path.join(os.tmpdir(), `falcon-values.e2e.${Date.now()}.${suffix}.yaml`);
    generatedFiles.push(filePath);
    return filePath;
  }

  afterEach((): void => {
    while (generatedFiles.length > 0) {
      const filePath: string | undefined = generatedFiles.pop();
      if (filePath && fs.existsSync(filePath)) {
        fs.rmSync(filePath, {force: true});
      }
    }
  });

  it('generates a valid values file with --default and all 7 sections', async (): Promise<void> => {
    const outputPath: string = trackOutputPath('default');

    await main(buildPrepareArgv(outputPath));

    expect(fs.existsSync(outputPath), `expected ${outputPath} to exist`).to.equal(true);

    const contents: string = fs.readFileSync(outputPath, 'utf8');
    expect(contents).to.match(/^# One-Shot Falcon Deployment Configuration/);

    const parsed: Record<string, unknown> = yaml.parse(contents) as Record<string, unknown>;
    for (const section of expectedSections) {
      expect(parsed, `missing section ${section}`).to.have.property(section);
    }
  });

  it('respects an absolute --output-values-file path', async (): Promise<void> => {
    const outputPath: string = path.resolve(trackOutputPath('absolute'));
    expect(path.isAbsolute(outputPath), 'test path must be absolute').to.equal(true);

    await main(buildPrepareArgv(outputPath));

    expect(fs.existsSync(outputPath), `expected ${outputPath} to exist`).to.equal(true);

    const parsed: Record<string, unknown> = yaml.parse(fs.readFileSync(outputPath, 'utf8')) as Record<string, unknown>;
    expect(parsed).to.have.all.keys(...expectedSections);
  });
});
