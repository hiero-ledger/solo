// SPDX-License-Identifier: Apache-2.0

import {type Options} from '../../request/options.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';

/**
 * Options for the `kind load image-archive` command.
 */
export class LoadImageArchiveOptions implements Options {
  /**
   * Path to the image archive to load.
   */
  private readonly _archivePath: string;

  /**
   * The name of the cluster (default "kind")
   */
  private readonly _name: string;

  /**
   * comma separated list of nodes to load images into
   */
  private readonly _nodes: string;

  public constructor(archivePath?: string, name?: string, nodes?: string) {
    if (archivePath) {
      this._archivePath = archivePath;
    }
    if (name) {
      this._name = name;
    }
    if (nodes) {
      this._nodes = nodes;
    }
  }

  /**
   * Apply the options to the KindExecutionBuilder.
   * @param builder The KindExecutionBuilder to apply options to.
   */
  public apply(builder: KindExecutionBuilder): void {
    if (this._archivePath) {
      builder.positional(this._archivePath);
    }
    if (this._name) {
      builder.argument('name', this._name);
    }
    if (this._nodes) {
      builder.argument('nodes', this._nodes);
    }
  }

  /**
   * The archive path.
   */
  public get archivePath(): string {
    return this._archivePath;
  }

  /**
   * The name of the cluster.
   */
  public get name(): string {
    return this._name;
  }

  /**
   * The nodes to load images into.
   */
  public get nodes(): string {
    return this._nodes;
  }
}
