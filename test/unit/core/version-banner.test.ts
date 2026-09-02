// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {VersionBanner} from '../../../src/core/version-banner.js';
import {getSoloVersion} from '../../../version.js';

describe('VersionBanner', (): void => {
  let standardOutputWrite: SinonStub;

  beforeEach((): void => {
    standardOutputWrite = sinon.stub(process.stdout, 'write').returns(true);
  });

  afterEach((): void => {
    sinon.restore();
  });

  function written(): string {
    return standardOutputWrite
      .getCalls()
      .map((call): string => String(call.args[0]))
      .join('');
  }

  it('reports that nothing was requested when no version flag is present', (): void => {
    expect(VersionBanner.writeIfRequested(['node', 'solo.ts', 'deployment', 'create'])).to.be.false;
    expect(standardOutputWrite).to.have.been.callCount(0);
  });

  for (const flag of ['-version', '--version', '-v', '--v']) {
    it(`writes the version for ${flag}`, (): void => {
      expect(VersionBanner.writeIfRequested(['node', 'solo.ts', flag])).to.be.true;
      expect(written()).to.include(getSoloVersion());
    });
  }

  // Issue #5370: the version has to be readable when the installation is already broken, so it goes
  // straight to stdout and never touches the logger or the dependency-injection container.
  it('writes to stdout rather than through the logger', (): void => {
    VersionBanner.writeIfRequested(['node', 'solo.ts', '--version']);

    expect(standardOutputWrite.called, 'the banner must reach stdout directly').to.be.true;
  });

  it('renders json for --output=json', (): void => {
    VersionBanner.writeIfRequested(['node', 'solo.ts', '--version', '--output=json']);

    expect(JSON.parse(written())).to.deep.equal({version: getSoloVersion()});
  });

  it('renders json for the separated --output json form', (): void => {
    VersionBanner.writeIfRequested(['node', 'solo.ts', '--version', '--output', 'json']);

    expect(JSON.parse(written())).to.deep.equal({version: getSoloVersion()});
  });

  it('renders yaml for --output=yaml', (): void => {
    VersionBanner.writeIfRequested(['node', 'solo.ts', '--version', '--output=yaml']);

    expect(written().trim()).to.equal(`version: ${getSoloVersion()}`);
  });

  it('renders the bare version for --output=wide', (): void => {
    VersionBanner.writeIfRequested(['node', 'solo.ts', '--version', '--output=wide']);

    expect(written().trim()).to.equal(getSoloVersion());
  });

  it('renders the banner when no output format is given', (): void => {
    VersionBanner.writeIfRequested(['node', 'solo.ts', '--version']);

    const output: string = written();
    expect(output).to.include('Solo');
    expect(output).to.include(getSoloVersion());
  });
});
