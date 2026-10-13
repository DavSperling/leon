import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeConfigDir, parseServerEnv } from './env';

const TOKEN = `leon_${'a'.repeat(43)}`;

describe('parseServerEnv', () => {
  it('accepte https, et http sur localhost ou 127.0.0.1', () => {
    for (const url of [
      'https://leon.example.fr',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]) {
      expect(parseServerEnv({ LEON_URL: url, LEON_TOKEN: TOKEN })).toEqual({ url, token: TOKEN });
    }
  });

  it.each([
    'pas une url',
    'http://leon.example.fr',
    'http://localhost:3000@evil.example',
    'ftp://localhost',
  ])('refuse LEON_URL = %s', (url) => {
    expect(() => parseServerEnv({ LEON_URL: url, LEON_TOKEN: TOKEN })).toThrow(/LEON_URL/);
  });

  it('refuse un jeton hors motif sans en recopier la valeur', () => {
    const bad = 'leon_secret-trop-court';
    let message = '';
    try {
      parseServerEnv({ LEON_URL: 'http://localhost:3000', LEON_TOKEN: bad });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/LEON_TOKEN/);
    expect(message).not.toContain('secret-trop-court');
  });

  it('traite une variable vide comme absente et demande de la renseigner', () => {
    expect(() => parseServerEnv({ LEON_URL: 'http://localhost:3000', LEON_TOKEN: '' })).toThrow(
      /LEON_TOKEN/,
    );
    expect(() => parseServerEnv({ LEON_URL: '', LEON_TOKEN: TOKEN })).toThrow(/LEON_URL/);
  });
});

describe('claudeConfigDir', () => {
  it('prend CLAUDE_CONFIG_DIR, sinon ~/.claude (vide = absente)', () => {
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: '/tmp/cc' })).toBe('/tmp/cc');
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: '' })).toBe(join(homedir(), '.claude'));
    expect(claudeConfigDir({})).toBe(join(homedir(), '.claude'));
  });
});
