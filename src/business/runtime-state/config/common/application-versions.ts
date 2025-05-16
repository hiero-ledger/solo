// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {type ApplicationVersionsSchema} from '../../../../data/schema/model/common/application-versions-schema.js';
import {type SemVer} from 'semver';

export class ApplicationVersions implements Facade<ApplicationVersionsSchema> {
  public constructor(public readonly encapsulatedObject: ApplicationVersionsSchema) {}

  public get cli(): SemVer {
    return this.encapsulatedObject.cli;
  }

  public set cli(cli: SemVer) {
    this.encapsulatedObject.cli = cli;
  }

  public get chart(): SemVer {
    return this.encapsulatedObject.chart;
  }

  public set chart(chart: SemVer) {
    this.encapsulatedObject.chart = chart;
  }

  public get consensusNode(): SemVer {
    return this.encapsulatedObject.consensusNode;
  }

  public set consensusNode(consensusNode: SemVer) {
    this.encapsulatedObject.consensusNode = consensusNode;
  }

  public get mirrorNodeChart(): SemVer {
    return this.encapsulatedObject.mirrorNodeChart;
  }

  public set mirrorNodeChart(mirrorNodeChart: SemVer) {
    this.encapsulatedObject.mirrorNodeChart = mirrorNodeChart;
  }

  public get explorerChart(): SemVer {
    return this.encapsulatedObject.explorerChart;
  }

  public set explorerChart(explorerChart: SemVer) {
    this.encapsulatedObject.explorerChart = explorerChart;
  }

  public get jsonRpcRelayChart(): SemVer {
    return this.encapsulatedObject.jsonRpcRelayChart;
  }

  public set jsonRpcRelayChart(jsonRpcRelayChart: SemVer) {
    this.encapsulatedObject.jsonRpcRelayChart = jsonRpcRelayChart;
  }

  public get blockNodeChart(): SemVer {
    return this.encapsulatedObject.blockNodeChart;
  }

  public set blockNodeChart(blockNodeChart: SemVer) {
    this.encapsulatedObject.blockNodeChart = blockNodeChart;
  }
}
