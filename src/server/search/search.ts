import { type SQL, sql } from 'drizzle-orm';
import { CAPTURE_KINDS } from '@/capture/turn';
import { HIGHLIGHT_END, HIGHLIGHT_START } from '@/lib/highlight';
import type { TenantContext } from '@/server/auth/tenant-context';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { EMBEDDING_DIMS, type Embedder, EmbedderError } from '@/server/embeddings/embedder';
import { logError } from '@/server/log';
import { recentSources } from './activity';
import {
  epochToDate,
  LAST_TS_SQL,
  passageConditions,
  sourceConditions,
  sourceInfoFrom,
  textArray,
} from './filters-sql';
import { parseQuery } from './parse-query';
import { myAddresses, resolvePeople } from './people';
import {
  PAGE_SIZE,
  PASSAGES_PER_SOURCE,
  type PassageHit,
  type SearchFilters,
  type SearchPage,
  type SourceHit,
} from './types';

// La recherche (C4 du plan du deuxième jet), la seule pour tous les usages : la barre, la réponse en tête, la
// discussion, le point du matin, le MCP. Elle tourne toujours sous `withTenant` du lecteur : la sécurité par
// ligne retire ce qu'il ne voit pas avant tout classement, et rien ici n'ouvre d'autre accès à la base.
//
// Trois classements de candidats, fusionnés par RRF (rang réciproque, k = 60) :
//   - le plein texte des passages (français et simple, `ts_rank_cd`) ;
//   - le titre de la source, à une faute de frappe près (trigrammes) ;
//   - les vecteurs du modèle courant, quand un fournisseur est réglé et répond à temps.
// Le score d'une source est celui de son meilleur passage plus celui de son titre, multiplié par un facteur de
// récence et par un bonus de 10 % pour ce dont le lecteur est l'auteur. Les sources se regroupent, trois
// passages au plus sous chacune.

// Candidats gardés par classement : de quoi remplir quelques pages, sans classer toute la base.
const CANDIDATES = 300;
const RRF_K = 60;
const RECENCY_FLOOR = 0.7;
const RECENCY_RANGE = 0.3;
const RECENCY_DAYS = 180;
// L'exposant du facteur de récence ne dépasse pas cette valeur : au-delà, `exp` sort de l'intervalle des
// nombres à virgule de Postgres (erreur « underflow » vers -745) et ferait échouer toute recherche dont une
// source est très ancienne. L'ingestion accepte toute date lisible (la « date zéro » `0001-01-01` de Go, de
// .NET et de Microsoft Graph, par exemple). À 50, le facteur vaut 0,7 à 1e-22 près : un résultat inchangé.
const RECENCY_EXP_MAX = 50;
const ME_BONUS = 1.1;
// Un titre répond à partir de cette ressemblance de trigrammes (0 : rien en commun, 1 : identique), le seuil
// par défaut de pg_trgm. Titres gardés : une centaine suffit à remplir quelques pages.
const TITLE_SIMILARITY = 0.3;
const TITLE_CANDIDATES = 100;
// Voisins que l'index HNSW garde en mémoire à chaque étape de son parcours (pgvector : 40 par défaut).
const HNSW_EF_SEARCH = 100;
// Distance cosinus au-delà de laquelle un passage ne répond plus (0 : même sens, 1 : sans rapport). Sans seuil,
// les vecteurs rendraient les passages les plus proches même pour une requête sans aucun rapport, et « Aucun
// résultat » n'arriverait jamais. Provisoire : à régler avec les fournisseurs candidats sur le jeu d'essai (T30).
export const MAX_VECTOR_DISTANCE = 0.8;
// La recherche n'attend pas le fournisseur de vecteurs plus longtemps : passé ce délai, elle répond au plein
// texte seul (une recherche lente est un échec, et la barre ne doit jamais dépendre d'un fournisseur).
export const EMBED_QUERY_TIMEOUT_MS = 3000;
// Valeurs d'un vecteur que `halfvec` accepte (±65 504).
const VECTOR_VALUE_MAX = 60_000;
const PAGE_MAX = 50;
const SNIPPET_CHARS = 240;
// Extrait avec les mots trouvés entourés des marqueurs de surlignage (C6), deux morceaux au plus.
const HEADLINE_OPTIONS = [
  `StartSel=${HIGHLIGHT_START}`,
  `StopSel=${HIGHLIGHT_END}`,
  'MaxFragments=2',
  'MaxWords=30',
  'MinWords=12',
  'FragmentDelimiter=" … "',
].join(', ');

