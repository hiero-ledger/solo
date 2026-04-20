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

  /**
   * Returns the message template for the given locale key in the active locale.
   * Falls back to the English entry, then to the key string itself if no entry exists.
   *
   * @param key - full locale key, e.g. "pod_not_ready_message"
   */
  public static getMessage(key: string): string {
    return LocaleRegistry.get(key) ?? key;
  }

  /**
   * Returns the troubleshooting steps for the given locale key in the active locale,
   * or undefined if none are defined. Steps are stored as a newline-joined string
   * and split back into an array on retrieval.
   *
   * @param key - full locale key, e.g. "pod_not_ready_troubleshooting_steps"
   */
  public static getTroubleshootingSteps(key: string): ReadonlyArray<string> | undefined {
    return LocaleRegistry.get(key)?.split('\n');
  }
}
