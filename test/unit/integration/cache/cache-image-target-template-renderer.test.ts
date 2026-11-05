// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import fs from 'node:fs';
import os from 'node:os';
import {parse} from 'yaml';

import * as constants from '../../../../src/core/constants.js';
import * as version from '../../../../version.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {CacheImageTargetTemplateRenderer} from '../../../../src/integration/cache/impl/cache-image-target-template-renderer.js';
import {DefaultCacheImageTemplateResolver} from '../../../../src/integration/cache/impl/default-cache-image-template-resolver.js';
import {CacheImageTemplateValues} from '../../../../src/integration/cache/models/impl/cache-image-template-values.js';

interface RenderedImage {
  name: string;
  version: string;
}

describe('CacheImageTargetTemplateRenderer', (): void => {
  let outputDirectory: string;

  beforeEach((): void => {
    outputDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-cache-image-target-'));
  });

  afterEach((): void => {
    fs.rmSync(outputDirectory, {force: true, recursive: true});
  });

  it('pins the shared PostgreSQL image to the digest Solo deploys', async (): Promise<void> => {
    const renderer: CacheImageTargetTemplateRenderer = new CacheImageTargetTemplateRenderer(
      new DefaultCacheImageTemplateResolver(
        new CacheImageTemplateValues(
          version.MIRROR_NODE_VERSION,
          version.BLOCK_NODE_VERSION,
          version.HEDERA_JSON_RPC_RELAY_VERSION,
          version.EXPLORER_VERSION,
          version.MINIO_OPERATOR_VERSION,
          version.MINIO_IMAGE_DIGEST,
          version.POSTGRES_IMAGE_DIGEST,
          version.SOLO_CHEETAH_VERSION,
          version.SOLO_CONTAINERS_VERSION,
        ),
      ),
    );

    const renderedFilePath: string = await renderer.renderToFile(
      constants.SOLO_CACHE_IMAGES_TARGET_FILE,
      outputDirectory,
    );
    const images: RenderedImage[] = (parse(fs.readFileSync(renderedFilePath, 'utf8')) as {images: RenderedImage[]})
      .images;
    const postgresImages: string[] = images
      .filter((image: RenderedImage): boolean => image.name.startsWith('docker.io/bitnami/postgresql'))
      .map((image: RenderedImage): string => `${image.name}:${image.version}`);

    expect(postgresImages).to.deep.equal([
      `${constants.POSTGRES_IMAGE_REGISTRY}/${constants.POSTGRES_IMAGE_REPOSITORY}@sha256:${version.POSTGRES_IMAGE_DIGEST}`,
    ]);
  });
});
