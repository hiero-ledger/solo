// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import fs from 'node:fs';
import os from 'node:os';
import sinon from 'sinon';
import {checkDockerDesktopContainerdSetting} from '../../../src/core/docker-desktop-checker.js';
import {type DockerDesktopContainerdCheckResult} from '../../../src/core/docker-desktop-containerd-check-result.js';
import {OperatingSystem} from '../../../src/business/utils/operating-system.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';

describe('checkDockerDesktopContainerdSetting', (): void => {
  let temporaryDirectory: string;
  let sandbox: sinon.SinonSandbox;

  beforeEach((): void => {
    sandbox = sinon.createSandbox();
    temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-docker-desktop-test-'));
  });

  afterEach((): void => {
    sandbox.restore();
    if (fs.existsSync(temporaryDirectory)) {
      fs.rmSync(temporaryDirectory, {recursive: true});
    }
  });

  it('returns false when running on Linux (Docker Desktop not used)', (): void => {
    sandbox.stub(OperatingSystem, 'isLinux').returns(true);
    const result: DockerDesktopContainerdCheckResult = checkDockerDesktopContainerdSetting();
    expect(result.containerdSnapshotterEnabled).to.be.false;
  });

  it('returns false when no Docker Desktop settings file exists', (): void => {
    sandbox.stub(OperatingSystem, 'isLinux').returns(false);
    // Override homedir so the lookup paths don't match real files on the test host.
    sandbox.stub(os, 'homedir').returns(PathEx.join(temporaryDirectory, 'nonexistent'));
    const result: DockerDesktopContainerdCheckResult = checkDockerDesktopContainerdSetting();
    expect(result.containerdSnapshotterEnabled).to.be.false;
    expect(result.settingsFilePath).to.be.undefined;
  });

  it('returns false when useContainerdSnapshotter is absent in settings', (): void => {
    sandbox.stub(OperatingSystem, 'isLinux').returns(false);
    // Make the checker find our temp file by pointing homedir at temporaryDirectory.
    sandbox.stub(os, 'homedir').returns(temporaryDirectory);
    // Create the expected path structure: <homedir>/.docker/settings-store.json
    const dockerDirectory: string = PathEx.join(temporaryDirectory, '.docker');
    fs.mkdirSync(dockerDirectory, {recursive: true});
    fs.writeFileSync(PathEx.join(dockerDirectory, 'settings-store.json'), JSON.stringify({otherSetting: true}));
    const result: DockerDesktopContainerdCheckResult = checkDockerDesktopContainerdSetting();
    expect(result.containerdSnapshotterEnabled).to.be.false;
  });

  it('returns false when useContainerdSnapshotter is false in settings', (): void => {
    sandbox.stub(OperatingSystem, 'isLinux').returns(false);
    const dockerDirectory: string = PathEx.join(temporaryDirectory, '.docker');
    fs.mkdirSync(dockerDirectory, {recursive: true});
    fs.writeFileSync(
      PathEx.join(dockerDirectory, 'settings-store.json'),
      JSON.stringify({useContainerdSnapshotter: false}),
    );
    sandbox.stub(os, 'homedir').returns(temporaryDirectory);
    const result: DockerDesktopContainerdCheckResult = checkDockerDesktopContainerdSetting();
    expect(result.containerdSnapshotterEnabled).to.be.false;
  });

  it('returns true with warning when useContainerdSnapshotter is true in settings', (): void => {
    sandbox.stub(OperatingSystem, 'isLinux').returns(false);
    const dockerDirectory: string = PathEx.join(temporaryDirectory, '.docker');
    fs.mkdirSync(dockerDirectory, {recursive: true});
    const settingsFile: string = PathEx.join(dockerDirectory, 'settings-store.json');
    fs.writeFileSync(settingsFile, JSON.stringify({useContainerdSnapshotter: true}));
    sandbox.stub(os, 'homedir').returns(temporaryDirectory);
    const result: DockerDesktopContainerdCheckResult = checkDockerDesktopContainerdSetting();
    expect(result.containerdSnapshotterEnabled).to.be.true;
    expect(result.settingsFilePath).to.equal(settingsFile);
    expect(result.warningMessage).to.include('containerd');
    expect(result.warningMessage).to.include('Docker Desktop');
  });

  it('skips a settings file with invalid JSON and continues', (): void => {
    sandbox.stub(OperatingSystem, 'isLinux').returns(false);
    const dockerDirectory: string = PathEx.join(temporaryDirectory, '.docker');
    fs.mkdirSync(dockerDirectory, {recursive: true});
    // Write invalid JSON to first candidate path so it should be skipped.
    fs.writeFileSync(PathEx.join(dockerDirectory, 'settings-store.json'), '{not valid json}');
    // Write a valid file to second candidate.
    fs.writeFileSync(PathEx.join(dockerDirectory, 'settings.json'), JSON.stringify({useContainerdSnapshotter: false}));
    sandbox.stub(os, 'homedir').returns(temporaryDirectory);
    const result: DockerDesktopContainerdCheckResult = checkDockerDesktopContainerdSetting();
    // Should not throw; may return false from the second valid file.
    expect(result.containerdSnapshotterEnabled).to.be.false;
  });
});
