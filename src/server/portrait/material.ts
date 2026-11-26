import { sql } from 'drizzle-orm';
import { CAPTURE_KINDS, PROVIDER_IDS } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import type { AboutMaterial } from '@/server/briefing/about-material';
import { lastTurns, sourceOf } from '@/server/briefing/gather';
import { withTenant } from '@/server/db/with-tenant';
import { LAST_TS_SQL, textArray } from '@/server/search/filters-sql';
import { handWritten } from './facts';
import { MAIL_KINDS, readSentMails } from './sent-mails';

// La matière de la synthèse de la fiche (synthese.ts) : les sources de la personne, et elles seules, dans tous ses
// outils, ses conversations avec des assistants comprises. Elle se lit sous withTenant de la personne ET avec le filtre
// `owner_user_id`, comme la matière de « À propos » (briefing/about-material.ts), dont elle a la forme.
//
// Du courrier, seulement les fils où elle a écrit de sa main dans la période : au moins un mail envoyé qui n'est pas un
// envoi automatique (handWritten). Tout ce qu'elle reçoit sans y répondre (lettres d'information, notifications) est
// aussi une source à elle, et sur une vraie boîte sept fils « envoyés » sur dix étaient des notifications parties de
// son compte. Une réunion de l'agenda Outlook n'est pas un mail envoyé : elle n'y entre pas non plus.

// Les sources actives depuis 90 jours, les plus récentes d'abord : 50 au plus par outil (un outil bavard ne prend pas
// toute la place), 150 en tout, et leurs 2 derniers tours.
const PORTRAIT_DAYS = 90;
const PORTRAIT_SOURCES_PER_TOOL = 50;
const PORTRAIT_SOURCES_MAX = 150;
const PORTRAIT_TURNS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function gatherPortraitMaterial(
  ctx: TenantContext,
  now: Date,
): Promise<AboutMaterial> {
  const cutoff = new Date(now.getTime() - PORTRAIT_DAYS * DAY_MS);
  const { mails } = await readSentMails(ctx, PORTRAIT_DAYS, now);
  const written = [...new Set(handWritten(mails).map((mail) => mail.sourceId))];
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<Parameters<typeof sourceOf>[0]>(sql`
      select id, kind, title, metadata, extract(epoch from last_ts) as last_epoch
      from (
        select s.id, s.kind, s.title, s.metadata, l.last_ts,
               row_number() over (partition by s.kind order by l.last_ts desc, s.id) as n
        from sources s
        cross join lateral (select ${LAST_TS_SQL} as last_ts) l
        where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId}
          and s.kind = any(${textArray([...PROVIDER_IDS, ...CAPTURE_KINDS])})
          and l.last_ts >= ${cutoff.toISOString()}::timestamptz
          and (s.kind <> all(${textArray(MAIL_KINDS)}) or s.id = any(${textArray(written)}::uuid[]))
      ) recent
      where n <= ${PORTRAIT_SOURCES_PER_TOOL}
      order by last_ts desc, id
      limit ${PORTRAIT_SOURCES_MAX}`);
    const turns = await lastTurns(
      tx,
      ctx,
      rows.map((row) => row.id),
      PORTRAIT_TURNS,
    );
    return {
      sources: rows.map((row) => ({ source: sourceOf(row), turns: turns.get(row.id) ?? [] })),
    };
  });
}
