// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import fc from 'fast-check';
import {ipV4ToBase64, isIpV4Address, parseIpAddressToUint8Array} from '../../../src/core/helpers.js';

type Octets = [number, number, number, number];

const octetArbitrary: fc.Arbitrary<number> = fc.nat({max: 255});
const octetsArbitrary: fc.Arbitrary<Octets> = fc.tuple(octetArbitrary, octetArbitrary, octetArbitrary, octetArbitrary);

function toDottedQuad(parts: number[]): string {
  return parts.join('.');
}

describe('IPv4 helpers property-based tests', (): void => {
  it('accepts, parses and encodes every dotted quad of octets in range', (): void => {
    fc.assert(
      fc.property(octetsArbitrary, (octets: Octets): void => {
        const address: string = toDottedQuad(octets);

        expect(isIpV4Address(address)).to.be.true;
        expect([...parseIpAddressToUint8Array(address)]).to.deep.equal(octets);

        const encoded: string = ipV4ToBase64(address);
        expect(encoded).to.match(/^[\d+/A-Za-z]{6}==$/);
        expect([...Buffer.from(encoded, 'base64')]).to.deep.equal(octets);
      }),
    );
  });

  it('rejects any dotted quad with an out-of-range octet', (): void => {
    const outOfRangeOctetArbitrary: fc.Arbitrary<number> = fc.integer({min: 256, max: 99_999});
    const invalidOctetsArbitrary: fc.Arbitrary<Octets> = fc
      .tuple(octetsArbitrary, outOfRangeOctetArbitrary, fc.nat({max: 3}))
      .map(([octets, outOfRange, position]: [Octets, number, number]): Octets => {
        const copy: Octets = [...octets];
        copy[position] = outOfRange;
        return copy;
      });

    fc.assert(
      fc.property(invalidOctetsArbitrary, (octets: Octets): void => {
        const address: string = toDottedQuad(octets);

        expect(isIpV4Address(address)).to.be.false;
        expect((): string => ipV4ToBase64(address)).to.throw(Error, 'Invalid IPv4 address');
      }),
    );
  });

  it('rejects any address that does not have exactly four parts', (): void => {
    const wrongLengthArbitrary: fc.Arbitrary<number[]> = fc
      .array(octetArbitrary, {maxLength: 6})
      .filter((parts: number[]): boolean => parts.length !== 4);

    fc.assert(
      fc.property(wrongLengthArbitrary, (parts: number[]): void => {
        const address: string = toDottedQuad(parts);

        expect(isIpV4Address(address)).to.be.false;
        expect((): string => ipV4ToBase64(address)).to.throw(Error, 'Invalid IPv4 address');
      }),
    );
  });

  it('encodes every string it accepts as an address into four decodable bytes', (): void => {
    fc.assert(
      fc.property(fc.string(), (input: string): void => {
        if (!isIpV4Address(input)) {
          return;
        }

        const decoded: number[] = [...Buffer.from(ipV4ToBase64(input), 'base64')];
        expect(decoded).to.have.lengthOf(4);
        expect(decoded).to.deep.equal([...parseIpAddressToUint8Array(input)]);
      }),
    );
  });
});
