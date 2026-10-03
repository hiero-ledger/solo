// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../core/errors/solo-errors.js';
import {type MirrorNodeModuleImageReference} from './mirror-node-module-image-reference.js';

/**
 * Mirror Node's build publishes six distinct images (`hedera-mirror-importer`, `-grpc`, `-rest`,
 * `-rest-java`, `-web3`, `-monitor`). `--component-image` for Mirror Node is treated as a repository
 * prefix (e.g. `ghcr.io/hiero-ledger/hedera-mirror:0.157.0-abc1234`) and expanded into the six module
 * images, preserving the `rest-java` (image suffix) to `restjava` (Helm chart key) mapping already
 * used by the legacy-image fallback in `MirrorNodeCommand`.
 */
export class MirrorNodeModuleImages {
  private static readonly MODULES: {chartKey: string; dockerSuffix: string}[] = [
    {chartKey: 'importer', dockerSuffix: 'importer'},
    {chartKey: 'grpc', dockerSuffix: 'grpc'},
    {chartKey: 'rest', dockerSuffix: 'rest'},
    {chartKey: 'restjava', dockerSuffix: 'rest-java'},
    {chartKey: 'web3', dockerSuffix: 'web3'},
    {chartKey: 'monitor', dockerSuffix: 'monitor'},
  ];

  /**
   * Expands a Mirror Node `--component-image` repository prefix into the six per-module image
   * references, inserting `-<module>` before the tag. Splitting on the last `:` is safe even for a
   * Kind-attached local registry reference (e.g. `localhost:5001/hedera-mirror:tag`), since the
   * port's colon always precedes the final `/` and the tag's colon is always the last one.
   */
  public static expand(componentImage: string): MirrorNodeModuleImageReference[] {
    const lastColonIndex: number = componentImage.lastIndexOf(':');
    if (lastColonIndex === -1) {
      throw new SoloErrors.validation.illegalArgument(
        `Mirror Node image reference must include a tag (e.g. hedera-mirror:tag): '${componentImage}'`,
        componentImage,
      );
    }

    const repositoryPrefix: string = componentImage.slice(0, lastColonIndex);
    const tag: string = componentImage.slice(lastColonIndex + 1);

    return MirrorNodeModuleImages.MODULES.map(({chartKey, dockerSuffix}): MirrorNodeModuleImageReference => ({
      chartKey,
      imageReference: `${repositoryPrefix}-${dockerSuffix}:${tag}`,
    }));
  }
}
