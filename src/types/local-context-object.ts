// SPDX-License-Identifier: Apache-2.0

import type * as WebSocket from 'ws';

export interface LocalContextObject {
  reject: (reason?: any) => void;
  connection: WebSocket.WebSocket;
  errorMessage: string;
}
