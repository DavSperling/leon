import { sql } from 'drizzle-orm';
import { type SessionFacts, SessionFactsSchema } from '@/capture/session-facts';
import { CODE_SESSION_KINDS, type SourceKind } from '@/capture/turn';
import { safeUrl } from '@/lib/safe-url';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { epochToDate, LAST_TS_SQL, textArray } from '@/server/search/filters-sql';

// « Mes sessions » du bloc de démarrage (T04, D7 du plan mémoire des sessions) : un périmètre, pas un sujet. Les
// sessions de code du lecteur sur ce dépôt, lues par leurs métadonnées (les faits rangés par la route des faits,
// T02), sans modèle ni vecteur, dans une seule transaction sous withTenant : la route répond dans les 3 s du crochet.
// Le graphe (D5) s'arrête à une jointure : une PR des faits est reliée à sa source GitHub par sa clé exacte, et n'en
// garde que le lien (jamais le titre, écrit par n'importe qui sur GitHub).

// Contraintes globales du plan : 4 sessions au plus, sur 7 jours.
const START_SESSIONS_MAX = 4;
const START_SESSIONS_DAYS = 7;
const GITHUB = 'github' satisfies SourceKind;

export type StartPr = SessionFacts['prs'][number] & { url: string | null };
export type StartFacts = Omit<SessionFacts, 'prs'> & { prs: StartPr[] };
// `faits` nul : des faits rangés que le schéma ne lit plus. Une session sans faits (envoyée sans accord de version 2,
// ou avant ce chantier) n'est pas lue : elle prendrait l'une des 4 places pour n'en montrer que l'outil et la date.
export type StartSession = { kind: SourceKind; lastTs: Date; faits: StartFacts | null };

type SessionRow = { kind: SourceKind; faits: unknown; last_epoch: string };
type PrRow = { key: string; url: unknown };

// La clé de la source GitHub d'une PR (connectors/github/map.ts), sans la casse : celle du dépôt varie selon qui l'écrit.
// Les noms de dépôt GitHub sont en ASCII : `toLowerCase` vaut le `lower` de Postgres.
const prKey = (pr: SessionFacts['prs'][number]) => `pr:${pr.repo}#${pr.numero}`.toLowerCase();

export async function readStartSessions(
  ctx: TenantContext,
  input: { projet: string; branche: string | null; session: string },
): Promise<StartSession[]> {
  return withTenant(ctx, async (tx) => {
    // `owner_user_id` en plus de la sécurité par ligne : la session d'un collègue partagée avec le lecteur n'est
    // pas « mes sessions ».
    const { rows } = await tx.execute<SessionRow>(sql`
      select s.kind, s.metadata->'faits' as faits, extract(epoch from l.last_ts) as last_epoch
      from sources s
      cross join lateral (select ${LAST_TS_SQL} as last_ts) l
      where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId}
        and s.kind = any(${textArray(CODE_SESSION_KINDS)})
        and s.metadata->>'project' = ${input.projet}
        and s.metadata->'faits' is not null
        and s.external_id <> ${input.session}
        and l.last_ts >= now() - make_interval(days => ${START_SESSIONS_DAYS})
      order by coalesce(s.metadata->>'branche' = ${input.branche}, false) desc, l.last_ts desc, s.id
      limit ${START_SESSIONS_MAX}`);
    const sessions = rows.map((row) => {
      const faits = SessionFactsSchema.safeParse(row.faits);
      return {
        kind: row.kind,
        lastTs: epochToDate(row.last_epoch),
        faits: faits.success ? faits.data : null,
      };
    });
    const keys = [...new Set(sessions.flatMap((session) => session.faits?.prs.map(prKey) ?? []))];
    const urls = new Map<string, string | null>();
    if (keys.length > 0) {
      // Une PR relevée par deux membres a deux copies : la plus récente donne le lien. Sous la sécurité par ligne,
      // une PR que le lecteur ne voit pas n'est pas reliée.
      // shortcut: aucun index sur lower(external_id), la lecture parcourt les sources (10 ms sur 10 000 sous RLS) ;
      // ajouter un index (tenant_id, kind, lower(external_id)) quand la mesure du démarrage dépasse 100 ms.
      // shortcut: une seule jointure (D5), ni WITH RECURSIVE ni table de liens ; à revoir si un lien de profondeur 3 sert.
      const { rows: prs } = await tx.execute<PrRow>(sql`
        select distinct on (lower(s.external_id)) lower(s.external_id) as key, s.metadata->>'url' as url
        from sources s
        where s.tenant_id = ${ctx.tenantId} and s.kind = ${GITHUB}
          and lower(s.external_id) = any(${textArray(keys)})
        order by lower(s.external_id), ${LAST_TS_SQL} desc, s.id`);
      for (const pr of prs) urls.set(pr.key, safeUrl(pr.url));
    }
    return sessions.map(({ faits, ...session }) => ({
      ...session,
      faits: faits && {
        ...faits,
        prs: faits.prs.map((pr) => ({ ...pr, url: urls.get(prKey(pr)) ?? null })),
      },
    }));
  });
}
