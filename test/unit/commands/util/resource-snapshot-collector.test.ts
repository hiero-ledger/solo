// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sinon, {type SinonStub} from 'sinon';

import {ResourceSnapshotCollector} from '../../../../src/commands/util/resource-snapshot-collector.js';
import {type PodResourceRow} from '../../../../src/commands/util/pod-resource-row.js';
import {ShellRunner} from '../../../../src/core/shell-runner.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';

function makeRow(podName: string, overrides: Partial<PodResourceRow> = {}): PodResourceRow {
  return {
    context: 'kind-solo',
    podReference: PodReference.of(NamespaceName.of('solo'), PodName.of(podName)),
    namespace: 'solo',
    podName,
    phase: 'Running',
    cpuInMillicores: 10,
    memoryInMebibytes: 100,
    restartCount: 0,
    stateNotes: [],
    ...overrides,
  };
}

describe('ResourceSnapshotCollector', (): void => {
  describe('buildUsageReport', (): void => {
    it('sorts pods by CPU descending with pods lacking metrics last', (): void => {
      const report: string = ResourceSnapshotCollector.buildUsageReport([
        makeRow('idle', {cpuInMillicores: 5}),
        makeRow('no-metrics', {cpuInMillicores: undefined, memoryInMebibytes: undefined}),
        makeRow('hot', {cpuInMillicores: 4000}),
      ]);

      const lines: string[] = report.trim().split('\n');
      expect(lines[1]).to.contain('hot');
      expect(lines[2]).to.contain('idle');
      expect(lines[3]).to.contain('no-metrics');
      expect(lines[3]).to.contain('n/a');
    });

    it('includes restart counts and container state notes', (): void => {
      const report: string = ResourceSnapshotCollector.buildUsageReport([
        makeRow('crashy', {restartCount: 7, stateNotes: ['root-container: OOMKilled (exit 137)']}),
      ]);

      expect(report).to.contain('\t7\t');
      expect(report).to.contain('OOMKilled (exit 137)');
    });
  });

  describe('isSuspect', (): void => {
    it('flags restarted pods and pods with abnormal container state only', (): void => {
      expect(ResourceSnapshotCollector.isSuspect(makeRow('ok'))).to.equal(false);
      expect(ResourceSnapshotCollector.isSuspect(makeRow('restarted', {restartCount: 1}))).to.equal(true);
      expect(
        ResourceSnapshotCollector.isSuspect(makeRow('waiting', {stateNotes: ['c: waiting CrashLoopBackOff']})),
      ).to.equal(true);
    });
  });

  describe('computeClockDriftSeconds', (): void => {
    it('reports a VM clock that is ahead of the host as positive drift', (): void => {
      // host midpoint is 1000s, VM reports 1600s
      expect(ResourceSnapshotCollector.computeClockDriftSeconds('1600\n', 999_000, 1_001_000)).to.equal(600);
    });

    it('reports a VM clock that is behind the host as negative drift', (): void => {
      expect(ResourceSnapshotCollector.computeClockDriftSeconds('400', 999_000, 1_001_000)).to.equal(-600);
    });

    it('returns undefined when the output is not an epoch', (): void => {
      expect(ResourceSnapshotCollector.computeClockDriftSeconds('not a number', 0, 0)).to.equal(undefined);
    });
  });

  describe('mergeWrappedLines', (): void => {
    it('rejoins a table row that was split across two lines', (): void => {
      expect(
        ResourceSnapshotCollector.mergeWrappedLines([
          'TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE',
          'Containers',
          '      1         1         3.428MB   0B (0%)',
          'Local Volumes   1         1         7.764GB   0B (0%)',
        ]),
      ).to.deep.equal([
        'TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE',
        'Containers      1         1         3.428MB   0B (0%)',
        'Local Volumes   1         1         7.764GB   0B (0%)',
      ]);
    });
  });

  describe('summarize', (): void => {
    let snapshotDirectory: string;

    beforeEach((): void => {
      snapshotDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-resource-summary-'));
    });

    afterEach((): void => {
      fs.rmSync(snapshotDirectory, {recursive: true, force: true});
    });

    it('returns nothing when there is no snapshot directory', (): void => {
      expect(ResourceSnapshotCollector.summarize(path.join(snapshotDirectory, 'missing'))).to.deep.equal([]);
    });

    it('summarizes docker CPU/memory/disk, clock drift and the top CPU pods', (): void => {
      fs.writeFileSync(
        path.join(snapshotDirectory, 'docker-stats.txt'),
        'NAME      CPU %     MEM USAGE / LIMIT    MEM %     NET I/O           BLOCK I/O         PIDS\n' +
          'kind-control-plane   93.90%    2.94GiB / 125.5GiB   2.34%     1.71GB / 58.5MB   8.19kB / 15.8GB   1259\n',
      );
      fs.writeFileSync(
        path.join(snapshotDirectory, 'docker-system-df.txt'),
        'TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE\n' +
          'Images          1         1         1.484GB   1.484GB (100%)\n' +
          'Local Volumes   1         1         6.588GB   0B (0%)\n',
      );
      fs.writeFileSync(
        path.join(snapshotDirectory, 'docker-vm-clock-drift.txt'),
        'kind-control-plane\tvm-clock-minus-host-seconds=-1\n',
      );
      fs.writeFileSync(
        path.join(snapshotDirectory, 'pod-resource-usage-kind-solo.txt'),
        'CONTEXT\tNAMESPACE\tPOD\tPHASE\tCPU(m)\tMEMORY(Mi)\tRESTARTS\tCONTAINER STATE NOTES\n' +
          'kind-solo\tsolo\tnetwork-node1-0\tRunning\t616\t588\t0\t-\n' +
          'kind-solo\tsolo\trelay-1\tRunning\t178\t82\t0\t-\n',
      );

      const summary: string = ResourceSnapshotCollector.summarize(snapshotDirectory).join('\n');

      expect(summary).to.contain('Resource usage snapshot:');
      expect(summary).to.contain('Docker kind-control-plane: CPU 93.90%, memory 2.94GiB / 125.5GiB (2.34%)');
      expect(summary).to.contain('Docker disk: Images 1.484GB, Local Volumes 6.588GB');
      expect(summary).to.contain('VM clock drift on kind-control-plane: -1s');
      expect(summary).to.contain('Top pod solo/network-node1-0: CPU 616m, memory 588Mi');
      expect(summary).to.not.contain('⚠');
    });

    it('summarizes a docker disk table whose row was split by the shell runner', (): void => {
      fs.writeFileSync(
        path.join(snapshotDirectory, 'docker-system-df.txt'),
        'TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE\n' +
          'Images          2         1         1.744GB   1.479GB (84%)\n' +
          'Containers\n' +
          '      1         1         3.428MB   0B (0%)\n' +
          'Local Volumes   1         1         7.764GB   0B (0%)\n',
      );

      expect(ResourceSnapshotCollector.summarize(snapshotDirectory).join('\n')).to.contain(
        'Docker disk: Images 1.744GB, Containers 3.428MB, Local Volumes 7.764GB',
      );
    });

    it('warns on saturated docker CPU, large clock drift and restarting pods', (): void => {
      fs.writeFileSync(
        path.join(snapshotDirectory, 'docker-stats.txt'),
        'NAME      CPU %     MEM USAGE / LIMIT    MEM %     NET I/O           BLOCK I/O         PIDS\n' +
          'kind-control-plane   550.00%    2GiB / 4GiB   50.00%     1GB / 1GB   1GB / 1GB   100\n',
      );
      fs.writeFileSync(
        path.join(snapshotDirectory, 'docker-vm-clock-drift.txt'),
        'kind-control-plane\tvm-clock-minus-host-seconds=600\n',
      );
      fs.writeFileSync(
        path.join(snapshotDirectory, 'pod-resource-usage-kind-solo.txt'),
        'CONTEXT\tNAMESPACE\tPOD\tPHASE\tCPU(m)\tMEMORY(Mi)\tRESTARTS\tCONTAINER STATE NOTES\n' +
          'kind-solo\tsolo\tcrashy\tRunning\t900\t10\t4\tc: OOMKilled (exit 137)\n',
      );

      const summary: string = ResourceSnapshotCollector.summarize(snapshotDirectory).join('\n');

      expect(summary).to.contain('⚠ Docker kind-control-plane: CPU 550.00%');
      expect(summary).to.contain('⚠ VM clock drift on kind-control-plane: 600s');
      expect(summary).to.contain('⚠ 1 pod(s) restarted');
    });
  });

  describe('collect', (): void => {
    let temporaryDirectory: string;
    let runStub: SinonStub;
    const logger: SoloLogger = {
      debug: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub(),
      showUser: sinon.stub(),
    } as unknown as SoloLogger;

    beforeEach((): void => {
      temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-resource-snapshot-'));
      runStub = sinon.stub(ShellRunner.prototype, 'run');
    });

    afterEach((): void => {
      runStub.restore();
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    });

    it('writes docker and cluster files and describes suspect pods', async (): Promise<void> => {
      runStub.callsFake(async (_command: string, arguments_: string[]): Promise<string[]> => {
        if (arguments_[0] === 'ps') {
          return ['solo-control-plane'];
        }
        if (arguments_[0] === 'exec') {
          return [String(Math.floor(Date.now() / 1000))];
        }
        return ['docker output'];
      });

      const pods: Record<string, unknown> = {
        topPods: sinon.stub().resolves([
          {
            namespace: NamespaceName.of('solo'),
            podName: PodName.of('hot'),
            cpuInMillicores: 4000,
            memoryInMebibytes: 512,
          },
        ]),
        listForAllNamespaces: sinon.stub().resolves([{podReference: makeRow('hot').podReference}]),
        read: sinon.stub().resolves({
          podReference: makeRow('hot').podReference,
          phase: 'Running',
          allContainerStatuses: [
            {name: 'root-container', restartCount: 3, terminatedReason: 'OOMKilled', terminatedExitCode: 137},
            {name: 'init-hedera', restartCount: 0, terminatedReason: 'Completed', terminatedExitCode: 0},
          ],
        }),
        readDescribe: sinon.stub().resolves('describe-yaml'),
      };
      const k8: Record<string, unknown> = {pods: (): unknown => pods};
      const k8Factory: K8Factory = {
        default: (): unknown => ({contexts: (): unknown => ({list: (): string[] => ['kind-solo']})}),
        getK8: (): unknown => k8,
      } as unknown as K8Factory;

      await ResourceSnapshotCollector.collect(k8Factory, logger, temporaryDirectory).task({}, {} as never);

      const snapshotDirectory: string = path.join(temporaryDirectory, ResourceSnapshotCollector.DIRECTORY_NAME);
      expect(fs.readFileSync(path.join(snapshotDirectory, 'docker-stats.txt'), 'utf8')).to.contain('docker output');
      expect(fs.readFileSync(path.join(snapshotDirectory, 'docker-vm-clock-drift.txt'), 'utf8')).to.contain(
        'solo-control-plane\tvm-clock-minus-host-seconds=',
      );
      const usage: string = fs.readFileSync(path.join(snapshotDirectory, 'pod-resource-usage-kind-solo.txt'), 'utf8');
      expect(usage).to.contain('4000');
      expect(usage).to.contain('OOMKilled (exit 137)');
      expect(usage).to.not.contain('init-hedera');
      expect(
        fs.readFileSync(path.join(snapshotDirectory, 'pod-describe', 'kind-solo', 'solo_hot.yaml'), 'utf8'),
      ).to.equal('describe-yaml');
    });

    it('omits pod describe reports when pod specs are excluded and never fails when docker is unavailable', async (): Promise<void> => {
      runStub.rejects(new Error('docker: command not found'));
      const pods: Record<string, unknown> = {
        topPods: sinon.stub().rejects(new Error('metrics API not available')),
        listForAllNamespaces: sinon.stub().resolves([]),
        readDescribe: sinon.stub().resolves('should not be written'),
      };
      const k8Factory: K8Factory = {
        default: (): unknown => ({contexts: (): unknown => ({list: (): string[] => ['kind-solo']})}),
        getK8: (): unknown => ({pods: (): unknown => pods}),
      } as unknown as K8Factory;

      await ResourceSnapshotCollector.collect(k8Factory, logger, temporaryDirectory, false, false).task(
        {},
        {} as never,
      );

      const snapshotDirectory: string = path.join(temporaryDirectory, ResourceSnapshotCollector.DIRECTORY_NAME);
      expect(fs.readFileSync(path.join(snapshotDirectory, 'docker-stats.txt'), 'utf8')).to.contain('# unavailable');
      expect(fs.existsSync(path.join(snapshotDirectory, 'pod-describe'))).to.equal(false);
    });
  });
});
