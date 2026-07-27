// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import sinon from 'sinon';

import {DiagnosticsAnalyzer} from '../../../../src/commands/util/diagnostics-analyzer.js';
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
      showUserUnlessOneShot: sinon.stub(),
      beginDeferredUserOutput: sinon.stub(),
      flushDeferredUserOutput: sinon.stub(),
      showUserError: sinon.stub(),
      error: sinon.stub(),
      warn: sinon.stub(),
      info: sinon.stub(),
      debug: sinon.stub(),
      showList: sinon.stub(),
      showListIfNotEmpty: sinon.stub(),
      showJSON: sinon.stub(),
      addMessageGroup: sinon.stub(),
      getMessageGroup: sinon.stub().returns([]),
      addMessageGroupMessage: sinon.stub(),
      showMessageGroup: sinon.stub(),
      getMessageGroupKeys: sinon.stub().returns([]),
      showAllMessageGroups: sinon.stub(),
      flush: sinon.stub().callsFake((callback: (error?: Error) => void): void => callback()),
      setLogBinding: sinon.stub(),
      addLogBindings: sinon.stub(),
      clearLogBindings: sinon.stub(),
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

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

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

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('ERROR EXCEPTION        <main> CryptoStatic: key loading failed');
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

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

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

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Image pull failure detected for pod network-node1-0');
    expect(reportText).to.include('line 10: 429 Too Many Requests - Server message: toomanyrequests: You have reached');
    expect(reportText).to.include('message: "Error: ErrImagePull"');
    expect(reportText).to.include('message: "Error: ImagePullBackOff"');
    expect(reportText).to.not.include('Pod not ready/running: network-node1-0');
  });

  it('includes container termination exit codes in pod readiness findings', (): void => {
    const describeSample: string = `pod:
  status:
    phase: Running
    conditions:
      - message: "containers with unready status: [relay]"
        reason: ContainersNotReady
        status: "False"
        type: ContainersReady
    containerStatuses:
      - lastState:
          terminated:
            exitCode: 137
            reason: Error
        name: relay
        ready: false
        state:
          running:
            startedAt: 2026-06-25T07:42:53.000Z
containers:
  relay:
    Last State: Terminated
      Reason: Error
      Exit Code: 137
    Ready: False
`;

    const describeDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs', 'kind-solo-e2e');
    fs.mkdirSync(describeDirectory, {recursive: true});
    fs.writeFileSync(path.join(describeDirectory, 'relay-1.describe.txt'), describeSample, 'utf8');

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Pod not ready/running: relay-1');
    expect(reportText).to.include('line 12: exitCode: 137');
    expect(reportText).to.include('line 23: Exit Code: 137');
    expect(reportText).to.include('line 13: reason: Error');

    const consoleSummary: string = userMessages.join('\n');
    expect(consoleSummary).to.include('line 12: exitCode: 137');
    expect(consoleSummary).to.include('line 23: Exit Code: 137');
  });

  it('suppresses known transient postgres migration race errors but keeps other errors', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const postgresLogPath: string = path.join(componentLogDirectory, 'solo-shared-resources-postgres-main.log');
    fs.writeFileSync(
      postgresLogPath,
      [
        '2026-03-27T16:52:37.539Z 2026-03-27T16:52:37.539Z ERROR relation "account_balance_temp" does not exist',
        '2026-03-27T16:52:38.539Z 2026-03-27T16:52:38.539Z ERROR unrecoverable postgres failure',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: solo-shared-resources-postgres-main');
    expect(reportText).to.include('ERROR unrecoverable postgres failure');
    expect(reportText).to.not.include('relation "account_balance_temp" does not exist');
  });

  it('suppresses mirror importer begin-phase downloader errors only after repeated parse success', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const importerLogPath: string = path.join(componentLogDirectory, 'mirror-main-importer.log');
    fs.writeFileSync(
      importerLogPath,
      [
        '2026-03-27T16:52:00.000Z 2026-03-27T16:52:00.000Z ERROR RecordFileDownloader Error downloading files',
        '2026-03-27T16:52:01.000Z 2026-03-27T16:52:01.000Z INFO RecordFileParser Successfully processed 1 items',
        '2026-03-27T16:52:02.000Z 2026-03-27T16:52:02.000Z ERROR AccountBalancesDownloader Error downloading signature files for node 0',
        '2026-03-27T16:52:03.000Z 2026-03-27T16:52:03.000Z INFO RecordFileParser Successfully processed 1 items',
        '2026-03-27T16:52:04.000Z 2026-03-27T16:52:04.000Z ERROR RecordFileDownloader Error downloading files',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: mirror-main-importer');
    expect(reportText).to.include(
      'line 5: 2026-03-27T16:52:04.000Z ERROR RecordFileDownloader Error downloading files',
    );
    expect(reportText).to.not.include(
      'line 1: 2026-03-27T16:52:00.000Z ERROR RecordFileDownloader Error downloading files',
    );
    expect(reportText).to.not.include(
      'line 3: 2026-03-27T16:52:02.000Z ERROR AccountBalancesDownloader Error downloading signature files for node 0',
    );
  });

  it('suppresses mirror importer begin-phase block-node source errors only after repeated parse success', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const importerLogPath: string = path.join(componentLogDirectory, 'mirror-main-importer.log');
    fs.writeFileSync(
      importerLogPath,
      [
        '2026-05-19T17:08:39.170Z 2026-05-19T17:08:39.170Z ERROR scheduling-6 o.h.m.i.d.b.BlockNode Failed to get server status for BlockNode(block-node-1.one-shot.svc.cluster.local:40840) io.grpc.StatusRuntimeException: UNAVAILABLE: io exception',
        '2026-05-19T17:08:39.170Z 2026-05-19T17:08:39.170Z ERROR scheduling-6 o.h.m.i.d.b.CompositeBlockSource Failed to get block from BLOCK_NODE source org.hiero.mirror.importer.exception.BlockStreamException: No block node can provide block 0',
        '2026-05-19T17:08:40.170Z 2026-05-19T17:08:40.170Z INFO RecordFileParser Successfully processed 1 items',
        '2026-05-19T17:08:41.170Z 2026-05-19T17:08:41.170Z INFO RecordFileParser Successfully processed 1 items',
        '2026-05-19T17:08:42.170Z 2026-05-19T17:08:42.170Z ERROR scheduling-6 o.h.m.i.d.b.BlockNode Failed to get server status for BlockNode(block-node-1.one-shot.svc.cluster.local:40840) io.grpc.StatusRuntimeException: UNAVAILABLE: io exception',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: mirror-main-importer');
    expect(reportText).to.include(
      'line 5: 2026-05-19T17:08:42.170Z ERROR scheduling-6 o.h.m.i.d.b.BlockNode Failed to get server status for BlockNode(block-node-1.one-shot.svc.cluster.local:40840) io.grpc.StatusRuntimeException: UNAVAILABLE: io exception',
    );
    expect(reportText).to.not.include(
      'line 1: 2026-05-19T17:08:39.170Z ERROR scheduling-6 o.h.m.i.d.b.BlockNode Failed to get server status for BlockNode(block-node-1.one-shot.svc.cluster.local:40840) io.grpc.StatusRuntimeException: UNAVAILABLE: io exception',
    );
    expect(reportText).to.not.include(
      'line 2: 2026-05-19T17:08:39.170Z ERROR scheduling-6 o.h.m.i.d.b.CompositeBlockSource Failed to get block from BLOCK_NODE source org.hiero.mirror.importer.exception.BlockStreamException: No block node can provide block 0',
    );
  });

  it('suppresses conditional mirror rest retry errors when success marker exists', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const restLogPath: string = path.join(componentLogDirectory, 'mirror-main-rest.log');
    fs.writeFileSync(
      restLogPath,
      [
        '2026-03-27T16:52:00.000Z 2026-03-27T16:52:00.000Z ERROR Startup Error connecting to redis://redis:6379',
        '2026-03-27T16:52:05.000Z 2026-03-27T16:52:05.000Z INFO Startup Connected to redis://redis:6379',
        '2026-03-27T16:52:10.000Z 2026-03-27T16:52:10.000Z ERROR unrelated rest failure',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: mirror-main-rest');
    expect(reportText).to.include('ERROR unrelated rest failure');
    expect(reportText).to.not.include('ERROR Startup Error connecting to redis://redis:6379');
  });

  it('suppresses mirror rest db auth failures only during startup', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const restLogPath: string = path.join(componentLogDirectory, 'mirror-1-rest-7447d9dd48-fzz6t.log');
    fs.writeFileSync(
      restLogPath,
      [
        '2026-05-16T20:04:01.696Z 2026-05-16T20:04:01.696Z INFO Startup Loaded configuration source: /home/node/app/config/application.yml',
        '2026-05-16T20:04:03.795Z 2026-05-16T20:04:03.795Z ERROR Startup Error connecting to redis://redis:6379: connect ECONNREFUSED 10.96.225.68:6379',
        '2026-05-16T20:04:03.912Z 2026-05-16T20:04:03.912Z ERROR Startup healthcheck failed DbError: password authentication failed for user "mirror_rest"',
        '2026-05-16T20:04:03.912Z     at file:///home/node/app/health.js:26:13',
        '2026-05-16T20:04:09.801Z 2026-05-16T20:04:09.801Z INFO Startup Connected to redis://redis:6379',
        '2026-05-16T20:04:13.909Z 2026-05-16T20:04:13.909Z ERROR Startup healthcheck failed NotFoundError: Application readiness check failed',
        '2026-05-16T20:05:10.000Z 2026-05-16T20:05:10.000Z ERROR Startup healthcheck failed DbError: password authentication failed for user "mirror_rest"',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: mirror-1-rest-7447d9dd48-fzz6t');
    expect(reportText).to.include(
      'line 7: 2026-05-16T20:05:10.000Z ERROR Startup healthcheck failed DbError: password authentication failed for user "mirror_rest"',
    );
    expect(reportText).to.not.include(
      'line 6: 2026-05-16T20:04:13.909Z ERROR Startup healthcheck failed NotFoundError: Application readiness check failed',
    );
    expect(reportText).to.not.include(
      'line 3: 2026-05-16T20:04:03.912Z ERROR Startup healthcheck failed DbError: password authentication failed for user "mirror_rest"',
    );
  });

  it('suppresses split mirror rest readiness failures only during startup', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const restLogPath: string = path.join(componentLogDirectory, 'mirror-1-rest-68c654f85d-xbkw8-1.log');
    fs.writeFileSync(
      restLogPath,
      [
        '2026-06-29T07:59:03.482Z 2026-06-29T07:59:02.854Z INFO Startup Loaded configuration source: /home/node/app/config/application.yml',
        '2026-06-29T07:59:05.486Z 2026-06-29T07:59:05.479Z ERROR Startup healthcheck failed',
        'Error: Application readiness check failed',
        '    at file:///home/node/app/server.js:778:1872',
        '    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)',
        '2026-06-29T08:02:05.486Z 2026-06-29T08:02:05.479Z ERROR Startup healthcheck failed',
        'Error: Application readiness check failed',
        '    at file:///home/node/app/server.js:778:1872',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: mirror-1-rest-68c654f85d-xbkw8-1');
    expect(reportText).to.include('line 6: 2026-06-29T08:02:05.479Z ERROR Startup healthcheck failed');
    expect(reportText).to.not.include('line 2: 2026-06-29T07:59:05.479Z ERROR Startup healthcheck failed');
  });

  it('suppresses split mirror rest db auth failures only during startup', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const restLogPath: string = path.join(componentLogDirectory, 'mirror-1-rest-68c654f85d-zlr9q.log');
    fs.writeFileSync(
      restLogPath,
      [
        '2026-06-28T03:30:43.350Z 2026-06-28T03:30:42.737Z INFO Startup Loaded configuration source: /home/node/app/config/application.yml',
        '2026-06-28T03:30:44.102Z 2026-06-28T03:30:43.939Z ERROR Startup healthcheck failed',
        'Error: password authentication failed for user "mirror_rest"',
        '    at file:///home/node/app/server.js:778:1819',
        '2026-06-28T03:31:45.103Z 2026-06-28T03:31:44.933Z ERROR Startup healthcheck failed',
        'Error: password authentication failed for user "mirror_rest"',
        '    at file:///home/node/app/server.js:778:1819',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: mirror-1-rest-68c654f85d-zlr9q');
    expect(reportText).to.include('line 5: 2026-06-28T03:31:44.933Z ERROR Startup healthcheck failed');
    expect(reportText).to.not.include('line 2: 2026-06-28T03:30:43.939Z ERROR Startup healthcheck failed');
  });

  it('keeps non-suppressed continuation-line error matches as evidence', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const relayLogPath: string = path.join(componentLogDirectory, 'relay-main.log');
    fs.writeFileSync(
      relayLogPath,
      [
        '2026-03-27T16:52:00.000Z ERROR relay startup failed',
        '  java.lang.RuntimeException: root cause',
        '  Caused by: nested ERROR detail',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('line 1: ERROR relay startup failed');
    expect(reportText).to.include('line 3: Caused by: nested ERROR detail');
  });

  it('suppresses postgres authentication failures only within startup window', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const postgresLogPath: string = path.join(componentLogDirectory, 'solo-shared-resources-postgres-0.log');
    fs.writeFileSync(
      postgresLogPath,
      [
        '2026-05-16T20:03:43.159Z 2026-05-16 20:03:43.159 GMT [1] LOG:  pgaudit extension initialized',
        '2026-05-16T20:03:43.185Z 2026-05-16 20:03:43.185 GMT [1] LOG:  database system is ready to accept connections',
        '2026-05-16T20:04:03.911Z 2026-05-16 20:04:03.911 GMT [245] FATAL:  password authentication failed for user "mirror_rest"',
        '2026-05-16T20:04:03.911Z 2026-05-16 20:04:03.911 GMT [245] DETAIL:  Role "mirror_rest" does not exist.',
        '2026-05-16T20:04:04.906Z 2026-05-16 20:04:04.906 GMT [246] FATAL:  password authentication failed for user "mirror_rest"',
        '2026-05-16T20:04:04.906Z 2026-05-16 20:04:04.906 GMT [246] DETAIL:  Role "mirror_rest" does not exist.',
        '2026-05-16T20:04:12.906Z 2026-05-16 20:04:12.906 GMT [271] FATAL:  password authentication failed for user "mirror_rest"',
        '2026-05-16T20:04:12.906Z 2026-05-16 20:04:12.906 GMT [271] DETAIL:  Role "mirror_rest" does not exist.',
        '2026-05-16T20:04:24.616Z 2026-05-16 20:04:24.616 GMT [260] ERROR:  relation "crypto_allowance_migration" does not exist at character 8',
        '2026-05-16T20:05:20.616Z 2026-05-16 20:05:20.616 GMT [260] ERROR:  deadlock detected',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: solo-shared-resources-postgres-0');
    expect(reportText).to.include('ERROR:  deadlock detected');
    expect(reportText).to.not.include('ERROR:  relation "crypto_allowance_migration" does not exist');
    // Auth failures within 90-second startup window should be suppressed
    expect(reportText).to.not.include('FATAL:  password authentication failed');
  });

  it('suppresses transient solo.log block-node copy verification size mismatch errors', (): void => {
    const soloLogPath: string = path.join(temporaryDirectory, 'solo.log');
    fs.writeFileSync(
      soloLogPath,
      [
        '[17:15:44.153] ERROR: Failed to download block node log files from block-node-1-0: SoloError: copy verification failed: expected size 3422030 but found 3429506 at /Users/jeffrey/.solo/logs/hiero-components-logs/kind-solo-cluster/block-node-1-0-block-logs/blocknode-0.log',
        '[17:15:44.200] INFO: continuing diagnostics collection',
        '[17:15:45.153] ERROR: real analyzer failure that must be reported',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('ERROR detected in solo.log');
    expect(reportText).to.include('line 3: [17:15:45.153] ERROR: real analyzer failure that must be reported');
    expect(reportText).to.not.include('copy verification failed: expected size 3422030 but found 3429506');

    const consoleSummary: string = userMessages.join('\n');
    expect(consoleSummary).to.include('Suppressed 1 transient error line(s) in solo.log');
  });
});
