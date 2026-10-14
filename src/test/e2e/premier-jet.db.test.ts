import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { API_PATHS } from '@/capture/api-contract';
import { type IngestPayload, type IngestResult, IngestResultSchema } from '@/capture/turn';
import { importClaudeCode } from '@/cli/import-claude-code';
import { app } from '@/server/api/app';
import { createApiToken } from '@/server/auth/api-tokens';
import { createUserWithOrganization } from '@/server/auth/sign-up';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { createFakeLlm } from '@/server/llm/fake-llm';
import { resolveReviewItem } from '@/server/memory/review-items';
import { listReviewItems } from '@/server/memory/review-list';
import { listSources } from '@/server/memory/sources';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { apiRequest } from '@/test/api-request';
import { createTestUser } from '@/test/fixtures';
import { readPromptJson } from '@/test/llm-prompt';
import { runPipelineNow } from '@/test/run-pipeline-now';
import { exchangeToPayload } from '../../../extension/lib/to-payload';

vi.mock('@/server/pipeline/queue');

const SESSION_FIXTURE = new URL(
  '../../capture/fixtures/claude-code/session-simple.jsonl',
  import.meta.url,
);
const DISMISSAL = 'Nous allons licencier Jean Dupont en décembre.';
const PAYMENT = 'ACME paiera désormais à 30 jours';

// Les tours que le prompt de triage ou d'extraction envoie au modèle : id et texte.
function promptTurns(prompt: string): Array<{ id: string; text: string }> {
  return [...prompt.matchAll(/<tour id="([^"]+)"[^>]*>\n([\s\S]*?)\n<\/tour>/g)].map((match) => ({
    id: match[1] as string,
    text: match[2] as string,
  }));
}

function extractedFact(turnExternalId: string, input: Record<string, unknown>) {
  return {
    turnExternalId,
    value: null,
    otherMentions: [],
    validFrom: null,
    validTo: null,
    confidence: 0.9,
    assertion: 'etabli',
    sensitive: false,
    sensitiveCategory: null,
    ...input,
  };
}

// Le triage ne marque que le tour du licenciement ; l'extraction ne tire un fait que des deux
// tours scénarisés et marque sensible le licenciement, comme le demande le signalement du tri (D6
// révisée : la sensibilité se juge fait par fait) ; le rangement crée une fiche par candidat.
const llm = createFakeLlm((request) => {
  if (request.step === 'triage') {
    const sensitive = promptTurns(request.prompt).filter((turn) => turn.text.includes(DISMISSAL));
    return {
      keep: true,
      reason: 'Des faits durables.',
      sensitiveTurns: sensitive.map((turn) => ({ turnExternalId: turn.id, category: 'rh' })),
      noiseTurns: [],
    };
  }
  if (request.step === 'extraction') {
    const facts = promptTurns(request.prompt).flatMap((turn) => {
      if (turn.text.includes(DISMISSAL)) {
        return [
          extractedFact(turn.id, {
            statement: 'Jean Dupont sera licencié en décembre.',
            typeHint: 'personne',
            predicate: 'note',
            subject: { name: 'Jean Dupont', email: null, domain: null },
            quote: DISMISSAL,
            sensitive: true,
            sensitiveCategory: 'rh',
          }),
        ];
      }
      if (turn.text.includes(PAYMENT)) {
        return [
          extractedFact(turn.id, {
            statement: 'ACME paiera à 30 jours.',
            typeHint: 'client',
            predicate: 'paiement',
            subject: { name: 'ACME', email: null, domain: null },
            quote: PAYMENT,
          }),
        ];
      }
      return [];
    });
    return { facts };
  }
  const context = readPromptJson(request.prompt, 'contexte') as {
    candidates: Array<{ candidateId: string; typeHint: string; subject: { name: string } }>;
  };
  return {
    decisions: context.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      decision: 'new',
      cardId: null,
      newCardTitle: candidate.subject.name,
      typeSlug: candidate.typeHint,
      proposedType: null,
      relation: 'new',
      relatedFactId: null,
      reason: 'Entité nouvelle.',
    })),
  };
});

let configDir: string;
beforeAll(async () => {
  configDir = await mkdtemp(join(tmpdir(), 'leon-e2e-'));
  await mkdir(join(configDir, 'projects', 'demo'), { recursive: true });
  const session = await readFile(SESSION_FIXTURE, 'utf8');
  await writeFile(
    join(configDir, 'projects', 'demo', 'session.jsonl'),
    session.replace('Parfait, merci.', DISMISSAL),
  );
});
afterAll(() => rm(configDir, { recursive: true, force: true }));

async function signUpPaul(): Promise<TenantContext> {
  const result = await createUserWithOrganization({
    name: 'Paul Martin',
    email: `paul-${crypto.randomUUID()}@example.com`,
    password: 'motdepasse-solide',
    organizationName: 'Martin Conseil',
  });
  if (!result.ok) throw new Error(`inscription refusée : ${result.error}`);
  const ctx = await resolveTenantContext(result.userId, result.tenantId);
  if (!ctx) throw new Error('contexte de Paul introuvable');
  return ctx;
}

