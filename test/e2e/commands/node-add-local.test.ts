// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';

import {testNodeAdd} from '../../test-add.js';
import {Duration} from '../../../src/core/time/duration.js';

describe('Node add with hedera local build', async (): Promise<void> => {
  const localBuildPath =
    'node1=../hiero-consensus-node/hedera-node/data/,../hiero-consensus-node/hedera-node/data,node3=../hiero-consensus-node/hedera-node/data';
  await testNodeAdd(localBuildPath);
}).timeout(Duration.ofMinutes(3).toMillis());
