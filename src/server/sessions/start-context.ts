import { sql } from 'drizzle-orm';
import { type SessionFacts, SessionFactsSchema } from '@/capture/session-facts';
import { CODE_SESSION_KINDS, repoOf, type SourceKind } from '@/capture/turn';
import { safeUrl } from '@/lib/safe-url';
import type { TenantContext } from '@/server/auth/tenant-context';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { epochToDate, LAST_TS_SQL, textArray } from '@/server/search/filters-sql';
import { TEAM_LINES_MAX } from './render-context';

// « Mes sessions » du bloc de démarrage (T04, D7 du plan mémoire des sessions) : un périmètre, pas un sujet. Les
// sessions de code du lecteur sur ce dépôt, lues par leurs métadonnées (les faits rangés par la route des faits,
// T02), sans modèle ni vecteur, dans une seule transaction sous withTenant : la route répond dans les 3 s du crochet.
// Le graphe (D5) s'arrête à une jointure : une PR des faits est reliée à sa source GitHub par sa clé exacte, ou à
// défaut par la branche, et en garde le lien et l'état (T14, les clés d'origine de T13). Son titre, écrit par
// n'importe qui sur GitHub, n'est gardé que s'il est du lecteur.
// « L'équipe sur ce dépôt » (T14, décision E) : les PR récentes de l'équipe, lues de la même façon et dans la même
// transaction, sans aucun appel à GitHub, et seulement pour un lecteur dont la propre relève GitHub vient de lire ce
// dépôt d'équipe (D14).

// Contraintes globales du plan : 4 sessions au plus, sur 7 jours ; 10 lignes d'équipe, fusionnées depuis 72 h ou
// ouvertes et modifiées depuis 30 jours ; un dépôt confirmé depuis moins de 24 h.
const START_SESSIONS_MAX = 4;
const START_SESSIONS_DAYS = 7;
const HOUR_MS = 3_600_000;
const TEAM_MERGED_MS = 72 * HOUR_MS;
const TEAM_OPEN_MS = 30 * 24 * HOUR_MS;
const CONFIRMED_MS = 24 * HOUR_MS;
const GITHUB = 'github' satisfies SourceKind;
// shortcut: la branche par défaut n'est pas relevée (aucun appel à GitHub ici), main et master seulement ; ranger
// `default_branch` dans l'origin des PR (T13) quand un dépôt d'équipe en a une autre.
const DEFAULT_BRANCHES = new Set(['main', 'master']);

type PrState = 'open' | 'merged' | 'closed';
export type StartPr = Omit<SessionFacts['prs'][number], 'par'> & {
  par: SessionFacts['prs'][number]['par'] | 'branche';
  url: string | null;
  etat: PrState | null;
  titre: string | null;
};
// `perime` : une PR de la session a été fusionnée ou fermée après elle, son reste à faire l'est peut-être aussi.
export type StartFacts = Omit<SessionFacts, 'prs'> & { prs: StartPr[]; perime: boolean };
// `faits` nul : des faits rangés que le schéma ne lit plus. Une session sans faits (envoyée sans accord de version 2,
// ou avant ce chantier) n'est pas lue : elle prendrait l'une des 4 places pour n'en montrer que l'outil et la date.
export type StartSession = { kind: SourceKind; lastTs: Date; faits: StartFacts | null };
// Une ligne d'équipe : des clés, jamais un titre. `date` : la fusion, ou la dernière modification d'une PR ouverte.
export type TeamPr = {
  numero: number;
  etat: 'merged' | 'open';
  date: Date;
  membre: string | null;
  branche: string | null;
  brouillon: boolean;
  ferme: string | null;
};

type SessionRow = { kind: SourceKind; faits: unknown; last_epoch: string };
type PrRow = {
  key: string;
  url: unknown;
  etat: string | null;
  fini: string | null;
  titre: string | null;
};
type BranchRow = PrRow & { branche: string };
type TeamRow = Omit<TeamPr, 'numero' | 'date'> & { key: string; quand: string };
type PrInfo = Pick<StartPr, 'url' | 'etat' | 'titre'> & { fini: number };

// La clé de la source GitHub d'une PR (connectors/github/map.ts), sans la casse : celle du dépôt varie selon qui l'écrit.
// Les noms de dépôt GitHub sont en ASCII : `toLowerCase` vaut le `lower` de Postgres.
const prKey = (pr: SessionFacts['prs'][number]) => `pr:${pr.repo}#${pr.numero}`.toLowerCase();
const numberOf = (key: string) => Number(key.slice(key.lastIndexOf('#') + 1));
// Les dates rangées par GitHub et par saveSyncProgress sont en ISO 8601, en UTC : elles se comparent en texte, et une
// valeur mal formée ne fait pas échouer la lecture (un transtypage en timestamptz la ferait échouer).
const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();

