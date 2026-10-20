import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { getIP } from 'better-auth/api';
import { pool } from '@/server/db/client';
import { env } from '@/server/env';
import { auth } from './auth';

// La limite de débit de la connexion et de l'inscription (audit 2 n° 3). Les server actions appellent Better Auth
// par auth.api.*, qui ne passe pas par sa limite (seul son routeur l'applique, par adresse IP seulement, en
// mémoire) ; ses routes HTTP de connexion et d'inscription sont fermées (auth.ts). Le compteur vit en base
// (0021) : il tient avec plusieurs instances.
//
// Chaque tentative compte, réussie ou non : une tentative comptée après coup laisserait passer d'un coup toutes
// celles envoyées en même temps. Par e-mail, contre qui essaie des mots de passe sur un compte (au prix d'un
// compte bloqué jusqu'à la fin de la fenêtre) ; par adresse IP, contre qui essaie un mot de passe sur beaucoup de
// comptes, assez haut pour un bureau derrière une seule adresse.
//
// L'adresse IP vient du seul en-tête que pose le proxy de confiance (LEON_IP_HEADER) : en production, Caddy y
// écrit l'adresse du client et écrase ce que le client y a mis (`header_up X-Real-IP {remote_host}`), et l'appli
// n'est joignable que par lui. Un autre en-tête (un X-Forwarded-For choisi par le client) n'est jamais lu. Une
// adresse absente, illisible ou en liste est inconnue : elle compte sur une clé commune, à plafond haut, pour
// qu'aucune tentative n'échappe à la limite par adresse sans bloquer un bureau entier sur une erreur de réglage.

const WINDOW = '15 minutes';

export const AUTH_LIMITS = {
  connexion: { email: 10, ip: 50, inconnue: 500 },
  inscription: { email: 5, ip: 10, inconnue: 100 },
} as const;

export type AuthAttempt = keyof typeof AUTH_LIMITS;

// Ni l'e-mail ni l'adresse IP ne sont gardés en clair.
const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex');

// L'adresse du client, si l'en-tête du proxy en porte une seule et valide (normalisée par Better Auth : une
// adresse IPv6 compte pour son /64) ; null sinon. Better Auth rend 127.0.0.1 en développement et en test quand
// il ne lit rien : on ne l'appelle qu'avec une adresse valide.
function clientIp(headers: Headers): string | null {
  const value = env.LEON_IP_HEADER ? headers.get(env.LEON_IP_HEADER)?.trim() : undefined;
  if (!value || isIP(value) === 0) return null;
  return getIP(headers, auth.options);
}

// Compte la tentative ; false si l'e-mail ou l'adresse IP a dépassé son plafond dans la fenêtre.
export async function authAttemptAllowed(
  kind: AuthAttempt,
  email: string,
  headers: Headers,
): Promise<boolean> {
  const ip = clientIp(headers);
  const limits = new Map<string, number>([
    [`${kind}:email:${fingerprint(email.toLowerCase())}`, AUTH_LIMITS[kind].email],
    ip
      ? [`${kind}:ip:${fingerprint(ip)}`, AUTH_LIMITS[kind].ip]
      : [`${kind}:ip:inconnue`, AUTH_LIMITS[kind].inconnue],
  ]);
  const { rows } = await pool.query<{ cle: string; compte: number }>(
    'select cle, compte from consommer_limites($1, $2::interval)',
    [[...limits.keys()], WINDOW],
  );
  return rows.every((row) => row.compte <= (limits.get(row.cle) ?? 0));
}
