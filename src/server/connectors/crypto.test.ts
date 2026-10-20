import { createCipheriv, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectorsKey, decryptSecret, encryptSecret, SecretKeyMissingError } from './crypto';

const KEY = randomBytes(32);
const AAD = 'tenant-1:connexion-1';
const PLAIN = '{"token":"ghp_exemple-de-test-0123456789"}';

// Le message d'une erreur ne doit reprendre ni le texte clair ni le texte chiffré.
function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("l'appel aurait dû lever une erreur");
}

function expectRefused(fn: () => unknown, stored: string) {
  const message = messageOf(fn);
  expect(message).not.toContain(PLAIN);
  expect(message).not.toContain('ghp_exemple');
  for (const part of stored.split(':').slice(1)) expect(message).not.toContain(part);
}

// Remplace le dernier octet d'une des parties base64url du secret stocké.
function tamper(stored: string, partIndex: 1 | 2 | 3): string {
  const parts = stored.split(':');
  const bytes = Buffer.from(parts[partIndex] as string, 'base64url');
  bytes[bytes.length - 1] = (bytes[bytes.length - 1] as number) ^ 0xff;
  parts[partIndex] = bytes.toString('base64url');
  return parts.join(':');
}

describe('encryptSecret / decryptSecret', () => {
  it('relit ce qu’il a chiffré', () => {
    expect(decryptSecret(encryptSecret(PLAIN, AAD, KEY), AAD, KEY)).toBe(PLAIN);
  });

  it('relit un texte vide et un texte avec des caractères accentués', () => {
    expect(decryptSecret(encryptSecret('', AAD, KEY), AAD, KEY)).toBe('');
    expect(decryptSecret(encryptSecret('clé secrète « é »', AAD, KEY), AAD, KEY)).toBe(
      'clé secrète « é »',
    );
  });

  it('chiffre deux fois le même texte de deux façons (vecteur d’initialisation aléatoire)', () => {
    const first = encryptSecret(PLAIN, AAD, KEY);
    const second = encryptSecret(PLAIN, AAD, KEY);
    expect(first).not.toBe(second);
    expect(first.split(':')[1]).not.toBe(second.split(':')[1]);
  });

  it('stocke v1:<iv>:<tag>:<chiffré> en base64url, sans le texte clair', () => {
    const stored = encryptSecret(PLAIN, AAD, KEY);
    const parts = stored.split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
    for (const part of parts.slice(1)) expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(parts[1] as string, 'base64url')).toHaveLength(12);
    expect(Buffer.from(parts[2] as string, 'base64url')).toHaveLength(16);
    expect(stored).not.toContain(PLAIN);
    expect(Buffer.from(parts[3] as string, 'base64url').toString('utf8')).not.toContain('ghp_');
  });

  it('refuse une autre donnée associée (secret recopié sur une autre ligne)', () => {
    const stored = encryptSecret(PLAIN, AAD, KEY);
    expectRefused(() => decryptSecret(stored, 'tenant-1:connexion-2', KEY), stored);
  });

  it('refuse une autre clé', () => {
    const stored = encryptSecret(PLAIN, AAD, KEY);
    expectRefused(() => decryptSecret(stored, AAD, randomBytes(32)), stored);
  });

  it.each([
    ['le vecteur d’initialisation', 1],
    ['l’étiquette d’authenticité', 2],
    ['le chiffré', 3],
  ] as const)('refuse un octet modifié dans %s', (_name, index) => {
    const stored = encryptSecret(PLAIN, AAD, KEY);
    expectRefused(() => decryptSecret(tamper(stored, index), AAD, KEY), stored);
  });

  it('refuse un format d’une autre version', () => {
    const stored = encryptSecret(PLAIN, AAD, KEY);
    expectRefused(() => decryptSecret(stored.replace(/^v1:/, 'v2:'), AAD, KEY), stored);
  });

  it('refuse un texte qui n’a pas quatre parties', () => {
    expect(() => decryptSecret('v1:abc', AAD, KEY)).toThrow();
    expect(() => decryptSecret('', AAD, KEY)).toThrow();
    expect(() => decryptSecret('v1:a:b:c:d', AAD, KEY)).toThrow();
  });

  // Un tag tronqué reste valide pour GCM : Node 24 l'accepte (avec un simple avertissement),
  // Node 26 le refuse. Le contrôle doit donc venir du code, pas de la version de Node.
  it.each([4, 8, 12])('refuse une étiquette d’authenticité tronquée à %i octets', (length) => {
    const stored = encryptSecret(PLAIN, AAD, KEY);
    const parts = stored.split(':');
    const short = Buffer.from(parts[2] as string, 'base64url').subarray(0, length);
    parts[2] = short.toString('base64url');
    expectRefused(() => decryptSecret(parts.join(':'), AAD, KEY), stored);
  });

  it('refuse une étiquette d’authenticité trop longue (17 octets)', () => {
    const stored = encryptSecret(PLAIN, AAD, KEY);
    const parts = stored.split(':');
    parts[2] = Buffer.concat([
      Buffer.from(parts[2] as string, 'base64url'),
      Buffer.alloc(1),
    ]).toString('base64url');
    expectRefused(() => decryptSecret(parts.join(':'), AAD, KEY), stored);
  });

  // Secret chiffré honnêtement, mais avec un vecteur d'initialisation d'une autre longueur :
  // GCM l'accepterait, le format v1 impose 12 octets.
  it.each([8, 16])('refuse un vecteur d’initialisation de %i octets', (length) => {
    const iv = randomBytes(length);
    const cipher = createCipheriv('aes-256-gcm', KEY, iv);
    cipher.setAAD(Buffer.from(AAD));
    const encrypted = Buffer.concat([cipher.update(PLAIN, 'utf8'), cipher.final()]);
    const stored = ['v1', iv, cipher.getAuthTag(), encrypted]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join(':');
    expectRefused(() => decryptSecret(stored, AAD, KEY), stored);
  });

  it('refuse une clé qui ne fait pas 32 octets', () => {
    expect(() => encryptSecret(PLAIN, AAD, randomBytes(16))).toThrow();
    const stored = encryptSecret(PLAIN, AAD, KEY);
    expect(() => decryptSecret(stored, AAD, randomBytes(16))).toThrow();
  });
});

describe('clé de l’environnement', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('lit LEON_CONNECTORS_KEY (clé fixe de test) quand aucune clé n’est passée', () => {
    expect(connectorsKey()).toEqual(Buffer.alloc(32, 7));
    const stored = encryptSecret(PLAIN, AAD);
    expect(decryptSecret(stored, AAD)).toBe(PLAIN);
    expect(decryptSecret(stored, AAD, Buffer.alloc(32, 7))).toBe(PLAIN);
  });

  it('sans clé : connectorsKey() rend null, chiffrer et déchiffrer lèvent SecretKeyMissingError', async () => {
    const stored = encryptSecret(PLAIN, AAD, KEY);
    vi.stubEnv('LEON_CONNECTORS_KEY', '');
    vi.resetModules();
    const withoutKey = await import('./crypto');
    expect(withoutKey.connectorsKey()).toBeNull();
    expect(() => withoutKey.encryptSecret(PLAIN, AAD)).toThrow(withoutKey.SecretKeyMissingError);
    expect(() => withoutKey.decryptSecret(stored, AAD)).toThrow(withoutKey.SecretKeyMissingError);
  });

  it('SecretKeyMissingError dit que la clé manque, sans rien d’autre', () => {
    const error = new SecretKeyMissingError();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('LEON_CONNECTORS_KEY');
  });
});
