// SPDX-License-Identifier: Apache-2.0

import {IllegalArgumentError} from '../../core/errors/illegal-argument-error.js';

export interface ParsedImageReference {
  registry: string;
  repository: string;
  tag: string;
}

export class ImageReference {
  private static readonly IMAGE_TAG_REGEX: RegExp = /^[\w][\w.-]{0,127}$/;

  public static validateImageTag(tag: string, originalValue: string): string {
    if (!tag || !ImageReference.IMAGE_TAG_REGEX.test(tag)) {
      throw new IllegalArgumentError(`Invalid image tag: ${originalValue}`, originalValue);
    }
    return tag;
  }

  public static parseImageReference(imageReference: string): ParsedImageReference {
    const trimmedImageReference: string = imageReference.trim();
    if (!trimmedImageReference) {
      throw new IllegalArgumentError(`Invalid image reference format: ${imageReference}`, imageReference);
    }

    if (
      !trimmedImageReference.includes('/') &&
      !trimmedImageReference.includes(':') &&
      !trimmedImageReference.includes('@')
    ) {
      throw new IllegalArgumentError(`Invalid image reference format: ${imageReference}`, imageReference);
    }

    if (trimmedImageReference.includes('@')) {
      throw new IllegalArgumentError(
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
      throw new IllegalArgumentError(`Image repository cannot be empty: ${imageReference}`, imageReference);
    }

    return {registry, repository, tag};
  }
}
