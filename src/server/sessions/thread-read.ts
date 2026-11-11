import { sql } from 'drizzle-orm';
import { CODE_SESSION_KINDS, type SourceKind } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { oneLine } from '@/server/memory/labels';
import { type ReadTool, recordReads } from '@/server/memory/read-log';
import { latestIn, listVersions, readVersion, type Version } from '@/server/memory/versions';
import { textArray } from '@/server/search/filters-sql';
import { HEADING } from './resume-prompt';
import { DEFAULT_BRANCHES, type PrState, prStates } from './start-context';
import { deterministicState } from './thread-state';
import { type Read, readFil } from './thread-state-worker';
import { FIL, type Fil, findFils, has, listOf } from './threads';

// La lecture commune des fils (T44, T45, T54 ; C9, C12, D24, D27, D33, D35 du plan de la mémoire à disposition) : le
// dossier d'un projet, un fil et son historique, pour les routes de lecture (read-routes.ts) et les outils du MCP. Tout
// se lit sous les droits du lecteur (withTenant), le filtre owner_user_id en plus de la sécurité par ligne : la
// politique equipe_lit (0057) ouvrirait sinon à un manager les fils d'un subordonné. Rien ne s'écrit ici, hors du
// journal, et rien ne part en file.
//
// - L'état est la dernière version, si le lecteur peut la lire, sinon l'état déterministe, calculé à la lecture sur
//   ses seules sources visibles (readFil, celle du worker), jamais une version plus ancienne (D33). Masqué, il le reste
//   jusqu'à la prochaine version ; un compteur le relève (T38).
// - Un id absorbé mène au fil gardé, dont `absorbes` réunit toute la chaîne des fusions (threads.ts) ; le dossier ne
//   liste jamais un fil absorbé. Un fil absorbé garde son historique, sans redirection (D21).
// - Le journal d'abord, puis le rendu de ce qui a été noté (D35) : chaque lecture note le fil, les sources liées
//   rendues et les entrées d'un texte tiré du modèle, que l'état d'un autre fil reprendra. Une source que le journal
//   n'a pas notée (devenue invisible entre-temps) n'est pas rendue, et un texte dont une entrée manque non plus.
// - Les bornes de D27 : 20 fils, 50 sessions, 20 PR, 20 tickets, 20 sources liées ; chaque liste garde son total, pour
//   signaler la coupe.

export const DOSSIER_FILS_MAX = 20;
export const FIL_SESSIONS_MAX = 50;
export const FIL_PRS_MAX = 20;
export const FIL_TICKETS_MAX = 20;
export const FIL_LIEES_MAX = 20;
const TITRE_MAX = 60;
const ETAT_COURT_MAX = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Qui lit (le journal des lectures) : l'outil, le client (l'assistant ou `cli`), et la session de l'outil, quand elle
// est connue (D35).
export type Journal = { tool: ReadTool; client: string; session?: string | null };

export type Bounded<T> = { items: T[]; total: number };
export type ThreadPr = { repo: string; numero: number; etat: PrState | null };
export type ThreadRead = {
  id: string;
  titre: string;
  etat: string;
  // La version rendue, seulement quand `etat` est son texte.
  version: Pick<Version, 'n' | 'creeLe' | 'ecritPar'> | null;
  // Les entrées d'un état tiré du modèle, que le journal a notées ; vide pour une liste du serveur.
  entrees: string[];
  sessions: Bounded<{ id: string; kind: SourceKind; date: Date }>;
  prs: Bounded<ThreadPr>;
  tickets: Bounded<string>;
  liees: Bounded<{ id: string; kind: SourceKind; titre: string | null }>;
};
export type DossierFil = {
  id: string;
  titre: string;
  outils: SourceKind[];
  derniereDate: Date | null;
  prs: ThreadPr[];
  // Le nombre de PR du fil, pour signaler la coupe (D27).
  prsTotal: number;
  // Le nombre de sources liées que le lecteur voit.
  liees: number;
  etatCourt: string;
  entrees: string[];
};
export type Dossier = { fils: DossierFil[]; total: number };
// `texte` : la première ligne dans la liste, le texte entier pour une version demandée par son numéro.
export type VersionLine = Pick<Version, 'n' | 'creeLe' | 'ecritPar' | 'motif'> & {
  texte: string;
  entrees: string[];
};
export type VersionsRead = { id: string; titre: string; n: number | null; versions: VersionLine[] };

