#!/bin/bash

PROTO_DIR=$(dirname "$(realpath $0)")

# block-access, getBlock --> should work as is.
grpcurl -plaintext \
  -import-path "$PROTO_DIR" \
  -proto "$PROTO_DIR/block_access_service.proto" \
  -d '{"retrieveLatest": true}' \
  localhost:8080 \
  org.hiero.block.api.BlockAccessService/getBlock

# subscriber, needs a fix before working.
grpcurl -plaintext \
  -import-path "$PROTO_DIR" \
  -proto "$PROTO_DIR/block_stream_subscribe_service.proto" \
  -d '{"startBlockNumber": 0, "endBlockNumber": 10}' \
  localhost:8080 \
  org.hiero.block.api.BlockStreamSubscribeService/subscribeBlockStream
