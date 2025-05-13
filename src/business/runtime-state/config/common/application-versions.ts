// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {type ApplicationVersionsSchema} from '../../../../data/schema/model/common/application-versions-schema.js';
import {type SemVer} from 'semver';

export class ApplicationVersions implements Facade<ApplicationVersionsSchema> {
  public constructor(public readonly backingObject: ApplicationVersionsSchema) {}

  public get cli(): SemVer {
    return this.backingObject.cli;
  }

  public set cli(cli: SemVer) {
    this.backingObject.cli = cli;
  }

  public get chart(): SemVer {
    return this.backingObject.chart;
  }

  public set chart(chart: SemVer) {
    this.backingObject.chart = chart;
  }

  public get consensusNode(): SemVer {
    return this.backingObject.consensusNode;
  }

  public set consensusNode(consensusNode: SemVer) {
    this.backingObject.consensusNode = consensusNode;
  }

  public get mirrorNodeChart(): SemVer {
    return this.backingObject.mirrorNodeChart;
  }

  public set mirrorNodeChart(mirrorNodeChart: SemVer) {
    this.backingObject.mirrorNodeChart = mirrorNodeChart;
  }

  public get explorerChart(): SemVer {
    return this.backingObject.explorerChart;
  }

  public set explorerChart(explorerChart: SemVer) {
    this.backingObject.explorerChart = explorerChart;
  }

  public get jsonRpcRelayChart(): SemVer {
    return this.backingObject.jsonRpcRelayChart;
  }

  public set jsonRpcRelayChart(jsonRpcRelayChart: SemVer) {
    this.backingObject.jsonRpcRelayChart = jsonRpcRelayChart;
  }

  public get blockNodeChart(): SemVer {
    return this.backingObject.blockNodeChart;
  }

  public set blockNodeChart(blockNodeChart: SemVer) {
    this.backingObject.blockNodeChart = blockNodeChart;
  }
}
