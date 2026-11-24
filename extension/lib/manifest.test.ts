import { describe, expect, it } from 'vitest';
import { manifestFor } from './manifest';

const SERVER_URL = 'https://leonmemory.com';

describe('manifestFor', () => {
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
    expect(manifest.version).toBe('0.9.0');
    expect(manifest.host_permissions).toEqual([
      'https://claude.ai/*',
      'https://chatgpt.com/*',
      'https://leonmemory.com/*',
    ]);
    expect(manifest).not.toHaveProperty('key');
  });

  it('Chrome : aucun réglage propre à Firefox, la même version', () => {
    const manifest = manifestFor({ serverUrl: SERVER_URL, browser: 'chrome' });
    expect(manifest).not.toHaveProperty('browser_specific_settings');
    expect(manifest).not.toHaveProperty('key');
    expect(manifest.version).toBe('0.9.0');
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
