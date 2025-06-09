// SPDX-License-Identifier: Apache-2.0

import {ClassToObjectMapper} from '../../../../../src/data/mapper/impl/class-to-object-mapper.js';
import {ConfigKeyFormatter} from '../../../../../src/data/key/config-key-formatter.js';
import {UserIdentitySchema} from '../../../../../src/data/schema/model/common/user-identity-schema.js';
import {expect} from 'chai';

describe('ClassToObjectMapper', (): void => {
  const mapper: ClassToObjectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());

  it('should map class to object with missing field', (): void => {
    const user: object = {
      name: 'John Doe',
    };

    const schema: UserIdentitySchema = mapper.fromObject(UserIdentitySchema, user);
    expect(schema).to.be.not.null;
    expect(schema).to.be.instanceOf(UserIdentitySchema);
    expect(schema.name).to.equal('John Doe');
    expect(schema.hostname).to.be.undefined;
  });
});
