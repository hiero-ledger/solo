#!/bin/bash

PROTO_DIR=$(dirname "$(realpath $0)")

# block-access, getBlock --> should work as is.
grpcurl -plaintext \
  -import-path "$PROTO_DIR" \
  -proto "$PROTO_DIR/block_access_service.proto" \
  -d '{"retrieveLatest": true}' \
  localhost:8080 \
  org.hiero.block.api.BlockAccessService/getBlock
CALL1_RC=$?

# subscriber, needs a fix before working.
grpcurl -plaintext \
  -import-path "$PROTO_DIR" \
  -proto "$PROTO_DIR/block_stream_subscribe_service.proto" \
  -d '{"startBlockNumber": 0, "endBlockNumber": 10}' \
  localhost:8080 \
  org.hiero.block.api.BlockStreamSubscribeService/subscribeBlockStream
CALL2_RC=$?

if [[ $CALL1_RC -ne 0 || $CALL2_RC -ne 0 ]]; then
  echo "Job failed block-access: ${CALL1_RC}, subscriber: ${CALL2_RC}"
  exit 1
fi
