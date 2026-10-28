import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  type OfficeError,
  OfficeParser,
  OfficeWarningType,
  type SupportedFileType,
} from 'officeparser';
import { maskSecrets } from '@/capture/mask-secrets';
import { DOCUMENT_MAX_BYTES, type DocumentErrorCode } from '@/lib/documents';
import type { TenantContext } from '@/server/auth/tenant-context';
import { CONNECTOR_TURN_MAX, splitText } from '@/server/connectors/normalize';
import { users } from '@/server/db/schema/auth';
import { sources } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import {
  createIngestRun,
  enqueueIndexing,
  insertNewTurns,
  updateSource,
} from '@/server/ingest/ingest-turns';

const MAX_TEXT_CHARS = 1_000_000;
const NULL_CHAR = String.fromCharCode(0);
// Lus tels quels : officeparser ne les décode qu'en UTF-8.
const PLAIN_TEXT = new Set(['txt', 'csv', 'md']);
// L'extension est aussi le type de fichier d'officeparser.
const OFFICE_FORMATS: ReadonlySet<string> = new Set<SupportedFileType>([
  'docx',
  'epub',
  'html',
  'odt',
  'ods',
  'pdf',
  'pptx',
  'rtf',
  'tex',
  'xlsx',
]);
// Ce qu'officeparser laisse de côté passé un plafond : le document n'est alors indexé qu'en partie.
const TRUNCATIONS = new Set<string>([
  OfficeWarningType.TABLE_CELL_LIMIT_EXCEEDED,
  OfficeWarningType.REPEATED_CONTENT_LIMIT_EXCEEDED,
  OfficeWarningType.PDF_CONTENT_LIMIT_EXCEEDED,
]);
const EXTRACTION_TIMEOUT_MS = 60_000;
// Chaque extraction tient en mémoire le fichier, son arbre et son texte : deux à la fois par processus.
const EXTRACTIONS_MAX = 2;

// `code` dit à la page quoi afficher. `reason` (le code d'officeparser) ne sert qu'au journal : le message d'une
// erreur de lecture peut citer le contenu du fichier.
export class DocumentError extends Error {
  override name = 'DocumentError';
  constructor(
    readonly code: DocumentErrorCode,
    readonly reason?: string,
  ) {
    super(code);
  }
}

let extracting = 0;
const waiting: Array<() => void> = [];

async function withExtractionSlot<T>(run: () => Promise<T>): Promise<T> {
  if (extracting < EXTRACTIONS_MAX) extracting++;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  try {
    return await run();
  } finally {
    // La place passe directement à l'extraction suivante, sans repasser par le compteur.
    const next = waiting.shift();
    if (next) next();
    else extracting--;
  }
}

// UTF-8 d'abord ; un fichier qui n'en est pas (CSV exporté par Excel, TXT de Windows) est lu en Windows-1252.
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// Partagée avec le connecteur Drive (PDF, Word… déposés dans le Drive).
export async function extractText(
  extension: string,
  bytes: Uint8Array,
): Promise<{ text: string; partial: boolean }> {
  if (PLAIN_TEXT.has(extension)) return { text: decodeText(bytes), partial: false };
  return withExtractionSlot(async () => {
    const ast = await OfficeParser.parseOffice(bytes, {
      fileType: extension as SupportedFileType,
      abortSignal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
      decompressionLimits: {
        maxUncompressedBytes: 50 * 1024 * 1024,
        maxZipEntries: 2_000,
        maxTableCells: 200_000,
        maxXmlElements: 300_000,
        maxRepeatedContent: 1_000_000,
        maxRawContentLength: 1_000_000,
      },
      // pdf.js lit le PDF dans un processus à part (officeparser hors du paquet de Next, next.config.ts) : un
      // fichier piégé y épuise 256 Mo et fait échouer la lecture, sans toucher au serveur.
      pdfParserConfig: { processMemoryMb: 256 },
    });
    const { value, messages } = await ast.to('text');
    const partial = [...ast.warnings, ...messages].some((issue) => TRUNCATIONS.has(issue.code));
    return { text: value, partial };
  });
}

// Ce que l'import garde d'un fichier : son nom et son texte, secrets masqués, le texte découpé en tours comme
// celui des outils (aux titres, puis aux paragraphes).
export async function readDocument(
  file: File,
): Promise<{ title: string; parts: string[]; partial: boolean }> {
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  const known = PLAIN_TEXT.has(extension) || OFFICE_FORMATS.has(extension);
  if (!known || file.size === 0 || file.size > DOCUMENT_MAX_BYTES) {
    throw new DocumentError('unreadable');
  }

  let extracted: { text: string; partial: boolean };
  try {
    extracted = await extractText(extension, new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    const reason = (error as OfficeError).officeIssue?.code ?? (error as Error).name;
    throw new DocumentError('unreadable', reason);
  }
  const text = extracted.text.replaceAll(NULL_CHAR, '').trim();
  if (!text) throw new DocumentError('empty');
  if (text.length > MAX_TEXT_CHARS) throw new DocumentError('too_long');

  const title =
    maskSecrets(file.name.replace(/[\p{Cc}]/gu, '').trim()).slice(0, 300) || 'Document sans titre';
  return {
    title,
    parts: splitText(maskSecrets(text), CONNECTOR_TURN_MAX),
    partial: extracted.partial,
  };
}

export async function addDocument(ctx: TenantContext, file: File): Promise<{ partial: boolean }> {
  const { title, parts, partial } = await readDocument(file);
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
    // L'auteur du document est celui qui l'ajoute : « de: » et l'écran « Mon équipe » le retrouvent (0036).
    const [author] = await tx
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, ctx.userId));

    const now = new Date();
    const rows = parts.map((text, index) => ({
      tenantId: ctx.tenantId,
      sourceId: source.id,
      externalId: `part:${index}`,
      role: 'document' as const,
      text,
      ts: now,
      captureMode: 'manual' as const,
      authorName: author?.name ?? null,
      authorEmail: author?.email ?? null,
      acl: [ctx.tenantId],
    }));
    const inserted = await insertNewTurns(tx, rows);
    await updateSource(tx, source.id, title, inserted.lastTs);
    const runId = await createIngestRun(tx, ctx, source.id, inserted.ids, [ctx.tenantId]);
    return runId;
  });
  await enqueueIndexing(ctx, runId);
  return { partial };
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

// L'app n'a pas le droit de supprimer du brut : la fonction de 0034 ne retire qu'un document de l'organisation
// courante, et seulement pour son auteur. Tours, passages, vecteurs et runs partent avec lui (clés en cascade).
export async function deleteDocument(ctx: TenantContext, id: string): Promise<boolean> {
  const result = await withTenant(ctx, (tx) =>
    tx.execute<{ deleted: boolean }>(sql`select supprimer_document(${id}) as deleted`),
  );
  return result.rows[0]?.deleted === true;
}
