// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import fs from 'node:fs';
import os from 'node:os';
import {container} from 'tsyringe-neo';

import {resetForTest} from '../../../test-container.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {KubectlDependencyManager} from '../../../../src/core/dependency-managers/kubectl-dependency-manager.js';
import {type PackageDownloader} from '../../../../src/core/package-downloader.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';

describe('KubectlDependencyManager installationMeetsRequirements', (): void => {
  // the fake kubectl wrappers are POSIX shell scripts
  const itPosix: typeof it | typeof it.skip = process.platform === 'win32' ? it.skip : it;

  let installationDirectory: string;
  let manager: KubectlDependencyManager;
  let debugSpy: sinon.SinonSpy;
  let infoSpy: sinon.SinonSpy;

  const loggedLines: () => string = (): string =>
    [...debugSpy.getCalls(), ...infoSpy.getCalls()].map((call): string => String(call.args[0])).join('\n');

  const writeWrapper: (body: string) => string = (body: string): string => {
    const wrapperPath: string = PathEx.join(installationDirectory, 'kubectl');
    fs.writeFileSync(wrapperPath, `#!/bin/sh\n${body}\n`, {mode: 0o755});
    return wrapperPath;
  };

  beforeEach((): void => {
    resetForTest();
    installationDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'kubectl-manager-test-'));
    manager = new KubectlDependencyManager(
      {} as unknown as PackageDownloader,
      installationDirectory,
      'amd64',
      'v1.32.2',
    );
    const logger: SoloLogger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);
    debugSpy = sinon.spy(logger, 'debug');
    infoSpy = sinon.spy(logger, 'info');
  });

  afterEach((): void => {
    fs.rmSync(installationDirectory, {recursive: true, force: true});
    sinon.restore();
  });

  itPosix('accepts a newer kubectl wrapper and logs why', async (): Promise<void> => {
    const wrapperPath: string = writeWrapper('echo "Client Version: v1.35.0"; echo "Kustomize Version: v5.5.0"');

    expect(await manager.installationMeetsRequirements(wrapperPath)).to.be.true;
    const logged: string = loggedLines();
    expect(logged).to.include(`Checking kubectl at ${wrapperPath}`);
    expect(logged).to.include('is version 1.35.0, which meets the required version');
  });

  itPosix(
    'rejects a wrapper whose version output has no Client Version line and logs the reason',
    async (): Promise<void> => {
      const wrapperPath: string = writeWrapper('echo "v1.35.0"');

      expect(await manager.installationMeetsRequirements(wrapperPath)).to.be.false;
      const logged: string = loggedLines();
      expect(logged).to.include("no 'Client Version: <x.y.z>' line was found");
      expect(logged).to.include('treated as not meeting requirements');
    },
  );

  itPosix('rejects a wrapper that exits non-zero and logs the failure', async (): Promise<void> => {
    const wrapperPath: string = writeWrapper('echo "wrapper refused" >&2; exit 3');

    expect(await manager.installationMeetsRequirements(wrapperPath)).to.be.false;
    const logged: string = loggedLines();
    expect(logged).to.include("version --client' failed");
  });
});
