// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';
import sinon from 'sinon';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import * as constants from '../../../../src/core/constants.js';

function createNodeCommandTasksWithPvcData(persistentVolumeClaimsByContext: Record<string, string[]>): {
  tasks: NodeCommandTasks;
  showUserMessages: string[];
} {
  const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
  const showUserMessages: string[] = [];

  (nodeCommandTasks as unknown as {k8Factory: unknown}).k8Factory = {
    getK8: (context: string): {pvcs: () => {list: () => Promise<string[]>}} => ({
      pvcs: (): {list: () => Promise<string[]>} => ({
        list: async (): Promise<string[]> => persistentVolumeClaimsByContext[context] ?? [],
      }),
    }),
  };

  (nodeCommandTasks as unknown as {logger: unknown}).logger = {
    showUser: (message: string): void => {
      showUserMessages.push(message);
    },
  };

  return {tasks: nodeCommandTasks, showUserMessages};
}

function invokeValidateNodePvcsForLocalBuildPath(
  nodeCommandTasks: NodeCommandTasks,
  contexts: string[],
): Promise<void> {
  const validatorFunction: (namespace: NamespaceName, contexts: string[]) => Promise<void> = (
    nodeCommandTasks as unknown as Record<string, (namespace: NamespaceName, contexts: string[]) => Promise<void>>
  ).validateNodePvcsForLocalBuildPath;

  return validatorFunction.call(nodeCommandTasks, NamespaceName.of('solo'), contexts);
}

describe('NodeCommandTasks local build path PVC validation', (): void => {
  it('warns when local build path is used without node PVCs', async (): Promise<void> => {
    const {tasks, showUserMessages} = createNodeCommandTasksWithPvcData({
      'kind-solo': [],
    });

    await expect(invokeValidateNodePvcsForLocalBuildPath(tasks, ['kind-solo'])).to.eventually.be.fulfilled;
    expect(showUserMessages).to.have.length(1);
    expect(showUserMessages[0]).to.include('--pvcs true');
  });

  it('passes when node PVCs exist for each context', async (): Promise<void> => {
    const {tasks} = createNodeCommandTasksWithPvcData({
      'kind-alpha': ['data-node1'],
      'kind-beta': ['data-node2'],
    });

    await expect(invokeValidateNodePvcsForLocalBuildPath(tasks, ['kind-alpha', 'kind-beta'])).to.eventually.be
      .fulfilled;
  });
});

describe('NodeCommandTasks platform software fetch routing', (): void => {
  it('uploads local build software when upgrade version is empty', async (): Promise<void> => {
    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
    const uploadResult: object = {};
    const validateNodePvcsStub: sinon.SinonStub = sinon
      .stub(nodeCommandTasks as unknown as Record<string, unknown>, 'validateNodePvcsForLocalBuildPath')
      .resolves();
    const uploadPlatformSoftwareStub: sinon.SinonStub = sinon
      .stub(nodeCommandTasks as unknown as Record<string, unknown>, '_uploadPlatformSoftware')
      .returns(uploadResult);

    try {
      const fetchPlatformSoftwareTask = nodeCommandTasks.fetchPlatformSoftware('nodeAliases');
      const result: unknown = await fetchPlatformSoftwareTask.task(
        {
          config: {
            consensusNodes: [{name: 'node1', context: 'kind-solo'}],
            localBuildPath: '/tmp/local-build/data',
            namespace: NamespaceName.of('solo'),
            nodeAliases: ['node1'],
            podRefs: {},
            releaseTag: 'v0.74.0',
            stagingDir: '/tmp/staging',
            upgradeVersion: '',
          },
        } as never,
        {} as never,
      );

      expect(result).to.equal(uploadResult);
      expect(validateNodePvcsStub.calledOnceWith(NamespaceName.of('solo'), ['kind-solo'])).to.equal(true);
      expect(uploadPlatformSoftwareStub.calledOnce).to.equal(true);
    } finally {
      sinon.restore();
    }
  });
});

