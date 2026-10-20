import { createHash } from 'node:crypto';
import { getIP } from 'better-auth/api';
import { pool } from '@/server/db/client';
import { auth } from './auth';

// La limite de débit de la connexion et de l'inscription (audit 2 n° 3). Les server actions appellent Better Auth
// par auth.api.*, qui ne passe pas par sa limite (seul son routeur l'applique, par adresse IP seulement, en
// mémoire) ; ses routes HTTP de connexion et d'inscription sont fermées (auth.ts). Le compteur vit en base
// (0021) : il tient avec plusieurs instances.
//
// Chaque tentative compte, réussie ou non : une tentative comptée après coup laisserait passer d'un coup toutes
// celles envoyées en même temps. Par e-mail, contre qui essaie des mots de passe sur un compte (au prix d'un
// compte bloqué jusqu'à la fin de la fenêtre) ; par adresse IP, contre qui essaie un mot de passe sur beaucoup de
// comptes, assez haut pour un bureau derrière une seule adresse. L'adresse IP est celle que Better Auth retient
// (x-forwarded-for d'une seule valeur, réglages `advanced.ipAddress`) : sans adresse sûre, seule la limite par
// e-mail s'applique, plutôt qu'un compteur commun qui bloquerait tout le monde.

const WINDOW = '15 minutes';

export const AUTH_LIMITS = {
  connexion: { email: 10, ip: 50 },
  inscription: { email: 5, ip: 10 },
} as const;

export type AuthAttempt = keyof typeof AUTH_LIMITS;

// Ni l'e-mail ni l'adresse IP ne sont gardés en clair.
const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex');

// Compte la tentative ; false si l'e-mail ou l'adresse IP a dépassé son plafond dans la fenêtre.
export async function authAttemptAllowed(
  kind: AuthAttempt,
  email: string,
  headers: Headers,
): Promise<boolean> {
  const ip = getIP(headers, auth.options);
  const limits = new Map<string, number>([
    [`${kind}:email:${fingerprint(email.toLowerCase())}`, AUTH_LIMITS[kind].email],
  ]);
  if (ip) limits.set(`${kind}:ip:${fingerprint(ip)}`, AUTH_LIMITS[kind].ip);
  const { rows } = await pool.query<{ cle: string; compte: number }>(
    'select cle, compte from consommer_limites($1, $2::interval)',
    [[...limits.keys()], WINDOW],
  );
  return rows.every((row) => row.compte <= (limits.get(row.cle) ?? 0));
}
