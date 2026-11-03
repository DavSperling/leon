import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '@/server/env';

// Le code que la page d'autorisation (S03) signe pour la CLI et que POST /api/v1/ordinateurs (S04) vérifie : K4 du
// plan « CLI sans clone ». Signé, pas stocké : aucune table, et l'usage unique tient à l'unicité de
// api_tokens.token_hash. La charge porte l'empreinte du jeton que la CLI a tiré (jamais le jeton), l'utilisateur
// et l'espace qui ont autorisé ; seule la CLI qui détient le jeton de cette empreinte peut échanger le code.

const VERSION = 1;
const TTL_SECONDS = 120;
const KEY_INFO = 'leon:ordinateur:v1';

const PayloadSchema = z.strictObject({
  v: z.literal(VERSION),
  e: z.string().regex(/^[0-9a-f]{64}$/), // SHA-256 du jeton, comme hashApiToken
  u: z.string().min(1),
  t: z.string().min(1),
  x: z.number().int(), // expiration, secondes depuis 1970
});
export type ComputerCodePayload = z.infer<typeof PayloadSchema>;

// Le secret et l'horloge s'injectent pour les tests ; par défaut BETTER_AUTH_SECRET et l'heure réelle.
type Options = { secret?: string; now?: number };

// Une clé propre à ce code, tirée du secret du serveur par HKDF : le secret de session ne sert pas tel quel.
const keyFor = (secret: string) => Buffer.from(hkdfSync('sha256', secret, '', KEY_INFO, 32));

const sign = (body: string, secret: string) =>
  createHmac('sha256', keyFor(secret)).update(body).digest('base64url');

export function signComputerCode(
  claims: Pick<ComputerCodePayload, 'e' | 'u' | 't'>,
  { secret = env.BETTER_AUTH_SECRET, now = Date.now() }: Options = {},
): string {
  const payload: ComputerCodePayload = {
    v: VERSION,
    e: claims.e,
    u: claims.u,
    t: claims.t,
    x: Math.floor(now / 1000) + TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

// null : signature fausse, charge illisible ou mal formée, version autre que 1, ou expiré. L'appelant ne doit pas
// dire lequel (S04 répond 401 sans détail). La signature se vérifie avant de lire la charge.
export function verifyComputerCode(
  code: string,
  { secret = env.BETTER_AUTH_SECRET, now = Date.now() }: Options = {},
): ComputerCodePayload | null {
  const [body, signature, ...rest] = code.split('.');
  if (!body || !signature || rest.length > 0) return null;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = PayloadSchema.safeParse(value);
  if (!parsed.success || now > parsed.data.x * 1000) return null;
  return parsed.data;
}
