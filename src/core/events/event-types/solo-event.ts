// SPDX-License-Identifier: Apache-2.0

export enum SoloEventType {
  NetworkDeployed = 'NetworkDeployed',
  NodesStarted = 'NodesStarted',
  MirrorNodeDeployed = 'MirrorNodeDeployed',
}

export abstract class SoloEvent {
  protected constructor(public readonly type: SoloEventType) {}
}
