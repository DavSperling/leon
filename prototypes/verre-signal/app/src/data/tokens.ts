import { minutesAgo, paris } from '@/lib/format';

// Réglages : jetons personnels, branchement de Claude Code et de l'extension ; chiffres de la barre latérale.

export type PersonalToken = { id: string; name: string; /** fin du jeton : leon_…{hint} */ hint: string; createdAt: Date; lastUsedAt: Date | null };

export const TOKENS: PersonalToken[] = [
  { id: 'tk-1', name: 'MacBook de David', hint: 'f3a9', createdAt: paris('2026-10-12 09:30'), lastUsedAt: minutesAgo(125) },
  { id: 'tk-2', name: 'Claude Code (bureau)', hint: '81cc', createdAt: paris('2026-09-28 17:05'), lastUsedAt: paris('2026-10-20 16:40') },
  { id: 'tk-3', name: 'Extension Chrome', hint: '4d2e', createdAt: paris('2026-09-03 11:12'), lastUsedAt: null },
];

let made = 0;
/** Un jeton neuf, montré une seule fois : déterministe (même suite d'appels, mêmes jetons), unique même pour un nom déjà pris. */
export function createToken(name: string): { token: PersonalToken; secret: string } {
  const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let h = 7 + 7919 * ++made;
  const secret = `leon_${Array.from({ length: 32 }, (_, i) => abc[(h = (h * 31 + (name.charCodeAt(i % Math.max(1, name.length)) || 7) + i) % 104729) % abc.length]).join('')}`;
  return { token: { id: `tk-${secret.slice(-6)}`, name, hint: secret.slice(-4), createdAt: minutesAgo(0), lastUsedAt: null }, secret };
}

export const SERVER_URL = 'https://leon.acme.fr';
export const CLAUDE_CODE_COMMAND = `claude mcp add --transport http leon ${SERVER_URL}/api/mcp --header "Authorization: Bearer <votre jeton>"`;

/** Pied de la barre latérale. */
export const MEMORY = {
  passages: 12482,
  updatedAt: minutesAgo(2),
  /** Passages indexés par jour, sur 15 jours (le dernier : aujourd'hui). */
  activity: [3, 5, 4, 7, 6, 9, 8, 6, 10, 9, 12, 11, 14, 13, 16],
};
