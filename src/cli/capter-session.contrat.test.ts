// Contrat du câblage réel de `leon capter-session` : la vraie commande, lancée comme le fait le crochet de
// Claude Code (un processus fils, le JSON du crochet sur l'entrée standard), contre un faux serveur local, avec
// le vrai git, un vrai fichier de session fictif et un vrai `fetch`. Les tests de capture-session.test.ts
// injectent tout ; celui-ci garde ce qu'ils ne voient pas : le nom de la commande, les imports, l'entrée
// standard, le code de sortie, la sortie standard vide et les messages d'erreur.
//
// Vie privée : rien ici ne lit les vraies sessions de Claude Code. La session est écrite dans un dossier
// temporaire, CLAUDE_CONFIG_DIR et HOME y pointent (l'accord, ~/.leon/accord.json, aussi), et l'environnement du
// fils ne reprend rien de celui du test.
import { execFile, type SpawnOptionsWithoutStdio, spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PATHS, SessionFactsPayloadSchema } from '../capture/api-contract';
import type { IngestPayload } from '../capture/turn';
import { writeConsent } from './consent';

const run = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TOKEN = `leon_${'x'.repeat(43)}`;
const REMOTE_TOKEN = 'ghp_FAUX0123456789abcdefghijklmnopqrstuv'; // un jeton de dépôt fictif, dans l'adresse du remote
const SESSION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SECRET_IN_SESSION = `ghp_${'a1B2c3D4e5F6'.repeat(3)}`;
// La commande dure environ une demi-seconde (démarrage de tsx compris) : 5 s laissent une grande marge à une
// machine chargée, et attrapent une commande qui resterait ouverte (entrée standard, requête sans fin).
const MAX_SECONDS = 5;
const TEST_TIMEOUT_MS = 30_000;

type Received = { url: string; authorization: string | undefined; body: IngestPayload };
type Outcome = { code: number | null; stdout: string; stderr: string; seconds: number };

let dir: string;
let home: string;
let repo: string;
let server: Server;
let origin: string;
let received: Received[];
let handle: (request: IncomingMessage, response: ServerResponse) => void;

const answerOk = (_request: IncomingMessage, response: ServerResponse) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({ sourceId: crypto.randomUUID(), inserted: 2, skipped: 0, ingestRunId: null }),
  );
};
const neverAnswer = () => {};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'leon-contrat-'));
  home = join(dir, 'home');
  repo = join(dir, 'depot');
  await run('mkdir', ['-p', home, repo]);
  await run('git', ['init', '--quiet'], { cwd: repo, env: { ...process.env, HOME: home } });
  await run(
    'git',
    ['remote', 'add', 'origin', `https://utilisateur:${REMOTE_TOKEN}@github.com/Acme/Leon.git`],
    { cwd: repo, env: { ...process.env, HOME: home } },
  );

  received = [];
  handle = answerOk;
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      received.push({
        url: request.url ?? '',
        authorization: request.headers.authorization,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as IngestPayload,
      });
      handle(request, response);
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('port introuvable');
  origin = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await rm(dir, { recursive: true, force: true });
});

const sessionLine = (n: number, type: 'user' | 'assistant', text: string) =>
  JSON.stringify({
    type,
    uuid: `u-${n}`,
    sessionId: SESSION_ID,
    timestamp: `2026-10-20T08:0${n}:00.000Z`,
    cwd: repo,
    isSidechain: false,
    message: { role: type, content: text },
  });

async function writeSession(): Promise<string> {
  const path = join(dir, 'session.jsonl');
  await writeFile(
    path,
    [
      sessionLine(1, 'user', `Voici mon jeton : ${SECRET_IN_SESSION}`),
      sessionLine(2, 'assistant', 'Je ne le garde pas.'),
      sessionLine(3, 'user', 'Merci, on continue demain.'),
    ].join('\n'),
  );
  return path;
}

// Le JSON de la doc officielle (https://code.claude.com/docs/en/hooks, lue le 2026-10-20). Le dossier du
// crochet n'est PAS le dépôt : c'est celui de la session qui compte.
const hookJson = (transcriptPath: string) =>
  JSON.stringify({
    session_id: SESSION_ID,
    transcript_path: transcriptPath,
    cwd: home,
    hook_event_name: 'SessionEnd',
    reason: 'other',
  });

// Lance `node --import tsx src/cli/leon.ts capter-session` depuis la racine du dépôt de Leon (comme
// `pnpm --dir <dépôt> leon …`), avec un environnement réduit à ce que la commande demande.
function runCommand(input: string, extra: { env?: Record<string, string>; args?: string[] } = {}) {
  return new Promise<Outcome>((done, fail) => {
    const started = Date.now();
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '',
      HOME: home,
      TMPDIR: tmpdir(),
      CLAUDE_CONFIG_DIR: join(home, '.claude'),
      LEON_URL: origin,
      LEON_TOKEN: TOKEN,
      ...extra.env,
    };
    const options: SpawnOptionsWithoutStdio = { cwd: REPO_ROOT, env: env as NodeJS.ProcessEnv };
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'src/cli/leon.ts', 'capter-session', ...(extra.args ?? [])],
      options,
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', fail);
    child.on('close', (code) =>
      done({ code, stdout, stderr, seconds: (Date.now() - started) / 1000 }),
    );
    child.stdin.end(input);
  });
}