// Un compteur, relevé par T38 : une ligne par état masqué par la règle de lecture, sans texte ni id.
const countMasked = () => console.info('[leon]', 'fil.etat_masque');

// Le titre d'un fil (D24) : sa branche réduite à [A-Za-z0-9._/-], 60 caractères au plus, sinon « fil du JJ/MM » au
// jour de sa première session, en UTC. Jamais le titre d'une session ni d'une PR : l'agent ou un inconnu l'écrit.
export function filTitle(fil: Fil): string {
  const [branch] = listOf(fil, 'branches');
  const reduced =
    typeof branch === 'string' ? branch.replace(/[^A-Za-z0-9._/-]/g, '').slice(0, TITRE_MAX) : '';
  if (reduced !== '') return reduced;
  const [first] = listOf(fil, 'sessions');
  const date = new Date(String((first as { date?: unknown } | undefined)?.date));
  if (Number.isNaN(date.getTime())) return 'fil';
  const two = (n: number) => String(n).padStart(2, '0');
  return `fil du ${two(date.getUTCDate())}/${two(date.getUTCMonth() + 1)}`;
}

// La première ligne de « Où j'en suis » (C9) : celle qui suit le titre d'un état du modèle, sur une ligne, 200
// caractères au plus. Rien pour l'état déterministe, qui n'a pas ce titre.
export function etatCourt(texte: string): string {
  const [first, second = ''] = texte.split('\n', 2);
  return first === HEADING ? oneLine(second).slice(0, ETAT_COURT_MAX).toWellFormed() : '';
}

// La première ligne d'une version, pour l'historique (C12) : celle de etatCourt, ou à défaut la première.
const firstLine = (texte: string) =>
  etatCourt(texte) ||
  oneLine(texte.split('\n', 1)[0] ?? '')
    .slice(0, ETAT_COURT_MAX)
    .toWellFormed();

// Les entrées d'où vient le texte d'une version, à noter au journal : celles d'un texte du modèle seulement. Une
// liste du serveur ne rend que des clés ; ses sessions, notées, masqueraient sans raison un état qui la reprend.
const sourcesOf = (version: Pick<Version, 'duModele' | 'entrees'>) =>
  version.duModele ? version.entrees : [];

// L'état d'un fil lu (D33) : la dernière version si elle est lisible, sinon l'état déterministe.
async function stateOf(tx: Tx, ctx: TenantContext, read: Read) {
  const deterministe = deterministicState(read.list).texte;
  const { n, version } = await latestIn(tx, ctx, read.fil.id);
  if (version === null) {
    if (n > 0) countMasked();
    return { etat: deterministe, deterministe, version: null, entrees: [] };
  }
  return {
    etat: version.texte,
    deterministe,
    version: { n: version.n, creeLe: version.creeLe, ecritPar: version.ecritPar },
    entrees: sourcesOf(version),
  };
}

const boundedFirst = <T>(items: T[], max: number): Bounded<T> => ({
  items: items.slice(0, max),
  total: items.length,
});
// Les PR et les tickets s'ajoutent en fin de liste : les plus récents sont les derniers.
const boundedLast = <T>(items: T[], max: number): Bounded<T> => ({
  items: items.slice(-max),
  total: items.length,
});

// Un état dont une entrée n'a pas été notée redevient l'état déterministe.
const allLogged = (ids: string[], logged: Set<string>) => ids.every((id) => logged.has(id));

// Les clés d'un fil par son id : lui-même, ou le fil gardé qui l'a absorbé. Null pour un id qui n'est pas un uuid.
const byId = (id: string) => (UUID.test(id) ? [sql`s.id = ${id}`, has('absorbes', id)] : null);

