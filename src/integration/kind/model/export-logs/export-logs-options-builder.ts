// SPDX-License-Identifier: Apache-2.0

import {ExportLogsOptions} from './export-logs-options.js';

export class ExportLogsOptionsBuilder {
  private constructor(private _name?: string) {}

  public static builder(): ExportLogsOptionsBuilder {
    return new ExportLogsOptionsBuilder();
  }

  /**
   * Set the name of the cluster (default "kind").
   * @param name
   */
  public name(name: string): ExportLogsOptionsBuilder {
    this._name = name;
    return this;
  }

  /**
   * Build the ExportLogsOptions instance.
   */
  public build(): ExportLogsOptions {
    return new ExportLogsOptions(this._name);
  }

  public static from(options: ExportLogsOptions): ExportLogsOptionsBuilder {
    if (!options) {
      return new ExportLogsOptionsBuilder();
    }
    return new ExportLogsOptionsBuilder(options.name);
  }
}
