import { and, eq, sql } from 'drizzle-orm';
import type { SourceKind } from '@/capture/turn';
import { byStart, parisTime, type RendezVous, type StoredRendezVous, weekDays } from '@/lib/agenda';
import type { TenantContext } from '@/server/auth/tenant-context';
import { accountIsGone, lockAccount } from '@/server/briefing/briefings';
import { db } from '@/server/db/client';
import { agendas } from '@/server/db/schema/search';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import type { Llm } from '@/server/llm/llm';
import { epochToDate, textArray } from '@/server/search/filters-sql';
import { type AgendaMail, buildAgendaPrompt, parseAgendaAnswer } from './agenda-prompt';

// Le calendrier de la semaine sur l'Accueil. Deux origines, lues sous withTenant de la personne, et seulement dans
// SES sources (owner_user_id) : la boîte partagée d'un collègue ne met pas ses rendez-vous dans mon calendrier.
// - Les réunions de son agenda Outlook (nature « reunion », connectors/outlook/map.ts) : leur heure est écrite dans
//   le texte gardé, elles se lisent telles quelles à chaque affichage, sans modèle.
// - Ses derniers e-mails Gmail et Outlook : le modèle y relève les rendez-vous (agenda-prompt.ts) ; le résultat est
//   gardé dans `agendas` (0072), refait quand de nouveaux e-mails arrivent, au plus AGENDA_DAILY_CAP fois par jour.
// À la lecture, un rendez-vous dont la personne ne voit plus la source (droits retirés, source supprimée) disparaît.

// Au plus 4 lectures payées par personne et par jour (UTC, reserver_agenda, 0072). Avec Haiku 5.5, une lecture de
// 120 e-mails coupés à 600 caractères fait environ 25 000 jetons d'entrée : moins d'un demi-centime (estimé d'après
// le tarif de models.ts, pas encore mesuré), donc moins de 2 centimes par personne et par jour.
export const AGENDA_DAILY_CAP = 4;
// Un calendrier préparé il y a plus longtemps se refait à la prochaine visite de l'Accueil (sans appel au modèle
// s'il n'est arrivé aucun e-mail depuis).
export const AGENDA_STALE_MS = 3 * 60 * 60 * 1000;
export const AGENDA_MAIL_DAYS = 30;
export const AGENDA_MAILS_MAX = 120;
const MAIL_CHARS = 800;
// Ce qui annonce un rendez-vous dans un e-mail (objet ou texte), en français, en anglais et en hébreu : ces e-mails
// passent avant les autres. Une boîte pleine d'alertes et de lettres d'information remplissait sinon les 120 places
// en deux jours, et les invitations n'arrivaient jamais au modèle (premier essai en production, 16/11/2026).
export const RDV_PATTERN =
  '\\m(rdv|rendez-vous|r[ée]union\\w*|entretien\\w*|visio\\w*|invit\\w*|meeting\\w*|interview\\w*|appointment\\w*|call|appel|calendar|agenda|webex|calendly)\\M|zoom\\.us|meet\\.google\\.com|teams\\.microsoft\\.com|BEGIN:VCALENDAR|פגישה|ראיון|זימון|שיחת';
// Borne le texte ET la réflexion du modèle (llm.ts) : 60 lignes JSON en prennent environ 3 000.
const AGENDA_MAX_TOKENS = 6000;
const AGENDA_TIMEOUT_MS = 90_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const MAIL_KINDS = ['gmail', 'outlook'] satisfies SourceKind[];
const OUTLOOK = 'outlook' satisfies SourceKind;

// Ses derniers e-mails : un tour par message, ceux qui annoncent un rendez-vous d'abord (RDV_PATTERN), puis du plus
// récent au plus ancien, coupés. Les réunions de l'agenda Outlook n'en
// sont pas (elles se lisent à part). `latest` : l'arrivée dans Leon du dernier tour, à l'heure de la base, pour savoir
// s'il y a du neuf depuis la dernière lecture.
async function recentMails(
  tx: Tx,
  ctx: TenantContext,
  now: Date,
): Promise<{ mails: AgendaMail[]; latest: Date | null }> {
  const since = new Date(now.getTime() - AGENDA_MAIL_DAYS * DAY_MS);
  const { rows } = await tx.execute<{
    sourceId: string;
    title: string | null;
    author: string | null;
    at: string;
    text: string;
    createdAt: string;
  }>(sql`
    select t.source_id as "sourceId", s.title, coalesce(t.author_name, t.author_email) as author,
           to_char(t.ts at time zone 'Europe/Paris', 'YYYY-MM-DD"T"HH24:MI') as at,
           left(t.text, ${MAIL_CHARS}) as text, extract(epoch from t.created_at) as "createdAt"
    from turns t
    join sources s on s.id = t.source_id and s.tenant_id = t.tenant_id
    where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId}
      and s.kind = any(${textArray(MAIL_KINDS)})
      and coalesce(s.metadata->>'nature', '') <> 'reunion'
      and t.ts >= ${since.toISOString()}
    order by (coalesce(s.title, '') ~* ${RDV_PATTERN} or t.text ~* ${RDV_PATTERN}) desc, t.ts desc
    limit ${AGENDA_MAILS_MAX}`);
  const latest = rows.reduce<Date | null>((max, row) => {
    const at = epochToDate(row.createdAt);
    return max === null || at > max ? at : max;
  }, null);
  return {
    mails: rows.map(({ createdAt: _c, ...mail }) => mail),
    latest,
  };
}