// Un fil de l'auteur, par son id (un id absorbé mène au fil gardé) ou, sans id, par sa branche ; hors main et
// master, qui n'ont jamais de fil (threads.ts). `projet` null : sur tout projet (le `fetch` du MCP n'en a pas).
// Introuvable : null, sans rien noter.
export async function readThread(
  ctx: TenantContext,
  input: { projet: string | null; id?: string; branche?: string | null },
  journal: Journal,
): Promise<ThreadRead | null> {
  const keys =
    input.id !== undefined
      ? byId(input.id)
      : input.branche && !DEFAULT_BRANCHES.has(input.branche)
        ? [has('branches', input.branche)]
        : null;
  if (keys === null) return null;
  const found = await withTenant(ctx, async (tx) => {
    const [fil] = await findFils(tx, ctx, input.projet, keys);
    const read = fil ? await readFil(tx, ctx, fil.id, false) : null;
    if (read === null) return null;
    const prs = read.list.prs.slice(-FIL_PRS_MAX);
    const etats = await prStates(tx, ctx, prs);
    return { read, state: await stateOf(tx, ctx, read), prs, etats };
  });
  if (found === null) return null;
  const { read, state } = found;
  const liees = read.shown.sources.slice(0, FIL_LIEES_MAX);
  const logged = await recordReads(ctx, {
    ...journal,
    reads: [read.fil.id, ...state.entrees, ...liees.map((one) => one.id)].map((sourceId) => ({
      sourceId,
    })),
  });
  if (!logged.has(read.fil.id)) return null;
  const kept = allLogged(state.entrees, logged)
    ? state
    : { ...state, etat: state.deterministe, version: null, entrees: [] };
  return {
    id: read.fil.id,
    titre: filTitle(read.fil),
    etat: kept.etat,
    version: kept.version,
    entrees: kept.entrees,
    sessions: boundedFirst(read.shown.sessions, FIL_SESSIONS_MAX),
    prs: {
      items: found.prs.map((pr, index) => ({ ...pr, etat: found.etats[index] ?? null })),
      total: read.list.prs.length,
    },
    tickets: boundedLast(
      listOf(read.fil, 'tickets').filter((one): one is string => typeof one === 'string'),
      FIL_TICKETS_MAX,
    ),
    liees: {
      items: liees
        .filter((one) => logged.has(one.id))
        .map((one) => ({ id: one.id, kind: one.kind, titre: one.title })),
      total: read.shown.sources.length,
    },
  };
}

// Les fils de l'auteur sur ce projet, hors absorbés : celui de la branche d'abord (hors main et master), puis par
// date de mise à jour, 20 au plus.
export async function readDossier(
  ctx: TenantContext,
  input: { projet: string; branche?: string | null },
  journal: Journal,
): Promise<Dossier> {
  const branche = input.branche && !DEFAULT_BRANCHES.has(input.branche) ? input.branche : null;
  const { fils, total } = await withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<{ id: string; total: number }>(sql`
      select s.id, (count(*) over ())::int as total from sources s
      where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId} and s.kind = ${FIL}
        and s.metadata->>'project' = ${input.projet} and s.metadata->>'absorbe_par' is null
      order by ${branche === null ? sql`` : sql`${has('branches', branche)} desc nulls last,`}
        coalesce((s.metadata->>'maj_le')::timestamptz, s.created_at) desc, s.id
      limit ${DOSSIER_FILS_MAX}`);
    // shortcut: 4 requêtes par fil (readFil, la version), 20 fils au plus ; les grouper quand la mesure du lot 11
    // dépasse 200 ms.
    const reads: Array<{ read: Read; state: Awaited<ReturnType<typeof stateOf>> }> = [];
    for (const row of rows) {
      const read = await readFil(tx, ctx, row.id, false);
      if (read) reads.push({ read, state: await stateOf(tx, ctx, read) });
    }
    const prs = reads.map(({ read }) => read.list.prs.slice(-FIL_PRS_MAX));
    const etats = await prStates(tx, ctx, prs.flat());
    let next = 0;
    return {
      total: rows[0]?.total ?? 0,
      fils: reads.map(({ read, state }, index) => ({
        id: read.fil.id,
        titre: filTitle(read.fil),
        outils: [...new Set(read.shown.sessions.map((one) => one.kind))],
        derniereDate: read.shown.sessions[0]?.date ?? null,
        prs: (prs[index] ?? []).map((pr) => ({ ...pr, etat: etats[next++] ?? null })),
        prsTotal: read.list.prs.length,
        liees: read.list.sources.length,
        etatCourt: etatCourt(state.etat),
        entrees: state.entrees,
      })),
    };
  });
  const logged = await recordReads(ctx, {
    ...journal,
    reads: fils.flatMap((one) => [one.id, ...one.entrees]).map((sourceId) => ({ sourceId })),
  });
  return {
    total,
    fils: fils
      .filter((one) => logged.has(one.id))
      .map((one) =>
        allLogged(one.entrees, logged) ? one : { ...one, etatCourt: '', entrees: [] },
      ),
  };
}

