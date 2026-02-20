// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {platform, arch} from 'node:os';
import {existsSync} from 'node:fs';
import {execSync} from 'node:child_process';
import {gte} from 'semver';
import {SemanticVersion} from '../../../../../src/integration/helm/base/api/version/semantic-version.js';
import {HelmSoftwareLoader} from '../../../../../src/integration/helm/resource/helm-software-loader.js';
import {OperatingSystem} from '../../../../../src/business/utils/operating-system.js';

describe('Helm Software Loader Test', (): void => {
  const currentPlatform: NodeJS.Platform = platform();
  const currentArch: string = arch();

  const supportedPlatforms: {linux: string[]; darwin: string[]; win32: string[]} = {
    linux: ['x64', 'arm64'],
    darwin: ['x64', 'arm64'],
    win32: ['x64'],
  };

  const installHelmAndVerify: () => Promise<void> = async (): Promise<void> => {
    const helmPath: string = await HelmSoftwareLoader.getHelmExecutablePath();
    expect(helmPath).to.not.be.null;
    expect(existsSync(helmPath)).to.be.true;

    // Check if file is executable
    try {
      execSync(`test -x "${helmPath}"`, {stdio: 'ignore'});
    } catch {
      expect.fail('Helm executable should be executable');
    }

    // Check filename
    const expectedFilename: string = OperatingSystem.isWin32() ? 'helm.exe' : 'helm';
    expect(helmPath.endsWith(expectedFilename)).to.be.true;

    // Check version
    let helmVersion: string;
    try {
      helmVersion = execSync(`"${helmPath}" version --short`, {encoding: 'utf8'}).trim();
    } catch {
      expect.fail('Failed to execute helm version command');
    }

    expect(helmVersion).to.not.be.empty;
    if (helmVersion.toLowerCase().startsWith('v')) {
      helmVersion = helmVersion.slice(1);
    }

    const actualVersion: SemanticVersion = SemanticVersion.parse(helmVersion);
    const minimumVersion: SemanticVersion = SemanticVersion.parse('3.12.0');
    expect(actualVersion).to.not.be.null;
    expect(gte(actualVersion.toString(), minimumVersion.toString())).to.be.true;
  };

  // Run tests only if current platform/arch is supported
  if (
    currentPlatform in supportedPlatforms &&
    supportedPlatforms[currentPlatform as keyof typeof supportedPlatforms].includes(currentArch)
  ) {
    it(`${currentPlatform}: Install Supported Helm Version`, async (): Promise<void> => {
      await installHelmAndVerify();
    });
  }
});