// « Début : 2026-11-17T09:00:00Z » : l'heure qu'écrit le connecteur Outlook quand Graph la rend en UTC.
// shortcut: une heure dans un autre fuseau (« 2026-11-17T09:00:00 (Romance Standard Time) ») n'est pas lue ; il
// faudrait la table des fuseaux Windows, à ajouter si Graph en rend en pratique.
const UTC_LINE = (label: string) =>
  new RegExp(`^${label} : (\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z)$`, 'm');

export type OutlookEventRow = {
  id: string;
  title: string | null;
  url: string | null;
  participants: string | null;
  text: string;
};

// Une réunion de l'agenda Outlook, à l'heure de Paris ; null quand son heure n'est pas lisible ou qu'elle est annulée.
export function outlookRendezVous(row: OutlookEventRow): RendezVous | null {
  const start = UTC_LINE('Début').exec(row.text)?.[1];
  if (!start || /^Statut : annulée$/m.test(row.text)) return null;
  const end = UTC_LINE('Fin').exec(row.text)?.[1];
  return {
    titre: row.title?.trim() || 'Sans objet',
    debut: parisTime(new Date(start)),
    fin: end ? parisTime(new Date(end)) : null,
    avec: row.participants,
    sourceId: row.id,
    outil: OUTLOOK,
    lien: row.url,
  };
}

// Ses réunions Outlook de la semaine : la dernière version de chacune (une réunion déplacée garde l'ancienne aussi,
// normalize.ts empreinte chaque texte), filtrées sur leur heure de début, à un jour près, puis au jour près en JS.
async function outlookEvents(tx: Tx, ctx: TenantContext, days: string[]): Promise<RendezVous[]> {
  const from = new Date(Date.parse(`${days[0]}T00:00:00Z`) - DAY_MS);
  const to = new Date(Date.parse(`${days[6]}T00:00:00Z`) + 2 * DAY_MS);
  const { rows } = await tx.execute<OutlookEventRow>(sql`
    select * from (
      select distinct on (s.id) s.id, s.title, s.metadata->>'url' as url,
             s.metadata->'origin'->>'participants' as participants, t.text
      from sources s
      join turns t on t.source_id = s.id and t.tenant_id = s.tenant_id
      where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId}
        and s.kind = ${OUTLOOK} and s.metadata->>'nature' = 'reunion'
        and t.text like 'Début : %'
      order by s.id, t.ts desc, t.created_at desc
    ) e
    where substring(e.text from '^Début : (\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z)')::timestamptz
          between ${from.toISOString()} and ${to.toISOString()}`);
  return rows.flatMap((row) => {
    const event = outlookRendezVous(row);
    return event && days.includes(event.debut.slice(0, 10)) ? [event] : [];
  });
}

export type Week = { days: string[]; rendezVous: RendezVous[]; preparedAt: Date | null };

// La semaine de Paris qui contient `now` : les réunions Outlook, puis les rendez-vous trouvés dans les e-mails dont
// la personne voit encore la source. Un rendez-vous des e-mails à la même heure et au même titre qu'une réunion
// Outlook (son invitation) n'est montré qu'une fois.
export async function readWeek(ctx: TenantContext, now: Date = new Date()): Promise<Week> {
  const days = weekDays(now);
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select({ rendezVous: agendas.rendezVous, preparedAt: agendas.preparedAt })
      .from(agendas)
      .where(and(eq(agendas.tenantId, ctx.tenantId), eq(agendas.userId, ctx.userId)));
    const fromMails = (row?.rendezVous ?? []).filter((r) => days.includes(r.debut.slice(0, 10)));
    const ids = [...new Set(fromMails.map((r) => r.sourceId))];
    const visible = new Map<string, { kind: string; url: string | null }>();
    if (ids.length > 0) {
      const { rows } = await tx.execute<{ id: string; kind: string; url: string | null }>(sql`
        select id, kind, metadata->>'url' as url from sources
        where tenant_id = ${ctx.tenantId} and id = any(${textArray(ids)}::uuid[])`);
      for (const source of rows) visible.set(source.id, source);
    }
    const events = await outlookEvents(tx, ctx, days);
    const shown = new Set(events.map((e) => `${e.debut}\u0000${e.titre.toLowerCase()}`));
    const mails = fromMails.flatMap((r): RendezVous[] => {
      const source = visible.get(r.sourceId);
      if (!source || shown.has(`${r.debut}\u0000${r.titre.toLowerCase()}`)) return [];
      return [
        {
          titre: r.titre,
          debut: r.debut,
          fin: r.fin ?? null,
          avec: r.avec ?? null,
          sourceId: r.sourceId,
          outil: source.kind,
          lien: source.url,
        },
      ];
    });
    return {
      days,
      rendezVous: [...events, ...mails].sort(byStart),
      preparedAt: row?.preparedAt ?? null,
    };
  });
}

