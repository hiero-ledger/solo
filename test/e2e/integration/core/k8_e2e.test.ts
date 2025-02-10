/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe, after, before} from 'mocha';
import {expect} from 'chai';
import each from 'mocha-each';

import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import {v4 as uuid4} from 'uuid';
import {SoloError} from '../../../../src/core/errors.js';
import * as constants from '../../../../src/core/constants.js';
import {Templates} from '../../../../src/core/templates.js';
import {type ConfigManager} from '../../../../src/core/config_manager.js';
import * as logging from '../../../../src/core/logging.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import crypto from 'crypto';
import {PodName} from '../../../../src/core/kube/resources/pod/pod_name.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {NamespaceName} from '../../../../src/core/kube/resources/namespace/namespace_name.js';
import {PodRef} from '../../../../src/core/kube/resources/pod/pod_ref.js';
import {ContainerName} from '../../../../src/core/kube/resources/container/container_name.js';
import {ContainerRef} from '../../../../src/core/kube/resources/container/container_ref.js';
import {ServiceRef} from '../../../../src/core/kube/resources/service/service_ref.js';
import {ServiceName} from '../../../../src/core/kube/resources/service/service_name.js';
import {InjectTokens} from '../../../../src/core/dependency_injection/inject_tokens.js';
import {type K8} from '../../../../src/core/kube/k8.js';

const defaultTimeout = Duration.ofMinutes(2).toMillis();

async function createPod(podRef: PodRef, containerName: ContainerName, podLabelValue: string, k8: K8): Promise<void> {
  await k8
    .pods()
    .create(
      podRef,
      {app: podLabelValue},
      containerName,
      'alpine:latest',
      ['/bin/sh', '-c', 'apk update && apk upgrade && apk add --update bash && sleep 7200'],
      ['bash', '-c', 'exit 0'],
    );
}

