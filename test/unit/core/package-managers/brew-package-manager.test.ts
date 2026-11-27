// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';
import {type SinonStub} from 'sinon';
import sinon from 'sinon';
import {expect} from 'chai';
import {describe, it, afterEach} from 'mocha';
import {BrewPackageManager} from '../../../../src/core/package-managers/brew-package-manager.js';
import {ShellRunner} from '../../../../src/core/shell-runner.js';
import {SubprocessEnvironment} from '../../../../src/core/subprocess-environment.js';

describe('BrewPackageManager', (): void => {
  afterEach((): void => {
    sinon.restore();
    SubprocessEnvironment.resetForTesting();
  });

  it('install registers the brew shellenv variables and PATH directories as session state', async (): Promise<void> => {
    const previousPath: string = process.env.PATH ?? '';
    const previousHomebrewPrefix: string | undefined = process.env.HOMEBREW_PREFIX;
    const runStub: SinonStub = sinon
      .stub(ShellRunner.prototype, 'run')
      .callsFake(async (_command: string, arguments_: string[] = []): Promise<string[]> => {
        if (arguments_[0] === 'shellenv') {
          return [
            'export HOMEBREW_PREFIX="/home/linuxbrew/.linuxbrew";',
            'export PATH="/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin${PATH+:$PATH}";',
          ];
        }
        return [];
      });

    const packageManager: BrewPackageManager = new BrewPackageManager();
    const available: boolean = await packageManager.install();

    expect(available).to.be.true;
    expect(runStub.called).to.be.true;
    expect(SubprocessEnvironment.sessionVariable('HOMEBREW_PREFIX')).to.equal('/home/linuxbrew/.linuxbrew');
    expect(SubprocessEnvironment.currentPath()).to.equal(
      ['/home/linuxbrew/.linuxbrew/bin', '/home/linuxbrew/.linuxbrew/sbin', previousPath].join(path.delimiter),
    );
    // The global process environment must remain untouched.
    expect(process.env.PATH).to.equal(previousPath);
    expect(process.env.HOMEBREW_PREFIX).to.equal(previousHomebrewPrefix);
  });

  it('installPinnedPackage extracts the exact version into a local tap and installs it', async (): Promise<void> => {
    const runStub: SinonStub = sinon.stub(ShellRunner.prototype, 'run').resolves([]);

    await new BrewPackageManager().installPinnedPackage('podman', '6.2.0');

    const calls: string[] = runStub.getCalls().map((call: sinon.SinonSpyCall): string => call.args[1].join(' '));
    expect(calls).to.include('extract --version=6.2.0 podman solo/pinned');
    expect(calls.at(-1)).to.equal('install solo/pinned/podman@6.2.0');
  });

  it('installPinnedPackage is a no-op when the exact version is already installed', async (): Promise<void> => {
    const runStub: SinonStub = sinon.stub(ShellRunner.prototype, 'run').resolves(['podman@6.2.0 6.2.0']);

    await new BrewPackageManager().installPinnedPackage('podman', '6.2.0');

    expect(runStub.callCount).to.equal(1);
  });
});
