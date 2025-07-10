// SPDX-License-Identifier: Apache-2.0

export class GetNodesResponse {
  protected readonly _rawOutput: string;
  private readonly _nodes: string[] = [];

  public constructor() {
    // eslint-disable-next-line prefer-rest-params
    this._rawOutput = Array.from(arguments).join('\n');

    // Check if the output indicates no nodes were found
    // If the output doesn't contain nodes, leave _nodes empty
    const hasNodes = !this._rawOutput.trim().startsWith('No kind nodes found for cluster');

    if (hasNodes) {
      // Split the output into lines and filter out any empty lines
      const lines = this._rawOutput.split('\n').filter(line => line.trim().length > 0);
      this._nodes = lines;
    }
  }

  public get nodes(): string[] {
    return this._nodes;
  }
}
