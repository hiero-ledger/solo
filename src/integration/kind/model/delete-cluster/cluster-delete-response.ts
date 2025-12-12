// SPDX-License-Identifier: Apache-2.0

export class ClusterDeleteResponse {
  private readonly _name: string | undefined;
  private readonly _deletedNodes: string[] = [];

  public constructor(protected readonly _rawOutput: string) {
    // Extract cluster name from deletion output
    const nameMatch: RegExpMatchArray = this._rawOutput.match(/Deleting cluster "([^"]+)"/);
    this._name = nameMatch ? nameMatch[1] : undefined;

    // Extract deleted nodes if present
    const nodesMatch: RegExpMatchArray = this._rawOutput.match(/Deleted nodes: \[(.*?)]/);
    if (nodesMatch && nodesMatch[1]) {
      // Parse the JSON-like array string into actual string array
      try {
        // Remove extra quotes and split by comma
        const nodesList: string[] = nodesMatch[1]
          .split(',')
          .map((node): string => node.trim().replace(/^"(.*)"$/, '$1'));
        this._deletedNodes.push(...nodesList);
      } catch {
        // If parsing fails, leave as empty array
      }
    }
  }

  public get name(): string | undefined {
    return this._name;
  }

  public get deletedNodes(): string[] {
    return this._deletedNodes;
  }
}