describe('K8', () => {
  const testLogger = logging.NewLogger('debug', true);
  const configManager: ConfigManager = container.resolve(InjectTokens.ConfigManager);
  const k8: K8 = container.resolve(InjectTokens.K8);
  const testNamespace = NamespaceName.of('k8-e2e');
  const argv = [];
  const podName = PodName.of(`test-pod-${uuid4()}`);
  const podRef = PodRef.of(testNamespace, podName);
  const containerName = ContainerName.of('alpine');
  const podLabelValue = `test-${uuid4()}`;
  const serviceName = `test-service-${uuid4()}`;

  before(async function () {
    this.timeout(defaultTimeout);
    try {
      argv[flags.namespace.name] = testNamespace.name;
      configManager.update(argv);
      if (!(await k8.namespaces().has(testNamespace))) {
        await k8.namespaces().create(testNamespace);
      }
      await createPod(podRef, containerName, podLabelValue, k8);

      const serviceRef: ServiceRef = ServiceRef.of(testNamespace, ServiceName.of(serviceName));
      await k8.services().create(serviceRef, {app: 'svc-test'}, 80, 80);
    } catch (e) {
      console.log(`${e}, ${e.stack}`);
      throw e;
    }
  });

  after(async function () {
    this.timeout(defaultTimeout);
    try {
      await k8.pods().readByRef(PodRef.of(testNamespace, podName)).killPod();
      argv[flags.namespace.name] = constants.SOLO_SETUP_NAMESPACE.name;
      configManager.update(argv);
    } catch (e) {
      console.log(e);
      throw e;
    }
  });

  it('should be able to list clusters', async () => {
    const clusters = k8.clusters().list();
    expect(clusters).not.to.have.lengthOf(0);
  }).timeout(defaultTimeout);

  it('should be able to list namespaces', async () => {
    const namespaces = await k8.namespaces().list();
    expect(namespaces).not.to.have.lengthOf(0);
    const match = namespaces.filter(n => n.name === constants.DEFAULT_NAMESPACE.name);
    expect(match).to.have.lengthOf(1);
  }).timeout(defaultTimeout);

  it('should be able to list context names', () => {
    const contexts = k8.contexts().list();
    expect(contexts).not.to.have.lengthOf(0);
  }).timeout(defaultTimeout);

  it('should be able to create and delete a namespaces', async () => {
    const name = uuid4();
    expect(await k8.namespaces().create(NamespaceName.of(name))).to.be.true;
    expect(await k8.namespaces().delete(NamespaceName.of(name))).to.be.true;
  }).timeout(defaultTimeout);

  it('should be able to run wait for pod', async () => {
    const labels = [`app=${podLabelValue}`];

    const pods = await k8.pods().waitForRunningPhase(testNamespace, labels, 30, constants.PODS_RUNNING_DELAY);
    expect(pods).to.have.lengthOf(1);
  }).timeout(defaultTimeout);

  it('should be able to run wait for pod ready', async () => {
    const labels = [`app=${podLabelValue}`];

    const pods = await k8.pods().waitForReadyStatus(testNamespace, labels, 100);
    expect(pods).to.have.lengthOf(1);
  }).timeout(defaultTimeout);

  it('should be able to check if a path is directory inside a container', async () => {
    const pods = await k8.pods().list(testNamespace, [`app=${podLabelValue}`]);
    const podName = PodName.of(pods[0].metadata.name);
    expect(
      await k8
        .containers()
        .readByRef(ContainerRef.of(PodRef.of(testNamespace, podName), containerName))
        .hasDir('/tmp'),
    ).to.be.true;
  }).timeout(defaultTimeout);

  const testCases = ['test/data/pem/keys/a-private-node0.pem', 'test/data/build-v0.54.0-alpha.4.zip'];

  each(testCases).describe('test copyTo and copyFrom', localFilePath => {
    it('should be able to copy a file to and from a container', async () => {
      const pods = await k8.pods().waitForReadyStatus(testNamespace, [`app=${podLabelValue}`], 20);
      expect(pods).to.have.lengthOf(1);

      const localTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'k8-test'));
      const remoteTmpDir = '/tmp';
      const fileName = path.basename(localFilePath);
      const remoteFilePath = `${remoteTmpDir}/${fileName}`;
      const originalFileData = fs.readFileSync(localFilePath);
      const originalFileHash = crypto.createHash('sha384').update(originalFileData).digest('hex');
      const originalStat = fs.statSync(localFilePath);

      // upload the file
      expect(
        await k8.containers().readByRef(ContainerRef.of(podRef, containerName)).copyTo(localFilePath, remoteTmpDir),
      ).to.be.true;

      // download the same file
      expect(
        await k8.containers().readByRef(ContainerRef.of(podRef, containerName)).copyFrom(remoteFilePath, localTmpDir),
      ).to.be.true;
      const downloadedFilePath = path.join(localTmpDir, fileName);
      const downloadedFileData = fs.readFileSync(downloadedFilePath);
      const downloadedFileHash = crypto.createHash('sha384').update(downloadedFileData).digest('hex');
      const downloadedStat = fs.statSync(downloadedFilePath);

      expect(downloadedStat.size, 'downloaded file size should match original file size').to.equal(originalStat.size);
      expect(downloadedFileHash, 'downloaded file hash should match original file hash').to.equal(originalFileHash);

      // rm file inside the container
      await k8
        .containers()
        .readByRef(ContainerRef.of(podRef, containerName))
        .execContainer(['rm', '-f', remoteFilePath]);

      fs.rmdirSync(localTmpDir, {recursive: true});
    }).timeout(defaultTimeout);
  });

  it('should be able to port forward gossip port', done => {
    const podName = Templates.renderNetworkPodName('node1');
    const localPort = +constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT;
    try {
      const podRef: PodRef = PodRef.of(testNamespace, podName);
      k8.pods()
        .readByRef(podRef)
        .portForward(localPort, +constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT)
        .then(server => {
          expect(server).not.to.be.null;

          // client
          const s = new net.Socket();
          s.on('ready', async () => {
            s.destroy();
            await k8.pods().readByRef(podRef).stopPortForward(server);
            done();
          });

          s.on('error', async e => {
            s.destroy();
            await k8.pods().readByRef(podRef).stopPortForward(server);
            done(new SoloError(`could not connect to local port '${localPort}': ${e.message}`, e));
          });

          s.connect(localPort);
        });
    } catch (e) {
      testLogger.showUserError(e);
      expect.fail();
    }
    // TODO enhance this test to do something with the port, this pod isn't even running, but it is still passing
  }).timeout(defaultTimeout);

  it('should be able to cat a file inside the container', async () => {
    const pods = await k8.pods().list(testNamespace, [`app=${podLabelValue}`]);
    const podName = PodName.of(pods[0].metadata.name);
    const output = await k8
      .containers()
      .readByRef(ContainerRef.of(PodRef.of(testNamespace, podName), containerName))
      .execContainer(['cat', '/etc/hostname']);
    expect(output.indexOf(podName.name)).to.equal(0);
  }).timeout(defaultTimeout);

  it('should be able to list persistent volume claims', async () => {
    const pvcRef: PodRef = PodRef.of(testNamespace, PodName.of(`test-pvc-${uuid4()}`));
    try {
      await k8.pvcs().create(pvcRef, {storage: '50Mi'}, ['ReadWriteOnce']);
      const pvcs: string[] = await k8.pvcs().list(testNamespace, undefined);
      expect(pvcs).to.have.length.greaterThan(0);
    } catch (e) {
      console.error(e);
      throw e;
    } finally {
      await k8.pvcs().delete(pvcRef);
    }
  }).timeout(defaultTimeout);

  it('should be able to kill a pod', async () => {
    const podName = PodName.of(`test-pod-${uuid4()}`);
    const podRef = PodRef.of(testNamespace, podName);
    const podLabelValue = `test-${uuid4()}`;
    await createPod(podRef, containerName, podLabelValue, k8);
    await k8.pods().readByRef(podRef).killPod();
    const newPods = await k8.pods().list(testNamespace, [`app=${podLabelValue}`]);
    expect(newPods).to.have.lengthOf(0);
  });
});
