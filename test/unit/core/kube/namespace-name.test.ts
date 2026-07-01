// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';

import {NamespaceNameInvalidError} from '../../../../src/integration/kube/errors/namespace-name-invalid-error.js';

describe('Namespace Name', (): void => {
  it('should throw an error if namespace is not valid', (): void => {
    const namespaceName: string = 'node=/invalid/path';

    expect((): NamespaceName => NamespaceName.of(namespaceName)).to.throw(
      NamespaceNameInvalidError,
      NamespaceNameInvalidError.NAMESPACE_NAME_INVALID(namespaceName),
    );
  });

  it('should match a NamespaceName', (): void => {
    const namespaceName: string = 'valid-namespace';
    const namespace: NamespaceName = NamespaceName.of(namespaceName);
    const namespaces: NamespaceName[] = [namespace];

    expect(namespaces.some((ns): boolean => ns.equals(NamespaceName.of(namespaceName)))).to.be.true;
  });

  it('should not match a NamespaceName', (): void => {
    const namespaceName: string = 'valid-namespace';
    const namespace: NamespaceName = NamespaceName.of(namespaceName);
    const namespaces: NamespaceName[] = [namespace];

    expect(namespaces.some((ns): boolean => ns.equals(NamespaceName.of('invalid-namespace')))).to.be.false;
  });
});
