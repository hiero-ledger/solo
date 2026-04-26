// SPDX-License-Identifier: Apache-2.0

import {EN} from './en.js';
import {ES} from './es.js';
import {type LocaleData} from './locale-data.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';

const LOCALES: Readonly<Record<string, LocaleData>> = {en: EN, es: ES};
const DEFAULT_LOCALE: string = 'en';

export class LocaleRegistry {
  private static get(key: string): string | undefined {
    const locale: string = container.resolve(InjectTokens.SoloLocale);
    const data: LocaleData = LOCALES[locale] ?? LOCALES[DEFAULT_LOCALE]!;
    return data[key] ?? LOCALES[DEFAULT_LOCALE]![key];
  }

  /** Returns the message for the given locale key, optionally interpolating {{placeholder}} tokens. */
  public static getMessage(
    key: string,
    context?: Readonly<Record<string, string | number | boolean | undefined>>,
  ): string {
    const template: string = LocaleRegistry.get(key) ?? key;
    if (!context) {
      return template;
    }
    return template.replaceAll(/\{\{(\w+)\}\}/g, (_match: string, contextKey: string): string => {
      const value: string | number | boolean | undefined = context[contextKey];
      return value === undefined ? `{{${contextKey}}}` : String(value);
    });
  }

  /** Returns troubleshooting steps for the given locale key, split on newlines. */
  public static getTroubleshootingSteps(key: string): ReadonlyArray<string> | undefined {
    return LocaleRegistry.get(key)?.split('\n');
  }
}
