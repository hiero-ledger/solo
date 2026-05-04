// SPDX-License-Identifier: Apache-2.0

import {EnLocale} from './en.js';
import {EsLocale} from './es.js';
import {type LocaleValue} from './locale-data.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';

type LocaleClass = typeof EnLocale;
export type LocaleKey = {[K in keyof LocaleClass]: LocaleClass[K] extends LocaleValue ? K : never}[keyof LocaleClass];

type LocaleData = {[K in LocaleKey]: LocaleValue};

const LOCALES: Readonly<Record<string, LocaleData>> = {en: EnLocale, es: EsLocale};
const DEFAULT_LOCALE: string = 'en';

export class LocaleRegistry {
  private static get(key: LocaleKey): LocaleValue {
    const locale: string = container.resolve(InjectTokens.SoloLocale);
    const data: LocaleData = LOCALES[locale] ?? LOCALES[DEFAULT_LOCALE]!;
    return data[key];
  }

  /** Returns the message for the given locale key, optionally interpolating {{placeholder}} tokens. */
  public static getMessage(
    key: LocaleKey,
    context?: Readonly<Record<string, string | number | boolean | undefined>>,
  ): string {
    const raw: LocaleValue = LocaleRegistry.get(key);
    const template: string = typeof raw === 'string' ? raw : raw.message;
    if (!context) {
      return template;
    }
    return template.replaceAll(/\{\{(\w+)\}\}/g, (_match: string, contextKey: string): string => {
      const value: string | number | boolean | undefined = context[contextKey];
      return value === undefined ? `{{${contextKey}}}` : String(value);
    });
  }

  /** Returns troubleshooting steps for the given locale key, split on newlines. */
  public static getTroubleshootingSteps(key: LocaleKey): ReadonlyArray<string> | undefined {
    const raw: LocaleValue = LocaleRegistry.get(key);
    if (typeof raw === 'string') {
      return undefined;
    }
    return raw.troubleshooting_steps?.split('\n');
  }
}