// Une PR relevée par deux membres a deux copies : la plus récemment modifiée sur GitHub donne le lien et l'état ; à
// date égale, celle qui porte les faits de T13, pas une copie relevée avant eux et jamais rattrapée.
const LATEST_COPY = sql`s.metadata->>'updatedAt' desc nulls last,
  (s.metadata->'origin'->>'etat' is not null) desc, ${LAST_TS_SQL} desc, s.id`;

// La copie la plus récente de chaque PR du dépôt, filtrée ensuite : une copie ancienne ne fait pas revenir un état
// passé. Sous la sécurité par ligne, une PR que le lecteur ne voit pas n'en fait pas partie.
const latestPrs = (ctx: TenantContext, repo: string) => sql`
  select distinct on (lower(s.external_id)) lower(s.external_id) as key, s.tenant_id, s.title, s.metadata,
    s.metadata->'origin' as origin, s.metadata->>'updatedAt' as updated
  from sources s
  where s.tenant_id = ${ctx.tenantId} and s.kind = ${GITHUB}
    and lower(s.metadata->'origin'->>'repo') = ${repo} and s.external_id like 'pr:%'
  order by lower(s.external_id), ${LATEST_COPY}`;

// Ce que la source d'une PR dit d'elle (T13). `fini` : la fusion. Le titre n'entre que s'il est du lecteur, de
// l'équipe : `auteur` est le login de sa propre connexion GitHub (l'intitulé de la connexion, oauth-routes.ts).
// shortcut: une PR fermée sans fusion n'a pas de date de fin, elle ne rend jamais « peut-être périmé » ; ranger
// closed_at dans l'origin (T13) si l'on veut ce marquage.
const prColumns = (ctx: TenantContext) => sql`
  s.metadata->>'url' as url, s.metadata->'origin'->>'etat' as etat, s.metadata->'origin'->>'fini_le' as fini,
  case when s.metadata->'origin'->>'cote' = 'equipe' and exists (
    select 1 from connections c
    where c.tenant_id = s.tenant_id and c.created_by = ${ctx.userId} and c.provider = ${GITHUB}
      and lower(c.label) = lower(s.metadata->'origin'->>'auteur')) then s.title end as titre`;

function prInfo(row: PrRow): PrInfo {
  const etat = row.etat?.startsWith('closed') ? 'closed' : row.etat;
  return {
    url: safeUrl(row.url),
    etat: etat === 'open' || etat === 'merged' || etat === 'closed' ? etat : null,
    // map.ts écrit « #n titre » : le numéro est déjà dans le bloc.
    titre: row.titre?.replace(/^#\d+ /, '') || null,
    fini: Date.parse(row.fini ?? ''),
  };
}

export async function readStartContext(
  ctx: TenantContext,
  input: { projet: string; branche: string | null; session: string },
): Promise<{ sessions: StartSession[]; equipe: TeamPr[] }> {
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
    const exact = new Map<string, PrInfo>();
    if (keys.length > 0) {
      // Sous la sécurité par ligne, une PR que le lecteur ne voit pas n'est pas reliée.
      // shortcut: aucun index sur lower(external_id), la lecture parcourt les sources (10 ms sur 10 000 sous RLS) ;
      // ajouter un index (tenant_id, kind, lower(external_id)) quand la mesure du démarrage dépasse 100 ms.
      // shortcut: une seule jointure (D5), ni WITH RECURSIVE ni table de liens ; à revoir si un lien de profondeur 3 sert.
      const { rows: prs } = await tx.execute<PrRow>(sql`
        select distinct on (lower(s.external_id)) lower(s.external_id) as key, ${prColumns(ctx)}
        from sources s
        where s.tenant_id = ${ctx.tenantId} and s.kind = ${GITHUB}
          and lower(s.external_id) = any(${textArray(keys)})
        order by lower(s.external_id), ${LATEST_COPY}`);
      for (const pr of prs) exact.set(pr.key, prInfo(pr));
    }
    // À défaut de lien exact (aucune PR des faits n'a de source visible), la branche : seulement une PR de l'équipe
    // dont la tête est dans le dépôt (pas un fork, qui peut porter n'importe quel nom de branche), et jamais la branche
    // par défaut, que tout le monde partage. Les PR des faits restent dans l'en-tête, avant celle de la branche.
    const unresolved = (faits: SessionFacts) => faits.prs.every((pr) => !exact.has(prKey(pr)));
    const repo = repoOf(input.projet);
    const branches = [
      ...new Set(
        sessions.flatMap(({ faits }) =>
          faits && unresolved(faits) && faits.branche && !DEFAULT_BRANCHES.has(faits.branche)
            ? [faits.branche]
            : [],
        ),
      ),
    ];
    const byBranch = new Map<string, Pick<StartPr, 'repo' | 'numero'> & PrInfo>();
    if (repo && branches.length > 0) {
      const { rows: prs } = await tx.execute<BranchRow>(sql`
        select s.key, ${prColumns(ctx)}, s.origin->>'branche' as branche
        from (${latestPrs(ctx, repo)}) s
        where s.origin->>'branche' = any(${textArray(branches)})
          and s.origin->>'cote' = 'equipe' and lower(s.origin->>'tete') = ${repo}
        order by s.updated desc nulls last, s.key`);
      // La plus récemment modifiée, quand une branche a servi à plusieurs PR.
      for (const pr of prs) {
        if (!byBranch.has(pr.branche))
          byBranch.set(pr.branche, { repo, numero: numberOf(pr.key), ...prInfo(pr) });
      }
    }
    const start = sessions.map(({ faits, ...session }) => {
      if (!faits) return { ...session, faits: null };
      const linked = unresolved(faits) && faits.branche ? byBranch.get(faits.branche) : undefined;
      const prs = [
        ...faits.prs.map((pr) => ({
          ...pr,
          url: null,
          etat: null,
          titre: null,
          fini: Number.NaN,
          ...exact.get(prKey(pr)),
        })),
        ...(linked ? [{ par: 'branche' as const, ...linked }] : []),
      ];
      const after = session.lastTs.getTime();
      return {
        ...session,
        faits: {
          ...faits,
          prs: prs.map(({ fini: _fini, ...pr }) => pr),
          perime: prs.some(
            (pr) => (pr.etat === 'merged' || pr.etat === 'closed') && pr.fini > after,
          ),
        },
      };
    });
    return { sessions: start, equipe: repo ? await readTeamPrs(tx, ctx, input.projet, repo) : [] };
  });
}

