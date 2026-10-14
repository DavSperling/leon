import { z } from 'zod';
import { maskSecrets } from '@/capture/mask-secrets';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { factCandidates } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import type { Llm } from '@/server/llm/llm';
import { authorAcl, teamAcl } from '@/server/memory/acl';
import { type Catalog, loadCatalog } from '@/server/memory/catalog';
import { oneLine, SOURCE_KIND_LABELS } from '@/server/memory/labels';
import {
  type AssertionKind,
  buildExtractionPrompt,
  type ExtractedFact,
  ExtractionOutputSchema,
} from './prompts/extraction';
import type { PipelineJob, PipelineStep } from './queue';
import { verifyQuote } from './quote';
import { advanceRun, type PipelineRun, type RunTurn, startStep } from './runs';
import { windowTurns } from './windows';

const WINDOW_MAX_CHARS = 40_000;
const EXTRACTION_MAX_TOKENS = 16_000;
const STATEMENT_MAX_CHARS = 500;
const IsoDateSchema = z.iso.date();

type NewCandidate = typeof factCandidates.$inferInsert;
type WindowFact = { fact: ExtractedFact; window: RunTurn[] };

// Une date mal formée est ignorée, sans rejeter le fait.
function parseDate(value: string | null): Date | null {
  if (value === null || !IsoDateSchema.safeParse(value).success) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

// Une fin qui ne suit pas le début ferait échouer la période du fait au rangement : elle est ignorée.
function validity(fact: ExtractedFact): { validFrom: Date | null; validTo: Date | null } {
  const validFrom = parseDate(fact.validFrom);
  const validTo = parseDate(fact.validTo);
  return { validFrom, validTo: validFrom && validTo && validTo <= validFrom ? null : validTo };
}

// Sensibilité au plus restrictif (D6) ; l'ACL voulue du fait en découle (D13).
function factAccess(run: PipelineRun, ctx: TenantContext, fact: ExtractedFact) {
  const triageEntry = run.triage?.sensitiveTurns.find(
    (entry) => entry.turnExternalId === fact.turnExternalId,
  );
  const turnSensitive = triageEntry !== undefined;
  const sensitive = turnSensitive || fact.sensitive || fact.sensitiveCategory !== null;
  const factAcl = sensitive ? authorAcl(ctx.userId) : teamAcl(ctx.tenantId);
  return {
    sensitivity: sensitive ? ('sensitive' as const) : ('shareable' as const),
    sensitiveCategory: fact.sensitiveCategory ?? triageEntry?.category ?? null,
    factAcl,
  };
}

// Seul un fait établi entre dans la mémoire : une proposition, une supposition ou une action de session
// présentée comme un fait d'équipe diffuserait une erreur avec assurance.
const ASSERTION_REJECTIONS: Record<Exclude<AssertionKind, 'etabli'>, string> = {
  propose: 'proposition non validée',
  suppose: 'supposition',
  session: 'action de session',
};

function rejectionReason(input: {
  turn: RunTurn | undefined;
  assertion: AssertionKind;
  statement: string;
  hasSecret: boolean;
  quoteFound: boolean;
}): string | null {
  if (!input.turn) return 'tour inconnu';
  if (input.statement === '' || input.statement.length > STATEMENT_MAX_CHARS)
    return 'énoncé invalide';
  if (input.hasSecret) return 'secret détecté';
  if (!input.quoteFound) return 'citation introuvable';
  if (input.assertion !== 'etabli') return ASSERTION_REJECTIONS[input.assertion];
  return null;
}

// Énoncé, prédicat, valeur et nom du sujet sur une ligne : ils ne fabriquent pas de structure au rendu.
// Ils sont stockés masqués : un secret reconnu rejette le candidat sans être écrit en clair.
function toCandidate(run: PipelineRun, ctx: TenantContext, { fact, window }: WindowFact) {
  const turn = window.find((t) => t.externalId === fact.turnExternalId);
  const statement = oneLine(fact.statement);
  const value = fact.value === null ? null : oneLine(fact.value);
  const maskedStatement = maskSecrets(statement);
  const maskedValue = value === null ? null : maskSecrets(value);
  const range = turn ? verifyQuote(turn.text, fact.quote) : null;
  const hasSecret = maskedStatement !== statement || maskedValue !== value;
  const reason = rejectionReason({
    turn,
    assertion: fact.assertion,
    statement,
    hasSecret,
    quoteFound: range !== null,
  });
  return {
    tenantId: ctx.tenantId,
    ingestRunId: run.id,
    // Un tour inconnu est rattaché au premier tour de sa fenêtre (turn_id est obligatoire).
    turnId: (turn ?? (window[0] as RunTurn)).id,
    statement: maskedStatement,
    predicate: oneLine(fact.predicate),
    typeHint: fact.typeHint,
    value: maskedValue,
    mentions: {
      subject: { ...fact.subject, name: oneLine(fact.subject.name) },
      others: fact.otherMentions,
    },
    quote: turn && range ? turn.text.slice(range.start, range.end) : fact.quote,
    quoteStart: range?.start ?? null,
    quoteEnd: range?.end ?? null,
    ...validity(fact),
    confidence: Math.min(1, Math.max(0, fact.confidence)),
    ...factAccess(run, ctx, fact),
    status: reason === null ? 'pending' : 'rejected',
    rejectionReason: reason,
    acl: authorAcl(ctx.userId),
  } satisfies NewCandidate;
}

async function extractFacts(run: PipelineRun, catalog: Catalog, llm: Llm) {
  const extracted: WindowFact[] = [];
  for (const window of windowTurns(run.turns, WINDOW_MAX_CHARS)) {
    const prompt = buildExtractionPrompt({
      catalog,
      sourceKindLabel: SOURCE_KIND_LABELS[run.sourceKind],
      title: run.sourceTitle,
      turns: window,
    });
    const output = await llm.generateObject({
      step: 'extraction',
      ...prompt,
      schema: ExtractionOutputSchema,
      maxTokens: EXTRACTION_MAX_TOKENS,
    });
    extracted.push(...output.facts.map((fact) => ({ fact, window })));
  }
  return extracted;
}

export async function runExtraction(job: PipelineJob, llm: Llm): Promise<PipelineStep | null> {
  const ctx = await resolveTenantContext(job.userId, job.tenantId);
  if (!ctx) throw new Error('contexte du job introuvable');
  const run = await startStep(ctx, job.ingestRunId, 'extraction');
  if (!run) return null;
  const catalog = await withTenant(ctx, loadCatalog);
  const extracted = await extractFacts(run, catalog, llm); // appels LLM hors transaction
  const candidates = extracted.map((item) => toCandidate(run, ctx, item));
  const next = candidates.some((c) => c.status === 'pending') ? 'placement' : null;
  await withTenant(ctx, async (tx) => {
    if (candidates.length > 0) await tx.insert(factCandidates).values(candidates);
    await advanceRun(tx, run.id, next ?? 'done');
  });
  return next;
}
