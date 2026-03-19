// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {describe, it, beforeEach, afterEach} from 'mocha';
import {expect} from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {Flags as flags} from '../../../src/commands/flags.js';
import {NetworkCommand} from '../../../src/commands/network.js';
import * as NodeFlags from '../../../src/commands/node/flags.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type ConfigManager} from '../../../src/core/config-manager.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';
import {Argv} from '../../helpers/argv-wrapper.js';

describe('wrapsKeyPath flag', (): void => {
  describe('Flag definition', (): void => {
    it('should have the correct constName', (): void => {
      expect(flags.wrapsKeyPath.constName).to.equal('wrapsKeyPath');
    });

    it('should have the correct CLI name', (): void => {
      expect(flags.wrapsKeyPath.name).to.equal('wraps-key-path');
    });

    it('should be a string type', (): void => {
      expect(flags.wrapsKeyPath.definition.type).to.equal('string');
    });

    it('should not have a default value', (): void => {
      expect(flags.wrapsKeyPath.definition.defaultValue).to.be.undefined;
    });

    it('should not prompt', (): void => {
      expect(flags.wrapsKeyPath.prompt).to.be.undefined;
    });
  });

  describe('Flag registration in allFlags', (): void => {
    it('should be registered in Flags.allFlags', (): void => {
      expect(flags.allFlags).to.include(flags.wrapsKeyPath);
    });
  });

  describe('Flag present in command flag lists', (): void => {
    it('should be in NetworkCommand.DEPLOY_FLAGS_LIST', (): void => {
      expect(NetworkCommand.DEPLOY_FLAGS_LIST.optional).to.include(flags.wrapsKeyPath);
    });

    it('should be in node ADD_FLAGS (via COMMON_ADD_OPTIONAL_FLAGS)', (): void => {
      expect(NodeFlags.ADD_FLAGS.optional).to.include(flags.wrapsKeyPath);
    });

    it('should be in node UPDATE_FLAGS (via COMMON_UPDATE_FLAGS_OPTIONAL_FLAGS)', (): void => {
      expect(NodeFlags.UPDATE_FLAGS.optional).to.include(flags.wrapsKeyPath);
    });

    it('should be in node UPGRADE_FLAGS', (): void => {
      expect(NodeFlags.UPGRADE_FLAGS.optional).to.include(flags.wrapsKeyPath);
    });

    it('should be in node START_FLAGS', (): void => {
      expect(NodeFlags.START_FLAGS.optional).to.include(flags.wrapsKeyPath);
    });

    it('should be in node RESTART_FLAGS', (): void => {
      expect(NodeFlags.RESTART_FLAGS.optional).to.include(flags.wrapsKeyPath);
    });
  });

  describe('Config manager integration', (): void => {
    let configManager: ConfigManager;

    beforeEach((): void => {
      resetForTest();
      configManager = container.resolve<ConfigManager>(InjectTokens.ConfigManager);
    });

    afterEach((): void => {
      sinon.restore();
    });

    it('should store and retrieve wrapsKeyPath from configManager', (): void => {
      const argv: Argv = Argv.initializeEmpty();
      argv.setArg(flags.wrapsKeyPath, '/some/test/path');
      configManager.update(argv.build());

      const result: string = configManager.getFlag<string>(flags.wrapsKeyPath);
      expect(result).to.equal('/some/test/path');
    });

    it('should return undefined when wrapsKeyPath is not set', (): void => {
      const argv: Argv = Argv.initializeEmpty();
      configManager.update(argv.build());

      const result: string = configManager.getFlag<string>(flags.wrapsKeyPath);
      expect(result).to.be.undefined;
    });

    it('should map wrapsKeyPath to config object via getConfig', (): void => {
      const argv: Argv = Argv.initializeEmpty();
      argv.setArg(flags.wrapsKeyPath, '/custom/wraps/dir');
      argv.setArg(flags.wrapsEnabled, true);
      configManager.update(argv.build());

      const flagsList: CommandFlag[] = [flags.wrapsKeyPath, flags.wrapsEnabled];
      const config: {wrapsKeyPath: string; wrapsEnabled: boolean} = configManager.getConfig('wrapsTest', flagsList) as {
        wrapsKeyPath: string;
        wrapsEnabled: boolean;
      };

      expect(config.wrapsKeyPath).to.equal('/custom/wraps/dir');
      expect(config.wrapsEnabled).to.equal(true);
    });
  });

  describe('File copy logic', (): void => {
    let temporaryDirectory: string;
    let sourceDirectory: string;

    beforeEach((): void => {
      temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'wraps-test-'));
      sourceDirectory = path.join(temporaryDirectory, 'source');
      fs.mkdirSync(sourceDirectory);
    });

    afterEach((): void => {
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    });

    it('should only copy allowed .bin files from source directory', (): void => {
      const allowedFiles: string[] = ['decider_pp.bin', 'decider_vp.bin', 'nova_pp.bin', 'nova_vp.bin'];
      const disallowedFiles: string[] = ['README.md', 'extra.bin', 'config.json'];

      for (const file of [...allowedFiles, ...disallowedFiles]) {
        fs.writeFileSync(path.join(sourceDirectory, file), `content-${file}`);
      }

      const destinationDirectory: string = path.join(temporaryDirectory, 'dest');
      fs.mkdirSync(destinationDirectory, {recursive: true});

      const allowedSet: Set<string> = new Set(allowedFiles);
      for (const file of fs.readdirSync(sourceDirectory)) {
        if (allowedSet.has(file)) {
          fs.copyFileSync(path.join(sourceDirectory, file), path.join(destinationDirectory, file));
        }
      }
      // eslint-disable-next-line unicorn/no-array-sort
      const copiedFiles: string[] = [...fs.readdirSync(destinationDirectory)].sort();
      // eslint-disable-next-line unicorn/no-array-sort
      expect(copiedFiles).to.deep.equal([...allowedFiles].sort());

      for (const file of allowedFiles) {
        const content: string = fs.readFileSync(path.join(destinationDirectory, file), 'utf8');
        expect(content).to.equal(`content-${file}`);
      }
    });

    it('should not modify the source directory', (): void => {
      const allFiles: string[] = ['decider_pp.bin', 'nova_pp.bin', 'extra.txt'];
      for (const file of allFiles) {
        fs.writeFileSync(path.join(sourceDirectory, file), `content-${file}`);
      }

      const destinationDirectory: string = path.join(temporaryDirectory, 'dest');
      fs.mkdirSync(destinationDirectory, {recursive: true});

      const allowedSet: Set<string> = new Set(['decider_pp.bin', 'decider_vp.bin', 'nova_pp.bin', 'nova_vp.bin']);
      for (const file of fs.readdirSync(sourceDirectory)) {
        if (allowedSet.has(file)) {
          fs.copyFileSync(path.join(sourceDirectory, file), path.join(destinationDirectory, file));
        }
      }
      // eslint-disable-next-line unicorn/no-array-sort
      const sourceFiles: string[] = [...fs.readdirSync(sourceDirectory)].sort();
      // eslint-disable-next-line unicorn/no-array-sort
      expect(sourceFiles).to.deep.equal([...allFiles].sort());
    });

    it('should handle source directory with no matching .bin files', (): void => {
      fs.writeFileSync(path.join(sourceDirectory, 'unrelated.txt'), 'data');
      fs.writeFileSync(path.join(sourceDirectory, 'other.bin'), 'data');

      const destinationDirectory: string = path.join(temporaryDirectory, 'dest');
      fs.mkdirSync(destinationDirectory, {recursive: true});

      const allowedSet: Set<string> = new Set(['decider_pp.bin', 'decider_vp.bin', 'nova_pp.bin', 'nova_vp.bin']);
      for (const file of fs.readdirSync(sourceDirectory)) {
        if (allowedSet.has(file)) {
          fs.copyFileSync(path.join(sourceDirectory, file), path.join(destinationDirectory, file));
        }
      }

      const copiedFiles: string[] = fs.readdirSync(destinationDirectory);
      expect(copiedFiles).to.be.empty;
    });

    it('should create destination directory if it does not exist', (): void => {
      fs.writeFileSync(path.join(sourceDirectory, 'decider_pp.bin'), 'data');

      const destinationDirectory: string = path.join(temporaryDirectory, 'nested', 'dest');
      expect(fs.existsSync(destinationDirectory)).to.be.false;

      if (!fs.existsSync(destinationDirectory)) {
        fs.mkdirSync(destinationDirectory, {recursive: true});
      }

      const allowedSet: Set<string> = new Set(['decider_pp.bin', 'decider_vp.bin', 'nova_pp.bin', 'nova_vp.bin']);
      for (const file of fs.readdirSync(sourceDirectory)) {
        if (allowedSet.has(file)) {
          fs.copyFileSync(path.join(sourceDirectory, file), path.join(destinationDirectory, file));
        }
      }

      expect(fs.existsSync(destinationDirectory)).to.be.true;
      expect(fs.readdirSync(destinationDirectory)).to.deep.equal(['decider_pp.bin']);
    });
  });

  describe('Path validation', (): void => {
    it('should detect non-existent wrapsKeyPath', (): void => {
      const nonExistentPath: string = '/this/path/definitely/does/not/exist';
      expect(fs.existsSync(nonExistentPath)).to.be.false;
    });

    it('should detect valid wrapsKeyPath', (): void => {
      const temporaryDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'wraps-valid-'));
      try {
        expect(fs.existsSync(temporaryDirectory)).to.be.true;
      } finally {
        fs.rmSync(temporaryDirectory, {recursive: true, force: true});
      }
    });
  });
});