// Les constantes numériques ci-dessus sont écrites dans la requête : jamais une valeur venue d'ailleurs.
const num = (value: number): SQL => sql.raw(String(value));

type Tools = NonNullable<SearchFilters['tools']>;
type Natures = NonNullable<SearchFilters['natures']>;

const emptyToUndefined = <T>(list: T[] | undefined): T[] | undefined =>
  list && list.length > 0 ? list : undefined;

function intersect<T>(a: T[] | undefined, b: T[] | undefined): T[] | undefined {
  if (!a) return b;
  if (!b) return a;
  return a.filter((value) => b.includes(value));
}

// Les filtres passés à part et ceux écrits dans la requête s'appliquent tous deux : les outils et les types se
// croisent, la date la plus étroite l'emporte, les auteurs s'additionnent (comme deux `de:`). Une liste vide
// ne restreint rien. `impossible` : deux listes sans rien en commun.
function mergeFilters(
  explicit: SearchFilters,
  inline: Omit<SearchFilters, 'authorEmails' | 'authorNames'>,
  authors: Pick<SearchFilters, 'authorEmails' | 'authorNames'>,
): { filters: SearchFilters; impossible: boolean } {
  const tools: Tools | undefined = intersect(emptyToUndefined(explicit.tools), inline.tools);
  const natures: Natures | undefined = intersect(
    emptyToUndefined(explicit.natures),
    inline.natures,
  );
  const latest = (a: Date | undefined, b: Date | undefined) =>
    a && b ? (a > b ? a : b) : (a ?? b);
  const earliest = (a: Date | undefined, b: Date | undefined) =>
    a && b ? (a < b ? a : b) : (a ?? b);
  const authorEmails = [
    ...new Set([...(explicit.authorEmails ?? []), ...(authors.authorEmails ?? [])]),
  ];
  const authorNames = [...(explicit.authorNames ?? []), ...(authors.authorNames ?? [])];
  const since = latest(explicit.since, inline.since);
  const until = earliest(explicit.until, inline.until);
  return {
    impossible: tools?.length === 0 || natures?.length === 0,
    filters: {
      ...(tools ? { tools } : {}),
      ...(natures ? { natures } : {}),
      ...(authorEmails.length > 0 ? { authorEmails } : {}),
      ...(authorNames.length > 0 ? { authorNames } : {}),
      ...(since ? { since } : {}),
      ...(until ? { until } : {}),
    },
  };
}

const hasFilters = (filters: SearchFilters) => Object.keys(filters).length > 0;

function isUsableVector(vector: unknown): vector is number[] {
  return (
    Array.isArray(vector) &&
    vector.length === EMBEDDING_DIMS &&
    vector.every((x) => Number.isFinite(x) && Math.abs(x) <= VECTOR_VALUE_MAX)
  );
}

