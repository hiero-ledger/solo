// SPDX-License-Identifier: Apache-2.0

export class GetNodesResponse {
  protected readonly _rawOutput: string;
  private readonly _nodes: string[] = [];

  public constructor() {
    // eslint-disable-next-line prefer-rest-params
    this._rawOutput = [...arguments].join('\n');

    // Check if the output indicates no nodes were found
    // If the output doesn't contain nodes, leave _nodes empty
    const hasNodes: boolean = !this._rawOutput.trim().startsWith('No kind nodes found for cluster');

    if (hasNodes) {
      // Split the output into lines and filter out any empty lines
      this._nodes = this._rawOutput.split('\n').filter((line): boolean => line.trim().length > 0);
    }
  }

  public get nodes(): string[] {
    return this._nodes;
  }
}
