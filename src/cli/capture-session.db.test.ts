import { appendFile, copyFile, cp, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
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
import {
  captureSessionFromHook,
  captureToolFile,
  captureToolHook,
  type ToolCaptureDeps,
} from './capture-session';
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

// T52 et T63 amendés le 17/11 : la capture d'un fichier de Codex ou d'Antigravity, ses envois réels passés à l'app en
// mémoire, puis les tours que le serveur a rangés. Le serveur ne garde une cible que sous le nom commun (`Bash`,
// `Read`, `Edit`) : la CLI y ramène les outils connus, et un nom inconnu arrive en `[outil]`, sans cible.
describe('la capture de Codex et d’Antigravity et leurs coulisses, jusqu’en base', () => {
  const ESSAI = '/Users/demo/projets/essai';
  const TEMOIN = 'TEMOIN-ARGUMENT-7f3a';

  async function captureToolAndRead(
    externalId: string,
    run: (deps: ToolCaptureDeps & { env: Record<string, string | undefined> }) => Promise<unknown>,
  ) {
    const { tenantId, members } = await createTestTenant(['Paul']);
    const [paul] = members;
    if (!paul) throw new Error('membre de test manquant');
    const { token } = await createApiToken(paul, 'test');
    const fetchImpl: typeof fetch = async (url, init) => app.request(url.toString(), init);
    const server = { url: 'http://localhost:3000', token };
    const warnings = vi.spyOn(console, 'error').mockImplementation(() => {});
    await run({
      send: createIngestSender(fetchImpl, server),
      facts: {
        accord: FACTS_VERSION,
        accordLe: new Date(),
        usages: ['coulisses'],
        send: createFactsSender(fetchImpl, server),
        sendCoulisses: createCoulissesSender(fetchImpl, server),
      },
      out: () => {},
      // Chaque dossier est la racine de son dépôt, sans remote.
      git: async (args) => (args[0] === 'rev-parse' ? 'true\n' : null),
      readFile: (path) => readFile(path, 'utf8'),
      readdir: (path) => readdir(path),
      stat: (path) => stat(path),
      home: dir,
      env: { CODEX_HOME: join(dir, 'codex') },
    });
    const messages = warnings.mock.calls.map(([message]) => message);
    warnings.mockRestore();
    const [source] = await adminDb
      .select({ id: sources.id })
      .from(sources)
      .where(and(eq(sources.tenantId, tenantId), eq(sources.externalId, externalId)));
    if (!source) throw new Error('session absente de la base');
    const stored = await adminDb
      .select({ role: turns.role, text: turns.text, injecte: turns.injecte })
      .from(turns)
      .where(eq(turns.sourceId, source.id));
    return { messages, stored };
  }
  const appels = (stored: { role: string; text: string }[]) =>
    stored.filter((turn) => turn.role === 'appel_outil').map((turn) => turn.text);

  it('Codex, au crochet de fin : le raisonnement, les sous-agents et les appels sous le nom commun', async () => {
    const S = '019a7d2c-1111-7111-8111-111111111111';
    const day = join(dir, 'codex', 'sessions', '2026', '11', '13');
    await cp(
      fileURLToPath(new URL('../capture/fixtures/codex-sous-agents/', import.meta.url)),
      day,
      {
        recursive: true,
      },
    );
    const path = join(day, `rollout-2026-11-13T10-56-00-${S}.jsonl`);
    // Un changement de fichier, et un élément que le lecteur ne connaît pas, dont un argument est témoin.
    const item = (ordinal: number, value: Record<string, unknown>) =>
      `${JSON.stringify({
        timestamp: `2026-11-13T10:58:0${ordinal - 47}.000Z`,
        ordinal,
        type: 'event_msg',
        payload: { type: 'item_completed', thread_id: S, turn_id: 'tour-2', item: value },
      })}\n`;
    await appendFile(
      path,
      item(47, {
        type: 'FileChange',
        id: 'i-20',
        changes: { 'a.txt': { type: 'update' } },
        status: 'completed',
      }) + item(48, { type: 'OutilNouveau', id: 'i-21', status: 'completed', requete: TEMOIN }),
    );

    const { messages, stored } = await captureToolAndRead(S, (deps) =>
      captureToolHook(
        'codex',
        'fin',
        JSON.stringify({ session_id: S, transcript_path: path, cwd: ESSAI }),
        deps,
      ),
    );

    expect(messages).toEqual([]);
    const of = (role: string) =>
      stored.filter((turn) => turn.role === role).map((turn) => turn.text);
    expect(of('raisonnement')).toEqual([
      'Deux commandes à la suite : un ls qui échouera, puis les tests.',
    ]);
    expect(of('sous_agent')).toContain('[consigne]\nLis a.txt et rends son contenu.');
    expect(of('sous_agent')).toContain('[rapport]\na.txt contient « bonjour ».');
    expect(appels(stored)).toEqual(
      expect.arrayContaining([
        'Bash · ls · erreur',
        'Bash · pnpm test · ok',
        'Bash · cat · ok', // l'appel d'un sous-agent
        'Edit · a.txt · ok',
        '[outil] · ok',
      ]),
    );
    expect(stored.some((turn) => turn.text.includes(TEMOIN))).toBe(false);
  });

  it('Antigravity, quand la conversation est finie : les mêmes noms communs, et rien de ses arguments', async () => {
    const CONVERSATION = '11111111-1111-4111-8111-111111111111';
    const brain = join(dir, '.gemini', 'antigravity', 'brain');
    await cp(
      fileURLToPath(new URL('../capture/fixtures/antigravity-sous-agents/brain/', import.meta.url)),
      brain,
      { recursive: true },
    );
    const path = join(brain, CONVERSATION, '.system_generated', 'logs', 'transcript_full.jsonl');
    // Un outil que le lecteur ne connaît pas, dont un argument est témoin, resté sans résultat.
    await appendFile(
      path,
      `${JSON.stringify({
        step_index: 19,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: '2026-11-13T11:47:00Z',
        tool_calls: [{ name: 'outil_nouveau', args: { Query: TEMOIN } }],
      })}\n`,
    );

    const { messages, stored } = await captureToolAndRead(CONVERSATION, (deps) =>
      captureToolFile('antigravity', path, { fin: true, dossier: ESSAI }, deps),
    );

    expect(messages).toEqual([]);
    // Le message de chaque sous-agent à la session, rangé comme un tour `user` injecté (décision d'Amos du 17/11).
    for (const text of [
      'a.txt contient « bonjour ».',
      "La page ne s'ouvre pas encore, je réessaie.",
      'La page affiche « Exemple ».',
    ])
      expect(stored).toContainEqual({ role: 'user', text, injecte: true });
    expect(stored.some((turn) => turn.role === 'raisonnement')).toBe(true);
    expect(stored.map((turn) => turn.text)).toContain('[rapport]\na.txt contient « bonjour ».');
    expect(appels(stored)).toEqual(
      expect.arrayContaining([
        'Bash · ls · ok',
        'Read · a.txt · ok', // l'appel d'un sous-agent
        'invoke_subagent · ok',
        '[outil] · sans_resultat',
      ]),
    );
    expect(stored.some((turn) => turn.text.includes(TEMOIN))).toBe(false);
  });
});
