import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { factText } from '@/capture/session-facts';
import { CODE_SESSION_KINDS, ProjectSchema } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources, turns } from '@/server/db/schema/memory';
import { passages } from '@/server/db/schema/search';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { createIngestRun, enqueueIndexing, insertNewTurns } from '@/server/ingest/ingest-turns';
import { type EcritPar, lockTarget, readable, type WriteInput, writeVersion } from './versions';

// Les notes de l'agent (T57 ; D33, D34, D38 et C14 du plan de la mémoire à disposition) : writeNote est le seul chemin
// qui crée ou réécrit une note, pour `leon note` (POST /api/v1/noter) comme pour `remember` (MCP). Une note est une
// source `mcp_remember` privée à son auteur, avec un tour indexé : sa dernière version (versions.ts), que la recherche
// trouve. Les anciennes versions restent dans versions_memoire, hors de la recherche et de fetch. Le texte d'une note
// n'est jamais journalisé. Toute lecture se fait sous withTenant, avec en plus le filtre de l'auteur : la politique
// equipe_lit (0057) montre des sources aux managers.
//
// - La version suivante est un compare-and-set (D34), et ne vient que du même outil que la dernière : un assistant web
//   ne réécrit jamais la note d'un outil de code. Après une restauration du site (`humain`), c'est l'outil de la note
//   (`metadata.outil`) qui compte.
// - Le tour prend le nouveau texte et ses passages partent dans la même transaction ; l'indexation est mise en file
//   après la validation, comme ingestTurns et writeResume.
// - Une note écrite avant ce lot n'a pas de version : son tour vaut v1, écrite à sa première nouvelle version ou
//   restauration. Elle n'a pas non plus d'outil connu : aucun agent ne la réécrit, seul le site la restaure.

// C14 : 4 000 caractères au plus, comme une version (C12).
export const NOTE_MAX = 4000;
// Le titre de la source : le début du texte de la dernière version, comme l'ancien remember.
const TITLE_MAX = 80;

// `metadata.outil` : un outil de code (`leon note`), ou `mcp:<libellé>` (`remember`), le libellé du client au motif de
// read_log.client (client-label.ts).
export const NoteOutilSchema = z.union([
  z.enum(CODE_SESSION_KINDS),
  z.string().regex(/^mcp:[a-z0-9._-]{1,40}$/),
]);

const InputSchema = z.object({
  texte: z.string(),
  outil: NoteOutilSchema,
  session: z.string().min(1).max(200).optional(),
  projet: ProjectSchema.optional(),
  // La version suivante : la note et le numéro de sa dernière version lue, ensemble.
  note: z.uuid().optional(),
  version: z.number().int().min(1).optional(),
});
export type NoteInput = z.input<typeof InputSchema>;
export type NoteResult =
  | { id: string; n: number }
  | 'depassee'
  | 'autre_outil'
  | 'introuvable'
  | 'invalide';

// Une note de l'auteur, verrouillée, avec son tour et sa dernière version. `virtuelle` : une note d'avant ce lot, dont
// le tour vaut v1 tant qu'elle n'a pas de version.
type Locked = {
  outil: string | null;
  turnId: string;
  text: string;
  last: { n: number; ecritPar: EcritPar; outil: string | null; virtuelle: boolean };
};

