// SPDX-License-Identifier: Apache-2.0

export enum SoloEventType {
  NetworkDeployed = 'NetworkDeployed',
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

export class MirrorNodeDeployedEvent extends SoloEvent {
  public constructor(public readonly deployment: string) {
    super(SoloEventType.MirrorNodeDeployed);
  }
}

export type AnySoloEvent = NetworkDeployedEvent | MirrorNodeDeployedEvent;
