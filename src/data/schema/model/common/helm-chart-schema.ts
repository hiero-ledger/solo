// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';

@Exclude()
export class HelmChartSchema {
  @Expose()
  public name: string | undefined;

  @Expose()
  public namespace: string | undefined;

  @Expose()
  public release: string | undefined;

  @Expose()
  public repository: string | undefined;

  @Expose()
  public directory: string | undefined;

  @Expose()
  public version: string | undefined;

  @Expose()
  public labelSelector: string | undefined;

  @Expose()
  public containerName: string | undefined;

  @Expose()
  public ingressClassName: string | undefined;

  @Expose()
  public ingressControllerName: string | undefined;

  @Expose()
  public ingressControllerPrefix: string | undefined;

  public constructor(
    name?: string,
    namespace?: string,
    release?: string,
    repository?: string,
    directory?: string,
    version?: string,
    labelSelector?: string,
    containerName?: string,
    ingressClassName?: string,
    ingressControllerName?: string,
    ingressControllerPrefix?: string,
  ) {
    this.name = name ?? undefined;
    this.namespace = namespace ?? undefined;
    this.release = release ?? undefined;
    this.repository = repository ?? undefined;
    this.directory = directory ?? undefined;
    this.version = version ?? undefined;
    this.labelSelector = labelSelector ?? undefined;
    this.containerName = containerName ?? undefined;
    this.ingressClassName = ingressClassName ?? undefined;
    this.ingressControllerName = ingressControllerName ?? undefined;
    this.ingressControllerPrefix = ingressControllerPrefix ?? undefined;
  }
}
