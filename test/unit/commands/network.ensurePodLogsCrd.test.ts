// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import fs from 'node:fs';
import sinon from 'sinon';

import {NetworkCommand as NC} from '../../../src/commands/network.js';

describe('NetworkCommand.ensurePodLogsCrd - defensive fetch handling', () => {
  const tmp = '/tmp/podlogs-crd-test.yaml';
  beforeEach(() => {
    sinon.restore();
    if (fs.existsSync(tmp)) fs.rmSync(tmp);
  });
  afterEach(() => {
    sinon.restore();
    if (fs.existsSync(tmp)) fs.rmSync(tmp);
  });

  it('accepts a string response from fetch', async () => {
    // mock global fetch to return a raw string
    // @ts-ignore
    global.fetch = sinon.fake.resolves('kind: CustomResourceDefinition\nmetadata:\n  name: podlogs.monitoring.grafana.com');

    // call the private method via casting (we only need behavior, not full K8 client)
    const cmd: any = new NC();
    const spyWrite = sinon.stub(fs, 'writeFileSync').callsFake(() => {});

    // call the method and ensure no exception thrown
    await cmd['ensurePodLogsCrd']({contexts: ['ctx']});

    expect(spyWrite.called).to.be.true;
  });

  it('handles a fetch mock that returns an object without text()', async () => {
    // mock fetch to return an object with body string
    // @ts-ignore
    global.fetch = sinon.fake.resolves({ok: true, body: 'crd: body string'});

    const cmd: any = new NC();
    const spyWrite = sinon.stub(fs, 'writeFileSync').callsFake(() => {});

    await cmd['ensurePodLogsCrd']({contexts: ['ctx']});

    expect(spyWrite.called).to.be.true;
  });

  it('throws a helpful error when fetch returns empty', async () => {
    // @ts-ignore
    global.fetch = sinon.fake.resolves(null);
    const cmd: any = new NC();

    await expect(cmd['ensurePodLogsCrd']({contexts: ['ctx']})).to.eventually.be.rejectedWith(
      /empty response from/,
    );
  });
});
