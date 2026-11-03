import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectionPath, writeConnection } from './connection';
import { claudeConfigDir, parseServerEnv, resolveServerEnv } from './env';

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

// E5 : LEON_URL et LEON_TOKEN, si les deux sont posées, passent avant ~/.leon/connexion.json. Toujours dans un HOME
// temporaire : jamais le vrai ~/.leon.
describe('resolveServerEnv', () => {
  const SAVED_TOKEN = `leon_${'s'.repeat(43)}`;
  const SAVED = { url: 'https://leon.example', token: SAVED_TOKEN };
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'leon-env-'));
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  const saveConnection = () =>
    writeConnection(home, {
      url: SAVED.url,
      jeton: SAVED.token,
      ordinateur: 'MacBook-Pro',
      espace: 'Acme',
      cree_le: '2026-11-03T10:00:00.000Z',
    });

  it('les deux variables passent avant la connexion enregistrée', async () => {
    await saveConnection();

    expect(
      await resolveServerEnv({ LEON_URL: 'http://localhost:3000', LEON_TOKEN: TOKEN }, home),
    ).toEqual({ url: 'http://localhost:3000', token: TOKEN });
  });

  it('sans variables, la connexion enregistrée', async () => {
    await saveConnection();

    expect(await resolveServerEnv({}, home)).toEqual(SAVED);
  });

  it('une seule variable posée (ou une vide) ne compte pas : la connexion enregistrée', async () => {
    await saveConnection();

    expect(await resolveServerEnv({ LEON_URL: 'http://localhost:3000' }, home)).toEqual(SAVED);
    expect(await resolveServerEnv({ LEON_TOKEN: TOKEN }, home)).toEqual(SAVED);
    expect(
      await resolveServerEnv({ LEON_URL: 'http://localhost:3000', LEON_TOKEN: '' }, home),
    ).toEqual(SAVED);
  });

  it('ni variables ni connexion : l’erreur d’aujourd’hui, complétée par « leon login »', async () => {
    const failure = await resolveServerEnv({}, home).catch((error: Error) => error);

    expect(failure).toBeInstanceOf(Error);
    const { message } = failure as Error;
    expect(message).toContain(
      'LEON_URL is missing or invalid (https, or http on localhost and 127.0.0.1).',
    );
    expect(message).toContain('LEON_TOKEN is missing or invalid');
    expect(message).toMatch(/not connected: run `leon login`/);
  });

  it('une connexion illisible vaut « pas connecté », sans recopier le fichier', async () => {
    await saveConnection();
    await writeFile(
      connectionPath(home),
      `{"url":"http://secret.example","jeton":"${SAVED_TOKEN}"`,
    );

    const failure = await resolveServerEnv({}, home).catch((error: Error) => error);

    expect((failure as Error).message).toMatch(/run `leon login`/);
    expect((failure as Error).message).not.toContain('secret.example');
    expect((failure as Error).message).not.toContain(SAVED_TOKEN);
  });

  it('deux variables posées mais invalides : l’erreur des variables, pas un repli silencieux sur la connexion', async () => {
    await saveConnection();

    await expect(
      resolveServerEnv({ LEON_URL: 'http://localhost:3000', LEON_TOKEN: 'leon_trop-court' }, home),
    ).rejects.toThrow(/LEON_TOKEN is missing or invalid/);
  });
});

describe('claudeConfigDir', () => {
  it('prend CLAUDE_CONFIG_DIR, sinon ~/.claude (vide = absente)', () => {
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: '/tmp/cc' })).toBe('/tmp/cc');
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: '' })).toBe(join(homedir(), '.claude'));
    expect(claudeConfigDir({})).toBe(join(homedir(), '.claude'));
  });
});
