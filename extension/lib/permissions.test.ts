import { describe, expect, it } from 'vitest';
import { hostPermissionsFor, serverUrlFromEnv } from './permissions';

describe('hostPermissionsFor', () => {
  it('liste les sites captés puis le serveur', () => {
    expect(hostPermissionsFor('http://localhost:3000')).toEqual([
      'https://claude.ai/*',
      'https://chatgpt.com/*',
      'http://localhost:3000/*',
    ]);
  });
});

describe('serverUrlFromEnv', () => {
  it('prend localhost:3000 par défaut', () => {
    expect(serverUrlFromEnv(undefined)).toBe('http://localhost:3000');
    expect(serverUrlFromEnv('')).toBe('http://localhost:3000');
  });

  it("renvoie l'origine, sans slash final", () => {
    expect(serverUrlFromEnv('https://leon.example.fr/')).toBe('https://leon.example.fr');
  });

  it('accepte http sur 127.0.0.1', () => {
    expect(serverUrlFromEnv('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
  });

  it.each([
    'ftp://x',
    'http://leon.example.fr',
    'http://localhost:3000@evil.example',
    'http://localhost:3000.evil.example',
  ])('refuse %s', (value) => {
    expect(() => serverUrlFromEnv(value)).toThrow();
  });
});
