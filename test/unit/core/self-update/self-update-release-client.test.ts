// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {SelfUpdateReleaseClient} from '../../../../src/core/self-update/self-update-release-client.js';
import {SelfUpdateBinarySwapper} from '../../../../src/core/self-update/self-update-binary-swapper.js';

describe('SelfUpdateReleaseClient', (): void => {
  describe('parseChecksums', (): void => {
    it('maps asset names to hashes for text and binary mode lines', (): void => {
      const hashA: string = 'a'.repeat(64);
      const hashB: string = 'b'.repeat(64);
      const checksums: Map<string, string> = SelfUpdateReleaseClient.parseChecksums(
        `${hashA}  solo-linux-x64\n${hashB} *solo-linux-arm64\n`,
      );

      expect(checksums.get('solo-linux-x64')).to.equal(hashA);
      expect(checksums.get('solo-linux-arm64')).to.equal(hashB);
    });

    it('ignores lines that are not a SHA-256 followed by a name', (): void => {
      const checksums: Map<string, string> = SelfUpdateReleaseClient.parseChecksums(
        `not-a-hash  solo-linux-x64\n${'c'.repeat(63)}  short\n\n`,
      );

      expect(checksums.size).to.equal(0);
    });
  });
});

describe('SelfUpdateBinarySwapper', (): void => {
  it('names the asset after the platform and architecture', (): void => {
    expect(SelfUpdateBinarySwapper.assetName()).to.match(/^solo-(linux|darwin|win32)-(x64|arm64)(-musl)?(\.exe)?$/);
  });

  it('prints an install-script command for the binary folder and tag', (): void => {
    const command: string = SelfUpdateBinarySwapper.installScriptCommand('/usr/local/bin', 'v0.98.0');

    expect(command).to.contain('--prefix /usr/local/bin --version v0.98.0');
  });
});
