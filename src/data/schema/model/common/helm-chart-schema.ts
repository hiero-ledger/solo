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
    if (name !== undefined) {
      this.name = name;
    }
    if (namespace !== undefined) {
      this.namespace = namespace;
    }
    if (release !== undefined) {
      this.release = release;
    }
    if (repository !== undefined) {
      this.repository = repository;
    }
    if (directory !== undefined) {
      this.directory = directory;
    }
    if (version !== undefined) {
      this.version = version;
    }
    if (labelSelector !== undefined) {
      this.labelSelector = labelSelector;
    }
    if (containerName !== undefined) {
      this.containerName = containerName;
    }
    if (ingressClassName !== undefined) {
      this.ingressClassName = ingressClassName;
    }
    if (ingressControllerName !== undefined) {
      this.ingressControllerName = ingressControllerName;
    }
    if (ingressControllerPrefix !== undefined) {
      this.ingressControllerPrefix = ingressControllerPrefix;
    }
  }
}
