// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {MirrorNodeModuleImages} from '../../../src/commands/mirror-node-module-images.js';
import {type MirrorNodeModuleImageReference} from '../../../src/commands/mirror-node-module-image-reference.js';

describe('MirrorNodeModuleImages', (): void => {
  const expectedChartKeys: string[] = ['importer', 'grpc', 'rest', 'restjava', 'web3', 'monitor'];

  it('expands a plain repository prefix into the six module images', (): void => {
    const moduleImages: MirrorNodeModuleImageReference[] = MirrorNodeModuleImages.expand('hedera-mirror:0.157.0');

    expect(moduleImages.map((entry: MirrorNodeModuleImageReference): string => entry.chartKey)).to.deep.equal(
      expectedChartKeys,
    );
    expect(moduleImages).to.deep.include({chartKey: 'importer', imageReference: 'hedera-mirror-importer:0.157.0'});
    expect(moduleImages).to.deep.include({chartKey: 'grpc', imageReference: 'hedera-mirror-grpc:0.157.0'});
    expect(moduleImages).to.deep.include({chartKey: 'rest', imageReference: 'hedera-mirror-rest:0.157.0'});
    expect(moduleImages).to.deep.include({
      chartKey: 'restjava',
      imageReference: 'hedera-mirror-rest-java:0.157.0',
    });
    expect(moduleImages).to.deep.include({chartKey: 'web3', imageReference: 'hedera-mirror-web3:0.157.0'});
    expect(moduleImages).to.deep.include({chartKey: 'monitor', imageReference: 'hedera-mirror-monitor:0.157.0'});
  });

  it('expands a registry-qualified repository prefix', (): void => {
    const moduleImages: MirrorNodeModuleImageReference[] = MirrorNodeModuleImages.expand(
      'ghcr.io/hiero-ledger/hedera-mirror:0.157.0-abc1234',
    );

    expect(moduleImages).to.deep.include({
      chartKey: 'importer',
      imageReference: 'ghcr.io/hiero-ledger/hedera-mirror-importer:0.157.0-abc1234',
    });
    expect(moduleImages).to.deep.include({
      chartKey: 'restjava',
      imageReference: 'ghcr.io/hiero-ledger/hedera-mirror-rest-java:0.157.0-abc1234',
    });
  });

  it('expands a Kind-attached local registry reference without mistaking the port colon for the tag separator', (): void => {
    const moduleImages: MirrorNodeModuleImageReference[] = MirrorNodeModuleImages.expand(
      'localhost:5001/hedera-mirror:0.157.0',
    );

    expect(moduleImages).to.deep.include({
      chartKey: 'importer',
      imageReference: 'localhost:5001/hedera-mirror-importer:0.157.0',
    });
    expect(moduleImages).to.deep.include({
      chartKey: 'monitor',
      imageReference: 'localhost:5001/hedera-mirror-monitor:0.157.0',
    });
  });

  it('throws for a bare value with no slash, colon, or digest marker', (): void => {
    expect((): MirrorNodeModuleImageReference[] => MirrorNodeModuleImages.expand('hedera-mirror')).to.throw(
      /Invalid Mirror Node image reference format/,
    );
  });

  it('defaults an untagged repository prefix to latest, matching ImageReference.parseImageReference', (): void => {
    const moduleImages: MirrorNodeModuleImageReference[] = MirrorNodeModuleImages.expand('hiero-ledger/hedera-mirror');

    expect(moduleImages).to.deep.include({
      chartKey: 'importer',
      imageReference: 'hiero-ledger/hedera-mirror-importer:latest',
    });
  });

  it('defaults an untagged Kind-attached local registry reference to latest instead of mistaking the port for a tag', (): void => {
    const moduleImages: MirrorNodeModuleImageReference[] =
      MirrorNodeModuleImages.expand('localhost:5001/hedera-mirror');

    expect(moduleImages).to.deep.include({
      chartKey: 'importer',
      imageReference: 'localhost:5001/hedera-mirror-importer:latest',
    });
    expect(moduleImages).to.deep.include({
      chartKey: 'monitor',
      imageReference: 'localhost:5001/hedera-mirror-monitor:latest',
    });
  });
});
