#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

# ------------------------------------------------------------------------------
# image_cache_upload.sh
#
# Purpose:
#   Upload the image cache archives image_cache_export.sh wrote, and their
#   `.sha256` hash files, to the CDN bucket. The CDN layout is flat: every file
#   is stored at gs://<bucket>/<file name>.
#
# Usage:
#   ./image_cache_upload.sh <image-cache-directory> <bucket>
#
#   <image-cache-directory> holds the archives, their hash files and
#   image-cache-images.json, as image_cache_export.sh writes them.
#
# Behavior, for each archive and then its hash file:
#   1) Absent from the bucket            -> upload it.
#   2) Present with the same content     -> skip it.
#   3) Present with different content    -> report it and fail once every file
#                                           has been checked.
#
#   A published file is never replaced. Content is compared by the MD5 Cloud
#   Storage records for each object, so nothing is downloaded, and every upload
#   is conditional on the object not existing yet, so a concurrent run cannot
#   be overwritten either. Uploading the archive before its hash file means a
#   hash file on the CDN always has its archive next to it.
#
#   Requires gcloud signed in with permission to read and create objects in
#   the bucket.
# ------------------------------------------------------------------------------

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <image-cache-directory> <bucket>" >&2
  exit 1
fi

image_cache_directory="$1"
bucket="$2"
index="${image_cache_directory}/image-cache-images.json"

if [[ ! -s "${index}" ]]; then
  echo "::error::Image cache index not found or empty: ${index}" >&2
  exit 1
fi

# A parallel composite upload stores an object without an MD5, which would leave nothing to compare against.
export CLOUDSDK_STORAGE_PARALLEL_COMPOSITE_UPLOAD_ENABLED=False

describe_errors="$(mktemp)"
trap 'rm -f "${describe_errors}"' EXIT

uploaded=0
skipped=0
mismatched=0

# Upload <file> as gs://<bucket>/<name> unless an object by that name exists; an existing object passes only
# when its content matches.
publish() {
  local file="$1" name="$2" content_type="$3" object="gs://${bucket}/$2" local_md5 remote_md5 describe_error

  if [[ ! -f "${file}" ]]; then
    echo "::error::${file} is listed in the index but was not exported" >&2
    return 1
  fi
  local_md5="$(openssl dgst -md5 -binary "${file}" | base64)"

  # stdout carries only the MD5; warnings on stderr must not be mistaken for it.
  if remote_md5="$(gcloud storage objects describe "${object}" --format='value(md5_hash)' 2> "${describe_errors}")"; then
    if [[ "${remote_md5}" == "${local_md5}" ]]; then
      echo "skipped   ${name} (already published, content matches)"
      skipped=$((skipped + 1))
    else
      echo "::error::${object} already exists with different content (MD5 ${remote_md5:-none}, this run ${local_md5}); a published file is never replaced" >&2
      mismatched=$((mismatched + 1))
    fi
    return 0
  fi

  describe_error="$(cat "${describe_errors}")"
  if ! grep -qiE 'not found|404' <<< "${describe_error}"; then
    echo "::error::cannot check ${object}: ${describe_error}" >&2
    return 1
  fi

  gcloud storage cp --if-generation-match=0 --content-type="${content_type}" "${file}" "${object}"
  echo "uploaded  ${name}"
  uploaded=$((uploaded + 1))
}

while IFS=$'\t' read -r tar_file hash_file; do
  echo "::group::${tar_file}"
  publish "${image_cache_directory}/${tar_file}" "${tar_file}" 'application/x-tar'
  publish "${image_cache_directory}/${hash_file}" "${hash_file}" 'text/plain'
  echo "::endgroup::"
done < <(jq -r '.[] | [.tarFile, .hashFile] | @tsv' "${index}")

echo "gs://${bucket}: ${uploaded} uploaded, ${skipped} already published, ${mismatched} conflicting."

if [[ "${mismatched}" -gt 0 ]]; then
  echo "::error::${mismatched} file(s) already on the CDN differ from this run's; see the errors above" >&2
  exit 1
fi
