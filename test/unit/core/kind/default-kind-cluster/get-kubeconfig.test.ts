// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {DefaultKindClient} from '../../../../../src/integration/kind/impl/default-kind-client.js';
import {GetKubeConfigResponse} from '../../../../../src/integration/kind/model/get-kubeconfig/get-kubeconfig-response.js';
import {type KindExecution} from '../../../../../src/integration/kind/execution/kind-execution.js';
import {type GetKubeConfigOptions} from '../../../../../src/integration/kind/model/get-kubeconfig/get-kubeconfig-options.js';

type ExecuteInternalFake = (
  namespace: unknown,
  request: unknown,
  responseClass: unknown,
  responseFunction: (execution: KindExecution, responseClass: unknown) => Promise<GetKubeConfigResponse>,
) => Promise<GetKubeConfigResponse>;

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

describe('DefaultKindClient - getKubeConfig', (): void => {
  let client: DefaultKindClient;
  let mockExecution: KindExecution;

  beforeEach((): void => {
    client = new DefaultKindClient('/usr/local/bin/kind');

    // Mock the KindExecution that will be returned from the builder
    mockExecution = {
      // @ts-expect-error TS2554: Expected 0 arguments, but got 1
      responseAs: sinon.stub().resolves(new GetKubeConfigResponse(getSampleKubeConfig())),
    } as unknown as KindExecution;

    const executeInternalFake: ExecuteInternalFake = (
      _namespace: unknown,
      request: unknown,
      responseClass: unknown,
      responseFunction: (execution: KindExecution, responseClass: unknown) => Promise<GetKubeConfigResponse>,
    ): Promise<GetKubeConfigResponse> => {
      return responseFunction(mockExecution, responseClass);
    };
    // @ts-ignore - Replace the constructor
    sinon.stub(client, 'executeInternal').callsFake(executeInternalFake);
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('should get kubeconfig with default parameters', async (): Promise<void> => {
    const result: GetKubeConfigResponse = await client.getKubeConfig();

    expect(result).to.be.instanceOf(GetKubeConfigResponse);
    expect(result.config).to.not.be.undefined;
    expect(result.rawOutput).to.include('apiVersion: v1');
  });

  it('should get kubeconfig for a specified cluster name', async (): Promise<void> => {
    const result: GetKubeConfigResponse = await client.getKubeConfig('test-cluster');

    expect(result).to.be.instanceOf(GetKubeConfigResponse);
  });

  it('should get kubeconfig with internal flag set', async (): Promise<void> => {
    const options: GetKubeConfigOptions = {
      name: 'test-cluster',
      internal: true,
    } as GetKubeConfigOptions;

    const result: GetKubeConfigResponse = await client.getKubeConfig('test-cluster', options);

    expect(result).to.be.instanceOf(GetKubeConfigResponse);
  });

  it('should parse kubeconfig data correctly', async (): Promise<void> => {
    const result: GetKubeConfigResponse = await client.getKubeConfig();

    expect(result.config).to.not.be.undefined;
    expect(result.config.apiVersion).to.equal('v1');
    expect(result.config.kind).to.equal('Config');
    expect(result.config.clusters).to.be.an('array');
    expect(result.config.contexts).to.be.an('array');
    expect(result.config.users).to.be.an('array');
  });

  it('should handle error when parsing invalid YAML', async (): Promise<void> => {
    try {
      // @ts-expect-error TS2554: Expected 0 arguments, but got 1
      new GetKubeConfigResponse('invalid: yaml: {');
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.include('Error parsing kubeconfig YAML');
    }
  });
});
