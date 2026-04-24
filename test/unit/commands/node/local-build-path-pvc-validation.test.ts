// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';

function createNodeCommandTasksWithPvcData(
  persistentVolumeClaimsByContext: Record<string, string[]>,
): NodeCommandTasks {
  const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;

  (nodeCommandTasks as unknown as {k8Factory: unknown}).k8Factory = {
    getK8: (context: string): {pvcs: () => {list: () => Promise<string[]>}} => ({
      pvcs: (): {list: () => Promise<string[]>} => ({
        list: async (): Promise<string[]> => persistentVolumeClaimsByContext[context] ?? [],
      }),
    }),
  };

  return nodeCommandTasks;
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
  it('throws when local build path is used without node PVCs', async (): Promise<void> => {
    const nodeCommandTasks: NodeCommandTasks = createNodeCommandTasksWithPvcData({
      'kind-solo': [],
    });

    await expect(invokeValidateNodePvcsForLocalBuildPath(nodeCommandTasks, ['kind-solo'])).to.be.rejectedWith(
      'Redeploy the consensus network with --pvcs true',
    );
  });

  it('passes when node PVCs exist for each context', async (): Promise<void> => {
    const nodeCommandTasks: NodeCommandTasks = createNodeCommandTasksWithPvcData({
      'kind-alpha': ['data-node1'],
      'kind-beta': ['data-node2'],
    });

    await expect(invokeValidateNodePvcsForLocalBuildPath(nodeCommandTasks, ['kind-alpha', 'kind-beta'])).to.eventually
      .be.fulfilled;
  });
});
