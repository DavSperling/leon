import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionFactsPayload } from '../capture/api-contract';
import { SECRET_MASK } from '../capture/mask-secrets';
import { extractClaudeCodeFacts } from '../capture/session-facts';
import { type IngestPayload, type IngestResult, TURNS_PER_BATCH_MAX } from '../capture/turn';
import {
  type CaptureDeps,
  captureSessionFromHook,
  createHookSender,
  HOOK_DEADLINE_MS,
  parseDeadlineMs,
  readHookStdin,
} from './capture-session';
import {
  createFactsSender,
  createIngestSender,
  type FactsSender,
  IngestResponseError,
  TokenRefusedError,
} from './import-claude-code';

const FIXTURES = new URL('../capture/fixtures/claude-code/', import.meta.url);
const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const HOME = '/home/demo';
const RESULT: IngestResult = {
  sourceId: crypto.randomUUID(),
  inserted: 2,
  skipped: 0,
  ingestRunId: null,
};
const HOOK = JSON.stringify({
  session_id: 's1',
  transcript_path: '/t/s1.jsonl',
  cwd: '/r',
  hook_event_name: 'SessionEnd',
  reason: 'other',
});

// Des secrets de forme réaliste, tous fictifs.
const SECRETS = {
  anthropic: 'sk-ant-api03-FAKEabcdefghijklmnopqrstuvwxyz0123456789',
  github: `ghp_${'a1B2c3D4e5F6'.repeat(3)}`,
  motDePasse: 'hunter2hunter2',
  jetonEnv: 'abcdef1234567890abcdef',
  leon: `leon_${'B'.repeat(43)}`,
  clePrivee: 'MIIEowIBAAKCAQEAFAKEFAKEFAKE',
  sortieOutil: 'AKIAFAKEFAKEFAKE1234',
};

const line = (value: Record<string, unknown>) => JSON.stringify(value);
// `cwd` : le dossier écrit sur la ligne ; null pour une ligne qui n'en porte pas.
const conversationLine = (
  n: number,
  type: 'user' | 'assistant',
  content: unknown,
  cwd: string | null = '/r',
) =>
  line({
    type,
    uuid: `u-${n}`,
    sessionId: SESSION_ID,
    timestamp: `2026-10-20T08:${String(n % 60).padStart(2, '0')}:00.000Z`,
    ...(cwd === null ? {} : { cwd }),
    isSidechain: false,
    message: { role: type, content },
  });
const folderKey = (path: string) =>
  `dossier:${createHash('sha256').update(path).digest('hex').slice(0, 16)}`;

function sessionWithSecrets(): string {
  return [
    conversationLine(
      1,
      'user',
      `Voici mon .env :\nANTHROPIC_API_KEY=${SECRETS.anthropic}\nDATABASE_URL=postgres://admin:${SECRETS.motDePasse}@db.exemple.fr:5432/app\nAPI_TOKEN=${SECRETS.jetonEnv}`,
    ),
    line({ type: 'ai-title', sessionId: SESSION_ID, aiTitle: `Configurer ${SECRETS.anthropic}` }),
    conversationLine(2, 'assistant', [
      {
        type: 'text',
        text: `J'ai lu ${SECRETS.github} et ${SECRETS.leon}.\n-----BEGIN RSA PRIVATE KEY-----\n${SECRETS.clePrivee}\n-----END RSA PRIVATE KEY-----`,
      },
      {
        type: 'tool_use',
        id: 't1',
        name: 'Bash',
        input: { command: `cat ${SECRETS.sortieOutil}` },
      },
    ]),
    conversationLine(3, 'user', [
      { type: 'tool_result', tool_use_id: 't1', content: `AWS_KEY=${SECRETS.sortieOutil}` },
    ]),
    conversationLine(4, 'user', 'Merci, on continue demain.'),
  ].join('\n');
}

let stderr: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});
const stderrText = () => stderr.mock.calls.flat().join('\n');

function makeDeps(
  overrides: {
    session?: string;
    remote?: string | null;
    send?: CaptureDeps['send'];
    readFile?: CaptureDeps['readFile'];
    git?: CaptureDeps['git'];
    projectDir?: string;
    facts?: CaptureDeps['facts'];
    env?: CaptureDeps['env'];
  } = {},
) {
  const session = overrides.session ?? sessionWithSecrets();
  const send = vi.fn<CaptureDeps['send']>(overrides.send ?? (async () => RESULT));
  const readSessionFile = vi.fn<CaptureDeps['readFile']>(
    overrides.readFile ?? (async () => session),
  );
  const git = vi.fn<CaptureDeps['git']>(
    overrides.git ?? (async () => (overrides.remote === undefined ? null : overrides.remote)),
  );
  const out = vi.fn<(line: string) => void>();
  const deps: CaptureDeps = {
    send,
    out,
    readFile: readSessionFile,
    git,
    // Jamais l'environnement ni le HOME du lanceur des tests (Cursor, Codex).
    env: overrides.env ?? {},
    home: HOME,
    ...(overrides.projectDir === undefined ? {} : { projectDir: overrides.projectDir }),
    ...(overrides.facts === undefined ? {} : { facts: overrides.facts }),
  };
  return { deps, send, readSessionFile, git, out };
}