async function lockNote(tx: Tx, ctx: TenantContext, id: string): Promise<Locked | null> {
  if (!(await lockTarget(tx, ctx, id))) return null;
  // shortcut: une note n'a qu'un tour (writeNote, l'ancien remember) ; une note de plusieurs tours, envoyée autrefois par
  // la route d'ingestion, ne réécrit que le premier. À revoir si une telle note apparaît.
  const { rows } = await tx.execute<{ outil: string | null; turn_id: string; text: string }>(sql`
    select s.metadata->>'outil' as outil, t.id as turn_id, t.text
    from sources s join turns t on t.tenant_id = s.tenant_id and t.source_id = s.id
    where s.tenant_id = ${ctx.tenantId} and s.id = ${id} and s.owner_user_id = ${ctx.userId}
      and s.kind = 'mcp_remember'
    order by t.created_at, t.id limit 1`);
  const note = rows[0];
  if (!note) return null;
  const { rows: versions } = await tx.execute<{
    n: number;
    ecrit_par: EcritPar;
    outil: string | null;
  }>(
    sql`select v.n, v.ecrit_par, v.outil from versions_memoire v
      where v.tenant_id = ${ctx.tenantId} and v.source_id = ${id}
      order by v.n desc limit 1`,
  );
  const [last] = versions;
  return {
    outil: note.outil,
    turnId: note.turn_id,
    text: note.text,
    last: last
      ? { n: last.n, ecritPar: last.ecrit_par, outil: last.outil, virtuelle: false }
      : { n: 1, ecritPar: 'agent', outil: note.outil, virtuelle: true },
  };
}

// La v1 d'une note d'avant ce lot, depuis le texte de son tour. Rend false pour un compte supprimé.
async function backfill(tx: Tx, ctx: TenantContext, id: string, note: Locked): Promise<boolean> {
  if (!note.last.virtuelle) return true;
  const written = await writeVersion(tx, ctx, {
    sourceId: id,
    attendue: 0,
    texte: note.text,
    entrees: [],
    ecritPar: 'agent',
    motif: 'note',
    ...(note.outil === null ? {} : { outil: note.outil }),
  });
  return typeof written === 'object';
}

// Écrit la version suivante d'une note verrouillée, puis lui donne son texte : le tour, le titre, et plus aucun passage
// de l'ancien texte. Rend le run d'indexation, à mettre en file après la validation.
async function rewrite(
  tx: Tx,
  ctx: TenantContext,
  id: string,
  note: Locked,
  version: Omit<WriteInput, 'sourceId' | 'leconId' | 'attendue'>,
): Promise<{ n: number; run: string } | 'introuvable'> {
  const written = await writeVersion(tx, ctx, { ...version, sourceId: id, attendue: note.last.n });
  // Sous le verrou, jamais « dépassée » : seul un compte supprimé n'écrit plus.
  if (typeof written !== 'object') return 'introuvable';
  const texte = factText(version.texte, NOTE_MAX);
  await tx
    .update(turns)
    .set({ text: texte, ts: sql`now()` })
    .where(and(eq(turns.tenantId, ctx.tenantId), eq(turns.id, note.turnId)));
  await tx
    .update(sources)
    .set({ title: texte.slice(0, TITLE_MAX), lastTurnAt: sql`now()` })
    .where(and(eq(sources.tenantId, ctx.tenantId), eq(sources.id, id)));
  await tx
    .delete(passages)
    .where(and(eq(passages.tenantId, ctx.tenantId), eq(passages.turnId, note.turnId)));
  return { n: written.n, run: await createIngestRun(tx, ctx, id, [note.turnId], [ctx.userId]) };
}

// Une note neuve : sa source, son tour et sa v1, écrite par l'agent.
async function create(
  tx: Tx,
  ctx: TenantContext,
  input: { texte: string; outil: string; session?: string; projet?: string },
): Promise<{ id: string; n: number; run: string }> {
  const [source] = await tx
    .insert(sources)
    .values({
      tenantId: ctx.tenantId,
      kind: 'mcp_remember',
      externalId: randomUUID(),
      ownerUserId: ctx.userId,
      title: input.texte.slice(0, TITLE_MAX),
      acl: [ctx.userId],
      lastTurnAt: new Date(),
      metadata: {
        outil: input.outil,
        ...(input.session === undefined ? {} : { session: input.session }),
        ...(input.projet === undefined ? {} : { project: input.projet }),
      },
    })
    .returning({ id: sources.id });
  if (!source) throw new Error('note non écrite');
  const {
    ids: [turnId],
  } = await insertNewTurns(tx, [
    {
      tenantId: ctx.tenantId,
      sourceId: source.id,
      externalId: randomUUID(),
      // Comme l'ancien remember ; une note n'est jamais preuve d'une décision (D36, thread-state.ts).
      role: 'user',
      text: input.texte,
      ts: new Date(),
      captureMode: 'manual',
      acl: [ctx.userId],
    },
  ]);
  if (!turnId) throw new Error('tour de la note non écrit');
  const written = await writeVersion(tx, ctx, {
    sourceId: source.id,
    attendue: 0,
    texte: input.texte,
    entrees: [],
    ecritPar: 'agent',
    motif: 'note',
    outil: input.outil,
    session: input.session,
  });
  // Un compte supprimé n'a plus de jeton : l'erreur annule tout plutôt que de laisser une note sans version.
  if (typeof written !== 'object') throw new Error('version de la note non écrite');
  return {
    id: source.id,
    n: written.n,
    run: await createIngestRun(tx, ctx, source.id, [turnId], [ctx.userId]),
  };
}

