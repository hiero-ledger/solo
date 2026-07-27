#!/bin/bash

PROTO_DIR=$(dirname "$(realpath $0)")/proto

# Use --warning=no-unknown-keyword (GNU tar) on Linux and Windows (Git Bash/MINGW/MSYS).
# macOS ships BSD tar which does not support --warning, so skip it there.
case "$(uname -s)" in
  Darwin*)
    tar -xzf proto.zip -C proto
    ;;
  *)
    tar --warning=no-unknown-keyword -xzf proto.zip -C proto
    ;;
esac
RC=$?
if [[ $RC -ne 0 ]]; then
  echo "Failed to extract proto files: ${RC}"
  exit 1
fi

# block-access, getBlock --> should work as is.
grpcurl -plaintext \
  -import-path "$PROTO_DIR" \
  -proto "$PROTO_DIR/block_access_service.proto" \
  -d '{"retrieveLatest": true}' \
  localhost:40840 \
  org.hiero.block.api.BlockAccessService/getBlock
RC=$?

if [[ $RC -ne 0 ]]; then
  echo "Job failed block-access: ${RC}"
  exit 1
fi
