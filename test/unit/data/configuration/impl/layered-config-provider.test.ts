// SPDX-License-Identifier: Apache-2.0

import {type ConfigProvider} from '../../../../../src/data/configuration/api/config-provider.js';
import {type Config} from '../../../../../src/data/configuration/api/config.js';
import {LayeredConfigProvider} from '../../../../../src/data/configuration/impl/layered-config-provider.js';
import {ClassToObjectMapper} from '../../../../../src/data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../../src/data/key/config-key-formatter.js';
import {expect} from 'chai';
import {ConfigurationError} from '../../../../../src/data/configuration/api/configuration-error.js';

describe('LayeredConfigProvider', (): void => {
  const mapper: ClassToObjectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());

  it('should not throw an error when registering a valid initial config (issue #2094)', (): void => {
    const provider: ConfigProvider = new LayeredConfigProvider(mapper, 'SOLO');
    expect(provider).is.not.null.and.not.undefined;
    expect((): Config => provider.config()).to.throw(ConfigurationError);

    const config: Config = provider.builder().build();
    expect((): Config => provider.config()).to.not.throw();

    expect((): void => provider.register(config)).to.throw(ConfigurationError);
    expect((): Config => provider.config()).to.not.throw();
  });
});