// Le calendrier mérite d'être refait : jamais préparé, ou préparé il y a plus de AGENDA_STALE_MS.
export const agendaIsStale = (preparedAt: Date | null, now: Date = new Date()): boolean =>
  preparedAt === null || now.getTime() - preparedAt.getTime() > AGENDA_STALE_MS;

async function writeAgenda(
  ctx: TenantContext,
  rendezVous: StoredRendezVous[],
  sourceIds: string[],
  preparedAt: Date,
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    // Un compte supprimé depuis le début de la lecture, ou en train de l'être, ne garde pas de rendez-vous.
    if (!(await lockAccount(tx, ctx))) return;
    await tx
      .insert(agendas)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        rendezVous,
        sourceIds,
        preparedAt,
        acl: [ctx.userId],
      })
      .onConflictDoUpdate({
        target: [agendas.tenantId, agendas.userId],
        set: { rendezVous, sourceIds, preparedAt },
      });
  });
}

// Relit les derniers e-mails de la personne et garde les rendez-vous de cette semaine et de la suivante (le lundi
// matin, la semaine est déjà là). Sans e-mail, ou sans e-mail arrivé depuis la dernière lecture, aucun appel au
// modèle. Passé le plafond du jour, rien ne change. Une panne du modèle remonte (LlmError) et laisse l'ancien.
export async function refreshAgenda(
  ctx: TenantContext,
  deps: { llm: Llm; now?: Date },
): Promise<void> {
  if (await accountIsGone(ctx.userId)) return;
  const now = deps.now ?? new Date();
  // `seenAt` : l'heure de la base au moment de la lecture, que le calendrier garde comme heure de préparation : un
  // e-mail arrivé ensuite est du neuf pour la prochaine fois.
  const { mails, latest, preparedAt, seenAt } = await withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select({ preparedAt: agendas.preparedAt })
      .from(agendas)
      .where(and(eq(agendas.tenantId, ctx.tenantId), eq(agendas.userId, ctx.userId)));
    const { rows } = await tx.execute<{ at: string }>(sql`select extract(epoch from now()) as at`);
    return {
      ...(await recentMails(tx, ctx, now)),
      preparedAt: row?.preparedAt ?? null,
      seenAt: epochToDate(rows[0]?.at ?? 0),
    };
  });
  if (mails.length === 0) {
    await writeAgenda(ctx, [], [], seenAt);
    return;
  }
  if (preparedAt !== null && latest !== null && latest <= preparedAt) {
    await withTenant(ctx, (tx) =>
      tx
        .update(agendas)
        .set({ preparedAt: seenAt })
        .where(and(eq(agendas.tenantId, ctx.tenantId), eq(agendas.userId, ctx.userId))),
    );
    return;
  }
  const { rows } = await db.execute<{ ok: boolean }>(
    sql`select reserver_agenda(${ctx.userId}, ${AGENDA_DAILY_CAP}) as ok`,
  );
  if (rows[0]?.ok !== true) {
    console.warn('[leon]', 'agenda.daily_cap', JSON.stringify({ userId: ctx.userId }));
    return;
  }
  const days = weekDays(now);
  const period = {
    first: days[0] as string,
    last: weekDays(new Date(now.getTime() + 7 * DAY_MS))[6] as string,
  };
  const prompt = buildAgendaPrompt(mails, period);
  let answer = '';
  for await (const delta of deps.llm.streamText({
    step: 'agenda',
    system: prompt.system,
    messages: prompt.messages,
    maxTokens: AGENDA_MAX_TOKENS,
    signal: AbortSignal.timeout(AGENDA_TIMEOUT_MS),
  })) {
    answer += delta;
  }
  // Toutes les sources fournies au modèle, citées ou non.
  const sourceIds = [...new Set(mails.map((mail) => mail.sourceId))];
  const found = parseAgendaAnswer(answer, mails, period);
  // Des nombres seulement, jamais de texte : de quoi voir dans les journaux ce que la lecture a donné.
  console.info(
    '[leon]',
    'agenda.refreshed',
    JSON.stringify({
      userId: ctx.userId,
      mails: mails.length,
      found: found.length,
      chars: answer.length,
    }),
  );
  await writeAgenda(ctx, found, sourceIds, seenAt);
}
