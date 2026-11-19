// SPDX-License-Identifier: Apache-2.0

import crypto from 'node:crypto';
import fs from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {verify, type Bundle} from 'sigstore';
import {GitHubApiClient} from '../github-api-client.js';
import * as constants from '../constants.js';
import {SoloErrors} from '../errors/solo-errors.js';
import {Duration} from '../time/duration.js';
import {PathEx} from '../../business/utils/path-ex.js';

/**
 * Finds, downloads and verifies Solo release assets for `solo update`.
 *
 * The latest release comes from the `releases/latest` redirect rather than `api.github.com`, which is rate
 * limited to 60 requests an hour per IP address. Every download is checked against `SHA256SUMS`, and that
 * manifest is checked against its Sigstore bundle, which must come from the release-signing workflow on `main`.
 */
export class SelfUpdateReleaseClient {
  public static readonly REPOSITORY_URL: string = 'https://github.com/hiero-ledger/solo';
  public static readonly RELEASES_URL: string = `${SelfUpdateReleaseClient.REPOSITORY_URL}/releases`;

  private static readonly CHECKSUMS_ASSET: string = 'SHA256SUMS';
  private static readonly TAG_PATTERN: RegExp = /\/releases\/tag\/(v\d+\.\d+\.\d+[^/?#]*)$/;
  private static readonly CHECKSUM_LINE_PATTERN: RegExp = /^([\da-f]{64}) [ *](\S+)$/;
  private static readonly SIGNER_ISSUER: string = 'https://token.actions.githubusercontent.com';
  private static readonly SIGNER_IDENTITY: string = String.raw`^https://github\.com/hiero-ledger/solo/\.github/workflows/flow-sign-release-assets\.yaml@refs/heads/main$`;
  private static readonly LOOKUP_TIMEOUT: Duration = Duration.ofSeconds(10);

  private constructor() {}

  /** Returns the tag of the release GitHub marks as latest, for example `v0.97.0`. */
  public static async resolveLatestTag(): Promise<string> {
    const url: string = `${SelfUpdateReleaseClient.RELEASES_URL}/latest`;
    let location: string | null;
    try {
      const response: Response = await fetch(url, {
        redirect: 'manual',
        headers: {'User-Agent': constants.SOLO_USER_AGENT_HEADER},
        signal: AbortSignal.timeout(SelfUpdateReleaseClient.LOOKUP_TIMEOUT.toMillis()),
      });
      location = response.headers.get('location');
    } catch (error) {
      throw new SoloErrors.system.selfUpdateDownloadFailed(url, error as Error);
    }

    const tag: string | undefined = location ? SelfUpdateReleaseClient.TAG_PATTERN.exec(location)?.[1] : undefined;
    if (!tag) {
      throw new SoloErrors.system.selfUpdateDownloadFailed(url);
    }
    return tag;
  }

  /**
   * Downloads `SHA256SUMS` and its Sigstore bundle for a release, verifies the signature, and returns the
   * SHA-256 of each listed asset keyed by asset name.
   */
  public static async fetchVerifiedChecksums(tag: string): Promise<Map<string, string>> {
    const manifestUrl: string = SelfUpdateReleaseClient.assetUrl(tag, SelfUpdateReleaseClient.CHECKSUMS_ASSET);
    const manifest: Buffer = Buffer.from(await SelfUpdateReleaseClient.downloadBytes(manifestUrl));
    const bundleText: string = Buffer.from(
      await SelfUpdateReleaseClient.downloadBytes(`${manifestUrl}.sigstore.json`),
    ).toString('utf8');

    try {
      await verify(JSON.parse(bundleText) as Bundle, manifest, {
        certificateIssuer: SelfUpdateReleaseClient.SIGNER_ISSUER,
        certificateIdentityURI: SelfUpdateReleaseClient.SIGNER_IDENTITY,
        tufCachePath: PathEx.join(constants.SOLO_CACHE_DIR, 'sigstore-tuf'),
      });
    } catch (error) {
      throw new SoloErrors.system.selfUpdateVerificationFailed(
        tag,
        `the ${SelfUpdateReleaseClient.CHECKSUMS_ASSET} signature is not valid (${(error as Error).message})`,
      );
    }

    return SelfUpdateReleaseClient.parseChecksums(manifest.toString('utf8'));
  }

  /** Downloads a release asset to `destination`. The caller removes a partly written file on failure. */
  public static async downloadAsset(tag: string, assetName: string, destination: string): Promise<void> {
    const url: string = SelfUpdateReleaseClient.assetUrl(tag, assetName);
    const response: Response = await GitHubApiClient.get(url);
    if (!response.body) {
      throw new SoloErrors.system.selfUpdateDownloadFailed(url);
    }
    try {
      await pipeline(
        response.body as unknown as AsyncIterable<Uint8Array>,
        fs.createWriteStream(destination, {mode: 0o755}),
      );
    } catch (error) {
      throw new SoloErrors.system.selfUpdateDownloadFailed(url, error as Error);
    }
  }

  /** Returns the lowercase hex SHA-256 of a file. */
  public static async sha256(filePath: string): Promise<string> {
    const hash: crypto.Hash = crypto.createHash('sha256');
    await pipeline(fs.createReadStream(filePath), hash);
    return hash.digest('hex');
  }

  /** Parses `sha256sum` output (`<hex>  <name>` per line) into a map from asset name to hash. */
  public static parseChecksums(text: string): Map<string, string> {
    const checksums: Map<string, string> = new Map<string, string>();
    for (const line of text.split('\n')) {
      const match: RegExpExecArray | null = SelfUpdateReleaseClient.CHECKSUM_LINE_PATTERN.exec(line.trim());
      if (match) {
        checksums.set(match[2], match[1]);
      }
    }
    return checksums;
  }

  private static assetUrl(tag: string, assetName: string): string {
    return `${SelfUpdateReleaseClient.RELEASES_URL}/download/${tag}/${assetName}`;
  }

  private static async downloadBytes(url: string): Promise<ArrayBuffer> {
    const response: Response = await GitHubApiClient.get(url, {timeout: Duration.ofMinutes(1)});
    try {
      return await response.arrayBuffer();
    } catch (error) {
      throw new SoloErrors.system.selfUpdateDownloadFailed(url, error as Error);
    }
  }
}
