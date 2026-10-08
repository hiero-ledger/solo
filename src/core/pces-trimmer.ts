// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import path from 'node:path';
import {SoloErrors} from './errors/solo-errors.js';

const PCES_PROTOBUF_EVENTS_VERSION: number = 2;
const GOSSIP_EVENT_CORE_FIELD_NUMBER: number = 1;
const GOSSIP_EVENT_TRANSACTIONS_FIELD_NUMBER: number = 4;
const EVENT_CORE_BIRTH_ROUND_FIELD_NUMBER: number = 2;
const SIGNED_TRANSACTION_BODY_BYTES_FIELD_NUMBER: number = 1;
const TRANSACTION_BODY_FREEZE_FIELD_NUMBER: number = 23;
const WIRE_TYPE_VARINT: number = 0;
const WIRE_TYPE_FIXED64: number = 1;
const WIRE_TYPE_LENGTH_DELIMITED: number = 2;
const WIRE_TYPE_FIXED32: number = 5;

interface VarintRead {
  value: bigint;
  nextOffset: number;
}

/**
 * Trims preconsensus event stream (PCES) files down to a maximum birth round.
 *
 * A restored state snapshot at round N is already a complete, fully signed state; any
 * preconsensus event with a birth round greater than N was created after that snapshot and
 * should not be replayed when the snapshot is restored elsewhere (for example, replaying a
 * freeze transaction ordered moments after the snapshot was taken would immediately re-freeze
 * the restored node). This trims strictly at a record boundary, so no footer/checksum needs to
 * be regenerated (see the PCES file format used by hiero-consensus-node's PcesFileIterator,
 * which already tolerates a file ending mid-record the same way it tolerates an abrupt
 * shutdown).
 */
export class PcesTrimmer {
  /**
   * Removes every preconsensus event with a birth round greater than maximumBirthRound from
   * all .pces files found recursively under directory. A file entirely beyond the cutoff is
   * deleted; a file straddling the cutoff is truncated at the first excluded record's start.
   */
  public static trimDirectoryToBirthRound(directory: string, maximumBirthRound: number): void {
    if (!fs.existsSync(directory)) {
      return;
    }

    for (const pcesFilePath of PcesTrimmer.findPcesFilesInSequenceOrder(directory)) {
      PcesTrimmer.trimFileToBirthRound(pcesFilePath, maximumBirthRound);
    }
  }

  /**
   * Removes every preconsensus event carrying a FreezeTransaction from all .pces files found
   * recursively under directory, regardless of birth round. A birth-round cutoff cannot reliably
   * exclude a freeze transaction that was gossiped before a restore snapshot but not yet
   * consensus-ordered as of it (its birth round can be at or below the snapshot's own round), and
   * trimming further back to compensate breaks the restored node's own continuity validation
   * (observed: both emptying the stream and trimming to the ancient-event threshold left restored
   * nodes stuck in CHECKING indefinitely — see hiero-ledger/solo#6164). Identifying the one
   * specific event by its transaction content instead avoids that tradeoff: every other event,
   * including the rest of the non-ancient window, is left untouched.
   */
  public static excludeFreezeTransactionEvents(directory: string): void {
    if (!fs.existsSync(directory)) {
      return;
    }

    for (const pcesFilePath of PcesTrimmer.findPcesFilesInSequenceOrder(directory)) {
      PcesTrimmer.excludeFreezeTransactionEventsFromFile(pcesFilePath);
    }
  }

  private static excludeFreezeTransactionEventsFromFile(pcesFilePath: string): void {
    try {
      const fileBuffer: Buffer = fs.readFileSync(pcesFilePath);
      if (fileBuffer.length < 4 || fileBuffer.readInt32BE(0) !== PCES_PROTOBUF_EVENTS_VERSION) {
        return;
      }

      const keptChunks: Buffer[] = [fileBuffer.subarray(0, 4)];
      let recordOffset: number = 4;
      let removedAny: boolean = false;

      while (recordOffset + 4 <= fileBuffer.length) {
        const recordLength: number = fileBuffer.readInt32BE(recordOffset);
        const recordStart: number = recordOffset + 4;
        if (recordLength < 0 || recordStart + recordLength > fileBuffer.length) {
          // A partial trailing record; keep the remainder verbatim rather than guessing at it.
          keptChunks.push(fileBuffer.subarray(recordOffset));
          recordOffset = fileBuffer.length;
          break;
        }

        const recordEnd: number = recordStart + recordLength;
        const recordBytes: Buffer = fileBuffer.subarray(recordStart, recordEnd);
        if (PcesTrimmer.eventContainsFreezeTransaction(recordBytes)) {
          removedAny = true;
        } else {
          keptChunks.push(fileBuffer.subarray(recordOffset, recordEnd));
        }
        recordOffset = recordEnd;
      }

      if (removedAny) {
        fs.writeFileSync(pcesFilePath, Buffer.concat(keptChunks));
      }
    } catch {
      // Best-effort: an unexpected or unrecognized PCES layout is left untouched rather than
      // risking corruption of a file the platform still needs to read on next startup.
    }
  }

