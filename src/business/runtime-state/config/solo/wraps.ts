// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {type WrapsSchema} from '../../../../data/schema/model/solo/wraps-schema.js';

export class Wraps implements Facade<WrapsSchema> {
  public constructor(public readonly encapsulatedObject: WrapsSchema) {}

  public get artifactsFolderName(): string {
    return this.encapsulatedObject.artifactsFolderName;
  }

  public get directoryName(): string {
    return this.encapsulatedObject.directoryName;
  }

  public get allowedKeyFiles(): string {
    return this.encapsulatedObject.allowedKeyFiles;
  }

  public get libraryDownloadUrl(): string {
    return this.encapsulatedObject.libraryDownloadUrl;
  }

  /** Parses allowedKeyFiles into a Set for O(1) membership checks. */
  public get allowedKeyFileSet(): Set<string> {
    return new Set(this.encapsulatedObject.allowedKeyFiles.split(',').filter(Boolean));
  }
}
