// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {PcesTrimmer} from '../../../src/core/pces-trimmer.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';

const PROTOBUF_EVENTS_VERSION: number = 2;
// Protobuf field tags: (field_number << 3) | wire_type. EventCore.birth_round is field 2,
// wire type 0 (varint); GossipEvent.event_core is field 1, wire type 2 (length-delimited).
const EVENT_CORE_BIRTH_ROUND_TAG: number = 16;
const GOSSIP_EVENT_EVENT_CORE_TAG: number = 10;

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

/** Builds a minimal GossipEvent protobuf payload carrying only event_core.birth_round. */
function buildGossipEventBytes(birthRound: number): Buffer {
  const birthRoundVarint: Buffer = encodeVarint(birthRound);
  const eventCoreBytes: Buffer = Buffer.concat([Buffer.from([EVENT_CORE_BIRTH_ROUND_TAG]), birthRoundVarint]);
  return Buffer.concat([
    Buffer.from([GOSSIP_EVENT_EVENT_CORE_TAG]),
    encodeVarint(eventCoreBytes.length),
    eventCoreBytes,
  ]);
}

function encodeLengthDelimitedField(fieldNumber: number, payload: Buffer): Buffer {
  const tag: Buffer = encodeVarint((fieldNumber << 3) | 2);
  return Buffer.concat([tag, encodeVarint(payload.length), payload]);
}

// GossipEvent.transactions is field 4 (repeated SignedTransaction bytes);
// SignedTransaction.bodyBytes is field 1; TransactionBody.freeze is field 23.
const GOSSIP_EVENT_TRANSACTIONS_FIELD_NUMBER: number = 4;
const SIGNED_TRANSACTION_BODY_BYTES_FIELD_NUMBER: number = 1;
const TRANSACTION_BODY_FREEZE_FIELD_NUMBER: number = 23;

/** Builds a GossipEvent carrying event_core.birth_round and, optionally, a freeze transaction. */
function buildGossipEventBytesWithTransaction(birthRound: number, isFreeze: boolean): Buffer {
  const eventCoreField: Buffer = buildGossipEventBytes(birthRound);
  if (!isFreeze) {
    return eventCoreField;
  }

  const transactionBody: Buffer = encodeLengthDelimitedField(TRANSACTION_BODY_FREEZE_FIELD_NUMBER, Buffer.alloc(0));
  const signedTransaction: Buffer = encodeLengthDelimitedField(
    SIGNED_TRANSACTION_BODY_BYTES_FIELD_NUMBER,
    transactionBody,
  );
  const transactionsField: Buffer = encodeLengthDelimitedField(
    GOSSIP_EVENT_TRANSACTIONS_FIELD_NUMBER,
    signedTransaction,
  );
  return Buffer.concat([eventCoreField, transactionsField]);
}

/** Builds a well-formed PCES file from pre-built GossipEvent byte payloads. */
function buildPcesFileBufferFromEvents(gossipEvents: Buffer[], version: number = PROTOBUF_EVENTS_VERSION): Buffer {
  const header: Buffer = Buffer.alloc(4);
  header.writeInt32BE(version, 0);

  const records: Buffer[] = gossipEvents.map((gossipEventBytes: Buffer): Buffer => {
    const lengthPrefix: Buffer = Buffer.alloc(4);
    lengthPrefix.writeInt32BE(gossipEventBytes.length, 0);
    return Buffer.concat([lengthPrefix, gossipEventBytes]);
  });

  return Buffer.concat([header, ...records]);
}

/** Builds a well-formed PCES file (header + length-prefixed records) for the given birth rounds. */
function buildPcesFileBuffer(birthRounds: number[], version: number = PROTOBUF_EVENTS_VERSION): Buffer {
  const header: Buffer = Buffer.alloc(4);
  header.writeInt32BE(version, 0);

  const records: Buffer[] = birthRounds.map((birthRound: number): Buffer => {
    const gossipEventBytes: Buffer = buildGossipEventBytes(birthRound);
    const lengthPrefix: Buffer = Buffer.alloc(4);
    lengthPrefix.writeInt32BE(gossipEventBytes.length, 0);
    return Buffer.concat([lengthPrefix, gossipEventBytes]);
  });

  return Buffer.concat([header, ...records]);
}

