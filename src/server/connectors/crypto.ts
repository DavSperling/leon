import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '@/server/env';

// Format stocké : v1:<iv>:<tag>:<chiffré>, chaque partie en base64url.
// Les données associées (`<tenant_id>:<connection_id>`) lient le secret à sa ligne.
const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

export class SecretKeyMissingError extends Error {
  constructor() {
    super(
      'LEON_CONNECTORS_KEY est absente : impossible de chiffrer ou de lire les clés des outils',
    );
    this.name = 'SecretKeyMissingError';
  }
}

export function connectorsKey(): Buffer | null {
  return env.LEON_CONNECTORS_KEY ? Buffer.from(env.LEON_CONNECTORS_KEY, 'base64') : null;
}

function resolveKey(key: Buffer | undefined): Buffer {
  const resolved = key ?? connectorsKey();
  if (!resolved) throw new SecretKeyMissingError();
  if (resolved.length !== KEY_BYTES) throw new Error('Clé de chiffrement de 32 octets attendue');
  return resolved;
}

// Aucun message d'erreur ici ne reprend le texte clair ni le texte chiffré.
export function encryptSecret(plain: string, aad: string, key?: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, resolveKey(key), iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const parts = [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url'));
  return [VERSION, ...parts].join(':');
}

export function decryptSecret(stored: string, aad: string, key?: Buffer): string {
  const resolved = resolveKey(key);
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Secret illisible');
  const [, iv, tag, encrypted] = parts.map((part) => Buffer.from(part, 'base64url')) as [
    Buffer,
    Buffer,
    Buffer,
    Buffer,
  ];
  try {
    const decipher = createDecipheriv(ALGORITHM, resolved, iv);
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tag); // Node refuse une étiquette de moins de 16 octets
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Secret illisible');
  }
}
