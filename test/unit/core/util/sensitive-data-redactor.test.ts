// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {SensitiveDataRedactor} from '../../../../src/core/util/sensitive-data-redactor.js';

describe('SensitiveDataRedactor', (): void => {
  describe('isSensitiveKey', (): void => {
    it('should detect "password" as sensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('password')).to.be.true;
    });

    it('should detect "global.operator.password" as sensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('global.operator.password')).to.be.true;
    });

    it('should detect "secret" as sensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('db.secret')).to.be.true;
    });

    it('should detect "token" as sensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('auth-token')).to.be.true;
    });

    it('should detect "key" as sensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('my_key')).to.be.true;
    });

    it('should detect "credential" as sensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('user-credential')).to.be.true;
    });

    it('should detect "auth" as sensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('auth')).to.be.true;
    });

    it('should detect "api_key" as sensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('api_key')).to.be.true;
    });

    it('should detect "apikey" as sensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('apikey')).to.be.true;
    });

    it('should detect "api-key" as sensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('api-key')).to.be.true;
    });

    it('should detect "passphrase" as sensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('passphrase')).to.be.true;
    });

    it('should detect "certificate" as sensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('tls.certificate')).to.be.true;
    });

    it('should detect "private" as sensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('private')).to.be.true;
    });

    it('should detect "passwd" as sensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('db.passwd')).to.be.true;
    });

    it('should detect "privatekey" as sensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('privatekey')).to.be.true;
    });

    it('should detect "privateKey" (camelCase) as sensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('privateKey')).to.be.true;
    });

    it('should be case-insensitive', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('PASSWORD')).to.be.true;
      expect(SensitiveDataRedactor.isSensitiveKey('Secret')).to.be.true;
      expect(SensitiveDataRedactor.isSensitiveKey('API_KEY')).to.be.true;
    });

    it('should not flag non-sensitive keys', (): void => {
      expect(SensitiveDataRedactor.isSensitiveKey('name')).to.be.false;
      expect(SensitiveDataRedactor.isSensitiveKey('namespace')).to.be.false;
      expect(SensitiveDataRedactor.isSensitiveKey('values')).to.be.false;
      expect(SensitiveDataRedactor.isSensitiveKey('replicas')).to.be.false;
    });
  });

  describe('redactArguments', (): void => {
    describe('flag-based redaction', (): void => {
      it('should redact the value after --password', (): void => {
        const arguments_: string[] = ['--password', 'mySecret'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          flagsToRedactNextArgument: ['--password'],
        });
        expect(result).to.deep.equal(['--password', '******']);
      });

      it('should redact the value after -p', (): void => {
        const arguments_: string[] = ['-p', 'mySecret'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          flagsToRedactNextArgument: ['-p'],
        });
        expect(result).to.deep.equal(['-p', '******']);
      });

      it('should handle flag at end of array without a value', (): void => {
        const arguments_: string[] = ['--password'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          flagsToRedactNextArgument: ['--password'],
        });
        expect(result).to.deep.equal(['--password']);
      });

      it('should redact multiple flag-based values', (): void => {
        const arguments_: string[] = ['--password', 'secret1', '-p', 'secret2'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          flagsToRedactNextArgument: ['--password', '-p'],
        });
        expect(result).to.deep.equal(['--password', '******', '-p', '******']);
      });
    });

    describe('set-style redaction', (): void => {
      it('should redact sensitive key=value after --set', (): void => {
        const arguments_: string[] = ['--set', 'global.password=mySecret'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          setStyleFlags: ['--set'],
        });
        expect(result).to.deep.equal(['--set', 'global.password=******']);
      });

      it('should redact sensitive key=value after --set-string', (): void => {
        const arguments_: string[] = ['--set-string', 'auth-token=abc123'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          setStyleFlags: ['--set-string'],
        });
        expect(result).to.deep.equal(['--set-string', 'auth-token=******']);
      });

      it('should redact sensitive key=value after --set-file', (): void => {
        const arguments_: string[] = ['--set-file', 'tls.certificate=/path/to/cert'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          setStyleFlags: ['--set-file'],
        });
        expect(result).to.deep.equal(['--set-file', 'tls.certificate=******']);
      });

      it('should not redact non-sensitive key=value after --set', (): void => {
        const arguments_: string[] = ['--set', 'replicas=3'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          setStyleFlags: ['--set'],
        });
        expect(result).to.deep.equal(['--set', 'replicas=3']);
      });

      it('should pass through --set value without = sign unchanged', (): void => {
        const arguments_: string[] = ['--set', 'someValue'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          setStyleFlags: ['--set'],
        });
        expect(result).to.deep.equal(['--set', 'someValue']);
      });

      it('should handle --set at end of array', (): void => {
        const arguments_: string[] = ['--set'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          setStyleFlags: ['--set'],
        });
        expect(result).to.deep.equal(['--set']);
      });
    });

    describe('inline key=value redaction', (): void => {
      it('should redact inline sensitive key=value args', (): void => {
        const arguments_: string[] = ['some-token=abc', 'api_key=xyz'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_);
        expect(result).to.deep.equal(['some-token=******', 'api_key=******']);
      });

      it('should not redact inline non-sensitive key=value args', (): void => {
        const arguments_: string[] = ['name=myApp', 'replicas=3'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_);
        expect(result).to.deep.equal(['name=myApp', 'replicas=3']);
      });
    });

    describe('regex dynamic matching', (): void => {
      it('should redact credential via regex', (): void => {
        const arguments_: string[] = ['--set', 'db.credential=secretValue'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          setStyleFlags: ['--set'],
        });
        expect(result).to.deep.equal(['--set', 'db.credential=******']);
      });

      it('should redact passphrase via regex', (): void => {
        const arguments_: string[] = ['ssh.passphrase=myPhrase'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_);
        expect(result).to.deep.equal(['ssh.passphrase=******']);
      });

      it('should redact api-key via regex', (): void => {
        const arguments_: string[] = ['api-key=abc123'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_);
        expect(result).to.deep.equal(['api-key=******']);
      });

      it('should redact certificate via regex', (): void => {
        const arguments_: string[] = ['tls.certificate=base64data'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_);
        expect(result).to.deep.equal(['tls.certificate=******']);
      });

      it('should redact auth via regex', (): void => {
        const arguments_: string[] = ['--set', 'global.auth=bearerXYZ'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          setStyleFlags: ['--set'],
        });
        expect(result).to.deep.equal(['--set', 'global.auth=******']);
      });

      it('should redact private via regex', (): void => {
        const arguments_: string[] = ['private=data'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_);
        expect(result).to.deep.equal(['private=******']);
      });

      it('should redact privatekey via regex', (): void => {
        const arguments_: string[] = ['privatekey=data'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_);
        expect(result).to.deep.equal(['privatekey=******']);
      });
    });

    describe('nested dot-notation key redaction', (): void => {
      it('should redact deeply nested password key', (): void => {
        const arguments_: string[] = ['--set', 'something.something.password=123456'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          setStyleFlags: ['--set'],
        });
        expect(result).to.deep.equal(['--set', 'something.something.password=******']);
      });

      it('should redact deeply nested secret key', (): void => {
        const arguments_: string[] = ['--set', 'a.b.c.secret=topSecret'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          setStyleFlags: ['--set'],
        });
        expect(result).to.deep.equal(['--set', 'a.b.c.secret=******']);
      });

      it('should redact nested privatekey', (): void => {
        const arguments_: string[] = ['tls.privatekey=base64data'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_);
        expect(result).to.deep.equal(['tls.privatekey=******']);
      });

      it('should not redact nested non-sensitive key', (): void => {
        const arguments_: string[] = ['--set', 'config.server.replicas=3'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          setStyleFlags: ['--set'],
        });
        expect(result).to.deep.equal(['--set', 'config.server.replicas=3']);
      });
    });

    describe('combined options', (): void => {
      it('should handle both flag-based and set-style redaction together', (): void => {
        const arguments_: string[] = [
          'install',
          'my-release',
          '--password',
          's3cret',
          '--set',
          'global.operator.password=mySecretValue',
          '--set',
          'global.db.secret=abc123',
          '--namespace',
          'default',
        ];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          flagsToRedactNextArgument: ['--password'],
          setStyleFlags: ['--set'],
        });
        expect(result).to.deep.equal([
          'install',
          'my-release',
          '--password',
          '******',
          '--set',
          'global.operator.password=******',
          '--set',
          'global.db.secret=******',
          '--namespace',
          'default',
        ]);
      });
    });

    describe('edge cases', (): void => {
      it('should return empty array for empty input', (): void => {
        const result: string[] = SensitiveDataRedactor.redactArguments([]);
        expect(result).to.deep.equal([]);
      });

      it('should pass through args with no sensitive data unchanged', (): void => {
        const arguments_: string[] = ['install', 'my-release', '--namespace', 'default', '--values', 'values.yaml'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_);
        expect(result).to.deep.equal(['install', 'my-release', '--namespace', 'default', '--values', 'values.yaml']);
      });

      it('should use default options when none provided', (): void => {
        const arguments_: string[] = ['password=secret', 'name=test'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_);
        expect(result).to.deep.equal(['password=******', 'name=test']);
      });
    });

    describe('composite argument splitting', (): void => {
      it('should split and redact composite arguments containing multiple key-value pairs', (): void => {
        const arguments_: string[] = [
          '--set foo.bar=false --set foo.privateKey=0x123456 --set foo.bar.password=123456',
        ];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          setStyleFlags: ['--set'],
        });
        expect(result).to.deep.equal([
          '--set',
          'foo.bar=false',
          '--set',
          'foo.privateKey=******',
          '--set',
          'foo.bar.password=******',
        ]);
      });

      it('should split composite arguments with flags and values', (): void => {
        const arguments_: string[] = ['--values values.yaml --set foo.bar=false'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          setStyleFlags: ['--set'],
        });
        expect(result).to.deep.equal(['--values', 'values.yaml', '--set', 'foo.bar=false']);
      });

      it('should handle composite arguments with password flag', (): void => {
        const arguments_: string[] = ['--password secret123 --set foo.bar=false'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_, {
          flagsToRedactNextArgument: ['--password'],
          setStyleFlags: ['--set'],
        });
        expect(result).to.deep.equal(['--password', '******', '--set', 'foo.bar=false']);
      });

      it('should not split arguments that do not contain whitespace', (): void => {
        const arguments_: string[] = ['install', 'my-release', '--namespace', 'default'];
        const result: string[] = SensitiveDataRedactor.redactArguments(arguments_);
        expect(result).to.deep.equal(['install', 'my-release', '--namespace', 'default']);
      });
    });
  });
});