describe('PcesTrimmer', (): void => {
  let temporaryDirectory: string;

  beforeEach((): void => {
    temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'pces-trimmer-'));
  });

  afterEach((): void => {
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
  });

  function writePcesFile(fileName: string, buffer: Buffer): string {
    const filePath: string = path.join(temporaryDirectory, fileName);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  it('leaves a file unchanged when every event is at or below the cutoff round', (): void => {
    const originalBuffer: Buffer = buildPcesFileBuffer([10, 20, 30]);
    const filePath: string = writePcesFile('a_seq0_minr1_maxr30_orgn0.pces', originalBuffer);

    PcesTrimmer.trimDirectoryToBirthRound(temporaryDirectory, 30);

    expect(fs.readFileSync(filePath)).to.deep.equal(originalBuffer);
  });

  it('leaves a single-record file unchanged when the record ends exactly at the end of the file', (): void => {
    const originalBuffer: Buffer = buildPcesFileBuffer([5]);
    const filePath: string = writePcesFile('a_seq0_minr1_maxr5_orgn0.pces', originalBuffer);

    PcesTrimmer.trimDirectoryToBirthRound(temporaryDirectory, 5);

    expect(fs.readFileSync(filePath)).to.deep.equal(originalBuffer);
  });

  it('truncates a file at the first record whose birth round exceeds the cutoff', (): void => {
    const filePath: string = writePcesFile('a_seq0_minr1_maxr40_orgn0.pces', buildPcesFileBuffer([10, 20, 30, 40]));

    PcesTrimmer.trimDirectoryToBirthRound(temporaryDirectory, 25);

    expect(fs.readFileSync(filePath)).to.deep.equal(buildPcesFileBuffer([10, 20]));
  });

  it('correctly parses multi-byte varints when truncating past a birth round above 127', (): void => {
    const filePath: string = writePcesFile(
      'a_seq0_minr1_maxr500_orgn0.pces',
      buildPcesFileBuffer([100, 200, 300, 400]),
    );

    PcesTrimmer.trimDirectoryToBirthRound(temporaryDirectory, 250);

    expect(fs.readFileSync(filePath)).to.deep.equal(buildPcesFileBuffer([100, 200]));
  });

  it('deletes a file entirely when even its first record exceeds the cutoff', (): void => {
    const filePath: string = writePcesFile('a_seq0_minr50_maxr60_orgn0.pces', buildPcesFileBuffer([50, 60]));

    PcesTrimmer.trimDirectoryToBirthRound(temporaryDirectory, 10);

    expect(fs.existsSync(filePath)).to.be.false;
  });

  it('leaves a file untouched when its version header is not the recognized PROTOBUF_EVENTS version', (): void => {
    const originalBuffer: Buffer = buildPcesFileBuffer([10, 999], 99);
    const filePath: string = writePcesFile('a_seq0_minr1_maxr999_orgn0.pces', originalBuffer);

    PcesTrimmer.trimDirectoryToBirthRound(temporaryDirectory, 10);

    expect(fs.readFileSync(filePath)).to.deep.equal(originalBuffer);
  });

  it('trims each file in a nested directory tree independently, in sequence order', (): void => {
    const nestedDirectory: string = path.join(temporaryDirectory, '2026', '08', '17');
    fs.mkdirSync(nestedDirectory, {recursive: true});

    const belowCutoffBuffer: Buffer = buildPcesFileBuffer([1, 2]);
    const belowCutoffPath: string = path.join(nestedDirectory, 'a_seq0_minr1_maxr2_orgn0.pces');
    fs.writeFileSync(belowCutoffPath, belowCutoffBuffer);

    const straddlingPath: string = path.join(nestedDirectory, 'b_seq1_minr2_maxr50_orgn0.pces');
    fs.writeFileSync(straddlingPath, buildPcesFileBuffer([2, 3, 40]));

    PcesTrimmer.trimDirectoryToBirthRound(temporaryDirectory, 3);

    expect(fs.readFileSync(belowCutoffPath)).to.deep.equal(belowCutoffBuffer);
    expect(fs.readFileSync(straddlingPath)).to.deep.equal(buildPcesFileBuffer([2, 3]));
  });

  it('does nothing when the directory does not exist', (): void => {
    const missingDirectory: string = path.join(temporaryDirectory, 'does-not-exist');

    expect((): void => PcesTrimmer.trimDirectoryToBirthRound(missingDirectory, 10)).to.not.throw();
  });

  it('leaves a file untouched when a record is malformed instead of risking an incorrect truncation', (): void => {
    const header: Buffer = Buffer.alloc(4);
    header.writeInt32BE(PROTOBUF_EVENTS_VERSION, 0);
    // A length prefix declaring more bytes than actually follow it.
    const corruptLengthPrefix: Buffer = Buffer.alloc(4);
    corruptLengthPrefix.writeInt32BE(1000, 0);
    const originalBuffer: Buffer = Buffer.concat([header, corruptLengthPrefix, Buffer.from([1, 2, 3])]);
    const filePath: string = writePcesFile('a_seq0_minr1_maxr10_orgn0.pces', originalBuffer);

    PcesTrimmer.trimDirectoryToBirthRound(temporaryDirectory, 10);

    expect(fs.readFileSync(filePath)).to.deep.equal(originalBuffer);
  });

  describe('excludeFreezeTransactionEvents', (): void => {
    it('removes only the event carrying a freeze transaction, regardless of birth round, keeping all others', (): void => {
      // The freeze event's birth round (5) is well below the other kept events (10, 20) —
      // mirroring the real-world case where a freeze transaction is gossiped long before it is
      // finally consensus-ordered, so no birth-round cutoff could exclude it without also
      // discarding legitimate, already-ordered history.
      const events: Buffer[] = [
        buildGossipEventBytesWithTransaction(10, false),
        buildGossipEventBytesWithTransaction(5, true),
        buildGossipEventBytesWithTransaction(20, false),
      ];
      const filePath: string = writePcesFile('a_seq0_minr1_maxr20_orgn0.pces', buildPcesFileBufferFromEvents(events));

      PcesTrimmer.excludeFreezeTransactionEvents(temporaryDirectory);

      expect(fs.readFileSync(filePath)).to.deep.equal(buildPcesFileBufferFromEvents([events[0], events[2]]));
    });

    it('leaves a file byte-for-byte unchanged when it carries no freeze transaction', (): void => {
      const originalBuffer: Buffer = buildPcesFileBufferFromEvents([
        buildGossipEventBytesWithTransaction(10, false),
        buildGossipEventBytesWithTransaction(20, false),
      ]);
      const filePath: string = writePcesFile('a_seq0_minr1_maxr20_orgn0.pces', originalBuffer);
      const statBefore: fs.Stats = fs.statSync(filePath);

      PcesTrimmer.excludeFreezeTransactionEvents(temporaryDirectory);

      expect(fs.readFileSync(filePath)).to.deep.equal(originalBuffer);
      expect(fs.statSync(filePath).mtimeMs).to.equal(statBefore.mtimeMs);
    });

    it('removes every freeze transaction event when a file carries more than one', (): void => {
      const events: Buffer[] = [
        buildGossipEventBytesWithTransaction(1, true),
        buildGossipEventBytesWithTransaction(2, false),
        buildGossipEventBytesWithTransaction(3, true),
      ];
      const filePath: string = writePcesFile('a_seq0_minr1_maxr3_orgn0.pces', buildPcesFileBufferFromEvents(events));

      PcesTrimmer.excludeFreezeTransactionEvents(temporaryDirectory);

      expect(fs.readFileSync(filePath)).to.deep.equal(buildPcesFileBufferFromEvents([events[1]]));
    });

    it('leaves a file untouched when its version header is not the recognized PROTOBUF_EVENTS version', (): void => {
      const originalBuffer: Buffer = buildPcesFileBufferFromEvents([buildGossipEventBytesWithTransaction(1, true)], 99);
      const filePath: string = writePcesFile('a_seq0_minr1_maxr1_orgn0.pces', originalBuffer);

      PcesTrimmer.excludeFreezeTransactionEvents(temporaryDirectory);

      expect(fs.readFileSync(filePath)).to.deep.equal(originalBuffer);
    });

    it('leaves a file untouched when a record is malformed instead of risking an incorrect rewrite', (): void => {
      const header: Buffer = Buffer.alloc(4);
      header.writeInt32BE(PROTOBUF_EVENTS_VERSION, 0);
      const corruptLengthPrefix: Buffer = Buffer.alloc(4);
      corruptLengthPrefix.writeInt32BE(1000, 0);
      const originalBuffer: Buffer = Buffer.concat([header, corruptLengthPrefix, Buffer.from([1, 2, 3])]);
      const filePath: string = writePcesFile('a_seq0_minr1_maxr10_orgn0.pces', originalBuffer);

      PcesTrimmer.excludeFreezeTransactionEvents(temporaryDirectory);

      expect(fs.readFileSync(filePath)).to.deep.equal(originalBuffer);
    });

    it('does nothing when the directory does not exist', (): void => {
      const missingDirectory: string = path.join(temporaryDirectory, 'does-not-exist');

      expect((): void => PcesTrimmer.excludeFreezeTransactionEvents(missingDirectory)).to.not.throw();
    });
  });
});
