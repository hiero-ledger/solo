// SPDX-License-Identifier: Apache-2.0

import {after, before, describe, it} from 'mocha';
import {expect} from 'chai';
import each from 'mocha-each';

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {v4 as uuid4} from 'uuid';
import {SoloError} from '../../../../src/core/errors/solo-error.js';
import * as constants from '../../../../src/core/constants.js';
import {type ConfigManager} from '../../../../src/core/config-manager.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import crypto from 'node:crypto';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {ContainerName} from '../../../../src/integration/kube/resources/container/container-name.js';
import {ContainerReference} from '../../../../src/integration/kube/resources/container/container-reference.js';
import {ServiceReference} from '../../../../src/integration/kube/resources/service/service-reference.js';
import {ServiceName} from '../../../../src/integration/kube/resources/service/service-name.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {Argv} from '../../../helpers/argv-wrapper.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {SoloPinoLogger} from '../../../../src/core/logging/solo-pino-logger.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {ShellRunner} from '../../../../src/core/shell-runner.js';

const defaultTimeout = Duration.ofMinutes(2).toMillis();

async function logPodDiagnostics(
  namespace: NamespaceName,
  labels: string[],
  k8Factory: K8Factory,
  logger: SoloLogger,
): Promise<void> {
  try {
    const pods: Pod[] = await k8Factory.default().pods().list(namespace, labels);
    if (pods.length === 0) {
      const namespacePods: Pod[] = await k8Factory.default().pods().list(namespace, []);
      logger.showUser?.(
        `Diagnostic: No pods matched labels [${labels.join(', ')}]. Pods currently in namespace ${namespace.toString()}: ${namespacePods
          .map(pod => `${pod.podReference.name.name}`)
          .join(', ')}`,
      );
      return;
    }

    pods.forEach(pod => {
      const conditions: string =
        pod.conditions?.map(condition => `${condition.type}:${condition.status}`).join(', ') ?? 'none';
      logger.showUser?.(
        `Diagnostic: Pod ${pod.podReference.name.name} -> conditions=[${conditions}], deletionTimestamp=${
          pod.deletionTimestamp?.toISOString() ?? 'n/a'
        }, labels=${JSON.stringify(pod.labels ?? {})}`,
      );
    });

    await describePods(namespace, pods, logger);
  } catch (diagnosticError) {
    logger.showUser?.(`Failed to capture pod diagnostics: ${(diagnosticError as Error).message}`);
  }
}

async function describePods(namespace: NamespaceName, pods: Pod[], logger: SoloLogger): Promise<void> {
  const shellRunner: ShellRunner = new ShellRunner(logger);

  for (const pod of pods) {
    const podName: string = pod.podReference.name.name;
    try {
      const describeOutput: string[] = await shellRunner.run(
        `kubectl describe pod ${podName} -n ${namespace.toString()}`,
        [],
        false,
        false,
      );
      logger.showUser?.(`kubectl describe pod ${podName}:\n${describeOutput.join('\n')}`);
    } catch (error) {
      logger.showUser?.(`Failed to describe pod ${podName}: ${(error as Error).message}`);
    }

    try {
      const statusOutput: string[] = await shellRunner.run(
        `kubectl get pod ${podName} -n ${namespace.toString()} -o jsonpath='{.status.containerStatuses}'`,
        [],
        false,
        false,
      );
      logger.showUser?.(`kubectl get pod ${podName} containerStatuses: ${statusOutput.join('\n')}`);
    } catch (error) {
      logger.showUser?.(`Failed to get pod status for ${podName}: ${(error as Error).message}`);
    }
  }
}

async function createPod(
  podReference: PodReference,
  containerName: ContainerName,
  podLabelValue: string,
  k8Factory: K8Factory,
): Promise<void> {
  await k8Factory
    .default()
    .pods()
    .create(
      podReference,
      {app: podLabelValue},
      containerName,
      'alpine:latest',
      ['/bin/sh', '-c', 'sleep 7200'],
      ['/bin/sh', '-c', 'exit 0'],
    );
}

