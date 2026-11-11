import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { USAGES, type Usage } from '@/capture/api-contract';
import { env } from '@/server/env';

// Une charge JSON signée par HMAC, une clé par « but » (purpose) : signPayload / verifyPayload. Signée, pas
// stockée : aucune table. Trois buts : « ordinateur » (le code que la page d'autorisation S03 signe pour la CLI et
// que POST /api/v1/ordinateurs S04 vérifie : K4 du plan « CLI sans clone »), puis « oauth-client » (le client_id
// d'une inscription, sans expiration) et « oauth-code » (le code d'autorisation, 2 minutes) du MCP distant.
// Pour « ordinateur », l'usage unique tient à l'unicité de api_tokens.token_hash ; la charge porte l'empreinte du
// jeton que la CLI a tiré (jamais le jeton), l'utilisateur et l'espace qui ont autorisé ; seule la CLI qui détient
// le jeton de cette empreinte peut échanger le code.

const VERSION = 1;
const TTL_SECONDS = 120;
const PURPOSE = 'ordinateur';

// Tous les usages que le serveur connaît, pas seulement ceux que la page montre à ce lot : un code signé avant un
// retour en arrière se vérifie encore.
const UsagesSchema = z.array(z.enum(USAGES)).max(USAGES.length);
const PayloadSchema = z.strictObject({
  v: z.literal(VERSION),
  e: z.string().regex(/^[0-9a-f]{64}$/), // SHA-256 du jeton, comme hashApiToken
  u: z.string().min(1),
  t: z.string().min(1),
  x: z.number().int(), // expiration, secondes depuis 1970
  // Les cases de la page (T64, C16 du plan de la mémoire à disposition) : montrées (m), puis cochées parmi elles (g).
  // Lisibles de qui voit l'adresse de retour, mais pas modifiables. Absentes quand la page n'en montrait aucune.
  m: UsagesSchema.optional(),
  g: UsagesSchema.optional(),
});
export type ComputerCodePayload = z.infer<typeof PayloadSchema>;

// Le secret et l'horloge s'injectent pour les tests ; par défaut BETTER_AUTH_SECRET et l'heure réelle.
// L'horloge ne sert qu'à vérifier : signPayload l'ignore (l'expiration, c'est le champ x que l'appelant écrit).
type Options = { secret?: string; now?: number };

// Une clé propre à chaque but, tirée du secret du serveur par HKDF : le secret de session ne sert pas tel quel, et
// une valeur signée pour un but ne se vérifie pas pour un autre.
const keyFor = (purpose: string, secret: string) => {
  if (!/^[a-z-]+$/.test(purpose)) throw new Error('Invalid signature purpose');
  return Buffer.from(hkdfSync('sha256', secret, '', `leon:${purpose}:v1`, 32));
};

const sign = (purpose: string, body: string, secret: string) =>
  createHmac('sha256', keyFor(purpose, secret)).update(body).digest('base64url');

export function signPayload(
  purpose: string,
  payload: unknown,
  { secret = env.BETTER_AUTH_SECRET }: Options = {},
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(purpose, body, secret)}`;
}

// null : signature fausse (ou d'un autre but), charge illisible ou qui n'est pas un objet, ou expirée. La signature
// se vérifie, en temps constant, avant de lire la charge. L'expiration (x, secondes depuis 1970) n'est vérifiée que
// si la charge en porte une ; sinon c'est à l'appelant de valider la charge avec son propre schéma.
export function verifyPayload(
  purpose: string,
  value: string,
  { secret = env.BETTER_AUTH_SECRET, now = Date.now() }: Options = {},
): Record<string, unknown> | null {
  const [body, signature, ...rest] = value.split('.');
  if (!body || !signature || rest.length > 0) return null;
  const expected = Buffer.from(sign(purpose, body, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const claims = payload as Record<string, unknown>;
  if ('x' in claims && !(Number.isFinite(claims.x) && now <= (claims.x as number) * 1000))
    return null;
  return claims;
}

// Sans case montrée, ni m ni g : le code est alors celui d'avant T64, qu'un serveur plus ancien (deux instances pendant
// un déploiement) vérifie encore.
export function signComputerCode(
  claims: Pick<ComputerCodePayload, 'e' | 'u' | 't'> & { m?: Usage[]; g?: Usage[] },
  { secret, now = Date.now() }: Options = {},
): string {
  const payload: ComputerCodePayload = {
    v: VERSION,
    e: claims.e,
    u: claims.u,
    t: claims.t,
    x: Math.floor(now / 1000) + TTL_SECONDS,
    ...(claims.m?.length ? { m: claims.m, g: claims.g ?? [] } : {}),
  };
  return signPayload(PURPOSE, payload, { secret });
}

// null : signature fausse, charge illisible ou mal formée, version autre que 1, ou expiré. L'appelant ne doit pas
// dire lequel (S04 répond 401 sans détail).
export function verifyComputerCode(
  code: string,
  options: Options = {},
): ComputerCodePayload | null {
  const parsed = PayloadSchema.safeParse(verifyPayload(PURPOSE, code, options));
  return parsed.success ? parsed.data : null;
}
