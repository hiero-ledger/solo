// SPDX-License-Identifier: Apache-2.0

export type OneShotParsedVersions = {
  soloChart?: string;
  consensus?: string;
  mirror?: string;
  explorer?: string;
  relay?: string;
  blockNode?: string;
};

const ONE_SHOT_VERSION_LABELS: Record<string, keyof OneShotParsedVersions> = {
  'Solo Chart Version': 'soloChart',
  'Consensus Node Version': 'consensus',
  'Mirror Node Version': 'mirror',
  'Explorer Version': 'explorer',
  'JSON RPC Relay Version': 'relay',
  'Block Node Version': 'blockNode',
};

export function parseOneShotVersionsFile(fileContent: string): OneShotParsedVersions {
  const parsedVersions: OneShotParsedVersions = {};

  for (const rawLine of fileContent.split('\n')) {
    const line: string = rawLine.trim();
    if (!line) {
      continue;
    }

    for (const [label, key] of Object.entries(ONE_SHOT_VERSION_LABELS)) {
      const versionPrefix: string = `${label}:`;
      if (!line.startsWith(versionPrefix)) {
        continue;
      }

      const version: string = line.slice(versionPrefix.length).trim();
      if (version) {
        parsedVersions[key] = version;
      }
      break;
    }
  }

  return parsedVersions;
}
