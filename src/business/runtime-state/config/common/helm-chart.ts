// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {HelmChartSchema} from '../../../../data/schema/model/common/helm-chart-schema.js';
import {NamespaceName} from '../../../../types/namespace/namespace-name.js';

export class HelmChart implements Facade<HelmChartSchema> {
  public constructor(public readonly encapsulatedObject: HelmChartSchema) {
    if (!encapsulatedObject) {
      this.encapsulatedObject = new HelmChartSchema();
    }
  }

  public get name(): string {
    return this.encapsulatedObject.name;
  }

  public set name(name: string) {
    this.encapsulatedObject.name = name;
  }

  public get namespace(): string {
    return this.encapsulatedObject.namespace;
  }

  public set namespace(namespace: string) {
    this.encapsulatedObject.namespace = namespace;
  }

  public get namespaceName(): NamespaceName {
    return NamespaceName.of(this.encapsulatedObject.namespace);
  }

  public get release(): string {
    return this.encapsulatedObject.release;
  }

  public set release(release: string) {
    this.encapsulatedObject.release = release;
  }

  public get repository(): string {
    if (this.encapsulatedObject.directory) {
      return this.encapsulatedObject.directory;
    }
    return this.encapsulatedObject.repository;
  }

  public set repository(repository: string) {
    this.encapsulatedObject.repository = repository;
  }

  public get directory(): string {
    return this.encapsulatedObject.directory;
  }

  public set directory(directory: string) {
    this.encapsulatedObject.directory = directory;
  }

  public get version(): string {
    return this.encapsulatedObject.version;
  }

  public set version(version: string) {
    this.encapsulatedObject.version = version;
  }

  public get labelSelector(): string {
    return this.encapsulatedObject.labelSelector;
  }

  public set labelSelector(labelSelector: string) {
    this.encapsulatedObject.labelSelector = labelSelector;
  }

  public get labels(): string[] {
    return this.encapsulatedObject.labelSelector?.split(',') ?? [];
  }

  public get containerName(): string {
    return this.encapsulatedObject.containerName;
  }

  public set containerName(containerName: string) {
    this.encapsulatedObject.containerName = containerName;
  }

  public get ingressClassName(): string {
    return this.encapsulatedObject.ingressClassName;
  }

  public set ingressClassName(ingressClassName: string) {
    this.encapsulatedObject.ingressClassName = ingressClassName;
  }

  public get ingressControllerName(): string {
    return this.encapsulatedObject.ingressControllerName;
  }

  public set ingressControllerName(ingressControllerName: string) {
    this.encapsulatedObject.ingressControllerName = ingressControllerName;
  }

  public get ingressControllerPrefix(): string {
    return this.encapsulatedObject.ingressControllerPrefix;
  }

  public set ingressControllerPrefix(ingressControllerPrefix: string) {
    this.encapsulatedObject.ingressControllerPrefix = ingressControllerPrefix;
  }
}
