// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {describe, it, beforeEach, afterEach} from 'mocha';
import {expect} from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {Flags as flags} from '../../../src/commands/flags.js';
import * as constants from '../../../src/core/constants.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type ConfigManager} from '../../../src/core/config-manager.js';
import {NodeCommandTasks} from '../../../src/commands/node/tasks.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {ValueContainer} from '../../../src/core/dependency-injection/value-container.js';
import {type InstanceOverrides} from '../../../src/core/dependency-injection/container-init.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';

describe('NodeCommandTasks.addWrapsLib', (): void => {
  let configManager: ConfigManager;
  let nodeCommandTasks: NodeCommandTasks;
  let sourceDirectory: string;
  let extractedDirectory: string;
  let downloaderStub: {fetchPackage: sinon.SinonStub};
  let zippyStub: {untar: sinon.SinonStub};

  const allowedFiles: string[] = ['decider_pp.bin', 'decider_vp.bin', 'nova_pp.bin', 'nova_vp.bin'];

  beforeEach((): void => {
    sourceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'wraps-test-'));
    extractedDirectory = PathEx.join(constants.SOLO_CACHE_DIR, constants.WRAPS_DIRECTORY_NAME);

    // Ensure parent cache directory exists
    if (!fs.existsSync(constants.SOLO_CACHE_DIR)) {
      fs.mkdirSync(constants.SOLO_CACHE_DIR, {recursive: true});
    }

    // Clean up extractedDirectory if it exists from a previous test
    if (fs.existsSync(extractedDirectory)) {
      fs.rmSync(extractedDirectory, {recursive: true, force: true});
    }

    downloaderStub = {fetchPackage: sinon.stub().resolves()};
    zippyStub = {untar: sinon.stub()};

    const remoteConfigStub = {
      configuration: {state: {wrapsEnabled: true}},
      isLoaded: sinon.stub().returns(true),
    };

    const containerOverrides: InstanceOverrides = new Map([
      [InjectTokens.PackageDownloader, new ValueContainer(InjectTokens.PackageDownloader, downloaderStub)],
      [InjectTokens.Zippy, new ValueContainer(InjectTokens.Zippy, zippyStub)],
      [
        InjectTokens.RemoteConfigRuntimeState,
        new ValueContainer(InjectTokens.RemoteConfigRuntimeState, remoteConfigStub),
      ],
    ]);

    resetForTest(undefined, undefined, true, containerOverrides);

    configManager = container.resolve<ConfigManager>(InjectTokens.ConfigManager);
    nodeCommandTasks = container.resolve<NodeCommandTasks>(InjectTokens.NodeCommandTasks);
  });

  afterEach((): void => {
    sinon.restore();
    if (fs.existsSync(sourceDirectory)) {
      fs.rmSync(sourceDirectory, {recursive: true, force: true});
    }
    if (fs.existsSync(extractedDirectory)) {
      fs.rmSync(extractedDirectory, {recursive: true, force: true});
    }
  });

  it('should copy allowed .bin files from wrapsKeyPath to cache directory', async (): Promise<void> => {
    for (const file of allowedFiles) {
      fs.writeFileSync(path.join(sourceDirectory, file), `content-${file}`);
    }

    const argv: Argv = Argv.initializeEmpty();
    argv.setArg(flags.wrapsKeyPath, sourceDirectory);
    configManager.update(argv.build());

    const listrTask = nodeCommandTasks.addWrapsLib();
    await listrTask.task({config: {consensusNodes: []}} as any, {} as any);

    const copiedFiles: string[] = fs.readdirSync(extractedDirectory);
    expect(copiedFiles).to.have.members(allowedFiles);

    for (const file of allowedFiles) {
      const content: string = fs.readFileSync(path.join(extractedDirectory, file), 'utf8');
      expect(content).to.equal(`content-${file}`);
    }
  });

  it('should ignore non-allowed files in wrapsKeyPath', async (): Promise<void> => {
    const extraFiles: string[] = ['README.md', 'extra.bin', 'config.json'];
    for (const file of [...allowedFiles, ...extraFiles]) {
      fs.writeFileSync(path.join(sourceDirectory, file), `content-${file}`);
    }

    const argv: Argv = Argv.initializeEmpty();
    argv.setArg(flags.wrapsKeyPath, sourceDirectory);
    configManager.update(argv.build());

    const listrTask = nodeCommandTasks.addWrapsLib();
    await listrTask.task({config: {consensusNodes: []}} as any, {} as any);

    const copiedFiles: string[] = fs.readdirSync(extractedDirectory);
    expect(copiedFiles).to.have.members(allowedFiles);
    for (const extra of extraFiles) {
      expect(copiedFiles).to.not.include(extra);
    }
  });

  it('should throw SoloError for non-existent wrapsKeyPath', async (): Promise<void> => {
    const argv: Argv = Argv.initializeEmpty();
    argv.setArg(flags.wrapsKeyPath, '/this/path/does/not/exist');
    configManager.update(argv.build());

    const listrTask = nodeCommandTasks.addWrapsLib();

    try {
      await listrTask.task({config: {consensusNodes: []}} as any, {} as any);
      expect.fail('Expected SoloError to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(SoloError);
      expect(error.message).to.include('WRAPs key path does not exist');
    }
  });

  it('should create destination directory if missing', async (): Promise<void> => {
    fs.writeFileSync(path.join(sourceDirectory, 'decider_pp.bin'), 'data');

    expect(fs.existsSync(extractedDirectory)).to.be.false;

    const argv: Argv = Argv.initializeEmpty();
    argv.setArg(flags.wrapsKeyPath, sourceDirectory);
    configManager.update(argv.build());

    const listrTask = nodeCommandTasks.addWrapsLib();
    await listrTask.task({config: {consensusNodes: []}} as any, {} as any);

    expect(fs.existsSync(extractedDirectory)).to.be.true;
    expect(fs.readdirSync(extractedDirectory)).to.include('decider_pp.bin');
  });

  it('should fall back to download when wrapsKeyPath is not set', async (): Promise<void> => {
    const argv: Argv = Argv.initializeEmpty();
    configManager.update(argv.build());

    const listrTask = nodeCommandTasks.addWrapsLib();
    await listrTask.task({config: {consensusNodes: []}} as any, {} as any);

    expect(downloaderStub.fetchPackage.calledOnce).to.be.true;
    expect(zippyStub.untar.calledOnce).to.be.true;
  });
});

describe('WRAPS_ALLOWED_KEY_FILES constant', (): void => {
  it('should contain the expected default file names', (): void => {
    const files: string[] = constants.WRAPS_ALLOWED_KEY_FILES.split(',');
    expect(files).to.have.members(['decider_pp.bin', 'decider_vp.bin', 'nova_pp.bin', 'nova_vp.bin']);
  });
});
