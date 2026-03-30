// SPDX-License-Identifier: Apache-2.0

import {type Facade} from '../../facade/facade.js';
import {type ApplicationVersionsSchema} from '../../../../data/schema/model/common/application-versions-schema.js';
import {type SemanticVersion} from '../../../utils/semantic-version.js';

export class ApplicationVersions implements Facade<ApplicationVersionsSchema> {
  public constructor(public readonly encapsulatedObject: ApplicationVersionsSchema) {}

  public get cli(): SemanticVersion<string> {
    return this.encapsulatedObject.cli;
  }

  public set cli(cli: SemanticVersion<string>) {
    this.encapsulatedObject.cli = cli;
  }

  public get chart(): SemanticVersion<string> {
    return this.encapsulatedObject.chart;
  }

  public set chart(chart: SemanticVersion<string>) {
    this.encapsulatedObject.chart = chart;
  }

  public get consensusNode(): SemanticVersion<string> {
    return this.encapsulatedObject.consensusNode;
  }

  public set consensusNode(consensusNode: SemanticVersion<string>) {
    this.encapsulatedObject.consensusNode = consensusNode;
  }

  public get mirrorNodeChart(): SemanticVersion<string> {
    return this.encapsulatedObject.mirrorNodeChart;
  }

  public set mirrorNodeChart(mirrorNodeChart: SemanticVersion<string>) {
    this.encapsulatedObject.mirrorNodeChart = mirrorNodeChart;
  }

  public get explorerChart(): SemanticVersion<string> {
    return this.encapsulatedObject.explorerChart;
  }

  public set explorerChart(explorerChart: SemanticVersion<string>) {
    this.encapsulatedObject.explorerChart = explorerChart;
  }

  public get jsonRpcRelayChart(): SemanticVersion<string> {
    return this.encapsulatedObject.jsonRpcRelayChart;
  }

  public set jsonRpcRelayChart(jsonRpcRelayChart: SemanticVersion<string>) {
    this.encapsulatedObject.jsonRpcRelayChart = jsonRpcRelayChart;
  }

  public get blockNodeChart(): SemanticVersion<string> {
    return this.encapsulatedObject.blockNodeChart;
  }

  public set blockNodeChart(blockNodeChart: SemanticVersion<string>) {
    this.encapsulatedObject.blockNodeChart = blockNodeChart;
  }
}
