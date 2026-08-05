// SPDX-License-Identifier: Apache-2.0

import {describe, afterEach} from 'mocha';
import sinon from 'sinon';

describe('DefaultOneShotDestroyOrchestrator', (): void => {
  afterEach((): void => {
    sinon.restore();
  });
});
