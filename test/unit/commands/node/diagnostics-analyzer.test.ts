// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import sinon from 'sinon';

import {DiagnosticsAnalyzer} from '../../../../src/commands/node/diagnostics-analyzer.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';

describe('DiagnosticsAnalyzer', (): void => {
  let temporaryDirectory: string;
  let loggerStub: SoloLogger;
  let userMessages: string[];

  const swirldsLogSample: string = `2026-03-27 16:52:37.460 20       INFO  STARTUP          <main> EnhancedKeyStoreLoader: Finished key store migration.
2026-03-27 16:52:37.481 21       INFO  STARTUP          <main> EnhancedKeyStoreLoader: Generating agreement key pair for local nodeId 2
2026-03-27 16:52:37.539 22       WARN  STARTUP          <main> EnhancedKeyStoreLoader: No certificate found for nodeId 2 [purpose = AGREEMENT ]
2026-03-27 16:52:37.539 23       ERROR EXCEPTION        <main> CryptoStatic: Exception while loading/generating keys
com.swirlds.platform.crypto.KeyLoadingException: No certificate found for nodeId 2 [purpose = AGREEMENT ]
\tat com.swirlds.platform.crypto.EnhancedKeyStoreLoader.verify(EnhancedKeyStoreLoader.java:341)
\tat com.swirlds.platform.crypto.CryptoStatic.initNodeSecurity(CryptoStatic.java:186)
\tat com.hedera.node.app.ServicesMain.main(ServicesMain.java:228)
2026-03-27 16:52:37.541 24       INFO  STARTUP          <main> SystemExitUtils: System exit requested (KEY_LOADING_FAILED)
thread requesting exit: main
com.swirlds.platform.system.SystemExitUtils.exitSystem(SystemExitUtils.java:37)
\tat com.swirlds.platform.system.SystemExitUtils.exitSystem(SystemExitUtils.java:73)
\tat com.swirlds.platform.crypto.CryptoStatic.initNodeSecurity(CryptoStatic.java:216)
\tat com.hedera.node.app.ServicesMain.main(ServicesMain.java:228)

2026-03-27 16:52:37.544 25       ERROR EXCEPTION        <main> SystemExitUtils: Exiting system {"reason":"KEY_LOADING_FAILED","code":204} [com.swirlds.logging.legacy.payload.SystemExitPayload]
2026-03-27 16:52:37.544 26       INFO  STARTUP          <<browser: shutdown-hook>> Log4jSetup: JVM is shutting down.
`;

  beforeEach((): void => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-diagnostics-analyzer-'));
    userMessages = [];
    loggerStub = {
      setDevMode: sinon.stub(),
      isDevMode: sinon.stub().returns(false),
      nextTraceId: sinon.stub(),
      prepMeta: sinon.stub().callsFake((meta?: object): object => meta ?? {}),
      showUser: sinon.stub().callsFake((message: unknown): void => {
        userMessages.push(String(message));
      }),
      showUserError: sinon.stub(),
      error: sinon.stub(),
      warn: sinon.stub(),
      info: sinon.stub(),
      debug: sinon.stub(),
      showList: sinon.stub(),
      showJSON: sinon.stub(),
      addMessageGroup: sinon.stub(),
      getMessageGroup: sinon.stub().returns([]),
      addMessageGroupMessage: sinon.stub(),
      showMessageGroup: sinon.stub(),
      getMessageGroupKeys: sinon.stub().returns([]),
      showAllMessageGroups: sinon.stub(),
      flush: sinon.stub().callsFake((callback: (error?: Error) => void): void => callback()),
    };
  });

  afterEach((): void => {
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    sinon.restore();
  });

  it('extracts and reports exception stack details from swirlds.log', (): void => {
    const archivePath: string = path.join(temporaryDirectory, 'network-node3-0-log-config.zip');
    const archive: AdmZip = new AdmZip();
    archive.addFile('output/swirlds.log', Buffer.from(swirldsLogSample, 'utf8'));
    archive.writeZip(archivePath);

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, undefined);

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    expect(fs.existsSync(reportPath)).to.equal(true);

    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Consensus node may not have reached ACTIVE status');
    expect(reportText).to.include('Exception detected in swirlds.log');
    expect(reportText).to.include(
      'com.swirlds.platform.crypto.KeyLoadingException: No certificate found for nodeId 2 [purpose = AGREEMENT ]',
    );
    expect(reportText).to.include(
      'at com.swirlds.platform.crypto.EnhancedKeyStoreLoader.verify(EnhancedKeyStoreLoader.java:341)',
    );
    expect(reportText).to.include('No ACTIVE status marker found in swirlds.log');

    const consoleSummary: string = userMessages.join('\n');
    expect(consoleSummary).to.include('Exception detected in swirlds.log');
    expect(consoleSummary).to.include(
      'com.swirlds.platform.crypto.KeyLoadingException: No certificate found for nodeId 2 [purpose = AGREEMENT ]',
    );
  });

  it('includes the preceding ERROR EXCEPTION line when exception block starts on throwable class line', (): void => {
    const logWithUppercaseExceptionMarker: string = `2026-03-27 16:52:37.539 23       ERROR EXCEPTION        <main> CryptoStatic: key loading failed
com.swirlds.platform.crypto.KeyLoadingException: No certificate found for nodeId 2 [purpose = AGREEMENT ]
\tat com.swirlds.platform.crypto.EnhancedKeyStoreLoader.verify(EnhancedKeyStoreLoader.java:341)
2026-03-27 16:52:37.541 24       INFO  STARTUP          <main> SystemExitUtils: System exit requested (KEY_LOADING_FAILED)
`;

    const archivePath: string = path.join(temporaryDirectory, 'network-node3-0-log-config.zip');
    const archive: AdmZip = new AdmZip();
    archive.addFile('output/swirlds.log', Buffer.from(logWithUppercaseExceptionMarker, 'utf8'));
    archive.writeZip(archivePath);

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, undefined);

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include(
      'ERROR EXCEPTION        <main> CryptoStatic: key loading failed',
    );
    expect(reportText).to.include(
      'com.swirlds.platform.crypto.KeyLoadingException: No certificate found for nodeId 2 [purpose = AGREEMENT ]',
    );
  });

  it('includes the preceding timestamped ERROR line for hgcaa.log exceptions', (): void => {
    const hgcaaSample: string = `2026-03-27 16:46:55.329 INFO  401  WrapsHistoryProver - Considering publication of WRAPS R1 output on construction #2
2026-03-27 16:46:55.330 ERROR 351  HandleWorkflow - Possibly CATASTROPHIC failure trying to reconcile TSS state
java.lang.NullPointerException
\tat java.base/java.util.Objects.requireNonNull(Objects.java:220)
\tat com.hedera.node.app.history.impl.WrapsHistoryProver.publishIfNeeded(WrapsHistoryProver.java:407)
2026-03-27 16:46:55.390 INFO  401  WrapsHistoryProver - Considering publication of WRAPS R1 output on construction #2
`;

    const archivePath: string = path.join(temporaryDirectory, 'network-node2-0-log-config.zip');
    const archive: AdmZip = new AdmZip();
    archive.addFile('output/hgcaa.log', Buffer.from(hgcaaSample, 'utf8'));
    archive.writeZip(archivePath);

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, undefined);

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Exception detected in hgcaa.log');
    expect(reportText).to.include(
      '2026-03-27 16:46:55.330 ERROR 351  HandleWorkflow - Possibly CATASTROPHIC failure trying to reconcile TSS state',
    );
    expect(reportText).to.include('java.lang.NullPointerException');
  });

  it('detects image-pull failures from YAML pod describe content', (): void => {
    const describeSample: string = `pod:
  status:
    phase: Running
events:
  - lastTimestamp: 2026-03-27T17:10:35.000Z
    message: 'Failed to pull image "curlimages/curl:8.9.1": failed to pull and
      unpack image "docker.io/curlimages/curl:8.9.1": failed to copy:
      httpReadSeeker: failed open: unexpected status code
      https://registry-1.docker.io/v2/curlimages/curl/manifests/sha256:78c8580bd9480f0d2527c0b781eeb9ffa00f3795f882e625f576aa51af8f4ad5:
      429 Too Many Requests - Server message: toomanyrequests: You have reached
      your unauthenticated pull rate limit.
      https://www.docker.com/increase-rate-limit'
    reason: Failed
  - lastTimestamp: 2026-03-27T17:12:57.000Z
    message: "Error: ErrImagePull"
    reason: Failed
  - lastTimestamp: 2026-03-27T17:24:58.000Z
    message: "Error: ImagePullBackOff"
    reason: Failed
`;

    const describeDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs', 'kind-solo-e2e');
    fs.mkdirSync(describeDirectory, {recursive: true});
    fs.writeFileSync(path.join(describeDirectory, 'network-node1-0.describe.txt'), describeSample, 'utf8');

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, undefined);

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Image pull failure detected for pod network-node1-0');
    expect(reportText).to.include('line 10: 429 Too Many Requests - Server message: toomanyrequests: You have reached');
    expect(reportText).to.include('message: "Error: ErrImagePull"');
    expect(reportText).to.include('message: "Error: ImagePullBackOff"');
    expect(reportText).to.not.include('Pod not ready/running: network-node1-0');
  });
});
