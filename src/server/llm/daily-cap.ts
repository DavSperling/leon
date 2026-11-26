import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';

// Le plafond de dépense des appels qu'une personne déclenche elle-même, par jour UTC (reserver_appel, 0090) : la
// réponse en tête de la recherche (Sonnet, environ 1 centime) et la discussion (Opus, environ 7 centimes mesurés,
// models.ts). Larges pour un usage normal, bornés pour un script ou un onglet qui boucle : 1,50 $ et 2,80 $ par
// personne et par jour au plus (estimé, pas mesuré). Le point et l'agenda ont le leur (0060, 0072).
export const DAILY_CAPS = { reponse: 150, discussion: 40 } as const;

// Compte l'appel et rend true s'il reste sous le plafond du jour ; false sinon, journalisé sans rien de la question.
export async function reserveCall(userId: string, etape: keyof typeof DAILY_CAPS) {
  const { rows } = await db.execute<{ ok: boolean }>(
    sql`select reserver_appel(${userId}, ${etape}, ${DAILY_CAPS[etape]}) as ok`,
  );
  if (rows[0]?.ok === true) return true;
  console.warn('[leon]', 'llm.daily_cap', JSON.stringify({ userId, etape }));
  return false;
}
