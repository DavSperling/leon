import { randomUUID } from 'node:crypto';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { maskSecrets } from '@/capture/mask-secrets';
import { NUMERO_PREFIX, type ParsedLink, parseNote } from '@/capture/passation-format';
import { prepareTurnText } from '@/capture/prepare-turn-text';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources } from '@/server/db/schema/memory';
import { passationItems, passationLiens } from '@/server/db/schema/passation';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { createIngestRun, enqueueIndexing, insertNewTurns } from '@/server/ingest/ingest-turns';

// Écrire une note de passation (spec du 01/11/2026) : une source brute visible par toute l'organisation, indexée comme
// le reste, plus ses éléments et ses liens, lus sans modèle. Tout dans une transaction : une note sans ses éléments
// n'existe jamais.

export const PASSATION_TOOLS = [
  'claude_code',
  'codex',
  'cursor',
  'chatgpt',
  'claude_ai',
  'autre',
] as const;
export type PassationTool = (typeof PASSATION_TOOLS)[number];

export type PassationInput = {
  texte: string;
  project: string;
  branch: string | null;
  tool: PassationTool;
};
export type WriteResult = { sourceId: string; numeros: string[]; remplaces: string[] };

const TITLE_MAX = 80;

function titleOf(resume: string | null, input: PassationInput): string {
  const where = input.branch ?? input.project;
  const first = resume?.split('\n')[0]?.trim();
  return (first ? `${where} : ${first}` : `Passation ${where}`).slice(0, TITLE_MAX);
}

async function nextNumero(tx: Tx, prefix: string): Promise<string> {
  const { rows } = await tx.execute<{ n: string }>(
    sql`select nextval('passation_numero_seq')::text as n`,
  );
  return `${prefix}${rows[0]?.n}`;
}

async function insertLinks(
  tx: Tx,
  ctx: TenantContext,
  sourceId: string,
  itemId: string | null,
  links: ParsedLink[],
  acl: string[],
): Promise<void> {
  if (links.length === 0) return;
  await tx
    .insert(passationLiens)
    .values(links.map((link) => ({ tenantId: ctx.tenantId, sourceId, itemId, ...link, acl })));
}

export async function writePassation(
  ctx: TenantContext,
  input: PassationInput,
): Promise<WriteResult> {
  // Le texte rangé est celui du tour : secrets masqués, rappels système retirés.
  const text = prepareTurnText(input.texte);
  if (text === null) throw new Error('note de passation vide');
  const note = parseNote(text);
  const acl = [ctx.tenantId];
  const now = new Date();

  const { result, runId } = await withTenant(ctx, async (tx) => {
    const [source] = await tx
      .insert(sources)
      .values({
        tenantId: ctx.tenantId,
        kind: 'passation',
        externalId: randomUUID(),
        ownerUserId: ctx.userId,
        title: maskSecrets(titleOf(note.resume, input)),
        acl,
        metadata: { project: input.project, branch: input.branch, tool: input.tool },
        lastTurnAt: now,
      })
      .returning({ id: sources.id });
    if (!source) throw new Error('note de passation non créée');
    const sourceId = source.id;

    const { ids } = await insertNewTurns(tx, [
      {
        tenantId: ctx.tenantId,
        sourceId,
        externalId: randomUUID(),
        role: 'user',
        text,
        ts: now,
        captureMode: 'manual',
        acl,
      },
    ]);

    await insertLinks(tx, ctx, sourceId, null, note.noteLinks, acl);
    const numeros: string[] = [];
    const remplaces: string[] = [];
    for (const item of note.items) {
      const numero = await nextNumero(tx, NUMERO_PREFIX[item.type]);
      const [row] = await tx
        .insert(passationItems)
        .values({
          tenantId: ctx.tenantId,
          sourceId,
          numero,
          type: item.type,
          texte: item.texte,
          project: input.project,
          branch: input.branch,
          authorUserId: ctx.userId,
          acl,
        })
        .returning({ id: passationItems.id });
      if (!row) throw new Error('élément de passation non créé');
      numeros.push(numero);
      await insertLinks(tx, ctx, sourceId, row.id, item.links, acl);
      for (const target of item.remplace) {
        // Même organisation (sécurité par ligne), même dépôt, pas déjà remplacé, jamais lui-même.
        const replaced = await tx
          .update(passationItems)
          .set({ remplaceePar: row.id })
          .where(
            and(
              eq(passationItems.numero, target),
              eq(passationItems.project, input.project),
              isNull(passationItems.remplaceePar),
              ne(passationItems.id, row.id),
            ),
          )
          .returning({ numero: passationItems.numero });
        remplaces.push(...replaced.map((r) => r.numero));
      }
    }
    const runId = ids.length > 0 ? await createIngestRun(tx, ctx, sourceId, ids, acl) : null;
    return { result: { sourceId, numeros, remplaces }, runId };
  });

  if (runId !== null) await enqueueIndexing(ctx, runId);
  return result;
}
