// SPDX-License-Identifier: Apache-2.0

import {instanceToPlain, plainToInstance} from 'class-transformer';
import {type Facade} from '../../facade/facade.js';
import {SoloConfigSchema} from '../../../../data/schema/model/solo/solo-config-schema.js';
import {FeatureFlagsSchema} from '../../../../data/schema/model/solo/feature-flags-schema.js';
import {HelmChart} from '../common/helm-chart.js';
import {Tss} from './tss.js';
import {FeatureFlags} from './feature-flags.js';
import {type ConfigProvider} from '../../../../data/configuration/api/config-provider.js';

export class SoloConfig implements Facade<SoloConfigSchema> {
  public readonly encapsulatedObject: SoloConfigSchema;

  private readonly _helmChart: HelmChart;
  private readonly _ingressControllerHelmChart: HelmChart;
  private readonly _clusterSetupHelmChart: HelmChart;
  private readonly _certManagerHelmChart: HelmChart;
  private readonly _tss: Tss;
  private readonly _featureFlags: FeatureFlags;

  public constructor(schema: SoloConfigSchema) {
    // Deep copy for immutability — prevents callers from mutating projected config through the schema ref
    this.encapsulatedObject = plainToInstance(SoloConfigSchema, instanceToPlain(schema ?? new SoloConfigSchema()));
    this._helmChart = new HelmChart(this.encapsulatedObject.helmChart);
    this._ingressControllerHelmChart = new HelmChart(this.encapsulatedObject.ingressControllerHelmChart);
    this._clusterSetupHelmChart = new HelmChart(this.encapsulatedObject.clusterSetupHelmChart);
    this._certManagerHelmChart = new HelmChart(this.encapsulatedObject.certManagerHelmChart);
    this._tss = new Tss(this.encapsulatedObject.tss);
    // Config sources legitimately omit featureFlags — no flag is declared yet, so nothing emits the key —
    // and class-transformer leaves an exposed-but-absent property undefined rather than keeping the value
    // the constructor gave it. Normalising here keeps the schema view and the facade view in agreement.
    this.encapsulatedObject.featureFlags ??= new FeatureFlagsSchema();
    this._featureFlags = new FeatureFlags(this.encapsulatedObject.featureFlags);
  }

  public static getConfig(configProvider: ConfigProvider): SoloConfig {
    return new SoloConfig(configProvider.config().asObject(SoloConfigSchema));
  }

  /**
   * Reads the feature flags at the point of use.
   *
   * <p>For services that are not commands: a singleton constructed during container initialisation would
   * snapshot the config before {@code main()} loads the sources, and every flag would read its default
   * forever. Resolving here instead means the read always happens after bootstrap.
   */
  public static featureFlags(configProvider: ConfigProvider): FeatureFlags {
    return SoloConfig.getConfig(configProvider).featureFlags;
  }

  public get helmChart(): HelmChart {
    return this._helmChart;
  }

  public get ingressControllerHelmChart(): HelmChart {
    return this._ingressControllerHelmChart;
  }

  public get clusterSetupHelmChart(): HelmChart {
    return this._clusterSetupHelmChart;
  }

  public get certManagerHelmChart(): HelmChart {
    return this._certManagerHelmChart;
  }

  public get tss(): Tss {
    return this._tss;
  }

  public get featureFlags(): FeatureFlags {
    return this._featureFlags;
  }
}