describe('leon capter-session : la vraie commande', () => {
  // Sans accord.json (installé avant ce chantier) : les tours seuls, comme avant.
  it(
    'envoie la session une seule fois, avec la clé du dépôt GitHub, sans rien écrire sur la sortie standard',
    async () => {
      const outcome = await runCommand(hookJson(await writeSession()));

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toBe('');
      expect(outcome.seconds).toBeLessThan(MAX_SECONDS);
      expect(received).toHaveLength(1);
      const [request] = received;
      expect(request?.url).toBe(API_PATHS.ingest);
      expect(request?.authorization).toBe(`Bearer ${TOKEN}`);
      expect(request?.body.source).toMatchObject({
        kind: 'claude_code',
        external_id: SESSION_ID,
        project: 'github.com/acme/leon',
      });
      expect(request?.body.turns.map((turn) => turn.external_id)).toEqual(['u-1', 'u-2', 'u-3']);
      expect(outcome.stderr).toMatch(/session captured/);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "avec l'accord en version 2, envoie les faits après les tours, sur leur route",
    async () => {
      await writeConsent(home, 'claude_code', 2);

      const outcome = await runCommand(hookJson(await writeSession()));

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toBe('');
      expect(outcome.seconds).toBeLessThan(MAX_SECONDS);
      expect(received.map((request) => request.url)).toEqual([API_PATHS.ingest, API_PATHS.faits]);
      const facts = received[1];
      expect(facts?.authorization).toBe(`Bearer ${TOKEN}`);
      // Ce que la route du serveur accepte (T02), au champ près.
      expect(SessionFactsPayloadSchema.safeParse(facts?.body).success).toBe(true);
      expect(facts?.body).toMatchObject({
        kind: 'claude_code',
        external_id: SESSION_ID,
        project: 'github.com/acme/leon',
        accord: 2,
        fin: true,
        faits: { echanges: 2 },
      });
      expect(JSON.stringify(facts?.body)).not.toContain(SECRET_IN_SESSION);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'un serveur sans la route des faits (404) : code 0, un message fixe, les tours captés',
    async () => {
      await writeConsent(home, 'claude_code', 2);
      handle = (request, response) => {
        if (request.url !== API_PATHS.faits) return answerOk(request, response);
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'MOT-DU-SERVEUR' }));
      };

      const outcome = await runCommand(hookJson(await writeSession()));

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toBe('');
      expect(received).toHaveLength(2);
      expect(outcome.stderr).toMatch(/session captured/);
      expect(outcome.stderr).toMatch(/does not accept session facts/);
      expect(outcome.stderr).not.toContain('MOT-DU-SERVEUR');
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "ne laisse passer ni le secret de la session, ni l'adresse du remote, ni le jeton de Leon",
    async () => {
      const outcome = await runCommand(hookJson(await writeSession()));

      expect(outcome.code).toBe(0);
      const wire = JSON.stringify(received.map((request) => request.body));
      expect(wire).not.toContain(SECRET_IN_SESSION);
      expect(wire).toContain('Merci, on continue demain.');
      for (const text of [wire, outcome.stdout, outcome.stderr]) {
        expect(text).not.toContain(REMOTE_TOKEN);
        expect(text).not.toContain('utilisateur:');
        expect(text).not.toContain(TOKEN);
      }
      expect(outcome.stderr).not.toContain(SECRET_IN_SESSION);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'un serveur qui ne répond pas : code 0 et message de délai, une fois le délai demandé écoulé',
    async () => {
      handle = neverAnswer;

      const outcome = await runCommand(hookJson(await writeSession()), {
        args: ['--delai-ms', '400'],
      });

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toBe('');
      expect(outcome.stderr).toMatch(/too slow|timeout/);
      expect(outcome.stderr).not.toContain(TOKEN);
      expect(outcome.stderr).not.toContain(REMOTE_TOKEN);
      expect(outcome.seconds).toBeLessThan(MAX_SECONDS);
      expect(received).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "une option inconnue ou invalide ne fait pas échouer la commande : code 0, le délai du crochet s'applique",
    async () => {
      const outcome = await runCommand(hookJson(await writeSession()), {
        args: ['--delai-ms', 'pas-un-nombre', '--option-inconnue'],
      });

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toBe('');
      expect(received).toHaveLength(1);
      expect(outcome.stderr).toMatch(/session captured/);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "sans LEON_TOKEN : code 0, un message qui ne recopie rien, rien d'envoyé",
    async () => {
      const outcome = await runCommand(hookJson(await writeSession()), { env: { LEON_TOKEN: '' } });

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toBe('');
      expect(outcome.stderr).toMatch(/LEON_TOKEN/);
      expect(received).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "une entrée standard vide ou illisible : code 0, rien d'envoyé",
    async () => {
      for (const input of ['', "ceci n'est pas du JSON"]) {
        const outcome = await runCommand(input);
        expect(outcome.code).toBe(0);
        expect(outcome.stdout).toBe('');
        expect(outcome.stderr).toMatch(/^Leon: /m);
      }
      expect(received).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );
});
