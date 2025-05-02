// SPDX-License-Identifier: Apache-2.0

import {DeploymentPhase} from '../../../../data/schema/model/remote/deployment-phase.js';
import {SoloError} from '../../../errors/solo-error.js';
import {isValidEnum} from '../../../util/validation-helpers.js';
import {type ComponentMetadataStruct} from './interfaces/component-metadata-struct.js';
import {type ClusterReference, type ComponentId, type NamespaceNameAsString} from '../types.js';
import {type ToObject, type Validate} from '../../../../types/index.js';

export class ComponentMetadata implements ComponentMetadataStruct, Validate, ToObject<ComponentMetadataStruct> {
  /**
   * @param id - the id to distinguish components.
   * @param cluster - the cluster in which the component is deployed.
   * @param namespace - the namespace associated with the component.
   * @param phase - the phase of the component
   */
  public constructor(
    public readonly id: ComponentId,
    public readonly cluster: ClusterReference,
    public readonly namespace: NamespaceNameAsString,
    public phase: DeploymentPhase,
  ) {}

  public validate(): void {
    if (typeof this.id !== 'number' || this.id < 0) {
      throw new SoloError(`Invalid id: ${this.id}`);
    }

    if (!this.cluster || typeof this.cluster !== 'string') {
      throw new SoloError(`Invalid cluster: ${this.cluster}`);
    }

    if (!this.namespace || typeof this.namespace !== 'string') {
      throw new SoloError(
        `Invalid namespace: ${this.namespace}, is typeof 'string': ${typeof this.namespace !== 'string'}`,
      );
    }

    if (!isValidEnum(this.phase, DeploymentPhase)) {
      throw new SoloError(`Invalid component type: ${this.phase}`);
    }
  }

  public toObject(): ComponentMetadataStruct {
    return {
      id: this.id,
      cluster: this.cluster,
      namespace: this.namespace,
      phase: this.phase,
    };
  }

  public static compare(x: ComponentMetadata, y: ComponentMetadata): boolean {
    return x.id === y.id && x.cluster === y.cluster && x.namespace === y.namespace && x.phase === y.phase;
  }

  public static fromObject(metadata: ComponentMetadataStruct): ComponentMetadata {
    return new ComponentMetadata(metadata.id, metadata.cluster, metadata.namespace, metadata.phase);
  }
}
