// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sinon, {type SinonStub} from 'sinon';
import {type SpawnSyncReturns} from 'node:child_process';

import {DiagnosticsReporter} from '../../../../src/commands/util/diagnostics-reporter.js';
import {ShellRunner} from '../../../../src/core/shell-runner.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';

function makeLoggerStub(): SoloLogger {
  return {
    info: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub(),
    debug: sinon.stub(),
    showUser: sinon.stub(),
    showUserError: sinon.stub(),
    showList: sinon.stub(),
    showJSON: sinon.stub(),
    addMessageGroup: sinon.stub(),
    getMessageGroup: sinon.stub().returns([]),
    addMessageGroupMessage: sinon.stub(),
    showMessageGroup: sinon.stub(),
    getMessageGroupKeys: sinon.stub().returns([]),
    showAllMessageGroups: sinon.stub(),
    setDevMode: sinon.stub(),
    isDevMode: sinon.stub().returns(false),
    nextTraceId: sinon.stub(),
    prepMeta: sinon.stub().callsFake((meta?: object): object => meta ?? {}),
    flush: sinon.stub().callsFake((callback: (error?: Error) => void): void => callback()),
  } as unknown as SoloLogger;
}

describe('DiagnosticsReporter', (): void => {
  let temporaryDirectory: string;
  let loggerStub: SoloLogger;

  beforeEach((): void => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-diagnostics-reporter-'));
    loggerStub = makeLoggerStub();
  });

  afterEach((): void => {
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    sinon.restore();
  });

  describe('isGhCliAvailable', (): void => {
    it('returns true when gh is on the PATH', async (): Promise<void> => {
      sinon.stub(ShellRunner.prototype, 'run').resolves(['/usr/bin/gh']);
      expect(await DiagnosticsReporter.isGhCliAvailable(loggerStub)).to.equal(true);
    });

    it('returns false when gh is not found', async (): Promise<void> => {
      sinon.stub(ShellRunner.prototype, 'run').rejects(new Error('not found'));
      expect(await DiagnosticsReporter.isGhCliAvailable(loggerStub)).to.equal(false);
    });
  });

  describe('findLatestDebugZip', (): void => {
    it('returns undefined when directory does not exist', (): void => {
      expect(DiagnosticsReporter.findLatestDebugZip('/nonexistent-dir-xyz', 'test-deployment', Date.now())).to.equal(
        undefined,
      );
    });

    it('returns undefined when no matching zip exists', (): void => {
      expect(DiagnosticsReporter.findLatestDebugZip(temporaryDirectory, 'my-deployment', 0)).to.equal(undefined);
    });

    it('finds the most recently modified zip created after the start time', (): void => {
      const deployment: string = 'my-deployment';
      const beforeStart: number = Date.now() - 1000;
      const zipPath: string = path.join(temporaryDirectory, `solo-debug-${deployment}-2026-04-01T10-00-00.zip`);
      fs.writeFileSync(zipPath, 'fake zip content');

      const result: string | undefined = DiagnosticsReporter.findLatestDebugZip(
        temporaryDirectory,
        deployment,
        beforeStart,
      );
      expect(result).to.equal(zipPath);
    });

    it('ignores zip files created before the start time', (): void => {
      const deployment: string = 'my-deployment';
      const zipPath: string = path.join(temporaryDirectory, `solo-debug-${deployment}-old.zip`);
      fs.writeFileSync(zipPath, 'old fake content');

      // Start time is in the future relative to the file's mtime
      const result: string | undefined = DiagnosticsReporter.findLatestDebugZip(
        temporaryDirectory,
        deployment,
        Date.now() + 5000,
      );
      expect(result).to.equal(undefined);
    });
  });

  describe('readAnalysisContent', (): void => {
    it('returns empty string when the analysis file does not exist', (): void => {
      expect(DiagnosticsReporter.readAnalysisContent(temporaryDirectory)).to.equal('');
    });

    it('returns the file content when the analysis file exists', (): void => {
      const analysisPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
      fs.writeFileSync(analysisPath, 'some analysis content');
      expect(DiagnosticsReporter.readAnalysisContent(temporaryDirectory)).to.equal('some analysis content');
    });
  });

  describe('buildIssueBody', (): void => {
    it('includes all required metadata fields', (): void => {
      const body: string = DiagnosticsReporter.buildIssueBody({
        soloVersion: '1.2.3',
        deployment: 'my-deploy',
        timestamp: '2026-04-01T10-00-00',
        analysisDirectory: '/tmp/analysis',
        zipFilePath: '/tmp/solo-debug.zip',
      });

      expect(body).to.include('Solo Version**: 1.2.3');
      expect(body).to.include('Deployment**: my-deploy');
      expect(body).to.include('2026-04-01T10-00-00');
      expect(body).to.include('/tmp/solo-debug.zip');
      expect(body).to.include('Please attach it to this issue');
    });

    it('uses (not specified) when deployment is empty', (): void => {
      const body: string = DiagnosticsReporter.buildIssueBody({
        soloVersion: '1.0.0',
        deployment: '',
        timestamp: '2026-04-01T10-00-00',
        analysisDirectory: '/tmp/analysis',
      });

      expect(body).to.include('(not specified)');
    });
  });

  describe('createGitHubIssue', (): void => {
    let executeGhCommandStub: SinonStub;
    const mockPid: number = 12_345;

    beforeEach((): void => {
      executeGhCommandStub = sinon.stub(DiagnosticsReporter, 'executeGhCommand');
    });

    it('returns the issue URL on success', async (): Promise<void> => {
      const expectedUrl: string = 'https://github.com/hiero-ledger/solo/issues/42';
      executeGhCommandStub.returns({
        status: 0,
        stdout: `${expectedUrl}\n`,
        stderr: '',
        output: [undefined, `${expectedUrl}\n`, ''],
        pid: mockPid,
        signal: undefined,
      } as SpawnSyncReturns<string>);

      const url: string = await DiagnosticsReporter.createGitHubIssue(
        loggerStub,
        'Test Title',
        'Test Body',
        '/tmp/analysis',
      );

      expect(url).to.equal(expectedUrl);
      expect(executeGhCommandStub).to.have.been.calledOnce;
    });

    it('throws SoloError when gh command fails', async (): Promise<void> => {
      executeGhCommandStub.returns({
        status: 1,
        stdout: '',
        stderr: 'authentication required',
        output: [undefined, '', 'authentication required'],
        pid: mockPid,
        signal: undefined,
      } as SpawnSyncReturns<string>);

      await expect(
        DiagnosticsReporter.createGitHubIssue(loggerStub, 'Test Title', 'Test Body', '/tmp/analysis'),
      ).to.be.rejectedWith(SoloError, /Failed to create GitHub issue/);
    });
  });
});
