// SPDX-License-Identifier: Apache-2.0

import type * as x509 from '@peculiar/x509';
import type crypto from 'node:crypto';

export interface NodeKeyObject {
  privateKey: crypto.webcrypto.CryptoKey;
  certificate: x509.X509Certificate;
  certificateChain: x509.X509Certificates;
}
