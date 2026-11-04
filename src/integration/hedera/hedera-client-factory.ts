// SPDX-License-Identifier: Apache-2.0

import {type Client} from '@hiero-ledger/sdk';
import {type HederaClient} from './hedera-client.js';
import {type HederaClientOptions} from './hedera-client-options.js';

export interface HederaClientFactory {
  /**
   * Creates a client for the given network
   * @param options - the network and the client settings
   */
  create(options: HederaClientOptions): HederaClient;

  /**
   * Wraps an SDK client that was created elsewhere
   * @deprecated transitional seam for code that still threads an SDK client through its configuration; the wrapper
   * shares the SDK client, so closing one closes the other
   * @param sdkClient - the SDK client to wrap
   */
  wrap(sdkClient: Client): HederaClient;
}