const sentPayloads = (send: { mock: { calls: Array<[IngestPayload]> } }) =>
  send.mock.calls.map(([payload]) => payload);

describe('captureSessionFromHook : une session qui se termine', () => {
  it('envoie ce seul fichier, avec la clé de projet tirée du dossier du crochet', async () => {
    const { deps, send, readSessionFile, git } = makeDeps({
      remote: 'git@github.com:Acme/Leon.git',
    });

    const code = await captureSessionFromHook(HOOK, deps);

    expect(code).toBe(0);
    expect(readSessionFile).toHaveBeenCalledTimes(1);
    expect(readSessionFile).toHaveBeenCalledWith('/t/s1.jsonl');
    expect(git).toHaveBeenCalledWith(['remote', 'get-url', 'origin'], '/r');
    expect(send).toHaveBeenCalledTimes(1);
    const [payload] = sentPayloads(send);
    expect(payload?.source).toEqual({
      kind: 'claude_code',
      external_id: SESSION_ID,
      title: expect.any(String),
      project: 'github.com/acme/leon',
    });
    expect(payload?.turns.map((turn) => turn.external_id)).toEqual(['u-1', 'u-2', 'u-4']);
  });

  it('dit combien de tours sont nouveaux, au pluriel comme au singulier', async () => {
    const many = makeDeps();
    await captureSessionFromHook(HOOK, many.deps);
    expect(stderrText()).toContain('session captured (2 new turns, 0 already known).');

    stderr.mockClear();
    const one = makeDeps({ send: async () => ({ ...RESULT, inserted: 1, skipped: 3 }) });
    await captureSessionFromHook(HOOK, one.deps);
    expect(stderrText()).toContain('session captured (1 new turn, 3 already known).');
  });

  it('sans remote, la clé est celle du dossier', async () => {
    const { deps, send } = makeDeps({ remote: null });

    await captureSessionFromHook(HOOK, deps);

    expect(sentPayloads(send)[0]?.source.project).toMatch(/^dossier:[0-9a-f]{16}$/);
  });

  it("n'envoie que le fichier désigné, jamais les autres sessions du même dossier", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'leon-capture-'));
    try {
      await copyFile(new URL('session-simple.jsonl', FIXTURES), join(dir, 'a.jsonl'));
      await copyFile(new URL('session-bruit.jsonl', FIXTURES), join(dir, 'b.jsonl'));
      const { deps, send } = makeDeps({ readFile: (path) => readFile(path, 'utf8') });

      const code = await captureSessionFromHook(
        JSON.stringify({ session_id: 'x', transcript_path: join(dir, 'a.jsonl'), cwd: dir }),
        deps,
      );

      expect(code).toBe(0);
      expect(send).toHaveBeenCalledTimes(1);
      expect(sentPayloads(send)[0]?.source.external_id).toBe(
        '11111111-1111-4111-8111-111111111111',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('découpe une longue session en lots, tous marqués du même projet', async () => {
    const lines = Array.from({ length: TURNS_PER_BATCH_MAX * 2 + 50 }, (_, i) =>
      conversationLine(i, i % 2 === 0 ? 'user' : 'assistant', `Tour ${i}`),
    );
    const { deps, send } = makeDeps({
      session: lines.join('\n'),
      remote: 'https://github.com/acme/leon',
    });

    const code = await captureSessionFromHook(HOOK, deps);

    expect(code).toBe(0);
    const payloads = sentPayloads(send);
    // Les lots partent du plus récent (le dernier, de 50 tours) au plus ancien.
    expect(payloads.map((payload) => payload.turns.length)).toEqual([
      50,
      TURNS_PER_BATCH_MAX,
      TURNS_PER_BATCH_MAX,
    ]);
    expect(new Set(payloads.map((payload) => payload.source.project))).toEqual(
      new Set(['github.com/acme/leon']),
    );
  });

  it('une session sans aucun échange ne fait rien et sort à 0', async () => {
    const { deps, send } = makeDeps({ session: line({ type: 'permission-mode' }) });

    expect(await captureSessionFromHook(HOOK, deps)).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

// Le JSON de la doc officielle, https://code.claude.com/docs/en/hooks (lue le 2026-10-20) : les champs communs
// (session_id, prompt_id, transcript_path, cwd, scratchpad_dir, permission_mode, effort) et ceux de SessionEnd
// (hook_event_name, reason). Un futur `.strict()` sur l'entrée du crochet casserait la première vraie session.
describe('captureSessionFromHook : le JSON de la doc de Claude Code (SessionEnd)', () => {
  const DOC_INPUT = {
    session_id: 'abc123',
    prompt_id: '550e8400-e29b-41d4-a716-446655440000',
    transcript_path: '/Users/demo/.claude/projects/-r/00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl',
    cwd: '/r',
    scratchpad_dir: '/tmp/claude-1000/-r/abc123/scratchpad',
    permission_mode: 'default',
    effort: { level: 'high' },
    hook_event_name: 'SessionEnd',
    reason: 'other',
  };

  it("accepte tous les champs de la doc, y compris ceux que Leon n'utilise pas", async () => {
    const { deps, send, readSessionFile } = makeDeps({ remote: 'git@github.com:acme/leon.git' });

    const code = await captureSessionFromHook(JSON.stringify(DOC_INPUT), deps);

    expect(code).toBe(0);
    expect(readSessionFile).toHaveBeenCalledWith(DOC_INPUT.transcript_path);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sentPayloads(send)[0]?.source.project).toBe('github.com/acme/leon');
  });

  it.each(['clear', 'resume', 'logout', 'prompt_input_exit', 'other', 'une-raison-future'])(
    'envoie la session quelle que soit la raison de fin (%s)',
    async (reason) => {
      const { deps, send } = makeDeps();

      expect(await captureSessionFromHook(JSON.stringify({ ...DOC_INPUT, reason }), deps)).toBe(0);
      expect(send).toHaveBeenCalledTimes(1);
    },
  );
});

// Les crochets de Claude Code lancés par un autre outil (T06) : Cursor qui les reprend, Codex qui les a recopiés à
// sa migration. Leur fichier de session n'est pas au format de Claude Code, et chacun a son propre crochet.
describe('captureSessionFromHook : lancée par un autre outil que Claude Code', () => {
  const hookWith = (fields: Record<string, unknown>) =>
    JSON.stringify({ ...JSON.parse(HOOK), ...fields });

  it.each([
    ['une entrée Cursor (cursor_version)', hookWith({ cursor_version: '1.7.2' }), {}],
    ['CURSOR_VERSION posé', HOOK, { CURSOR_VERSION: '1.7.2' }],
    [
      'une session Codex sous CODEX_HOME',
      hookWith({ transcript_path: '/codex/sessions/2026/11/02/rollout-1.jsonl' }),
      { CODEX_HOME: '/codex' },
    ],
    [
      'une session Codex sous ~/.codex, sans CODEX_HOME',
      hookWith({ transcript_path: `${HOME}/.codex/sessions/2026/11/02/rollout-1.jsonl` }),
      {},
    ],
  ])('%s : code 0, sans rien lire, envoyer ni écrire', async (_name, stdin, env) => {
    const { deps, send, readSessionFile, git, out } = makeDeps({ env });

    expect(await captureSessionFromHook(stdin, deps)).toBe(0);

    expect(readSessionFile).not.toHaveBeenCalled();
    expect(git).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(out).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it.each([
    ['une session Claude Code', `${HOME}/.claude/projects/-r/s1.jsonl`, {}],
    [
      'une session sous ~/.codex quand CODEX_HOME est ailleurs',
      `${HOME}/.codex/sessions/s1.jsonl`,
      { CODEX_HOME: '/codex' },
    ],
  ])('%s : la session part, comme d’habitude', async (_name, transcriptPath, env) => {
    const { deps, send } = makeDeps({ env: { CURSOR_VERSION: '', ...env } });

    expect(await captureSessionFromHook(hookWith({ transcript_path: transcriptPath }), deps)).toBe(
      0,
    );

    expect(send).toHaveBeenCalledTimes(1);
  });
});

// Le `cwd` du crochet suit Claude (doc : « the worktree root after Claude enters a worktree, and the new directory
// after Claude runs cd »). La clé du projet doit rester celle du dossier de départ de la session, que voit aussi
// `briefing` au démarrage : sans remote GitHub, la clé est le hachage du chemin, et trois chemins donnent trois clés.
describe('captureSessionFromHook : le projet est celui du dossier de départ de la session', () => {
  const START = '/p';
  // Trois tours : le premier au dossier de départ, les suivants après un worktree puis un `cd`.
  const sessionWith = (cwds: [string | null, string | null, string | null]) =>
    [
      conversationLine(1, 'user', 'Bonjour', cwds[0]),
      conversationLine(2, 'assistant', [{ type: 'text', text: 'Salut' }], cwds[1]),
      conversationLine(3, 'user', 'Merci', cwds[2]),
    ].join('\n');
  const sessionStartedAt = (cwd: string) => sessionWith([cwd, '/p/.claude/worktrees/x', '/tmp']);
  const hookAt = (cwd: string) =>
    JSON.stringify({ session_id: 's1', transcript_path: '/t/s1.jsonl', cwd });

  it.each([
    ['un worktree du dépôt', '/p/.claude/worktrees/x'],
    ['un dossier sans rapport (cd)', '/tmp'],
    ['un sous-dossier', '/p/src'],
  ])(
    'sans remote GitHub, un crochet lancé dans %s donne la clé du dossier de départ',
    async (_name, hookCwd) => {
      const { deps, send, git } = makeDeps({ session: sessionStartedAt(START), remote: null });

      expect(await captureSessionFromHook(hookAt(hookCwd), deps)).toBe(0);

      expect(sentPayloads(send)[0]?.source.project).toBe(folderKey(START));
      expect(git.mock.calls.map(([, cwd]) => cwd)).toEqual([START]);
    },
  );

  it('donne la même clé que le crochet lancé à la racine du projet', async () => {
    const keys: Array<string | undefined> = [];
    for (const hookCwd of [START, '/p/.claude/worktrees/x', '/tmp']) {
      const { deps, send } = makeDeps({ session: sessionStartedAt(START), remote: null });
      await captureSessionFromHook(hookAt(hookCwd), deps);
      keys.push(sentPayloads(send)[0]?.source.project);
    }

    expect(new Set(keys).size).toBe(1);
  });

  it('sans dossier écrit dans la session, prend CLAUDE_PROJECT_DIR (le dossier où la session a démarré)', async () => {
    const { deps, send, git } = makeDeps({
      session: sessionWith([null, null, null]),
      remote: null,
      projectDir: START,
    });

    await captureSessionFromHook(hookAt('/tmp'), deps);

    expect(sentPayloads(send)[0]?.source.project).toBe(folderKey(START));
    expect(git.mock.calls.map(([, cwd]) => cwd)).toEqual([START]);
  });

  it("sans rien d'autre, prend le dossier du crochet", async () => {
    const { deps, send } = makeDeps({
      session: sessionWith([null, null, null]),
      remote: null,
    });

    await captureSessionFromHook(hookAt('/tmp'), deps);

    expect(sentPayloads(send)[0]?.source.project).toBe(folderKey('/tmp'));
  });

  it("ignore un dossier relatif (écrit dans la session ou dans l'environnement)", async () => {
    const { deps, send, git } = makeDeps({
      session: sessionWith(['relatif', null, null]),
      remote: null,
      projectDir: 'aussi-relatif',
    });

    await captureSessionFromHook(hookAt('/tmp'), deps);

    expect(sentPayloads(send)[0]?.source.project).toBe(folderKey('/tmp'));
    expect(git.mock.calls.map(([, cwd]) => cwd)).toEqual(['/tmp']);
  });

  it('avec un remote GitHub, la clé est la même où que se trouve le crochet', async () => {
    const { deps, send } = makeDeps({
      session: sessionStartedAt(START),
      remote: 'git@github.com:Acme/Leon.git',
    });

    await captureSessionFromHook(hookAt('/tmp'), deps);

    expect(sentPayloads(send)[0]?.source.project).toBe('github.com/acme/leon');
  });
});

// Les faits partent après les tours, seulement quand l'accord le permet : leon.ts ne pose `facts` qu'à partir de
// la version 2 (consent.ts). Sans `facts`, tous les tests ci-dessus montrent que seuls les tours partent.
describe("captureSessionFromHook : les faits de la session, si l'accord le permet", () => {
  const env = { url: 'http://localhost:3000', token: `leon_${'a'.repeat(43)}` };
  const GESTES = new URL(
    '../capture/fixtures/claude-code-faits/session-gestes.jsonl',
    import.meta.url,
  );

  it('après les tours, envoie les faits, avec la version de l’accord et une vraie fin', async () => {
    const content = await readFile(GESTES, 'utf8');
    const events: string[] = [];
    const facts = vi.fn<FactsSender>(async () => {
      events.push('faits');
    });
    const { deps } = makeDeps({
      session: content,
      remote: 'git@github.com:Acme/Leon.git',
      send: async () => {
        events.push('tours');
        return RESULT;
      },
      facts: { accord: 2, send: facts },
    });

    expect(await captureSessionFromHook(HOOK, deps)).toBe(0);

    expect(events.at(-1)).toBe('faits');
    expect(events.filter((event) => event === 'faits')).toHaveLength(1);
    const [payload] = facts.mock.calls.map(([sent]) => sent);
    expect(payload).toEqual<SessionFactsPayload>({
      kind: 'claude_code',
      external_id: '44444444-4444-4444-8444-444444444444',
      project: 'github.com/acme/leon',
      accord: 2,
      // Les fichiers sont relatifs au dossier de départ de la session, pas à celui du crochet.
      faits: extractClaudeCodeFacts(content, '/Users/demo/projets/leon'),
      fin: true,
    });
    expect(payload?.faits.fichiers.length).toBeGreaterThan(0);
  });

  it.each([404, 400])(
    'un %i sur les faits : code 0, la session reste captée, un message fixe sans le corps de la réponse',
    async (status) => {
      const fetchImpl = vi.fn(
        async () => new Response(JSON.stringify({ error: 'MOT-DU-SERVEUR' }), { status }),
      );
      const { deps, send } = makeDeps({
        facts: { accord: 2, send: createFactsSender(fetchImpl as unknown as typeof fetch, env) },
      });

      expect(await captureSessionFromHook(HOOK, deps)).toBe(0);

      expect(send).toHaveBeenCalledTimes(1);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(stderrText()).toMatch(/session captured/);
      expect(stderrText()).toMatch(/does not accept session facts/);
      expect(stderrText()).not.toContain('MOT-DU-SERVEUR');
    },
  );

  it("une autre erreur sur les faits : code 0, un message fixe, rien du texte de l'erreur", async () => {
    const { deps } = makeDeps({
      facts: {
        accord: 2,
        send: async () => {
          throw new TypeError(`fetch failed : MOT-DE-L-ERREUR ${SECRETS.anthropic}`);
        },
      },
    });

    expect(await captureSessionFromHook(HOOK, deps)).toBe(0);

    expect(stderrText()).toMatch(/session captured/);
    expect(stderrText()).toMatch(/session facts not sent/);
    expect(stderrText()).not.toContain('MOT-DE-L-ERREUR');
    expect(stderrText()).not.toContain(SECRETS.anthropic);
  });

  it('des tours refusés : les faits ne partent pas', async () => {
    const facts = vi.fn<FactsSender>(async () => {});
    const { deps } = makeDeps({
      send: async () => {
        throw new IngestResponseError(500);
      },
      facts: { accord: 2, send: facts },
    });

    expect(await captureSessionFromHook(HOOK, deps)).toBe(0);

    expect(facts).not.toHaveBeenCalled();
  });
});

describe('captureSessionFromHook : un 400 du serveur', () => {
  const env = { url: 'http://localhost:3000', token: `leon_${'a'.repeat(43)}` };

  it("dit que le serveur ne reconnaît pas l'envoi (peut-être plus ancien que la CLI), sans le corps de la réponse", async () => {
    const refusing = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'MOT-DU-SERVEUR unrecognized_keys project' }), {
          status: 400,
        }),
    );
    const { deps } = makeDeps({ send: createHookSender(refusing as unknown as typeof fetch, env) });

    expect(await captureSessionFromHook(HOOK, deps)).toBe(0);

    expect(stderrText()).toMatch(/does not recognize this upload/);
    expect(stderrText()).toMatch(/older than the CLI/);
    expect(stderrText()).not.toMatch(/unreachable/);
    expect(stderrText()).not.toContain('MOT-DU-SERVEUR');
    expect(refusing).toHaveBeenCalledTimes(1);
  });

  it('une autre réponse en erreur garde le message général', async () => {
    const failing = vi.fn(async () => new Response('', { status: 500 }));
    const { deps } = makeDeps({ send: createHookSender(failing as unknown as typeof fetch, env) });

    await captureSessionFromHook(HOOK, deps);

    expect(stderrText()).toMatch(/unreachable or unexpected response/);
    expect(stderrText()).not.toMatch(/does not recognize/);
  });

  it("l'erreur d'envoi porte le code de la réponse, sans la citer dans son message", () => {
    const error = new IngestResponseError(400);

    expect(error.status).toBe(400);
    expect(error.message).toBe('Response 400 from the Leon server.');
  });
});

// Le délai du crochet court une seule fois pour tout l'envoi. Une session reprise renvoie son historique déjà
// connu : si les lots partaient du plus ancien, ils épuiseraient le délai avant d'atteindre les tours nouveaux,
// et la capture échouerait de la même façon à chaque fin de session. Les lots partent donc du plus récent.
describe("captureSessionFromHook : les lots les plus récents d'abord", () => {
  const env = { url: 'http://localhost:3000', token: `leon_${'a'.repeat(43)}` };
  const BATCHES = 40;

  it('quand le délai tombe après trois lots, ce sont les trois derniers qui sont reçus', async () => {
    const total = TURNS_PER_BATCH_MAX * BATCHES;
    const lines = Array.from({ length: total }, (_, i) =>
      conversationLine(i, i % 2 === 0 ? 'user' : 'assistant', `Tour ${i}`),
    );
    const controller = new AbortController();
    const received: string[][] = [];
    const fetchWithDeadline = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as IngestPayload;
      received.push(payload.turns.map((turn) => turn.external_id));
      if (received.length === 3) {
        controller.abort(new DOMException('délai', 'TimeoutError')); // le délai du crochet tombe ici
      }
      if (init?.signal?.aborted) throw init.signal.reason;
      return new Response(JSON.stringify(RESULT), { status: 200 });
    });
    const send = createIngestSender(fetchWithDeadline as unknown as typeof fetch, env, {
      signal: controller.signal,
    });
    const { deps } = makeDeps({ session: lines.join('\n'), send });

    expect(await captureSessionFromHook(HOOK, deps)).toBe(0);

    expect(received).toHaveLength(3);
    expect(received[0]?.at(-1)).toBe(`u-${total - 1}`); // le dernier tour de la session part dans le premier envoi
    expect(received[0]?.[0]).toBe(`u-${total - TURNS_PER_BATCH_MAX}`);
    expect(received[1]?.at(-1)).toBe(`u-${total - TURNS_PER_BATCH_MAX - 1}`);
    expect(received.flat()).not.toContain('u-0'); // le début, lui, attendra la capture suivante
    expect(stderrText()).toMatch(/too slow|timeout/);
  });

  it("dans chaque lot, les tours restent dans l'ordre de la conversation", async () => {
    const lines = Array.from({ length: TURNS_PER_BATCH_MAX + 20 }, (_, i) =>
      conversationLine(i, i % 2 === 0 ? 'user' : 'assistant', `Tour ${i}`),
    );
    const { deps, send } = makeDeps({ session: lines.join('\n') });

    await captureSessionFromHook(HOOK, deps);

    const [newest, oldest] = sentPayloads(send);
    expect(newest?.turns.map((turn) => turn.external_id)).toEqual(
      Array.from({ length: 20 }, (_, i) => `u-${TURNS_PER_BATCH_MAX + i}`),
    );
    expect(oldest?.turns.map((turn) => turn.external_id)).toEqual(
      Array.from({ length: TURNS_PER_BATCH_MAX }, (_, i) => `u-${i}`),
    );
  });
});

