// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';

@Exclude()
export class HelmChartSchema {
  @Expose()
  public name: string = '';

  @Expose()
  public namespace: string = '';

  @Expose()
  public release: string = '';

  @Expose()
  public repository: string = '';

  @Expose()
  public directory: string = '';

  @Expose()
  public version: string = '';

  @Expose()
  public labelSelector: string = '';

  @Expose()
  public containerName: string = '';

  @Expose()
  public ingressClassName: string = '';

  @Expose()
  public ingressControllerName: string = '';

  @Expose()
  public ingressControllerPrefix: string = '';

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
    this.name ||= name;
    this.namespace ||= namespace;
    this.release ||= release;
    this.repository ||= repository;
    this.directory ||= directory;
    this.version ||= version;
    this.labelSelector ||= labelSelector;
    this.containerName ||= containerName;
    this.ingressClassName ||= ingressClassName;
    this.ingressControllerName ||= ingressControllerName;
    this.ingressControllerPrefix ||= ingressControllerPrefix;
  }
}
