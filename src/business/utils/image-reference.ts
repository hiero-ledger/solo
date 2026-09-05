// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../core/errors/solo-errors.js';
import {type ParsedImageReference} from './parsed-image-reference.js';

export {type ParsedImageReference} from './parsed-image-reference.js';

export class ImageReference {
  private static readonly IMAGE_TAG_REGEX: RegExp = /^[\w][\w.-]{0,127}$/;

  public static validateImageTag(tag: string, originalValue: string): string {
    if (!tag || !ImageReference.IMAGE_TAG_REGEX.test(tag)) {
      throw new SoloErrors.validation.illegalArgument(`Invalid image tag: ${originalValue}`, originalValue);
    }
    return tag;
  }

  public static parseImageReference(imageReference: string): ParsedImageReference {
    const trimmedImageReference: string = imageReference.trim();
    if (!trimmedImageReference) {
      throw new SoloErrors.validation.illegalArgument(
        `Invalid image reference format: ${imageReference}`,
        imageReference,
      );
    }

    if (
      !trimmedImageReference.includes('/') &&
      !trimmedImageReference.includes(':') &&
      !trimmedImageReference.includes('@')
    ) {
      throw new SoloErrors.validation.illegalArgument(
        `Invalid image reference format: ${imageReference}`,
        imageReference,
      );
    }

    if (trimmedImageReference.includes('@')) {
      throw new SoloErrors.validation.illegalArgument(
        `Digest-based image references are not supported: ${imageReference}`,
        imageReference,
      );
    }

    const lastSlash: number = trimmedImageReference.lastIndexOf('/');
    const lastColon: number = trimmedImageReference.lastIndexOf(':');
    const hasTag: boolean = lastColon > lastSlash;
    const tag: string = ImageReference.validateImageTag(
      hasTag ? trimmedImageReference.slice(lastColon + 1) : 'latest',
      imageReference,
    );
    const imageWithoutTag: string = hasTag ? trimmedImageReference.slice(0, lastColon) : trimmedImageReference;

    const imageParts: string[] = imageWithoutTag.split('/');
    const potentialRegistry: string = imageParts[0];
    const explicitRegistry: boolean =
      potentialRegistry.includes('.') || potentialRegistry.includes(':') || potentialRegistry === 'localhost';

    const registry: string = explicitRegistry ? potentialRegistry : 'docker.io';
    let repository: string;
    if (explicitRegistry) {
      repository = imageParts.slice(1).join('/');
    } else if (imageParts.length === 1) {
      repository = `library/${imageParts[0]}`;
    } else {
      repository = imageWithoutTag;
    }

    if (!repository) {
      throw new SoloErrors.validation.illegalArgument(
        `Image repository cannot be empty: ${imageReference}`,
        imageReference,
      );
    }

    return {registry, repository, tag};
  }

  /**
   * Derives a module-specific {@link ParsedImageReference} by appending {@code -suffix} to the
   * last path segment of the repository.
   *
   * @example
   * // {registry: 'docker.io', repository: 'library/hedera-mirror', tag: '0.156.0'}
   * // + suffix 'rest-java'
   * // → {registry: 'docker.io', repository: 'library/hedera-mirror-rest-java', tag: '0.156.0'}
   */
  public static deriveModuleParsedReference(
    parsedReference: ParsedImageReference,
    imageSuffix: string,
  ): ParsedImageReference {
    return {
      registry: parsedReference.registry,
      repository: `${parsedReference.repository}-${imageSuffix}`,
      tag: parsedReference.tag,
    };
  }

  /**
   * Derives a module-specific image reference string by appending {@code -suffix} to the image
   * name portion (the last path segment before the tag).
   *
   * @example
   * // 'hedera-mirror:0.156.0' + 'rest-java' → 'hedera-mirror-rest-java:0.156.0'
   * // 'myprefix/hedera-mirror:0.156.0' + 'grpc' → 'myprefix/hedera-mirror-grpc:0.156.0'
   */
  public static deriveModuleImageReference(baseImageReference: string, imageSuffix: string): string {
    const trimmed: string = baseImageReference.trim();
    const lastColon: number = trimmed.lastIndexOf(':');
    const lastSlash: number = trimmed.lastIndexOf('/');
    const hasTag: boolean = lastColon > lastSlash && lastColon !== -1;

    if (hasTag) {
      const beforeTag: string = trimmed.slice(0, lastColon);
      const tag: string = trimmed.slice(lastColon + 1);
      return `${beforeTag}-${imageSuffix}:${tag}`;
    }

    return `${trimmed}-${imageSuffix}`;
  }
}