describe('captureSessionFromHook : les secrets', () => {
  it("un secret présent dans la session n'arrive jamais tel quel au serveur", async () => {
    const { deps, send } = makeDeps({ remote: 'git@github.com:acme/leon.git' });

    await captureSessionFromHook(HOOK, deps);

    const wire = JSON.stringify(sentPayloads(send));
    for (const [name, secret] of Object.entries(SECRETS)) {
      expect(wire, name).not.toContain(secret);
    }
    expect(wire).toContain(SECRET_MASK);
    // Le texte sans secret, lui, passe.
    expect(wire).toContain('Merci, on continue demain.');
  });

  it('le titre de la session est masqué comme le texte des tours', async () => {
    const { deps, send } = makeDeps();

    await captureSessionFromHook(HOOK, deps);

    const title = sentPayloads(send)[0]?.source.title ?? '';
    expect(title).toContain(SECRET_MASK);
    expect(title).not.toContain(SECRETS.anthropic);
  });

  it("un secret n'apparaît pas non plus sur la sortie d'erreur, même quand l'envoi échoue", async () => {
    const { deps } = makeDeps({
      send: async () => {
        throw new Error(`échec avec ${SECRETS.anthropic} et ${SECRETS.motDePasse}`);
      },
    });

    await captureSessionFromHook(HOOK, deps);

    for (const secret of Object.values(SECRETS)) expect(stderrText()).not.toContain(secret);
  });
});

