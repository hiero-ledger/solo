// SPDX-License-Identifier: Apache-2.0

import type net from 'node:net';

export interface ExtendedNetServer extends net.Server {
  localPort: number;
  info: string;
}
