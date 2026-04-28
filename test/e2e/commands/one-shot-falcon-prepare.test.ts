// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, afterEach} from 'mocha';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'yaml';

import {main} from '../../../src/index.js';
import {Flags} from '../../../src/commands/flags.js';
import {optionFromFlag} from '../../../src/commands/command-helpers.js';
import {OneShotCommandDefinition} from '../../../src/commands/command-definitions/one-shot-command-definition.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {SOLO_CACHE_DIR} from '../../../src/core/constants.js';

const expectedSections: readonly string[] = [
  'network',
  'setup',
  'consensusNode',
  'mirrorNode',
  'relayNode',
  'blockNode',
  'explorerNode',
];

function buildBasePrepareArgv(): string[] {
  return [
    '${PATH}/node',
    '${SOLO_ROOT}/solo.ts',
    OneShotCommandDefinition.COMMAND_NAME,
    OneShotCommandDefinition.FALCON_SUBCOMMAND_NAME,
    OneShotCommandDefinition.FALCON_PREPARE,
    optionFromFlag(Flags.acceptDefaults),
  ];
}

function buildPrepareArgv(outputPath: string): string[] {
  return [...buildBasePrepareArgv(), optionFromFlag(Flags.outputValuesFile), outputPath];
}

describe('One Shot Falcon Prepare E2E', (): void => {
  const generatedFiles: string[] = [];

  function trackOutputPath(suffix: string): string {
    const filePath: string = PathEx.join(os.tmpdir(), `falcon-values.e2e.${Date.now()}.${suffix}.yaml`);
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

  it('generates a valid values file at the default path under SOLO_CACHE_DIR', async (): Promise<void> => {
    const defaultOutputPath: string = PathEx.join(SOLO_CACHE_DIR, 'falcon-values.yaml');
    generatedFiles.push(defaultOutputPath);

    await main(buildBasePrepareArgv());

    expect(fs.existsSync(defaultOutputPath), `expected ${defaultOutputPath} to exist`).to.equal(true);

    const contents: string = fs.readFileSync(defaultOutputPath, 'utf8');
    expect(contents).to.match(/^# One-Shot Falcon Deployment Configuration/);

    const parsed: Record<string, unknown> = yaml.parse(contents) as Record<string, unknown>;
    for (const section of expectedSections) {
      expect(parsed, `missing section ${section}`).to.have.property(section);
    }
  });

  it(`respects an absolute ${optionFromFlag(Flags.outputValuesFile)} path`, async (): Promise<void> => {
    const outputPath: string = PathEx.resolve(trackOutputPath('absolute'));
    expect(path.isAbsolute(outputPath), 'test path must be absolute').to.equal(true);

    await main(buildPrepareArgv(outputPath));

    expect(fs.existsSync(outputPath), `expected ${outputPath} to exist`).to.equal(true);

    const parsed: Record<string, unknown> = yaml.parse(fs.readFileSync(outputPath, 'utf8')) as Record<string, unknown>;
    expect(parsed).to.have.all.keys(...expectedSections);
  });

  it('resolves a relative path against the user working directory (INIT_CWD)', async (): Promise<void> => {
    // Simulate running Solo from a directory that differs from process.cwd()
    // (e.g. when invoked via npx / npm run from an external directory).
    const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'falcon-cwd-'));
    const relativeName: string = `falcon-values.e2e.${Date.now()}.relative.yaml`;
    const expectedAbsolutePath: string = PathEx.join(temporaryDirectory, relativeName);
    generatedFiles.push(expectedAbsolutePath);

    const originalInitCwd: string | undefined = process.env.INIT_CWD;
    try {
      // Point INIT_CWD to the temp directory so the relative path resolves there
      process.env.INIT_CWD = temporaryDirectory;

      await main(buildPrepareArgv(`./${relativeName}`));

      expect(fs.existsSync(expectedAbsolutePath), `expected ${expectedAbsolutePath} to exist`).to.equal(true);

      const parsed: Record<string, unknown> = yaml.parse(fs.readFileSync(expectedAbsolutePath, 'utf8')) as Record<
        string,
        unknown
      >;
      expect(parsed).to.have.all.keys(...expectedSections);
    } finally {
      // Restore original INIT_CWD
      if (originalInitCwd === undefined) {
        delete process.env.INIT_CWD;
      } else {
        process.env.INIT_CWD = originalInitCwd;
      }
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    }
  });
});
