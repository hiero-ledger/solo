---
title: "Using Environment Variables"
weight: 120
description: >
    Environment variables are used to customize the behavior of Solo. This document provides a list of environment variables that can be configured to change the default behavior.
type: docs
---

## Environment Variables Used in Solo

User can configure the following environment variables to customize the behavior of Solo.

> **Note:** This page was found to have lost its full historical content (it tracked as an empty
> file as of this writing). The table below documents only the `one-shot`/block-stream/mirror-pinger
> variables touched by recent work; a full restoration covering every `getEnvironmentVariable()` call
> site in `src/**/*.ts` is tracked separately.

### Table of environment variables

| Environment Variable               | Description                                                                                                                 | Default Value |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `ONE_SHOT_WITH_BLOCK_NODE`          | When `true`, `one-shot single deploy` also deploys a block node                                                              | `false`        |
| `ONE_SHOT_BLOCK_NODE_PERF`          | When `true`, applies the block node messaging workaround values (larger Disruptor ring buffer, ZGC, more resources) used to mitigate hiero-block-node#3150 gating backpressure during performance tests | `false`        |
| `ONE_SHOT_PERFORMANCE_TUNING`       | When `true`, layers a consensus-node timing overlay (`resources/templates/performance-tuning/`) on top of the small-memory profile used by `one-shot single deploy` for CN >= 0.72.0: lowers `blockStream.blockPeriod` and raises `event.creation.maxCreationRate` to reduce end-to-end mirror RTT in the E2E performance test suite. Changes no heap/thread setting, so it carries no additional memory cost | `false`        |
| `BLOCK_STREAM_STREAM_MODE`          | Overrides `blockStream.streamMode` on the consensus node (`RECORDS`, `BLOCKS`, or `BOTH`)                                    | `BOTH`         |
| `BLOCK_STREAM_WRITER_MODE`          | Overrides `blockStream.writerMode` on the consensus node                                                                     | `FILE_AND_GRPC`|
| `MIRROR_NODE_PINGER_TPS`            | Target transactions-per-second for the background mirror node pinger deployed via `--pinger`                                | `5`            |