// Le vecteur de la requête, ou null quand le fournisseur échoue, répond de travers ou tarde trop. Le message
// d'une erreur du fournisseur ne sort pas dans les journaux (il peut citer la requête ou la clé) ; la requête
// non plus.
async function embedQuery(embedder: Embedder, text: string): Promise<number[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new EmbedderError('délai dépassé du fournisseur')),
        EMBED_QUERY_TIMEOUT_MS,
      );
    });
    const [vector] = await Promise.race([embedder.embed([text], 'requete'), deadline]);
    if (!isUsableVector(vector)) throw new EmbedderError('réponse inattendue du fournisseur');
    return vector;
  } catch (error) {
    logError(
      'search.embed_query_failed',
      error instanceof EmbedderError ? error : new Error('erreur inattendue du fournisseur'),
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Ce que le lecteur a écrit : ses adresses et, T19, ses identifiants d'outil. Au niveau du passage ; pour ses
// conversations (aucun auteur n'est noté sur leurs tours), la source suffit (voir `ranked`).
function mineCondition(me: Awaited<ReturnType<typeof myAddresses>>): SQL {
  const parts: SQL[] = [];
  if (me.emails.length > 0) {
    parts.push(sql`lower(p.author_email) = any(${textArray(me.emails)})`);
  }
  for (const name of me.names) {
    parts.push(sql`(s.kind = ${name.kind} and lower(p.author_name) = ${name.name.toLowerCase()})`);
  }
  return parts.length > 0 ? sql`coalesce(${sql.join(parts, sql` or `)}, false)` : sql`false`;
}

// Les réglages de l'index vectoriel, dans un point de sauvegarde. Une base dont pgvector est trop ancien (avant
// 0.8, sans `hnsw.iterative_scan`) les refuse, et ce refus abandonnerait toute la transaction : la recherche
// retombe alors sur le plein texte seul, comme quand le fournisseur de vecteurs tombe. Les réglages posés
// tiennent jusqu'à la fin de la transaction (`set local`).
async function tuneVectorIndex(tx: Tx): Promise<boolean> {
  try {
    await tx.transaction(async (interne) => {
      // Les voisins se cherchent par l'index sans qu'un filtre vide la liste : le parcours continue jusqu'à en
      // avoir assez (pgvector 0.8).
      await interne.execute(sql`set local hnsw.iterative_scan = relaxed_order`);
      await interne.execute(sql`set local hnsw.ef_search = ${num(HNSW_EF_SEARCH)}`);
    });
    return true;
  } catch {
    // Le message de la base n'est pas gardé : la requête peut y figurer.
    logError('search.vector_settings_failed', new Error('réglage des vecteurs refusé par la base'));
    return false;
  }
}

type SearchRow = {
  total: number;
  source_id: string | null;
  kind: string | null;
  title: string | null;
  metadata: unknown;
  last_epoch: string | null;
  score: number | null;
  passage_id: string | null;
  turn_id: string | null;
  epoch: string | null;
  author_name: string | null;
  snippet: string | null;
};

// Les sources de la page, avec leurs passages, et le nombre de sources qui répondent.
async function rankedSources(
  tx: Tx,
  ctx: TenantContext,
  query: {
    text: string;
    filters: SearchFilters;
    vector: number[] | null;
    model: string | null;
    me: Awaited<ReturnType<typeof myAddresses>>;
    now: Date;
    offset: number;
  },
): Promise<{ hits: SourceHit[]; total: number; usedVectors: boolean }> {
  const { text, filters, me } = query;
  const tenant = ctx.tenantId;
  // Une expression sans variable de ligne : Postgres la calcule une fois et peut s'en servir pour l'index.
  const tsq = sql`(websearch_to_tsquery('french', ${text}) || websearch_to_tsquery('simple', ${text}))`;
  const plain = text.replace(/"/g, ' ');
  const sourceWhere = sourceConditions(filters);
  const passageWhere = passageConditions(filters, sql`s.kind`);
  const snippet = sql`(case when numnode(${tsq}) > 0
    then ts_headline('french', p.text, ${tsq}, ${HEADLINE_OPTIONS})
    else left(p.text, ${num(SNIPPET_CHARS)}) end)`;

  // Réglages de cette transaction seulement (`set local`) ; les valeurs sont des constantes du code.
  await tx.execute(sql`set local pg_trgm.similarity_threshold = ${num(TITLE_SIMILARITY)}`);
  // Sans réglage accepté, plus de vecteurs : le plein texte seul répond (voir `tuneVectorIndex`).
  const vector = query.vector !== null && (await tuneVectorIndex(tx)) ? query.vector : null;
  const literal = vector ? `[${vector.join(',')}]` : null;
  // Sans filtre, la requête ne lit que les vecteurs : l'index HNSW la sert directement. Avec un filtre sur la
  // source ou le passage, elle les joint : Postgres choisit alors entre un parcours filtré de l'index (qui se
  // poursuit tant qu'il n'a pas ses candidats) et un tri exact des passages qui passent le filtre.
  const neighbours = (join: SQL, where: SQL) => sql`
    select v.passage_id, v.embedding <=> ${literal}::halfvec(${num(EMBEDDING_DIMS)}) as dist
    from passage_vectors v ${join}
    where v.tenant_id = ${tenant} and v.model = ${query.model} ${where}
    order by dist
    limit ${num(CANDIDATES)}`;
  const joined = sql`
    join passages p on p.tenant_id = v.tenant_id and p.id = v.passage_id
    join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id`;
  const vectorLeg =
    vector && literal
      ? sql`vec as (
          select passage_id, rank() over (order by dist) as r from (
            ${hasFilters(filters) ? neighbours(joined, sql`and ${passageWhere} and ${sourceWhere}`) : neighbours(sql``, sql``)}
          ) neighbours
          where dist < ${num(MAX_VECTOR_DISTANCE)}
        )`
      : sql`vec as (select null::uuid as passage_id, null::bigint as r where false)`;

  const { rows } = await tx.execute<SearchRow>(sql`
    with
    ft as (
      select passage_id, rank() over (order by score desc) as r from (
        select p.id as passage_id, ts_rank_cd(p.tsv, ${tsq}) as score
        from passages p
        join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
        where p.tenant_id = ${tenant} and p.tsv @@ ${tsq} and ${passageWhere} and ${sourceWhere}
        order by score desc
        limit ${num(CANDIDATES)}
      ) matches
    ),
    ${vectorLeg},
    fused as (
      select coalesce(f.passage_id, v.passage_id) as passage_id,
             (coalesce(1.0 / (${num(RRF_K)} + f.r), 0) + coalesce(1.0 / (${num(RRF_K)} + v.r), 0))::float8 as rrf
      from ft f full join vec v on v.passage_id = f.passage_id
    ),
    cand as (
      select fu.passage_id, p.source_id, fu.rrf, ${mineCondition(me)} as mine
      from fused fu
      join passages p on p.tenant_id = ${tenant} and p.id = fu.passage_id
      join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
    ),
    title as (
      select source_id, rank() over (order by sim desc) as r from (
        select s.id as source_id, similarity(s.title, ${plain}) as sim
        from sources s
        where s.tenant_id = ${tenant} and s.title % ${plain} and ${sourceWhere}
          and exists (
            select 1 from passages p
            where p.tenant_id = s.tenant_id and p.source_id = s.id and ${passageWhere})
        order by sim desc
        limit ${num(TITLE_CANDIDATES)}
      ) near_titles
    ),
    ranked as (
      select r.*,
             r.relevance
               * (${num(RECENCY_FLOOR)} + ${num(RECENCY_RANGE)} * exp(-least(${num(RECENCY_EXP_MAX)}, greatest(0,
                   extract(epoch from (${query.now.toISOString()}::timestamptz - r.last_ts))::float8 / 86400)
                   / ${num(RECENCY_DAYS)})))
               * (case when r.mine then ${num(ME_BONUS)} else 1 end) as score
      from (
        select s.id as source_id, s.kind, s.title, s.metadata, ${LAST_TS_SQL} as last_ts,
               (coalesce(c.best, 0) + coalesce(1.0 / (${num(RRF_K)} + ti.r), 0))::float8 as relevance,
               (coalesce(c.mine, false)
                 or (s.owner_user_id = ${ctx.userId} and s.kind = any(${textArray(CAPTURE_KINDS)}))) as mine
        from sources s
        left join (
          select source_id, max(rrf) as best, bool_or(mine) as mine from cand group by source_id
        ) c on c.source_id = s.id
        left join title ti on ti.source_id = s.id
        where s.tenant_id = ${tenant} and (c.source_id is not null or ti.source_id is not null)
      ) r
    )
    select tt.total, pg.source_id, pg.kind, pg.title, pg.metadata,
           extract(epoch from pg.last_ts) as last_epoch, pg.score,
           pp.passage_id, pp.turn_id, extract(epoch from pp.ts) as epoch, pp.author_name, pp.snippet
    from (select count(*)::int as total from ranked) tt
    left join lateral (
      select * from ranked order by score desc, last_ts desc, source_id
      offset ${query.offset} limit ${num(PAGE_SIZE)}
    ) pg on true
    left join lateral (
      (select p.id as passage_id, p.turn_id, p.ts, p.ord, p.author_name, ${snippet} as snippet,
              c.rrf as prank
       from cand c join passages p on p.id = c.passage_id
       where c.source_id = pg.source_id
       order by c.rrf desc, p.ts desc, p.ord
       limit ${num(PASSAGES_PER_SOURCE)})
      union all
      -- Une source trouvée par son titre seul : le début de son premier passage.
      (select p.id, p.turn_id, p.ts, p.ord, p.author_name, ${snippet}, 0::float8
       from passages p
       join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
       where p.tenant_id = ${tenant} and p.source_id = pg.source_id
         and not exists (select 1 from cand c where c.source_id = pg.source_id)
         and ${passageWhere}
       order by p.ts, p.ord
       limit 1)
    ) pp on true
    order by pg.score desc nulls last, pg.last_ts desc, pg.source_id, pp.prank desc nulls last, pp.ts desc, pp.ord`);

  const hits = new Map<string, SourceHit>();
  for (const row of rows) {
    if (row.source_id === null || row.kind === null || row.last_epoch === null) continue;
    let hit = hits.get(row.source_id);
    if (!hit) {
      hit = {
        ...sourceInfoFrom({
          id: row.source_id,
          kind: row.kind,
          title: row.title,
          metadata: row.metadata,
          lastTs: epochToDate(row.last_epoch),
        }),
        passages: [],
        score: Number(row.score),
      };
      hits.set(row.source_id, hit);
    }
    if (row.passage_id !== null && row.turn_id !== null && row.epoch !== null) {
      const passage: PassageHit = {
        passageId: row.passage_id,
        turnId: row.turn_id,
        snippet: row.snippet ?? '',
        ts: epochToDate(row.epoch),
        authorName: row.author_name,
      };
      hit.passages.push(passage);
    }
  }
  return { hits: [...hits.values()], total: rows[0]?.total ?? 0, usedVectors: vector !== null };
}

const hasWords = (text: string) => /[\p{L}\p{N}]/u.test(text);

export async function searchPassages(
  ctx: TenantContext,
  input: {
    query: string;
    filters?: SearchFilters;
    page?: number;
    embedder?: Embedder | null;
    now?: Date;
  },
): Promise<SearchPage> {
  const now = input.now ?? new Date();
  const parsed = parseQuery(input.query, now);
  const searchable = hasWords(parsed.text);
  const requested = input.page ?? 1;
  const page = Number.isInteger(requested) && requested >= 1 ? Math.min(requested, PAGE_MAX) : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const people = parsed.people.length > 0 ? await resolvePeople(ctx, parsed.people) : null;
  const { filters, impossible } = mergeFilters(input.filters ?? {}, parsed.filters, {
    authorEmails: people?.authorEmails,
    authorNames: people?.authorNames,
  });
  const unknownPeople = people?.unknown ?? [];
  // Des personnes nommées que personne ne porte : rien à leur attribuer, on ne devine pas.
  const nobody =
    parsed.people.length > 0 && !filters.authorEmails?.length && !filters.authorNames?.length;
  const empty: SearchPage = { hits: [], totalSources: 0, mode: 'plein-texte', unknownPeople };
  if (impossible || nobody) return empty;

  if (!searchable) {
    // Sans mot à chercher : les sources les plus récentes qui passent les filtres, s'il y en a.
    if (!hasFilters(filters)) return empty;
    const recent = await withTenant(ctx, (tx) =>
      recentSources(tx, ctx, filters, { limit: PAGE_SIZE, offset }),
    );
    return { hits: recent.hits, totalSources: recent.total, mode: 'plein-texte', unknownPeople };
  }

  // Le fournisseur de vecteurs est payant : il n'est interrogé qu'ici, une fois sûr que la recherche a lieu
  // (ni outils sans rien en commun, ni personne inconnue), pendant que la base donne les adresses du lecteur.
  const [vector, me] = await Promise.all([
    input.embedder ? embedQuery(input.embedder, parsed.text.replace(/"/g, ' ')) : null,
    myAddresses(ctx),
  ]);
  const found = await withTenant(ctx, (tx) =>
    rankedSources(tx, ctx, {
      text: parsed.text,
      filters,
      vector,
      model: vector ? (input.embedder?.model ?? null) : null,
      me,
      now,
      offset,
    }),
  );
  return {
    hits: found.hits,
    totalSources: found.total,
    mode: found.usedVectors ? 'hybride' : 'plein-texte',
    unknownPeople,
  };
}
