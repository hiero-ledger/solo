#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

# ------------------------------------------------------------------------------
# image_cache_manifest.sh
#
# Purpose:
#   Build the image cache manifest (`cache-manifest.json`) of a Solo release
#   from the index image_cache_export.sh writes. The CLI downloads this
#   manifest from the release to find the archives it may cache.
#
# Usage:
#   ./image_cache_manifest.sh <image-cache-images.json> <solo-version> <output-manifest>
#
# Environment variables:
#   IMAGE_CACHE_CDN_BASE_URL
#     Optional. When set, every archive and hash file in the index must be
#     served from <base>/<file name>, the archive with the size the index
#     records and the hash file holding the index's SHA-256, or no manifest is
#     written. Unset skips the check, for dry runs that upload nothing.
#
# Behavior:
#   1) Check the index against the rules the CLI enforces on a manifest
#      (CacheManifestClient), so a manifest the CLI would reject is never
#      published.
#   2) Confirm the CDN serves every archive and hash file, when asked to.
#   3) Write { schemaVersion: 2, soloVersion, images } to <output-manifest>.
# ------------------------------------------------------------------------------

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <image-cache-images.json> <solo-version> <output-manifest>" >&2
  exit 1
fi

index="$1"
solo_version="${2#v}"
output_manifest="$3"
cdn_base_url="${IMAGE_CACHE_CDN_BASE_URL:-}"
cdn_base_url="${cdn_base_url%/}"
schema_version=2

if [[ ! -s "${index}" ]]; then
  echo "::error::Image cache index not found or empty: ${index}" >&2
  exit 1
fi

if [[ ! "${solo_version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
  echo "::error::'${2}' is not a Solo version" >&2
  exit 1
fi

# 1) The CLI's manifest rules, applied to each index entry.
invalid_entries="$(jq -c '
  def bare_file_name: type == "string" and length > 0 and (test("[/\\\\]") | not) and (contains("..") | not);
  def valid:
    (.image | type == "string" and length > 0)
    and (.platform | type == "string" and test("^[0-9a-z]+/[0-9a-z]+(/[0-9a-z]+)?$"))
    and (.tarFile | bare_file_name)
    and (.hashFile | bare_file_name)
    and (.sha256 | type == "string" and test("^[0-9a-f]{64}$"))
    and (.size | type == "number" and . >= 0 and . == floor);
  if type != "array" or length == 0 then ["the index must be a non-empty array"]
  else
    [.[] | select(valid | not)]
    + [group_by([.image, .platform])[] | select(length > 1) | "\(.[0].image) is listed twice for \(.[0].platform)"]
  end
' "${index}")"

if [[ "${invalid_entries}" != "[]" ]]; then
  echo "::error::The image cache index breaks the manifest rules:" >&2
  jq . <<< "${invalid_entries}" >&2
  exit 1
fi

# 2) Every archive and hash file must already be on the CDN, unchanged.
if [[ -n "${cdn_base_url}" ]]; then
  failures=0
  while IFS=$'\t' read -r tar_file hash_file sha256 size; do
    if ! headers="$(curl -fsSI --retry 3 "${cdn_base_url}/${tar_file}")"; then
      echo "::error::${cdn_base_url}/${tar_file} is not on the CDN" >&2
      failures=$((failures + 1))
      continue
    fi
    served_size="$(tr -d '\r' <<< "${headers}" | awk 'tolower($1) == "content-length:" { size = $2 } END { print size }')"
    if [[ "${served_size}" != "${size}" ]]; then
      echo "::error::${cdn_base_url}/${tar_file} is ${served_size:-of unknown size} bytes, the index records ${size}" >&2
      failures=$((failures + 1))
    fi

    if ! published_hash="$(curl -fsS --retry 3 "${cdn_base_url}/${hash_file}")"; then
      echo "::error::${cdn_base_url}/${hash_file} is not on the CDN" >&2
      failures=$((failures + 1))
      continue
    fi
    # The CLI reads the first token, so both a bare digest and `sha256sum` output are accepted.
    read -r published_hash _ <<< "${published_hash}"
    if [[ "${published_hash,,}" != "${sha256}" ]]; then
      echo "::error::${cdn_base_url}/${hash_file} holds ${published_hash}, the index records ${sha256}" >&2
      failures=$((failures + 1))
    fi
  done < <(jq -r '.[] | [.tarFile, .hashFile, .sha256, (.size | tostring)] | @tsv' "${index}")

  if [[ "${failures}" -gt 0 ]]; then
    echo "::error::${failures} CDN check(s) failed; the manifest was not written" >&2
    exit 1
  fi
  echo "Every archive and hash file is on ${cdn_base_url}."
else
  echo "::notice::IMAGE_CACHE_CDN_BASE_URL is not set; the CDN was not checked."
fi

# 3) The manifest, with the index entries in a stable order.
jq --arg soloVersion "${solo_version}" --argjson schemaVersion "${schema_version}" '{
  schemaVersion: $schemaVersion,
  soloVersion: $soloVersion,
  images: (map({image, platform, tarFile, hashFile, sha256, size}) | sort_by(.image, .platform))
}' "${index}" > "${output_manifest}"

echo "Wrote ${output_manifest}: $(jq '.images | length' "${output_manifest}") archives for Solo ${solo_version}."
