// SPDX-License-Identifier: Apache-2.0

import * as constants from '../../../core/constants.js';
import {type CacheTargetProvider} from './cache-target-provider.js';
import {type CacheTargetStructure} from '../models/cache-target-structure.js';
import {CacheTarget} from '../models/impl/cache-target.js';
import {CacheArtifactEnum} from '../enums/cache-artifact-enum.js';
import {SoloError} from '../../../core/errors/solo-error.js';

export class KindNodeImageTargetProvider implements CacheTargetProvider {
  public async getRequiredTargets(): Promise<readonly CacheTargetStructure[]> {
    const {name, version} = this.parseImageReference(constants.KIND_NODE_IMAGE);

    return [new CacheTarget(CacheArtifactEnum.IMAGE, name, version, undefined)];
  }

  private parseImageReference(image: string): {name: string; version: string} {
    const tagSeparatorIndex: number = image.indexOf(':');

    if (tagSeparatorIndex === -1) {
      throw new SoloError(`Invalid kind node image reference: ${image}`);
    }

    return {
      name: image.slice(0, tagSeparatorIndex),
      version: image.slice(tagSeparatorIndex + 1),
    };
  }
}