  /**
   * Checks whether a GossipEvent carries a transaction whose body sets the `freeze` oneof field,
   * by walking GossipEvent.transactions (field 4, repeated SignedTransaction bytes) ->
   * SignedTransaction.bodyBytes (field 1) -> presence of TransactionBody.freeze (field 23).
   * Only presence is checked; FreezeTransactionBody's own contents are irrelevant here.
   */
  private static eventContainsFreezeTransaction(gossipEventBytes: Buffer): boolean {
    for (const transactionBytes of PcesTrimmer.readAllLengthDelimitedFields(
      gossipEventBytes,
      GOSSIP_EVENT_TRANSACTIONS_FIELD_NUMBER,
    )) {
      const bodyBytes: Buffer | undefined = PcesTrimmer.readLengthDelimitedField(
        transactionBytes,
        SIGNED_TRANSACTION_BODY_BYTES_FIELD_NUMBER,
      );
      if (bodyBytes && PcesTrimmer.readLengthDelimitedField(bodyBytes, TRANSACTION_BODY_FREEZE_FIELD_NUMBER)) {
        return true;
      }
    }

    return false;
  }

  private static findPcesFilesInSequenceOrder(directory: string): string[] {
    const filePaths: string[] = [];
    PcesTrimmer.collectPcesFiles(directory, filePaths);

    // Sequence numbers are encoded as "_seqN_" in the filename and are contiguous per node;
    // events must be inspected in that order regardless of how the date subdirectories nest.
    filePaths.sort(
      (left: string, right: string): number =>
        PcesTrimmer.extractSequenceNumber(left) - PcesTrimmer.extractSequenceNumber(right),
    );
    return filePaths;
  }