describe("captureSessionFromHook : l'adresse du remote", () => {
  const REMOTE = 'https://utilisateur:jeton-du-depot@github.com/Acme/Leon.git';

  it("n'envoie ni l'adresse brute ni le jeton, seulement la clé", async () => {
    const { deps, send, out } = makeDeps({ remote: REMOTE });

    await captureSessionFromHook(HOOK, deps);

    expect(sentPayloads(send)[0]?.source.project).toBe('github.com/acme/leon');
    const everything = [JSON.stringify(sentPayloads(send)), stderrText(), ...out.mock.calls.flat()];
    for (const text of everything) {
      expect(text).not.toContain('jeton-du-depot');
      expect(text).not.toContain('utilisateur');
      expect(text).not.toContain(REMOTE);
    }
  });

  it("n'écrit ni l'adresse ni le jeton dans un message d'erreur", async () => {
    const { deps, out } = makeDeps({
      remote: REMOTE,
      send: async () => {
        throw new TypeError(`fetch failed : ${REMOTE}`);
      },
    });

    expect(await captureSessionFromHook(HOOK, deps)).toBe(0);

    for (const text of [stderrText(), ...out.mock.calls.flat()]) {
      expect(text).not.toContain('jeton-du-depot');
      expect(text).not.toContain('github.com/Acme');
    }
  });

  it('si git échoue, la session part quand même avec la clé du dossier', async () => {
    const { deps, send } = makeDeps({
      git: async () => {
        throw new Error('git manque');
      },
    });

    expect(await captureSessionFromHook(HOOK, deps)).toBe(0);
    expect(sentPayloads(send)[0]?.source.project).toMatch(/^dossier:[0-9a-f]{16}$/);
  });
});

