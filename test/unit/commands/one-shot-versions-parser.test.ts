// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {
  parseOneShotVersionsFile,
  type OneShotParsedVersions,
} from '../../../src/commands/one-shot/one-shot-versions-parser.js';

describe('parseOneShotVersionsFile', (): void => {
  it('should parse versions from one-shot versions content', (): void => {
    const fileContent: string = [
      'Solo Chart Version: 0.63.3',
      'Consensus Node Version: v0.73.0',
      'Mirror Node Version: v0.153.1',
      'Explorer Version: 26.0.0',
      'JSON RPC Relay Version: 0.76.2',
    ].join('\n');

    const parsedVersions: OneShotParsedVersions = parseOneShotVersionsFile(fileContent);

    expect(parsedVersions).to.deep.equal({
      soloChart: '0.63.3',
      consensus: 'v0.73.0',
      mirror: 'v0.153.1',
      explorer: '26.0.0',
      relay: '0.76.2',
    });
  });

  it('should parse block node version when present', (): void => {
    const fileContent: string = 'Block Node Version: 0.31.0-rc4';

    const parsedVersions: OneShotParsedVersions = parseOneShotVersionsFile(fileContent);

    expect(parsedVersions).to.deep.equal({
      blockNode: '0.31.0-rc4',
    });
  });

  it('should ignore unknown and empty lines', (): void => {
    const fileContent: string = ['Unknown Field: value', '', '   ', 'Consensus Node Version: v0.73.0'].join('\n');

    const parsedVersions: OneShotParsedVersions = parseOneShotVersionsFile(fileContent);

    expect(parsedVersions).to.deep.equal({
      consensus: 'v0.73.0',
    });
  });
});
