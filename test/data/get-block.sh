#!/bin/bash

PROTO_DIR=$(dirname "$(realpath $0)")/proto

# block-access, getBlock --> should work as is.
grpcurl -plaintext \
  -import-path "$PROTO_DIR" \
  -proto "$PROTO_DIR/block_access_service.proto" \
  -d '{"retrieveLatest": true}' \
  localhost:8080 \
  org.hiero.block.api.BlockAccessService/getBlock
RC=$?

if [[ $RC -ne 0 ]]; then
  echo "Job failed block-access: ${RC}"
  exit 1
fi