// Écrit une note neuve (sans `note`), ou la version suivante de `note` depuis `version`. Le texte passe par maskSecrets.
// Refus, sans rien changer : « depassee » (une autre version est passée), « autre_outil » (la dernière vient d'un autre
// outil), « introuvable » (ni une note de l'auteur), « invalide » (hors schéma, ou texte vide).
export async function writeNote(ctx: TenantContext, input: NoteInput): Promise<NoteResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return 'invalide';
  const { outil, session, projet, note, version } = parsed.data;
  if ((note === undefined) !== (version === undefined)) return 'invalide';
  const texte = factText(parsed.data.texte, NOTE_MAX).trim();
  if (texte === '') return 'invalide';
  const done = await withTenant(ctx, async (tx) => {
    if (note === undefined || version === undefined) {
      return create(tx, ctx, { texte, outil, session, projet });
    }
    const locked = await lockNote(tx, ctx, note);
    if (locked === null) return 'introuvable';
    if (locked.last.n !== version) return 'depassee';
    const owner = locked.last.ecritPar === 'humain' ? locked.outil : locked.last.outil;
    if (owner !== outil) return 'autre_outil';
    if (!(await backfill(tx, ctx, note, locked))) return 'introuvable';
    const written = await rewrite(tx, ctx, note, locked, {
      texte,
      entrees: [],
      ecritPar: 'agent',
      motif: 'note',
      outil,
      session,
    });
    return typeof written === 'object' ? { id: note, ...written } : written;
  });
  if (typeof done !== 'object') return done;
  await enqueueIndexing(ctx, done.run);
  return { id: done.id, n: done.n };
}

// La restauration d'une note (D33, C12), par le même chemin : v(depuis+1), écrite par l'humain, avec le texte et les
// entrées de la version n si elle est lisible. Seule restoreVersion l'appelle, pour l'action du site (T55).
export async function restoreNote(
  ctx: TenantContext,
  input: { note: string; n: number; depuis: number },
): Promise<{ n: number } | 'depassee' | 'introuvable' | 'illisible'> {
  const done = await withTenant(ctx, async (tx) => {
    const locked = await lockNote(tx, ctx, input.note);
    if (locked === null) return 'introuvable';
    if (locked.last.n !== input.depuis) return 'depassee';
    // Une note d'avant ce lot n'a que son tour : v1.
    if (locked.last.virtuelle && input.n !== 1) return 'illisible';
    if (!(await backfill(tx, ctx, input.note, locked))) return 'introuvable';
    const chosen = await readable(tx, ctx, input.note, input.n);
    if (!chosen) return 'illisible';
    return rewrite(tx, ctx, input.note, locked, {
      texte: chosen.texte,
      entrees: chosen.entrees,
      ecritPar: 'humain',
      motif: 'restauration',
      restaureDe: chosen.restaureDe ?? chosen.id,
    });
  });
  if (typeof done !== 'object') return done;
  await enqueueIndexing(ctx, done.run);
  return { n: done.n };
}
