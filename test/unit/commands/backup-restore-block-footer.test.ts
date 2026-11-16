// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {BackupRestoreCommand} from '../../../src/commands/backup-restore.js';

// Protobuf field tags: (field_number << 3) | wire_type, all length-delimited (wire type 2).
const BLOCK_ITEMS_TAG: number = 10; // Block.items = 1
const BLOCK_ITEM_HEADER_TAG: number = 10; // BlockItem.block_header = 1
const BLOCK_ITEM_FOOTER_TAG: number = 98; // BlockItem.block_footer = 12
const FOOTER_PREVIOUS_HASH_TAG: number = 10; // BlockFooter.previous_block_root_hash = 1
const FOOTER_ALL_BLOCK_HASHES_TAG: number = 18; // BlockFooter.root_hash_of_all_block_hashes_tree = 2
const FOOTER_START_STATE_HASH_TAG: number = 26; // BlockFooter.start_of_block_state_root_hash = 3

const SHA256_LENGTH: number = 32;
const SHA384_LENGTH: number = 48;

type FooterFinder = {findPreviousBlockRootHash: (blockBytes: Buffer) => string | undefined};
const finder: FooterFinder = BackupRestoreCommand as unknown as FooterFinder;

function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  let remaining: number = value;
  while (remaining > 0b0111_1111) {
    bytes.push((remaining & 0b0111_1111) | 0b1000_0000);
    remaining >>>= 7;
  }
  bytes.push(remaining);
  return Buffer.from(bytes);
}

function lengthDelimited(tag: number, payload: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeVarint(payload.length), payload]);
}

function filledHash(length: number, fill: number): Buffer {
  return Buffer.alloc(length, fill);
}

/** A Block holding a header item with the given payload, then a footer item whose hashes are `hashLength` bytes. */
function buildBlock(hashLength: number, previousHash: Buffer, headerPayload: Buffer = Buffer.from([1, 2, 3])): Buffer {
  const footer: Buffer = Buffer.concat([
    lengthDelimited(FOOTER_PREVIOUS_HASH_TAG, previousHash),
    lengthDelimited(FOOTER_ALL_BLOCK_HASHES_TAG, filledHash(hashLength, 187)),
    lengthDelimited(FOOTER_START_STATE_HASH_TAG, filledHash(hashLength, 204)),
  ]);
  return Buffer.concat([
    lengthDelimited(BLOCK_ITEMS_TAG, lengthDelimited(BLOCK_ITEM_HEADER_TAG, headerPayload)),
    lengthDelimited(BLOCK_ITEMS_TAG, lengthDelimited(BLOCK_ITEM_FOOTER_TAG, footer)),
  ]);
}

describe('BackupRestoreCommand block footer parsing', (): void => {
  it('extracts a 32-byte SHA-256 previous_block_root_hash', (): void => {
    const previousHash: Buffer = filledHash(SHA256_LENGTH, 170);

    expect(finder.findPreviousBlockRootHash(buildBlock(SHA256_LENGTH, previousHash))).to.equal(
      previousHash.toString('hex'),
    );
  });

  it('extracts a 48-byte SHA-384 previous_block_root_hash', (): void => {
    const previousHash: Buffer = filledHash(SHA384_LENGTH, 170);

    expect(finder.findPreviousBlockRootHash(buildBlock(SHA384_LENGTH, previousHash))).to.equal(
      previousHash.toString('hex'),
    );
  });

  it('skips a stray footer tag whose declared length cannot hold the hash', (): void => {
    const previousHash: Buffer = filledHash(SHA256_LENGTH, 170);
    // Looks like `62 01 0a 20 ...` inside the header item, but a 1-byte footer cannot contain a 34-byte hash field.
    const decoyHeader: Buffer = Buffer.concat([
      Buffer.from([BLOCK_ITEM_FOOTER_TAG, 1, FOOTER_PREVIOUS_HASH_TAG, SHA256_LENGTH]),
      filledHash(SHA256_LENGTH, 221),
    ]);

    expect(finder.findPreviousBlockRootHash(buildBlock(SHA256_LENGTH, previousHash, decoyHeader))).to.equal(
      previousHash.toString('hex'),
    );
  });

  it('returns undefined for a hash length that is neither SHA-256 nor SHA-384', (): void => {
    expect(finder.findPreviousBlockRootHash(buildBlock(20, filledHash(20, 170)))).to.equal(undefined);
  });

  it('returns undefined when the block has no footer', (): void => {
    const block: Buffer = lengthDelimited(BLOCK_ITEMS_TAG, lengthDelimited(BLOCK_ITEM_HEADER_TAG, Buffer.from([1])));

    expect(finder.findPreviousBlockRootHash(block)).to.equal(undefined);
  });
});
