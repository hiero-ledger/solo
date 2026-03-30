// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Transform} from 'class-transformer';
import {Transformations} from '../utils/transformations.js';
import {SemanticVersion} from '../../../../business/utils/semantic-version.js';

@Exclude()
export class ApplicationVersionsSchema {
  @Expose()
  @Transform(Transformations.SemanticVersion)
  public cli: SemanticVersion<string>;

  @Expose()
  @Transform(Transformations.SemanticVersion)
  public chart: SemanticVersion<string>;

  @Expose()
  @Transform(Transformations.SemanticVersion)
  public consensusNode: SemanticVersion<string>;

  @Expose()
  @Transform(Transformations.SemanticVersion)
  public mirrorNodeChart: SemanticVersion<string>;

  @Expose()
  @Transform(Transformations.SemanticVersion)
  public explorerChart: SemanticVersion<string>;

  @Expose()
  @Transform(Transformations.SemanticVersion)
  public jsonRpcRelayChart: SemanticVersion<string>;

  @Expose()
  @Transform(Transformations.SemanticVersion)
  public blockNodeChart: SemanticVersion<string>;

  public constructor(
    cli?: SemanticVersion<string>,
    chart?: SemanticVersion<string>,
    consensusNode?: SemanticVersion<string>,
    mirrorNodeChart?: SemanticVersion<string>,
    explorerChart?: SemanticVersion<string>,
    jsonRpcRelayChart?: SemanticVersion<string>,
    blockNodeChart?: SemanticVersion<string>,
  ) {
    this.cli = cli ?? new SemanticVersion<string>('0.0.0');
    this.chart = chart ?? new SemanticVersion<string>('0.0.0');
    this.consensusNode = consensusNode ?? new SemanticVersion<string>('0.0.0');
    this.mirrorNodeChart = mirrorNodeChart ?? new SemanticVersion<string>('0.0.0');
    this.explorerChart = explorerChart ?? new SemanticVersion<string>('0.0.0');
    this.jsonRpcRelayChart = jsonRpcRelayChart ?? new SemanticVersion<string>('0.0.0');
    this.blockNodeChart = blockNodeChart ?? new SemanticVersion<string>('0.0.0');
  }
}
