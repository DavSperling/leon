import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { OfficeParser, type SupportedFileType } from 'officeparser';
import type { TenantContext } from '@/server/auth/tenant-context';
import { users } from '@/server/db/schema/auth';
import { sources } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import {
  createIngestRun,
  enqueueIndexing,
  insertNewTurns,
  updateSource,
} from '@/server/ingest/ingest-turns';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 1_000_000;
const TURN_CHARS = 20_000;
const NULL_CHAR = String.fromCharCode(0);
const FORMATS: Record<string, SupportedFileType> = {
  csv: 'csv',
  docx: 'docx',
  epub: 'epub',
  html: 'html',
  md: 'md',
  odt: 'odt',
  ods: 'ods',
  pdf: 'pdf',
  pptx: 'pptx',
  rtf: 'rtf',
  tex: 'tex',
  txt: 'md',
  xlsx: 'xlsx',
};

export const DOCUMENT_UPLOAD_ERROR =
  'Fichier illisible. Choisissez un PDF, Excel, Word, PowerPoint, CSV, TXT ou Markdown de 10 Mo maximum.';

export async function addDocument(ctx: TenantContext, file: File): Promise<void> {
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  const fileType = FORMATS[extension];
  if (!fileType || file.size === 0 || file.size > MAX_FILE_BYTES)
    throw new Error(DOCUMENT_UPLOAD_ERROR);

  let text: string;
  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (extension === 'txt')
      text = new TextDecoder().decode(buffer).replaceAll(NULL_CHAR, '').trim();
    else {
      const ast = await OfficeParser.parseOffice(buffer, {
        fileType,
        decompressionLimits: {
          maxUncompressedBytes: 50 * 1024 * 1024,
          maxZipEntries: 2_000,
          maxTableCells: 200_000,
          maxXmlElements: 300_000,
          maxRepeatedContent: 1_000_000,
          maxRawContentLength: 1_000_000,
        },
      });
      text = (await ast.to('text')).value.replaceAll(NULL_CHAR, '').trim();
    }
  } catch {
    throw new Error(DOCUMENT_UPLOAD_ERROR);
  }
  if (!text) throw new Error('Aucun texte lisible dans ce fichier.');
  if (text.length > MAX_TEXT_CHARS)
    throw new Error('Ce document contient trop de texte (maximum 1 million de caractères).');

  const title =
    file.name
      .replace(/[\p{Cc}]/gu, '')
      .trim()
      .slice(0, 300) || 'Document sans titre';
  const runId = await withTenant(ctx, async (tx) => {
    const [source] = await tx
      .insert(sources)
      .values({
        tenantId: ctx.tenantId,
        kind: 'document',
        externalId: `upload:${randomUUID()}`,
        ownerUserId: ctx.userId,
        title,
        acl: [ctx.tenantId],
        metadata: { nature: 'fichier' },
      })
      .returning({ id: sources.id });
    if (!source) throw new Error('Document non enregistré');

    const now = new Date();
    const rows = Array.from({ length: Math.ceil(text.length / TURN_CHARS) }, (_, index) => ({
      tenantId: ctx.tenantId,
      sourceId: source.id,
      externalId: `part:${index}`,
      role: 'document' as const,
      text: text.slice(index * TURN_CHARS, (index + 1) * TURN_CHARS),
      ts: now,
      captureMode: 'manual' as const,
      acl: [ctx.tenantId],
    }));
    const inserted = await insertNewTurns(tx, rows);
    await updateSource(tx, source.id, title, inserted.lastTs);
    const runId = await createIngestRun(tx, ctx, source.id, inserted.ids, [ctx.tenantId]);
    return runId;
  });
  await enqueueIndexing(ctx, runId);
}

export async function listDocuments(ctx: TenantContext) {
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: sources.id,
        title: sources.title,
        createdAt: sources.createdAt,
        ownerUserId: sources.ownerUserId,
        ownerName: users.name,
      })
      .from(sources)
      .innerJoin(users, eq(users.id, sources.ownerUserId))
      .where(and(eq(sources.tenantId, ctx.tenantId), eq(sources.kind, 'document')))
      .orderBy(desc(sources.createdAt)),
  );
}

export async function deleteDocument(ctx: TenantContext, id: string): Promise<boolean> {
  const [deleted] = await withTenant(ctx, (tx) =>
    tx
      .delete(sources)
      .where(
        and(
          eq(sources.id, id),
          eq(sources.tenantId, ctx.tenantId),
          eq(sources.ownerUserId, ctx.userId),
          eq(sources.kind, 'document'),
        ),
      )
      .returning({ id: sources.id }),
  );
  return deleted !== undefined;
}
