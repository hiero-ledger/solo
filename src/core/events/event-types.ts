// SPDX-License-Identifier: Apache-2.0

export enum SoloEventType {
  NetworkDeployed = 'NetworkDeployed',
  NodesStarted = 'NodesStarted',
  MirrorNodeDeployed = 'MirrorNodeDeployed',
}

export abstract class SoloEvent {
  public constructor(public readonly type: SoloEventType) {}
}

export class NetworkDeployedEvent extends SoloEvent {
  public constructor(public readonly deployment: string) {
    super(SoloEventType.NetworkDeployed);
  }
}

export class NodesStartedEvent extends SoloEvent {
  public constructor(public readonly deployment: string) {
    super(SoloEventType.NodesStarted);
  }
}

export class MirrorNodeDeployedEvent extends SoloEvent {
  public constructor(public readonly deployment: string) {
    super(SoloEventType.MirrorNodeDeployed);
  }
}

export type AnySoloEvent = NetworkDeployedEvent | MirrorNodeDeployedEvent;
