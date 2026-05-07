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

    const separatorIndex: number = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const label: string = line.slice(0, separatorIndex).trim();
    const key: keyof OneShotParsedVersions | undefined = ONE_SHOT_VERSION_LABELS[label];
    if (!key) {
      continue;
    }

    const version: string = line.slice(separatorIndex + 1).trim();
    if (version) {
      parsedVersions[key] = version;
    }
  }

  return parsedVersions;
}