  private static collectPcesFiles(directory: string, filePaths: string[]): void {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const entryPath: string = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        PcesTrimmer.collectPcesFiles(entryPath, filePaths);
      } else if (entry.isFile() && entry.name.endsWith('.pces')) {
        filePaths.push(entryPath);
      }
    }
  }

  private static extractSequenceNumber(pcesFilePath: string): number {
    const match: RegExpMatchArray | null = path.basename(pcesFilePath).match(/_seq(\d+)_/);
    return match ? Number(match[1]) : 0;
  }

  private static trimFileToBirthRound(pcesFilePath: string, maximumBirthRound: number): void {
    try {
      const fileBuffer: Buffer = fs.readFileSync(pcesFilePath);
      const truncateAtOffset: number | undefined = PcesTrimmer.findTruncationOffset(fileBuffer, maximumBirthRound);

      if (truncateAtOffset === undefined) {
        return;
      }

      if (truncateAtOffset <= 4) {
        fs.rmSync(pcesFilePath, {force: true});
        return;
      }

      fs.writeFileSync(pcesFilePath, fileBuffer.subarray(0, truncateAtOffset));
    } catch {
      // Best-effort trim: an unexpected or unrecognized PCES layout is left untouched rather
      // than risking corruption of a file the platform still needs to read on next startup.
    }
  }

  /**
   * Returns the byte offset of the first record whose birth round exceeds maximumBirthRound,
   * or undefined if the file does not need trimming (including when its header is not the
   * expected version, in which case it is left untouched rather than guessed at).
   */
  private static findTruncationOffset(fileBuffer: Buffer, maximumBirthRound: number): number | undefined {
    if (fileBuffer.length < 4 || fileBuffer.readInt32BE(0) !== PCES_PROTOBUF_EVENTS_VERSION) {
      return undefined;
    }

    let recordOffset: number = 4;
    while (recordOffset + 4 <= fileBuffer.length) {
      const recordLength: number = fileBuffer.readInt32BE(recordOffset);
      const recordStart: number = recordOffset + 4;
      if (recordLength < 0 || recordStart + recordLength > fileBuffer.length) {
        // A partial trailing record; nothing further to inspect.
        return undefined;
      }

      const recordBytes: Buffer = fileBuffer.subarray(recordStart, recordStart + recordLength);
      const birthRound: number | undefined = PcesTrimmer.readGossipEventBirthRound(recordBytes);
      if (birthRound !== undefined && birthRound > maximumBirthRound) {
        return recordOffset;
      }

      recordOffset = recordStart + recordLength;
    }

    return undefined;
  }

  /**
   * Reads GossipEvent.event_core.birth_round (field 1, then field 2 within it) directly from
   * the protobuf wire format. Only this one field is needed to decide whether an event belongs
   * before or after the restore boundary, so a full protobuf runtime is not required.
   */
  private static readGossipEventBirthRound(gossipEventBytes: Buffer): number | undefined {
    const eventCoreBytes: Buffer | undefined = PcesTrimmer.readLengthDelimitedField(
      gossipEventBytes,
      GOSSIP_EVENT_CORE_FIELD_NUMBER,
    );
    if (!eventCoreBytes) {
      return undefined;
    }

    return PcesTrimmer.readVarintField(eventCoreBytes, EVENT_CORE_BIRTH_ROUND_FIELD_NUMBER);
  }

  private static readLengthDelimitedField(messageBytes: Buffer, targetFieldNumber: number): Buffer | undefined {
    return PcesTrimmer.readAllLengthDelimitedFields(messageBytes, targetFieldNumber)[0];
  }

  /** Same field lookup as {@link readLengthDelimitedField}, but collects every occurrence — needed for repeated fields like GossipEvent.transactions. */
  private static readAllLengthDelimitedFields(messageBytes: Buffer, targetFieldNumber: number): Buffer[] {
    const matches: Buffer[] = [];
    let offset: number = 0;
    while (offset < messageBytes.length) {
      const tagRead: VarintRead = PcesTrimmer.readVarint(messageBytes, offset);
      const fieldNumber: number = Number(tagRead.value >> 3n);
      const wireType: number = Number(tagRead.value & 0x7n);
      offset = tagRead.nextOffset;

      if (fieldNumber === targetFieldNumber && wireType === WIRE_TYPE_LENGTH_DELIMITED) {
        const lengthRead: VarintRead = PcesTrimmer.readVarint(messageBytes, offset);
        const fieldStart: number = lengthRead.nextOffset;
        const fieldEnd: number = fieldStart + Number(lengthRead.value);
        matches.push(messageBytes.subarray(fieldStart, fieldEnd));
        offset = fieldEnd;
      } else {
        offset = PcesTrimmer.skipField(messageBytes, offset, wireType);
      }
    }

    return matches;
  }

  private static readVarintField(messageBytes: Buffer, targetFieldNumber: number): number | undefined {
    let offset: number = 0;
    while (offset < messageBytes.length) {
      const tagRead: VarintRead = PcesTrimmer.readVarint(messageBytes, offset);
      const fieldNumber: number = Number(tagRead.value >> 3n);
      const wireType: number = Number(tagRead.value & 0x7n);
      offset = tagRead.nextOffset;

      if (fieldNumber === targetFieldNumber && wireType === WIRE_TYPE_VARINT) {
        return Number(PcesTrimmer.readVarint(messageBytes, offset).value);
      }

      offset = PcesTrimmer.skipField(messageBytes, offset, wireType);
    }

    return undefined;
  }

  private static skipField(messageBytes: Buffer, offset: number, wireType: number): number {
    switch (wireType) {
      case WIRE_TYPE_VARINT: {
        return PcesTrimmer.readVarint(messageBytes, offset).nextOffset;
      }
      case WIRE_TYPE_FIXED64: {
        return offset + 8;
      }
      case WIRE_TYPE_LENGTH_DELIMITED: {
        const lengthRead: VarintRead = PcesTrimmer.readVarint(messageBytes, offset);
        return lengthRead.nextOffset + Number(lengthRead.value);
      }
      case WIRE_TYPE_FIXED32: {
        return offset + 4;
      }
      default: {
        throw new SoloErrors.internal.dataValidation('PCES protobuf wire type', '0, 1, 2, or 5', wireType);
      }
    }
  }

  private static readVarint(buffer: Buffer, offset: number): VarintRead {
    let result: bigint = 0n;
    let shift: bigint = 0n;
    let position: number = offset;

    while (position < buffer.length) {
      const currentByte: number = buffer[position];
      position++;
      result |= BigInt(currentByte & 0b0111_1111) << shift;
      if ((currentByte & 0b1000_0000) === 0) {
        return {value: result, nextOffset: position};
      }
      shift += 7n;
    }

    throw new SoloErrors.internal.dataValidation('PCES varint', 'a terminated varint', 'truncated bytes');
  }
}