async function postIngest(token: string, payload: IngestPayload): Promise<IngestResult> {
  const response = await apiRequest(API_PATHS.ingest, { token, body: payload });
  expect(response.status).toBe(202);
  return IngestResultSchema.parse(await response.json());
}

async function connectMcp(token: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://localhost:3000${API_PATHS.mcp}`),
    {
      fetch: async (url, init) => app.request(url.toString(), init),
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

type ToolResult = {
  content: Array<{ text?: string }>;
  structuredContent?: Record<string, unknown>;
};

async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  const results = (result.structuredContent?.results ?? []) as Array<{ id: string }>;
  return {
    text: result.content.map((block) => block.text ?? '').join('\n'),
    ids: results.map((r) => r.id),
  };
}

it("fait entrer des conversations par la CLI et l'extension, les range, et les relit par MCP sans fuite de droits", async () => {
  const paul = await signUpPaul();
  const marie = await createTestUser(paul.tenantId, 'Marie Durand');
  const paulToken = (await createApiToken(paul, 'test')).token;
  const marieToken = (await createApiToken(marie, 'test')).token;
  const runs: Array<{ ctx: TenantContext; ingestRunId: string }> = [];
  const importSession = () =>
    importClaudeCode(
      { baseDir: configDir, dryRun: false },
      {
        out: () => {},
        send: async (payload) => {
          const result = await postIngest(paulToken, payload);
          if (result.ingestRunId) runs.push({ ctx: paul, ingestRunId: result.ingestRunId });
          return result;
        },
      },
    );

  // CLI : la session de Paul entre par l'API.
  const firstImport = await importSession();
  expect(firstImport).toMatchObject({ sessions: 1, failures: 0, skipped: 0 });
  expect(firstImport.inserted).toBe(firstImport.turnsSent);

  // Extension : un échange ChatGPT de Marie entre par la même API.
  const payload = exchangeToPayload({
    site: 'chatgpt',
    conversationId: `conv-${crypto.randomUUID()}`,
    title: 'Délais de paiement',
    user: { messageId: 'msg-1', text: `${PAYMENT}.`, ts: '2026-10-13T10:00:00.000Z' },
    assistant: { messageId: 'msg-2', text: 'Noté.', ts: '2026-10-13T10:00:05.000Z' },
  });
  if (!payload) throw new Error('échange sans tour');
  const exchange = await postIngest(marieToken, payload);
  if (!exchange.ingestRunId) throw new Error('aucun run pour l’échange');
  runs.push({ ctx: marie, ingestRunId: exchange.ingestRunId });
  expect(vi.mocked(enqueuePipelineStep)).toHaveBeenCalledTimes(runs.length);

  // Pipeline : chaque run va jusqu'à done, et la page Sources de Marie le montre.
  for (const { ctx, ingestRunId } of runs) {
    await runPipelineNow({ ingestRunId, tenantId: ctx.tenantId, userId: ctx.userId }, llm);
  }
  const marieSources = await listSources(marie);
  expect(marieSources.sources.map((s) => [s.kind, s.lastRun?.status])).toEqual([
    ['chatgpt', 'done'],
  ]);

  // MCP : Paul retrouve par search puis fetch ce que Marie a dit à ChatGPT, et son propre fait sensible.
  const paulMcp = await connectMcp(paulToken);
  const payment = await callTool(paulMcp, 'search', { query: '30 jours' });
  expect(payment.ids).toHaveLength(1);
  const paymentCard = await callTool(paulMcp, 'fetch', { id: payment.ids[0] });
  expect(paymentCard.text).toContain('ACME paiera à 30 jours.');
  expect(paymentCard.text).toContain('ChatGPT · Marie Durand');
  const dismissal = await callTool(paulMcp, 'search', { query: 'Dupont' });
  expect(dismissal.ids).toHaveLength(1);
  const dismissalCard = await callTool(paulMcp, 'fetch', { id: dismissal.ids[0] });
  expect(dismissalCard.text).toContain('Jean Dupont sera licencié en décembre. (à valider)');

  // Paul / Marie : le fait sensible reste invisible de Marie jusqu'à ce que Paul le partage.
  const marieMcp = await connectMcp(marieToken);
  expect((await callTool(marieMcp, 'search', { query: 'Dupont' })).ids).toEqual([]);
  const open = await listReviewItems(paul, { status: 'open' });
  const sensitive = open.find((item) => item.detail.kind === 'sensitive_fact');
  if (!sensitive) throw new Error('aucun élément « À vérifier » pour le fait sensible');
  const resolved = await resolveReviewItem(paul, sensitive.id, {
    kind: 'sensitive_fact',
    decision: 'share',
  });
  expect(resolved).toEqual({ ok: true });
  expect((await callTool(marieMcp, 'search', { query: 'Dupont' })).ids).toEqual(dismissal.ids);

  // Un second import complet de la même session n'insère rien.
  const secondImport = await importSession();
  expect(secondImport).toMatchObject({ inserted: 0, skipped: firstImport.turnsSent });
  expect(runs).toHaveLength(2);

  await Promise.all([paulMcp.close(), marieMcp.close()]);
});