describe('K8', () => {
  const testLogger: SoloLogger = new SoloPinoLogger('debug', true);
  const configManager: ConfigManager = container.resolve(InjectTokens.ConfigManager);
  const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);
  const testNamespace = NamespaceName.of('k8-e2e');
  const argv = Argv.initializeEmpty();
  const podName = PodName.of(`test-pod-${uuid4()}`);
  const podReference = PodReference.of(testNamespace, podName);
  const containerName = ContainerName.of('alpine');
  const podLabelValue = `test-${uuid4()}`;
  const serviceName = `test-service-${uuid4()}`;

  before(async function () {
    this.timeout(defaultTimeout);
    try {
      argv.setArg(flags.namespace, testNamespace.name);
      configManager.update(argv.build());
      if (!(await k8Factory.default().namespaces().has(testNamespace))) {
        await k8Factory.default().namespaces().create(testNamespace);
      }
      await createPod(podReference, containerName, podLabelValue, k8Factory);

      const serviceReference: ServiceReference = ServiceReference.of(testNamespace, ServiceName.of(serviceName));
      await k8Factory.default().services().create(serviceReference, {app: 'svc-test'}, 80, 80);
      // wait 10 seconds for the pod up and running
      await new Promise(resolve => setTimeout(resolve, 10_000));
    } catch (error) {
      console.log(`${error}, ${error.stack}`);
      throw error;
    }
  });

  after(async function () {
    this.timeout(defaultTimeout);
    try {
      await k8Factory.default().pods().readByReference(PodReference.of(testNamespace, podName)).killPod();
      argv.setArg(flags.namespace, constants.SOLO_SETUP_NAMESPACE.name);
      configManager.update(argv.build());
    } catch (error) {
      console.log(error);
      throw error;
    }
  });

  it('should be able to list clusters', async () => {
    const clusters = k8Factory.default().clusters().list();
    expect(clusters).not.to.have.lengthOf(0);
  }).timeout(defaultTimeout);

  it('should be able to list namespaces', async () => {
    const namespaces = await k8Factory.default().namespaces().list();
    expect(namespaces).not.to.have.lengthOf(0);
    const match = namespaces.filter(n => n.name === constants.DEFAULT_NAMESPACE.name);
    expect(match).to.have.lengthOf(1);
  }).timeout(defaultTimeout);

  it('should be able to list context names', () => {
    const contexts = k8Factory.default().contexts().list();
    expect(contexts).not.to.have.lengthOf(0);
  }).timeout(defaultTimeout);

  it('should be able to create and delete a namespaces', async () => {
    const name = uuid4();
    expect(await k8Factory.default().namespaces().create(NamespaceName.of(name))).to.be.true;
    expect(await k8Factory.default().namespaces().delete(NamespaceName.of(name))).to.be.true;
  }).timeout(defaultTimeout);

  it('should be able to run wait for pod', async () => {
    const labels = [`app=${podLabelValue}`];

    let pods: Pod[] = [];
    try {
      pods = await k8Factory
        .default()
        .pods()
        .waitForRunningPhase(testNamespace, labels, 30, constants.PODS_RUNNING_DELAY);
    } catch (error) {
      await logPodDiagnostics(testNamespace, labels, k8Factory, testLogger);
      throw error;
    }
    if (pods.length !== 1) {
      await logPodDiagnostics(testNamespace, labels, k8Factory, testLogger);
    }
    expect(pods).to.have.lengthOf(1);
  }).timeout(defaultTimeout);

  it('should be able to run wait for pod ready', async () => {
    const labels = [`app=${podLabelValue}`];

    const pods = await k8Factory.default().pods().waitForReadyStatus(testNamespace, labels, 100);
    expect(pods).to.have.lengthOf(1);
  }).timeout(defaultTimeout);

  it('should be able to check if a path is directory inside a container', async () => {
    const pods: Pod[] = await k8Factory
      .default()
      .pods()
      .list(testNamespace, [`app=${podLabelValue}`]);
    expect(
      await k8Factory
        .default()
        .containers()
        .readByRef(ContainerReference.of(pods[0].podReference, containerName))
        .hasDir('/tmp'),
    ).to.be.true;
  }).timeout(defaultTimeout);

  const testCases = ['test/data/pem/keys/a-private-node0.pem', 'test/data/build-v0.54.0-alpha.4.zip'];

  each(testCases).describe('test copyTo and copyFrom', localFilePath => {
    it('should be able to copy a file to and from a container', async () => {
      const pods = await k8Factory
        .default()
        .pods()
        .waitForReadyStatus(testNamespace, [`app=${podLabelValue}`], 20);
      expect(pods).to.have.lengthOf(1);

      const localTemporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'k8-test'));
      const remoteTemporaryDirectory = '/tmp';
      const fileName = path.basename(localFilePath);
      const remoteFilePath = `${remoteTemporaryDirectory}/${fileName}`;
      const originalFileData = fs.readFileSync(localFilePath);
      const originalFileHash = crypto.createHash('sha384').update(originalFileData).digest('hex');
      const originalStat = fs.statSync(localFilePath);

      // upload the file
      expect(
        await k8Factory
          .default()
          .containers()
          .readByRef(ContainerReference.of(podReference, containerName))
          .copyTo(localFilePath, remoteTemporaryDirectory),
      ).to.be.true;

      // download the same file
      expect(
        await k8Factory
          .default()
          .containers()
          .readByRef(ContainerReference.of(podReference, containerName))
          .copyFrom(remoteFilePath, localTemporaryDirectory),
      ).to.be.true;
      const downloadedFilePath = PathEx.joinWithRealPath(localTemporaryDirectory, fileName);
      const downloadedFileData = fs.readFileSync(downloadedFilePath);
      const downloadedFileHash = crypto.createHash('sha384').update(downloadedFileData).digest('hex');
      const downloadedStat = fs.statSync(downloadedFilePath);

      expect(downloadedStat.size, 'downloaded file size should match original file size').to.equal(originalStat.size);
      expect(downloadedFileHash, 'downloaded file hash should match original file hash').to.equal(originalFileHash);

      // rm file inside the container
      await k8Factory
        .default()
        .containers()
        .readByRef(ContainerReference.of(podReference, containerName))
        .execContainer(['rm', '-f', remoteFilePath]);

      fs.rmSync(localTemporaryDirectory, {recursive: true});
    }).timeout(defaultTimeout);
  });

  it('should be able to port forward gossip port', done => {
    const localPort = +constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT;
    try {
      const podReference: PodReference = PodReference.of(testNamespace, podName);
      k8Factory
        .default()
        .pods()
        .readByReference(podReference)
        .portForward(localPort, +constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT)
        .then(async server => {
          // sleep for 5 seconds to allow the port forward to start
          await new Promise(resolve => setTimeout(resolve, 5000));
          expect(server).not.to.be.null;

          // client
          const s = new net.Socket();
          s.on('ready', async () => {
            s.destroy();
            await k8Factory.default().pods().readByReference(podReference).stopPortForward(server);
            done();
          });

          s.on('error', async error => {
            s.destroy();
            await k8Factory.default().pods().readByReference(podReference).stopPortForward(server);
            done(new SoloError(`could not connect to local port '${localPort}': ${error.message}`, error));
          });

          s.connect(localPort);
        });
    } catch (error) {
      testLogger.showUserError(error);
      expect.fail();
    }
    // TODO enhance this test to do something with the port, this pod isn't even running, but it is still passing
  }).timeout(defaultTimeout);

  it('should be able to cat a file inside the container', async () => {
    const pods: Pod[] = await k8Factory
      .default()
      .pods()
      .list(testNamespace, [`app=${podLabelValue}`]);
    const podName: PodName = pods[0].podReference.name;
    const output = await k8Factory
      .default()
      .containers()
      .readByRef(ContainerReference.of(PodReference.of(testNamespace, podName), containerName))
      .execContainer(['cat', '/etc/hostname']);
    expect(output.indexOf(podName.name)).to.equal(0);
  }).timeout(defaultTimeout);

  it('should be able to list persistent volume claims', async () => {
    const pvcReference: PodReference = PodReference.of(testNamespace, PodName.of(`test-pvc-${uuid4()}`));
    try {
      await k8Factory.default().pvcs().create(pvcReference, {storage: '50Mi'}, ['ReadWriteOnce']);
      const pvcs: string[] = await k8Factory.default().pvcs().list(testNamespace);
      expect(pvcs).to.have.length.greaterThan(0);
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      await k8Factory.default().pvcs().delete(pvcReference);
    }
  }).timeout(defaultTimeout);

  it('should be able to kill a pod', async () => {
    const podName = PodName.of(`test-pod-${uuid4()}`);
    const podReference = PodReference.of(testNamespace, podName);
    const podLabelValue = `test-${uuid4()}`;
    await createPod(podReference, containerName, podLabelValue, k8Factory);
    await k8Factory.default().pods().readByReference(podReference).killPod();
    const newPods = await k8Factory
      .default()
      .pods()
      .list(testNamespace, [`app=${podLabelValue}`]);
    expect(newPods).to.have.lengthOf(0);
  });
});
