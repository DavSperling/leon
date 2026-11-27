import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { manifestFor } from './manifest';

const SERVER_URL = 'https://leonmemory.com';
const LOCALES_DIR = new URL('../public/_locales/', import.meta.url);

const messagesOf = (locale: string): Record<string, { message: string }> =>
  JSON.parse(readFileSync(new URL(`${locale}/messages.json`, LOCALES_DIR), 'utf8'));

// Les clés __MSG_<clé>__ que le manifeste demande aux traductions.
const messageKeys = (manifest: object): string[] =>
  [...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].map((match) => match[1] as string);

describe('manifestFor', () => {
  it('Chrome : version 1.0.0, nom et description traduits, les deux sites et le serveur, aucune clé', () => {
    const manifest = manifestFor({ serverUrl: SERVER_URL, browser: 'chrome' });
    expect(manifest).toMatchObject({
      version: '1.0.0',
      name: '__MSG_extName__',
      description: '__MSG_extDescription__',
      default_locale: 'en',
      incognito: 'not_allowed',
      // Une permission de plus se voit à l'installation et repasse en relecture : elle ne s'ajoute pas par mégarde.
      permissions: ['storage', 'alarms'],
    });
    expect(manifest.host_permissions).toEqual([
      'https://claude.ai/*',
      'https://chatgpt.com/*',
      'https://leonmemory.com/*',
    ]);
    expect(manifest).not.toHaveProperty('browser_specific_settings');
    expect(manifest).not.toHaveProperty('key');
  });

  it('Firefox : l’identifiant de Leon, Firefox 140 au moins, les données montrées à l’installation', () => {
    const manifest = manifestFor({ serverUrl: SERVER_URL, browser: 'firefox' });
    expect(manifest.browser_specific_settings).toEqual({
      gecko: {
        id: 'leon@leonmemory.com',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['personalCommunications', 'websiteContent', 'authenticationInfo'],
        },
      },
    });
    expect(manifest).toMatchObject({
      version: '1.0.0',
      name: '__MSG_extName__',
      description: '__MSG_extDescription__',
      default_locale: 'en',
    });
    expect(manifest).not.toHaveProperty('key');
  });

  it('les deux cibles ne diffèrent que par les réglages de Firefox', () => {
    const { browser_specific_settings: _gecko, ...firefox } = manifestFor({
      serverUrl: SERVER_URL,
      browser: 'firefox',
    });
    expect(firefox).toEqual(manifestFor({ serverUrl: SERVER_URL, browser: 'chrome' }));
  });

  it('les hôtes suivent le serveur', () => {
    expect(
      manifestFor({ serverUrl: 'http://localhost:3000', browser: 'firefox' }).host_permissions,
    ).toEqual(['https://claude.ai/*', 'https://chatgpt.com/*', 'http://localhost:3000/*']);
  });
});

describe('les traductions du manifeste', () => {
  it('existent en anglais (default_locale) et en français, avec les mêmes clés', () => {
    expect(readdirSync(LOCALES_DIR).sort()).toEqual(['en', 'fr']);
    expect(Object.keys(messagesOf('fr')).sort()).toEqual(Object.keys(messagesOf('en')).sort());
  });

  it.each(['chrome', 'firefox'])(
    '%s : chaque clé __MSG_ du manifeste a un texte dans chaque langue',
    (browser) => {
      const keys = messageKeys(manifestFor({ serverUrl: SERVER_URL, browser }));
      expect(keys).toEqual(['extName', 'extDescription']);
      for (const locale of ['en', 'fr']) {
        for (const key of keys)
          expect(messagesOf(locale)[key]?.message, `${locale} ${key}`).toBeTruthy();
      }
    },
  );

  it.each(['en', 'fr'])(
    '%s : la description tient en 132 caractères (limite de Chrome)',
    (locale) => {
      expect([...(messagesOf(locale).extDescription?.message ?? '')].length).toBeLessThanOrEqual(
        132,
      );
    },
  );
});