// L'historique d'un fil de l'auteur sur ce projet (C12, T54), absorbé compris : sans `n`, ses versions lisibles ; avec
// `n`, le texte de celle-ci, si elle est lisible. Une note n'a pas de projet (remember-tool.ts) : elle est
// introuvable ici. Rien ne restaure (D33) : seule l'action du site le fait (T55).
export async function readVersions(
  ctx: TenantContext,
  input: { projet: string; id: string; n?: number },
  journal: Journal,
): Promise<VersionsRead | null> {
  if (!UUID.test(input.id)) return null;
  const fil = await withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<Fil>(sql`
      select s.id, s.metadata from sources s
      where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId} and s.kind = ${FIL}
        and s.id = ${input.id} and s.metadata->>'project' = ${input.projet}`);
    return rows[0];
  });
  if (!fil) return null;
  let versions: VersionLine[];
  if (input.n === undefined) {
    versions = (await listVersions(ctx, fil.id)).map((one) => ({
      n: one.n,
      creeLe: one.creeLe,
      ecritPar: one.ecritPar,
      motif: one.motif,
      texte: firstLine(one.debut),
      entrees: sourcesOf(one),
    }));
  } else {
    const one = await readVersion(ctx, fil.id, input.n);
    versions = one
      ? [
          {
            n: one.n,
            creeLe: one.creeLe,
            ecritPar: one.ecritPar,
            motif: one.motif,
            texte: one.texte,
            entrees: sourcesOf(one),
          },
        ]
      : [];
  }
  const logged = await recordReads(ctx, {
    ...journal,
    reads: [fil.id, ...versions.flatMap((one) => one.entrees)].map((sourceId) => ({ sourceId })),
  });
  if (!logged.has(fil.id)) return null;
  return {
    id: fil.id,
    titre: filTitle(fil),
    n: input.n ?? null,
    versions: versions.filter((one) => allLogged(one.entrees, logged)),
  };
}

// Les sources d'un fil de l'auteur, pour le filtre `fil` de `search` (T45) : ses sessions et ses sources liées
// visibles, comme les lit readFil ; un id absorbé mène au fil gardé. Introuvable (un collègue, un id mal formé) :
// aucune, donc aucun résultat. Rien n'est noté ici : la recherche note ce qu'elle rend.
export async function threadSources(ctx: TenantContext, id: string): Promise<string[]> {
  const keys = byId(id);
  if (keys === null) return [];
  return withTenant(ctx, async (tx) => {
    const [fil] = await findFils(tx, ctx, null, keys);
    const read = fil ? await readFil(tx, ctx, fil.id, false) : null;
    return read ? [...read.list.sessions, ...read.list.sources] : [];
  });
}

type PrKey = { repo: string; numero: number };
// Le fil de l'auteur et les PR des faits de chaque session de code parmi ces sources (T45, D35) : des clés seulement
// (D25), pour la mention d'une session trouvée par `search`. Une session dans deux fils (elle a changé de branche)
// cite le premier par id, comme findFils. Une source sans fil ni PR n'est pas dans la liste.
export async function sessionThreads(
  ctx: TenantContext,
  ids: string[],
): Promise<Map<string, { thread?: string; prs?: PrKey[] }>> {
  if (ids.length === 0) return new Map();
  const rows = await withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<{ id: string; fil: string | null; prs: unknown }>(sql`
      select s.id, s.metadata->'faits'->'prs' as prs, (
        select f.id from sources f
        where f.tenant_id = s.tenant_id and f.owner_user_id = ${ctx.userId} and f.kind = ${FIL}
          and f.metadata->>'absorbe_par' is null
          and f.metadata->'sessions' @> jsonb_build_array(jsonb_build_object('id', s.id::text))
        order by f.id limit 1) as fil
      from sources s
      where s.tenant_id = ${ctx.tenantId} and s.id = any(${textArray(ids)}::uuid[])
        and s.kind = any(${textArray(CODE_SESSION_KINDS)})`);
    return rows;
  });
  const found = new Map<string, { thread?: string; prs?: PrKey[] }>();
  for (const row of rows) {
    const prs = (Array.isArray(row.prs) ? row.prs : []).flatMap((pr) => {
      const { repo, numero } = (pr ?? {}) as Record<string, unknown>;
      return typeof repo === 'string' && typeof numero === 'number' ? [{ repo, numero }] : [];
    });
    if (row.fil === null && prs.length === 0) continue;
    found.set(row.id, {
      ...(row.fil === null ? {} : { thread: row.fil }),
      ...(prs.length === 0 ? {} : { prs }),
    });
  }
  return found;
}