// L'équipe sur ce dépôt : rien hors d'un dépôt d'équipe, ni pour un lecteur dont la propre connexion GitHub, active,
// n'a pas lu ce dépôt depuis moins de 24 h (`depots_confirmes`, T11) ; sa relève a alors vérifié sa permission. Une
// seule lecture SQL sous RLS, dans la transaction de mes sessions : les deux tiennent une seule connexion du pool.
// Le membre est le nom de celui dont une connexion GitHub porte le login de l'auteur. La branche d'une PR venue d'un
// fork, qu'un tiers a pu nommer, n'est pas montrée.
async function readTeamPrs(
  tx: Tx,
  ctx: TenantContext,
  projet: string,
  repo: string,
): Promise<TeamPr[]> {
  const { rows } = await tx.execute<TeamRow>(sql`
    select p.key, p.origin->>'etat' as etat,
      case when p.origin->>'etat' = 'merged' then p.origin->>'fini_le' else p.updated end as quand,
      coalesce((
        select u.name from connections c
        join member m on m."userId" = c.created_by and m."organizationId" = c.tenant_id
        join "user" u on u.id = c.created_by
        where c.tenant_id = ${ctx.tenantId} and c.provider = ${GITHUB}
          and lower(c.label) = lower(p.origin->>'auteur')
        order by c.created_at, c.id limit 1), p.origin->>'auteur') as membre,
      case when lower(p.origin->>'tete') = ${repo} then p.origin->>'branche' end as branche,
      coalesce(p.origin->>'brouillon' = 'oui', false) as brouillon, p.origin->>'ferme' as ferme
    from (${latestPrs(ctx, repo)}) p
    where exists (
        select 1 from depots_equipe d where d.tenant_id = ${ctx.tenantId} and d.project = ${projet})
      and exists (
        select 1 from connections c
        cross join lateral jsonb_array_elements(case when jsonb_typeof(c.config->'depots_confirmes') = 'array'
          then c.config->'depots_confirmes' else '[]'::jsonb end) e
        where c.tenant_id = ${ctx.tenantId} and c.created_by = ${ctx.userId} and c.provider = ${GITHUB}
          and c.status = 'active' and lower(e->>'depot') = ${projet}
          and e->>'confirme_le' >= ${isoAgo(CONFIRMED_MS)})
      and p.origin->>'cote' = 'equipe'
      and ((p.origin->>'etat' = 'merged' and p.origin->>'fini_le' >= ${isoAgo(TEAM_MERGED_MS)})
        or (p.origin->>'etat' = 'open' and p.updated >= ${isoAgo(TEAM_OPEN_MS)}))
    order by p.origin->>'etat' = 'merged' desc, quand desc, p.key
    limit ${TEAM_LINES_MAX}`);
  return rows.flatMap(({ key, quand, ...row }) => {
    const at = Date.parse(quand);
    return Number.isNaN(at) ? [] : [{ ...row, numero: numberOf(key), date: new Date(at) }];
  });
}
