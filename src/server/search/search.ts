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
import { type QueryTerms, queryTerms, withoutNegations } from './query-terms';
import {
  PAGE_MAX,
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
//
// Le plein texte se fait en deux passes (T06b), sur la requête sans ses mots outils (query-terms.ts) ; le titre et
// les vecteurs gardent la requête entière. La première passe exige tous les mots. Quand elle, les titres et les
// vecteurs trouvent ensemble moins de sources qu'une page, la passe élargie se contente d'un mot, mais garde les
// expressions exigées et les mots niés exclus ; elle ne cherche que dans les sources qu'aucun classement n'a
// trouvées, se range après elles dans le classement du plein texte (rangs à la suite), et ses sources passent
// après toutes les autres, d'abord celles qui couvrent le plus de mots : entre deux rangs voisins, la fusion ne
// laisse qu'un écart de 2 % environ, que la récence (jusqu'à 30 %) effacerait. Le score d'une source de la passe
// élargie peut donc dépasser celui d'une source rendue avant elle : l'ordre rendu est le classement.
//
// Coût : la sécurité par ligne empêche Postgres de se servir de l'index GIN du plein texte (l'opérateur `@@` n'est
// pas « leakproof ») ; chaque passe lit donc tous les passages visibles de l'organisation, en temps proportionnel
// au corpus. La passe élargie n'a lieu que si la page n'est pas pleine, sur WIDE_WORDS_MAX mots au plus.

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
// résultat » n'arriverait jamais. Mesuré avec voyage-4. Le 20/10/2026, à 0,8, 91 % des paires de passages tirées au
// hasard passaient. Le 27/10/2026 (passages et questions typés) : sur les 17 questions du jeu d'essai, le rappel à 10
// reste à 94 % de 0,55 à 0,65, et les sources sans rapport sous le seuil passent de 10 par question à 0,55 à 22 à 0,6
// et 50 à 0,65 ; sur des fichiers Drive courts (200 à 600 caractères), les bonnes sources tombent entre 0,41 et 0,65,
// et le rappel passe de 70 % à 0,55 à 100 % dès 0,6. Le bruit en plus reste derrière les bonnes sources (MRR 0,85 → 0,84).
// shortcut: seuil réglé pour voyage-4 seul, à mesurer de nouveau avant de changer de modèle de vecteurs.
export const MAX_VECTOR_DISTANCE = 0.6;
// La recherche n'attend pas le fournisseur de vecteurs plus longtemps : passé ce délai, elle répond au plein
// texte seul (une recherche lente est un échec, et la barre ne doit jamais dépendre d'un fournisseur).
export const EMBED_QUERY_TIMEOUT_MS = 3000;
// Valeurs d'un vecteur que `halfvec` accepte (±65 504).
const VECTOR_VALUE_MAX = 60_000;
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

// La requête plein texte d'un texte : français (racines) ou simple (mots tels quels, noms propres). Une expression
// sans variable de ligne : Postgres la calcule une fois et peut s'en servir pour l'index.
const fullText = (text: string): SQL =>
  sql`(websearch_to_tsquery('french', ${text}) || websearch_to_tsquery('simple', ${text}))`;

// Chaque mot nié exclu sous toutes ses formes (&& !!) : dans `fullText`, chaque branche porte sa propre
// négation, et la branche simple de « budget -facture » laissait passer « budget des factures ».
const excluded = (terms: QueryTerms): SQL =>
  sql.join(
    terms.negated.map((term) => sql` && (!!${fullText(term)})`),
    sql``,
  );

// Sans mot à chercher (« de:marie -budget ») : le passage ne contient aucune forme d'un mot nié.
const withoutNegated = (terms: QueryTerms): SQL =>
  sql.join(
    [sql`true`, ...terms.negated.map((term) => sql`not (p.tsv @@ ${fullText(term)})`)],
    sql` and `,
  );

// Audit 4 n° 3 : le titre de la source ne contient aucune forme d'un mot nié (sans quoi la source restait, trouvée
// par son titre ou par ses passages).
const titleWithoutNegated = (terms: QueryTerms): SQL =>
  sql.join(
    [
      sql`true`,
      ...terms.negated.map(
        (term) =>
          sql`not ((to_tsvector('french', coalesce(s.title, '')) || to_tsvector('simple', coalesce(s.title, ''))) @@ ${fullText(term)})`,
      ),
    ],
    sql` and `,
  );

// La requête de la première passe : tous les mots, et aucune forme d'un mot nié.
const firstQuery = (terms: QueryTerms): SQL => sql`(${fullText(terms.text)}${excluded(terms)})`;

// La requête de la passe élargie, bâtie mot par mot avec les opérateurs de tsquery : un mot suffit (||), chaque
// expression reste exigée (&&), chaque mot nié reste exclu (&& !!). Postgres donne à ces opérateurs la même
// priorité : les parenthèses fixent l'ordre.
function wideQuery(terms: QueryTerms): SQL {
  const anyWord = sql.join(terms.words.map(fullText), sql` || `);
  const required = terms.phrases.map((phrase) => sql` && ${fullText(phrase)}`);
  return sql`((${anyWord})${sql.join(required, sql``)}${excluded(terms)})`;
}

// Le nombre de mots de la requête que contient un passage. `ts_rank_cd` compte les occurrences : « remise,
// remise, remise » y vaut plus que « la remise du plan » ; la passe élargie classe d'abord par mots couverts.
function coveredWords(terms: QueryTerms): SQL {
  return sql`(${sql.join(
    terms.words.map((word) => sql`(p.tsv @@ ${fullText(word)})::int`),
    sql` + `,
  )})`;
}

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
// ne restreint rien. `impossible` : deux listes sans rien en commun. Le dépôt ne vient que des paramètres.
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
      ...(explicit.depot ? { depot: explicit.depot } : {}),
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
  const terms = queryTerms(text);
  const tsq = firstQuery(terms);
  // Avec un seul mot libre, la passe élargie serait la première : elle n'a pas lieu.
  const wide = terms.words.length >= 2 ? wideQuery(terms) : null;
  const plain = withoutNegations(text).replace(/"/g, ' ');
  const sourceWhere = sql`(${sourceConditions(filters)} and ${titleWithoutNegated(terms)})`;
  const passageWhere = passageConditions(filters, sql`s.kind`);
  const headline = (tsquery: SQL) =>
    sql`ts_headline('french', p.text, ${tsquery}, ${HEADLINE_OPTIONS})`;
  // Un passage de la passe élargie ne contient pas tous les mots : son extrait se centre sur ceux qu'il contient.
  const snippet = (fromWide: SQL) => sql`(case
    ${wide ? sql`when ${fromWide} then ${headline(wide)}` : sql``}
    when numnode(${tsq}) > 0 then ${headline(tsq)}
    else left(p.text, ${num(SNIPPET_CHARS)}) end)`;

  // Réglages de cette transaction seulement (`set local`) ; les valeurs sont des constantes du code.
  await tx.execute(sql`set local pg_trgm.similarity_threshold = ${num(TITLE_SIMILARITY)}`);
  // Pas de compilation à la volée (JIT) : Postgres la déclenche sur le coût estimé de la requête, que la passe
  // élargie, même quand elle n'a pas lieu, porte au-delà du seuil ; elle coûte alors plus que la recherche elle-même
  // (mesuré à la relecture de T06b : 930 ms au lieu de 318 ms sur 160 000 passages).
  await tx.execute(sql`set local jit = off`);
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
            ${
              hasFilters(filters) || terms.negated.length > 0
                ? neighbours(
                    joined,
                    sql`and ${passageWhere} and ${sourceWhere} and ${withoutNegated(terms)}`,
                  )
                : neighbours(sql``, sql``)
            }
          ) neighbours
          where dist < ${num(MAX_VECTOR_DISTANCE)}
        )`
      : sql`vec as (select null::uuid as passage_id, null::bigint as r where false)`;

  // La passe élargie (T06b). `found` : les sources que les autres classements ont trouvées. La passe élargie n'a
  // lieu que s'il y en a moins qu'une page : ses sources passent après les leurs, et ne viendraient sinon qu'en
  // page 2. Cette condition ne dépend d'aucune ligne : Postgres l'évalue une fois, avant tout parcours, et ne lit
  // rien quand la page est déjà pleine. Ces sources sont exclues de la passe élargie : leurs passages, leurs extraits
  // et leur score restent ceux d'avant. Trois passages au plus par source parmi ses candidats, qui se comptent en
  // passages : avec un seul mot exigé, une longue transcription prendrait sinon toutes les places. `materialized` :
  // calculée une seule fois, quel que soit le plan (sur de petites tables, Postgres la réévaluait par ligne).
  const wideLeg = wide
    ? sql`found as (
        select source_id from ft1
        union
        select pv.source_id from vec v join passages pv on pv.tenant_id = ${tenant} and pv.id = v.passage_id
        union
        select source_id from title
      ),
      wide as materialized (
        select passage_id, covered,
               (select count(*) from ft1) + rank() over (order by covered desc, score desc) as r
        from (
          select passage_id, covered, score from (
            select passage_id, covered, score,
                   row_number() over (partition by source_id order by covered desc, score desc) as n
            from (
              select p.id as passage_id, p.source_id, ${coveredWords(terms)} as covered,
                     ts_rank_cd(p.tsv, ${wide}) as score
              from passages p
              join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
              where (select count(*) from found) < ${num(PAGE_SIZE)}
                and p.tenant_id = ${tenant} and p.tsv @@ ${wide} and ${passageWhere} and ${sourceWhere}
                and not exists (select 1 from found f where f.source_id = p.source_id)
            ) matches
          ) by_source
          where n <= ${num(PASSAGES_PER_SOURCE)}
          order by covered desc, score desc
          limit ${num(CANDIDATES)}
        ) best
      )`
    : sql`wide as (select null::uuid as passage_id, null::int as covered, null::bigint as r where false)`;

  const { rows } = await tx.execute<SearchRow>(sql`
    with
    ft1 as (
      select passage_id, source_id, rank() over (order by score desc) as r from (
        select p.id as passage_id, p.source_id, ts_rank_cd(p.tsv, ${tsq}) as score
        from passages p
        join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
        where p.tenant_id = ${tenant} and p.tsv @@ ${tsq} and ${passageWhere} and ${sourceWhere}
        order by score desc
        limit ${num(CANDIDATES)}
      ) matches
    ),
    ${vectorLeg},
    title as (
      select source_id, rank() over (order by sim desc) as r from (
        select s.id as source_id, similarity(s.title, ${plain}) as sim
        from sources s
        where s.tenant_id = ${tenant} and s.title % ${plain} and ${sourceWhere}
          and exists (
            select 1 from passages p
            where p.tenant_id = s.tenant_id and p.source_id = s.id and ${passageWhere}
              and ${withoutNegated(terms)})
        order by sim desc
        limit ${num(TITLE_CANDIDATES)}
      ) near_titles
    ),
    ${wideLeg},
    ft as (
      select passage_id, r, false as wide, 0 as covered from ft1
      union all
      select passage_id, r, true, covered from wide
    ),
    fused as (
      select coalesce(f.passage_id, v.passage_id) as passage_id,
             (coalesce(1.0 / (${num(RRF_K)} + f.r), 0) + coalesce(1.0 / (${num(RRF_K)} + v.r), 0))::float8 as rrf,
             coalesce(f.wide, false) as wide, coalesce(f.covered, 0) as covered
      from ft f full join vec v on v.passage_id = f.passage_id
    ),
    cand as (
      select fu.passage_id, p.source_id, fu.rrf, fu.wide, fu.covered, ${mineCondition(me)} as mine
      from fused fu
      join passages p on p.tenant_id = ${tenant} and p.id = fu.passage_id
      join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
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
                 or (s.owner_user_id = ${ctx.userId} and s.kind = any(${textArray(CAPTURE_KINDS)}))) as mine,
               -- Trouvée par la passe élargie seule : après toutes les autres, quels que soient sa date et son auteur ;
               -- et, entre elles, d'abord celles qui couvrent le plus de mots (0 hors de cette passe).
               coalesce(c.wide, false) as wide, coalesce(c.covered, 0) as covered
        from sources s
        left join (
          select source_id, max(rrf) as best, bool_or(mine) as mine, bool_or(wide) as wide,
                 max(covered) as covered
          from cand group by source_id
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
      select * from ranked order by wide, covered desc, score desc, last_ts desc, source_id
      offset ${query.offset} limit ${num(PAGE_SIZE)}
    ) pg on true
    left join lateral (
      (select p.id as passage_id, p.turn_id, p.ts, p.ord, p.author_name, ${snippet(sql`c.wide`)} as snippet,
              c.rrf as prank
       from cand c join passages p on p.id = c.passage_id
       where c.source_id = pg.source_id
       order by c.rrf desc, p.ts desc, p.ord
       limit ${num(PASSAGES_PER_SOURCE)})
      union all
      -- Une source trouvée par son titre seul : le début de son premier passage.
      (select p.id, p.turn_id, p.ts, p.ord, p.author_name, ${snippet(sql`false`)}, 0::float8
       from passages p
       join sources s on s.tenant_id = p.tenant_id and s.id = p.source_id
       where p.tenant_id = ${tenant} and p.source_id = pg.source_id
         and not exists (select 1 from cand c where c.source_id = pg.source_id)
         and ${passageWhere} and ${withoutNegated(terms)}
       order by p.ts, p.ord
       limit 1)
    ) pp on true
    order by pg.wide nulls last, pg.covered desc nulls last, pg.score desc nulls last, pg.last_ts desc, pg.source_id,
             pp.prank desc nulls last, pp.ts desc, pp.ord`);

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

// Des exclusions seules (« -test ») : rien à chercher. Le plein texte rendrait sinon, au hasard, tout ce qui ne
// contient pas le mot, après avoir lu tout le corpus.
const onlyExclusions = (terms: QueryTerms) =>
  terms.negated.length > 0 && terms.words.length === 0 && terms.phrases.length === 0;

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
  const terms = queryTerms(parsed.text);
  const searchable = hasWords(parsed.text) && !onlyExclusions(terms);
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
      recentSources(
        tx,
        ctx,
        filters,
        { limit: PAGE_SIZE, offset },
        withoutNegated(terms),
        titleWithoutNegated(terms),
      ),
    );
    return { hits: recent.hits, totalSources: recent.total, mode: 'plein-texte', unknownPeople };
  }

  // Le fournisseur de vecteurs est payant : il n'est interrogé qu'ici, une fois sûr que la recherche a lieu
  // (ni outils sans rien en commun, ni personne inconnue), pendant que la base donne les adresses du lecteur.
  const [vector, me] = await Promise.all([
    input.embedder
      ? embedQuery(input.embedder, withoutNegations(parsed.text).replace(/"/g, ' '))
      : null,
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