describe('captureSessionFromHook : ne bloque jamais Claude Code', () => {
  const unreadableInputs: Array<[string, string]> = [
    ['vide', ''],
    ['pas du JSON', "ceci n'est pas du JSON"],
    ['objet vide', '{}'],
    ['tableau', '[]'],
    ['null', 'null'],
    ['chemin absent', JSON.stringify({ session_id: 's', cwd: '/r' })],
    ['chemin de mauvais type', JSON.stringify({ transcript_path: 42, cwd: '/r' })],
    ['chemin vide', JSON.stringify({ transcript_path: '', cwd: '/r' })],
    ['dossier absent', JSON.stringify({ transcript_path: '/t/s1.jsonl' })],
    ['dossier relatif', JSON.stringify({ transcript_path: '/t/s1.jsonl', cwd: 'relatif' })],
    ['dossier « . »', JSON.stringify({ transcript_path: '/t/s1.jsonl', cwd: '.' })],
  ];

  it.each(unreadableInputs)(
    'une entrée illisible (%s) : code 0, un message, rien lu ni envoyé',
    async (_name, stdin) => {
      const { deps, send, readSessionFile } = makeDeps();

      const code = await captureSessionFromHook(stdin, deps);

      expect(code).toBe(0);
      expect(stderr).toHaveBeenCalled();
      expect(stderrText()).toMatch(/^Leon: /);
      expect(readSessionFile).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("un message d'entrée illisible ne recopie pas l'entrée", async () => {
    const { deps } = makeDeps();

    await captureSessionFromHook(`{"transcript_path": 42, "secret": "${SECRETS.anthropic}"}`, deps);

    expect(stderrText()).not.toContain(SECRETS.anthropic);
  });

  it("un fichier absent : code 0, un message sans le texte de l'erreur", async () => {
    const { deps, send } = makeDeps({
      readFile: async () => {
        throw new Error("ENOENT: no such file or directory, open 'MOT-DE-L-ERREUR'");
      },
    });

    const code = await captureSessionFromHook(HOOK, deps);

    expect(code).toBe(0);
    expect(stderrText()).toMatch(/not found|unreadable/);
    expect(stderrText()).not.toContain('MOT-DE-L-ERREUR');
    expect(send).not.toHaveBeenCalled();
  });

  it("un fichier qui n'est pas une session : code 0, rien d'envoyé", async () => {
    const { deps, send } = makeDeps({ session: `contenu quelconque ${SECRETS.anthropic}` });

    expect(await captureSessionFromHook(HOOK, deps)).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(stderrText()).not.toContain(SECRETS.anthropic);
  });

  it("un serveur injoignable : code 0, un message, rien du texte de l'erreur", async () => {
    const { deps } = makeDeps({
      send: async () => {
        throw new TypeError('fetch failed : MOT-DE-L-ERREUR', {
          cause: new Error('connect ECONNREFUSED 127.0.0.1:3000'),
        });
      },
    });

    const code = await captureSessionFromHook(HOOK, deps);

    expect(code).toBe(0);
    expect(stderrText()).toMatch(/unreachable/);
    expect(stderrText()).not.toContain('MOT-DE-L-ERREUR');
    expect(stderrText()).not.toContain('ECONNREFUSED');
  });

  it('une réponse 500 : code 0 et message fixe', async () => {
    const { deps } = makeDeps({
      send: async () => {
        throw new Error('Réponse 500 du serveur Leon.');
      },
    });

    expect(await captureSessionFromHook(HOOK, deps)).toBe(0);
    expect(stderrText()).toMatch(/^Leon: /);
  });

  it('un jeton refusé : code 0 et le message le dit', async () => {
    const { deps, send } = makeDeps({
      send: async () => {
        throw new TokenRefusedError();
      },
    });

    expect(await captureSessionFromHook(HOOK, deps)).toBe(0);
    expect(stderrText()).toMatch(/token refused/);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('un délai dépassé : code 0 et le message le dit', async () => {
    const { deps } = makeDeps({
      send: async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      },
    });

    expect(await captureSessionFromHook(HOOK, deps)).toBe(0);
    expect(stderrText()).toMatch(/too slow|timeout/);
  });

  it("une exception inattendue (même synchrone) ne fait jamais sortir autrement qu'à 0", async () => {
    const { deps } = makeDeps({
      readFile: () => {
        throw new Error('exception synchrone');
      },
    });

    expect(await captureSessionFromHook(HOOK, deps)).toBe(0);
    expect(stderrText()).not.toContain('exception synchrone');
  });

  it("s'arrête au premier lot refusé : pas de jeton réessayé pour rien", async () => {
    const lines = Array.from({ length: TURNS_PER_BATCH_MAX * 2 }, (_, i) =>
      conversationLine(i, i % 2 === 0 ? 'user' : 'assistant', `Tour ${i}`),
    );
    const { deps, send } = makeDeps({
      session: lines.join('\n'),
      send: async () => {
        throw new TokenRefusedError();
      },
    });

    expect(await captureSessionFromHook(HOOK, deps)).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('createHookSender : un délai réseau borné', () => {
  const env = { url: 'http://localhost:3000', token: `leon_${'a'.repeat(43)}` };
  // Un fetch qui ne répond jamais, sauf pour échouer quand on l'interrompt.
  const hangingFetch = vi.fn(
    (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        if (signal.aborted) return reject(signal.reason);
        signal.addEventListener('abort', () => reject(signal.reason));
      }),
  );

  it('le délai est nettement sous les 30 s du crochet', () => {
    expect(HOOK_DEADLINE_MS).toBeGreaterThan(0);
    expect(HOOK_DEADLINE_MS).toBeLessThanOrEqual(20_000);
  });

  it('interrompt un serveur qui ne répond pas, et la capture sort quand même à 0', async () => {
    const send = createHookSender(hangingFetch as unknown as typeof fetch, env, 30);
    const { deps } = makeDeps({ send });
    const started = Date.now();

    const code = await captureSessionFromHook(HOOK, deps);

    expect(code).toBe(0);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(hangingFetch).toHaveBeenCalledTimes(1);
    expect(stderrText()).toMatch(/too slow|timeout/);
  });
});

describe('parseDeadlineMs : raccourcir le délai, jamais le rallonger', () => {
  it('sans valeur, ou avec une valeur illisible, garde le délai du crochet', () => {
    for (const value of [undefined, '', 'abc', '1.5', '-5', '0', '12px', 'NaN', '1e3']) {
      expect(parseDeadlineMs(value), String(value)).toBe(HOOK_DEADLINE_MS);
    }
  });

  it('accepte un délai plus court', () => {
    expect(parseDeadlineMs('400')).toBe(400);
    expect(parseDeadlineMs(String(HOOK_DEADLINE_MS))).toBe(HOOK_DEADLINE_MS);
  });

  it('ramène un délai plus long à celui du crochet', () => {
    expect(parseDeadlineMs(String(HOOK_DEADLINE_MS + 1))).toBe(HOOK_DEADLINE_MS);
    expect(parseDeadlineMs('600000')).toBe(HOOK_DEADLINE_MS);
    expect(parseDeadlineMs('99999999999999999999')).toBe(HOOK_DEADLINE_MS);
  });
});

describe('readHookStdin', () => {
  it("lit tout le JSON de l'entrée standard, même en plusieurs morceaux", async () => {
    const bytes = Buffer.from(HOOK, 'utf8');
    const stream = Readable.from([bytes.subarray(0, 10), bytes.subarray(10)]);

    expect(await readHookStdin(stream)).toBe(HOOK);
  });

  it('recompose un caractère accentué coupé entre deux morceaux', async () => {
    const bytes = Buffer.from('{"cwd":"/dossier/é"}', 'utf8');
    const cut = bytes.indexOf(0xc3) + 1; // au milieu de « é »
    const stream = Readable.from([bytes.subarray(0, cut), bytes.subarray(cut)]);

    expect(await readHookStdin(stream)).toBe('{"cwd":"/dossier/é"}');
  });

  it('rend une chaîne vide au-delà de la taille permise', async () => {
    const stream = Readable.from(['a'.repeat(100), 'b'.repeat(100)]);

    expect(await readHookStdin(stream, { maxChars: 150 })).toBe('');
  });

  it("rend une chaîne vide si l'entrée ne se ferme pas à temps", async () => {
    const stream = new Readable({ read() {} });
    try {
      expect(await readHookStdin(stream, { timeoutMs: 20 })).toBe('');
    } finally {
      stream.destroy();
    }
  });

  it('ne lit pas un terminal : la commande lancée à la main ne reste pas suspendue', async () => {
    const stream = Object.assign(new Readable({ read() {} }), { isTTY: true });
    try {
      expect(await readHookStdin(stream)).toBe('');
    } finally {
      stream.destroy();
    }
  });

  it('rend une chaîne vide quand la lecture échoue', async () => {
    const stream = new Readable({
      read() {
        this.destroy(new Error('lecture impossible'));
      },
    });

    expect(await readHookStdin(stream)).toBe('');
  });
});
