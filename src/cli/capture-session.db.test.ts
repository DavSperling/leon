import { copyFile, cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Usage } from '../capture/api-contract';
import { extractBackstage } from '../capture/session-backstage';
import { app } from '../server/api/app';
import { createApiToken } from '../server/auth/api-tokens';
import { sources, turns } from '../server/db/schema/memory';
import { adminDb } from '../test/db';
import { createTestTenant } from '../test/fixtures';
import { captureSessionFromHook } from './capture-session';
import { FACTS_VERSION } from './consent';
import { createCoulissesSender, createFactsSender, createIngestSender } from './import-claude-code';
import { loadSubagents } from './subagents';

// Les files du pipeline, du résumé et du rangement sont simulées, comme dans les autres tests de la capture.
vi.mock('../server/pipeline/queue');
vi.mock('../server/sessions/resume-queue');
vi.mock('../server/sessions/threads-queue');

// La vraie fixture de l'annexe 08 : un sous-agent qui lit le dépôt, et le sien, rangés dans `<session>/subagents/`.
const FIXTURE = fileURLToPath(
  new URL('../capture/fixtures/claude-code-sous-agents/', import.meta.url),
);
const SESSION = '55555555-5555-4555-8555-555555555555';
const REPORT = 'Les tests sont dans faits-routes.db.test.ts.';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'leon-capture-db-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

// Le crochet de fin, ses envois réels (createIngestSender, createFactsSender, createCoulissesSender) passés à l'app en
// mémoire, puis ce que la base a gardé de la session. `usages` : ceux de l'accord de Claude Code.
async function captureAndRead(usages: Usage[] = []) {
  const { tenantId, members } = await createTestTenant(['Paul']);
  const [paul] = members;
  if (!paul) throw new Error('membre de test manquant');
  const { token } = await createApiToken(paul, 'test');
  const fetchImpl: typeof fetch = async (url, init) => app.request(url.toString(), init);
  const server = { url: 'http://localhost:3000', token };
  const warnings = vi.spyOn(console, 'error').mockImplementation(() => {});
  const stdin = JSON.stringify({
    session_id: SESSION,
    transcript_path: join(dir, `${SESSION}.jsonl`),
    cwd: dir,
    hook_event_name: 'SessionEnd',
    reason: 'other',
  });
  await captureSessionFromHook(stdin, {
    send: createIngestSender(fetchImpl, server),
    facts: {
      accord: FACTS_VERSION,
      accordLe: new Date(),
      usages,
      send: createFactsSender(fetchImpl, server),
      sendCoulisses: createCoulissesSender(fetchImpl, server),
    },
    out: () => {},
    git: async () => null,
    readFile: (path) => readFile(path, 'utf8'),
    readdir: (path) => readdir(path),
    env: {},
    home: dir,
  });
  const messages = warnings.mock.calls.map(([message]) => message);
  warnings.mockRestore();
  const [source] = await adminDb
    .select({ id: sources.id, metadata: sources.metadata })
    .from(sources)
    .where(and(eq(sources.tenantId, tenantId), eq(sources.externalId, SESSION)));
  if (!source) throw new Error('session absente de la base');
  const stored = await adminDb
    .select({ role: turns.role, text: turns.text, injecte: turns.injecte })
    .from(turns)
    .where(eq(turns.sourceId, source.id));
  return { messages, metadata: source.metadata, stored };
}

describe('le crochet de fin et les sous-agents, jusqu’en base (T63)', () => {
  it('des sous-agents qui ne lisent que le dépôt : la session n’est pas externe, le rapport est un tour injecté', async () => {
    await cp(FIXTURE, dir, { recursive: true });

    const { messages, metadata, stored } = await captureAndRead();

    expect(messages).toEqual(['Leon: session captured (4 new turns, 0 already known).']);
    expect(metadata).toMatchObject({ faits: { externe: false } });
    expect(stored).toContainEqual({ role: 'user', text: REPORT, injecte: true });
    // La consigne du sous-agent ne part pas.
    expect(stored.some((turn) => turn.text.includes('Trouve les tests'))).toBe(false);
  });

  it('sans le dossier des sous-agents, la session reste externe', async () => {
    await copyFile(join(FIXTURE, `${SESSION}.jsonl`), join(dir, `${SESSION}.jsonl`));

    const { messages, metadata } = await captureAndRead();

    expect(messages).toEqual(['Leon: session captured (4 new turns, 0 already known).']);
    expect(metadata).toMatchObject({ faits: { externe: true } });
  });
});

describe('le crochet de fin et les coulisses, jusqu’en base (T52)', () => {
  it('avec l’usage coulisses : le raisonnement, les sous-agents et les appels rangés comme tours de la session', async () => {
    await cp(FIXTURE, dir, { recursive: true });
    const file = join(dir, `${SESSION}.jsonl`);
    const subagents = await loadSubagents(file, {
      readFile: (path) => readFile(path, 'utf8'),
      readdir: (path) => readdir(path),
    });
    const blocs = extractBackstage(await readFile(file, 'utf8'), null, subagents);

    const { messages, stored } = await captureAndRead(['coulisses']);

    expect(messages).toEqual(['Leon: session captured (4 new turns, 0 already known).']);
    const of = (role: string) => stored.filter((turn) => turn.role === role);
    expect(of('raisonnement').map((turn) => turn.text)).toEqual([
      'Il faut trouver la route des faits, puis ses tests.',
    ]);
    expect(of('sous_agent').some((turn) => turn.text.startsWith('[consigne]\n'))).toBe(true);
    expect(of('sous_agent').some((turn) => turn.text === `[rapport]\n${REPORT}`)).toBe(true);
    expect(of('appel_outil')).toHaveLength(
      blocs.filter((bloc) => bloc.role === 'appel_outil').length,
    );
    expect(of('appel_outil').length).toBeGreaterThan(0);
  });

  it('sans l’usage, aucun tour de coulisses', async () => {
    await cp(FIXTURE, dir, { recursive: true });

    const { stored } = await captureAndRead(['lecture']);

    expect(new Set(stored.map((turn) => turn.role))).toEqual(new Set(['user', 'assistant']));
  });
});
