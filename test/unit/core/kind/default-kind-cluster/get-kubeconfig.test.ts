// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {DefaultKindClient} from '../../../../../src/integration/kind/impl/default-kind-client.js';
import {GetKubeConfigResponse} from '../../../../../src/integration/kind/model/get-kubeconfig/get-kubeconfig-response.js';
import {type KindExecution} from '../../../../../src/integration/kind/execution/kind-execution.js';
import {type GetKubeConfigOptions} from '../../../../../src/integration/kind/model/get-kubeconfig/get-kubeconfig-options.js';

describe('DefaultKindClient - getKubeConfig', () => {
  let client: DefaultKindClient;
  let mockExecution: KindExecution;

  beforeEach(() => {
    client = new DefaultKindClient('/usr/local/bin/kind');

    // Mock the KindExecution that will be returned from the builder
    mockExecution = {
      // @ts-expect-error TS2554: Expected 0 arguments, but got 1
      responseAs: sinon.stub().resolves(new GetKubeConfigResponse(getSampleKubeConfig())),
    } as unknown as KindExecution;

    // @ts-ignore - Replace the constructor
    sinon.stub(client, 'executeInternal').callsFake((_namespace, request, responseClass, responseFunction) => {
      return responseFunction(mockExecution, responseClass);
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should get kubeconfig with default parameters', async () => {
    const result: GetKubeConfigResponse = await client.getKubeConfig();

    expect(result).to.be.instanceOf(GetKubeConfigResponse);
    expect(result.config).to.not.be.undefined;
    expect(result.rawOutput).to.include('apiVersion: v1');
  });

  it('should get kubeconfig for a specified cluster name', async () => {
    const result: GetKubeConfigResponse = await client.getKubeConfig('test-cluster');

    expect(result).to.be.instanceOf(GetKubeConfigResponse);
  });

  it('should get kubeconfig with internal flag set', async () => {
    const options: GetKubeConfigOptions = {
      name: 'test-cluster',
      internal: true,
    } as GetKubeConfigOptions;

    const result = await client.getKubeConfig('test-cluster', options);

    expect(result).to.be.instanceOf(GetKubeConfigResponse);
  });

  it('should parse kubeconfig data correctly', async () => {
    const result = await client.getKubeConfig();

    expect(result.config).to.not.be.undefined;
    expect(result.config.apiVersion).to.equal('v1');
    expect(result.config.kind).to.equal('Config');
    expect(result.config.clusters).to.be.an('array');
    expect(result.config.contexts).to.be.an('array');
    expect(result.config.users).to.be.an('array');
  });

  it('should handle error when parsing invalid YAML', async () => {
    try {
      // @ts-expect-error TS2554: Expected 0 arguments, but got 1
      new GetKubeConfigResponse('invalid: yaml: {');
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.include('Error parsing kubeconfig YAML');
    }
  });

  // Helper function to generate a sample kubeconfig YAML response
  function getSampleKubeConfig(): string {
    return `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: xxxxxxxxxxx
    server: https://127.0.0.1:6443
  name: kind-test-cluster
contexts:
- context:
    cluster: kind-test-cluster
    user: kind-test-cluster
  name: kind-test-cluster
current-context: kind-test-cluster
kind: Config
preferences: {}
users:
- name: kind-test-cluster
  user:
    client-certificate-data: xxxxxxxxxxx
    client-key-data: xxxxxxxxxxx`;
  }
});
