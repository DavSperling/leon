import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SECRET_MASK } from '../capture/mask-secrets';
import { type IngestPayload, type IngestResult, TURNS_PER_BATCH_MAX } from '../capture/turn';
import {
  type CaptureDeps,
  captureSessionFromHook,
  createHookSender,
  HOOK_DEADLINE_MS,
  readHookStdin,
} from './capture-session';
import { TokenRefusedError } from './import-claude-code';

const FIXTURES = new URL('../capture/fixtures/claude-code/', import.meta.url);
const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
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
const conversationLine = (n: number, type: 'user' | 'assistant', content: unknown) =>
  line({
    type,
    uuid: `u-${n}`,
    sessionId: SESSION_ID,
    timestamp: `2026-10-20T08:${String(n % 60).padStart(2, '0')}:00.000Z`,
    cwd: '/r',
    isSidechain: false,
    message: { role: type, content },
  });

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
  return { deps: { send, out, readFile: readSessionFile, git }, send, readSessionFile, git, out };
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
    expect(payloads.map((payload) => payload.turns.length)).toEqual([
      TURNS_PER_BATCH_MAX,
      TURNS_PER_BATCH_MAX,
      50,
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
  ];

  it.each(unreadableInputs)(
    'une entrée illisible (%s) : code 0, un message, rien lu ni envoyé',
    async (_name, stdin) => {
      const { deps, send, readSessionFile } = makeDeps();

      const code = await captureSessionFromHook(stdin, deps);

      expect(code).toBe(0);
      expect(stderr).toHaveBeenCalled();
      expect(stderrText()).toMatch(/^Leon : /);
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
    expect(stderrText()).toMatch(/introuvable|illisible/);
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
    expect(stderrText()).toMatch(/injoignable/);
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
    expect(stderrText()).toMatch(/^Leon : /);
  });

  it('un jeton refusé : code 0 et le message le dit', async () => {
    const { deps, send } = makeDeps({
      send: async () => {
        throw new TokenRefusedError();
      },
    });

    expect(await captureSessionFromHook(HOOK, deps)).toBe(0);
    expect(stderrText()).toMatch(/jeton refusé/);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('un délai dépassé : code 0 et le message le dit', async () => {
    const { deps } = makeDeps({
      send: async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      },
    });

    expect(await captureSessionFromHook(HOOK, deps)).toBe(0);
    expect(stderrText()).toMatch(/trop lent|délai/);
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
    expect(stderrText()).toMatch(/trop lent|délai/);
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
