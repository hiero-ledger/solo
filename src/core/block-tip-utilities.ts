// SPDX-License-Identifier: Apache-2.0

import {type Container} from '../integration/kube/resources/container/container.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {container as diContainer} from 'tsyringe-neo';
import {InjectTokens} from './dependency-injection/inject-tokens.js';

const BLOCK_NODE_DATA_DIRECTORY: string = '/opt/hiero/block-node/data';
const CONSENSUS_BLOCK_STREAMS_DIRECTORY: string = '/opt/hgcapp/blockStreams';

/**
 * Block-stream filenames embed a zero-padded block number followed by an extension that
 * differs by component:
 *   - Block node: `.blk` plus optional `.zstd` / `.gz` compression, under `data/live` and
 *     `data/historic`.
 *   - Consensus node: `.pnd.gz` (pending block payload) and `.pnd.json` (metadata),
 *     under `blockStreams/<shard>.<realm>.<node>/`. CN promotes blocks from `.pnd` to a
 *     sealed name only after they are streamed and acknowledged downstream, so `.pnd`
 *     captures both newly-finalized blocks and any awaiting flush.
 * The numeric block number always precedes the first dot-extension run, so matching the
 * trailing digit run before `.blk` or `.pnd` works for both formats. Lexicographic sort
 * of these zero-padded names matches numeric order, so callers can safely take the last
 * entry from `find ... | sort | tail -1`.
 */
function parseBlockNumberFromPath(rawOutput: string): number {
  const match: RegExpMatchArray | null = (rawOutput || '').trim().match(/(\d+)\.(?:blk|pnd)/);
  return match ? Number.parseInt(match[1], 10) : -1;
}

/**
 * Read the highest block number persisted by the block node across both live and historic
 * storage. Returns -1 if no block files exist or the read fails.
 */
export async function readBlockNodeOnDiskTip(blockNodeContainer: Container): Promise<number> {
  const logger: SoloLogger = diContainer.resolve<SoloLogger>(InjectTokens.SoloLogger);
  try {
    const output: string = await blockNodeContainer.execContainer([
      'sh',
      '-c',
      `find ${BLOCK_NODE_DATA_DIRECTORY} -type f -name '*.blk*' 2>/dev/null | sort | tail -1`,
    ]);
    return parseBlockNumberFromPath(output);
  } catch (error: any) {
    logger.info(`Failed to read block node on-disk tip: ${error.message || error}`);
    return -1;
  }
}

/**
 * Read CN's highest block number from its local block stream directory. CN writes
 * `.pnd.gz` (pending) and `.pnd.json` (metadata) files as it finalizes blocks, then
 * promotes them to `.blk*` once they are sealed. Match either name - the most recently
 * finalized block is whichever sorts last. Returns -1 if nothing matches or the read
 * fails.
 */
export async function readConsensusBlockStreamTip(consensusNodeContainer: Container): Promise<number> {
  const logger: SoloLogger = diContainer.resolve<SoloLogger>(InjectTokens.SoloLogger);
  try {
    const output: string = await consensusNodeContainer.execContainer([
      'sh',
      '-c',
      String.raw`find ${CONSENSUS_BLOCK_STREAMS_DIRECTORY} -type f \( -name '*.blk*' -o -name '*.pnd*' \) 2>/dev/null | sort | tail -1`,
    ]);
    return parseBlockNumberFromPath(output);
  } catch (error: any) {
    logger.info(`Failed to read CN block stream tip: ${error.message || error}`);
    return -1;
  }
}