describe('NodeCommandTasks gossipFqdnRestricted resolution', (): void => {
  const configMapFalseData: {data: Record<string, string>} = {
    data: {[constants.APPLICATION_PROPERTIES]: 'nodes.gossipFqdnRestricted=false\n'},
  };
  const emptyConfigMapData: {data: Record<string, string>} = {data: {}};

  function invokeParseGossipFqdnRestricted(
    nodeCommandTasks: NodeCommandTasks,
    applicationPropertiesText: string,
  ): boolean | undefined {
    const parserFunction: (text: string) => boolean | undefined = (
      nodeCommandTasks as unknown as Record<string, (text: string) => boolean | undefined>
    ).parseGossipFqdnRestricted;
    return parserFunction.call(nodeCommandTasks, applicationPropertiesText);
  }

  function invokeGetGossipFqdnRestricted(
    nodeCommandTasks: NodeCommandTasks,
    config: {namespace: NamespaceName; stagingDir: string},
    k8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>} | never>}},
  ): Promise<boolean> {
    const getterFunction: (
      config: {namespace: NamespaceName; stagingDir: string},
      k8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>} | never>}},
    ) => Promise<boolean> = (
      nodeCommandTasks as unknown as Record<
        string,
        (
          config: {namespace: NamespaceName; stagingDir: string},
          k8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>} | never>}},
        ) => Promise<boolean>
      >
    ).getGossipFqdnRestricted;
    return getterFunction.call(nodeCommandTasks, config, k8);
  }

  it('parses true/false values with surrounding whitespace', (): void => {
    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;

    expect(invokeParseGossipFqdnRestricted(nodeCommandTasks, 'nodes.gossipFqdnRestricted=true')).to.equal(true);
    expect(invokeParseGossipFqdnRestricted(nodeCommandTasks, ' nodes.gossipFqdnRestricted = false ')).to.equal(false);
  });

  it('prefers ConfigMap value over staged application.properties', async (): Promise<void> => {
    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
    const stagingDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'gossip-fqdn-configmap-'));
    const templatesDirectory: string = path.join(stagingDirectory, 'templates');
    fs.mkdirSync(templatesDirectory, {recursive: true});
    fs.writeFileSync(
      path.join(templatesDirectory, constants.APPLICATION_PROPERTIES),
      'nodes.gossipFqdnRestricted=true\n',
    );

    const k8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>} | never>}} = {
      configMaps: (): {read: () => Promise<{data?: Record<string, string>} | never>} => ({
        read: async (): Promise<{data?: Record<string, string>}> => configMapFalseData,
      }),
    };
    const config: {namespace: NamespaceName; stagingDir: string} = {
      namespace: NamespaceName.of('solo'),
      stagingDir: stagingDirectory,
    };

    try {
      expect(await invokeGetGossipFqdnRestricted(nodeCommandTasks, config, k8)).to.equal(false);
    } finally {
      fs.rmSync(stagingDirectory, {recursive: true, force: true});
    }
  });

  it('falls back to staged application.properties when ConfigMap is unavailable', async (): Promise<void> => {
    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
    const stagingDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'gossip-fqdn-staged-'));
    const templatesDirectory: string = path.join(stagingDirectory, 'templates');
    fs.mkdirSync(templatesDirectory, {recursive: true});
    fs.writeFileSync(
      path.join(templatesDirectory, constants.APPLICATION_PROPERTIES),
      'nodes.gossipFqdnRestricted=false\n',
    );

    const k8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>} | never>}} = {
      configMaps: (): {read: () => Promise<{data?: Record<string, string>} | never>} => ({
        read: async (): Promise<never> => {
          throw new Error('config map missing');
        },
      }),
    };
    const config: {namespace: NamespaceName; stagingDir: string} = {
      namespace: NamespaceName.of('solo'),
      stagingDir: stagingDirectory,
    };

    try {
      expect(await invokeGetGossipFqdnRestricted(nodeCommandTasks, config, k8)).to.equal(false);
    } finally {
      fs.rmSync(stagingDirectory, {recursive: true, force: true});
    }
  });

  it('defaults to true when neither ConfigMap nor staged file provides a value', async (): Promise<void> => {
    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
    const stagingDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'gossip-fqdn-default-'));
    const k8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>} | never>}} = {
      configMaps: (): {read: () => Promise<{data?: Record<string, string>} | never>} => ({
        read: async (): Promise<{data?: Record<string, string>}> => emptyConfigMapData,
      }),
    };
    const config: {namespace: NamespaceName; stagingDir: string} = {
      namespace: NamespaceName.of('solo'),
      stagingDir: stagingDirectory,
    };

    const existsSyncStub: sinon.SinonStub = sinon.stub(fs, 'existsSync').returns(false);
    try {
      expect(await invokeGetGossipFqdnRestricted(nodeCommandTasks, config, k8)).to.equal(true);
      expect(existsSyncStub.calledOnce).to.equal(true);
    } finally {
      sinon.restore();
      fs.rmSync(stagingDirectory, {recursive: true, force: true});
    }
  });
});
