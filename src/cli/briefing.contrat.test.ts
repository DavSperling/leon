// Contrat du câblage réel de `leon briefing` : la vraie commande, lancée comme le fait le crochet de démarrage de
// Claude Code (un processus fils dont le dossier est le dépôt de Leon, le JSON du crochet sur l'entrée standard),
// contre un faux serveur local, avec le vrai git et un vrai `fetch`. Les tests de briefing.test.ts injectent tout ;
// celui-ci garde ce qu'ils ne voient pas : le nom de la commande, l'entrée standard, le dossier du projet, le code
// de sortie et ce qui passe sur la sortie standard (que Claude Code ajoute au contexte de la session).
//
// Vie privée : rien ici ne lit les vraies sessions ni les vrais réglages de Claude Code. HOME et CLAUDE_CONFIG_DIR
// pointent vers un dossier temporaire, et l'environnement du fils ne reprend rien de celui du test.
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PATHS, BRIEFING_PROJECT_PARAM, type BriefingResponse } from '../capture/api-contract';

const run = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TOKEN = `leon_${'x'.repeat(43)}`;
const REMOTE_TOKEN = 'ghp_FAUX0123456789abcdefghijklmnopqrstuv'; // un jeton de dépôt fictif, dans l'adresse du remote
const MARKDOWN = '# Point du matin · github.com/acme/leon\n- La PR 22 est fusionnée [1].';
// La commande dure environ une demi-seconde (démarrage de tsx compris), plus 3 s quand le serveur ne répond pas.
const MAX_SECONDS = 5;
const TEST_TIMEOUT_MS = 30_000;

type Outcome = { code: number | null; stdout: string; stderr: string; seconds: number };

let dir: string;
let home: string;
let repo: string;
let elsewhere: string;
let server: Server;
let origin: string;
let received: Array<{ url: URL; authorization: string | undefined }>;
let handle: (request: IncomingMessage, response: ServerResponse) => void;

const answerOk = (_request: IncomingMessage, response: ServerResponse) => {
  const body: BriefingResponse = {
    markdown: MARKDOWN,
    projet: 'github.com/acme/leon',
    preparedAt: '2026-10-20T04:00:00.000Z',
  };
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'leon-contrat-point-'));
  home = join(dir, 'home');
  repo = join(dir, 'depot');
  elsewhere = join(dir, 'ailleurs');
  await run('mkdir', ['-p', home, repo, elsewhere]);
  await run('git', ['init', '--quiet'], { cwd: repo, env: { ...process.env, HOME: home } });
  await run(
    'git',
    ['remote', 'add', 'origin', `https://utilisateur:${REMOTE_TOKEN}@github.com/Acme/Leon.git`],
    { cwd: repo, env: { ...process.env, HOME: home } },
  );

  received = [];
  handle = answerOk;
  server = createServer((request, response) => {
    received.push({
      url: new URL(request.url ?? '/', 'http://local'),
      authorization: request.headers.authorization,
    });
    handle(request, response);
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

// Le JSON de la doc officielle (https://code.claude.com/docs/en/hooks, lue le 2026-10-20), pour SessionStart.
const hookJson = (cwd: string) =>
  JSON.stringify({
    session_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    transcript_path: join(home, '.claude', 'projects', 'p', 's.jsonl'),
    cwd,
    hook_event_name: 'SessionStart',
    source: 'startup',
  });

// Lance `node --import tsx src/cli/leon.ts briefing` depuis la racine du dépôt de Leon (comme
// `pnpm -s --dir <dépôt> leon briefing`). `input` null : l'entrée standard reste ouverte et n'est jamais fermée.
function runCommand(input: string | null, env: Record<string, string> = {}) {
  return new Promise<Outcome>((done, fail) => {
    const started = Date.now();
    const childEnv: Record<string, string> = {
      PATH: process.env.PATH ?? '',
      HOME: home,
      TMPDIR: tmpdir(),
      CLAUDE_CONFIG_DIR: join(home, '.claude'),
      LEON_URL: origin,
      LEON_TOKEN: TOKEN,
      ...env,
    };
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli/leon.ts', 'briefing'], {
      cwd: REPO_ROOT,
      env: childEnv as NodeJS.ProcessEnv,
    });
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
    if (input !== null) child.stdin.end(input);
  });
}

describe('leon briefing : la vraie commande', () => {
  it(
    'affiche le point du projet du JSON du crochet, et lui seul, sur la sortie standard',
    async () => {
      const outcome = await runCommand(hookJson(repo), { INIT_CWD: elsewhere });

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toBe(`${MARKDOWN}\n`);
      expect(outcome.stderr).toBe('');
      expect(outcome.seconds).toBeLessThan(MAX_SECONDS);
      expect(received).toHaveLength(1);
      const [request] = received;
      expect(request?.url.pathname).toBe(API_PATHS.briefing);
      expect(request?.url.searchParams.get(BRIEFING_PROJECT_PARAM)).toBe('github.com/acme/leon');
      expect(request?.authorization).toBe(`Bearer ${TOKEN}`);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'sans JSON du crochet et avec une entrée standard jamais fermée, prend INIT_CWD sans rester suspendue',
    async () => {
      const outcome = await runCommand(null, { INIT_CWD: repo });

      expect(outcome.code).toBe(0);
      expect(outcome.seconds).toBeLessThan(MAX_SECONDS);
      expect(received[0]?.url.searchParams.get(BRIEFING_PROJECT_PARAM)).toBe(
        'github.com/acme/leon',
      );
      expect(outcome.stdout).toBe(`${MARKDOWN}\n`);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'sort avec 0 quand le serveur ne répond pas, sans rien sur la sortie standard ni le jeton du remote',
    async () => {
      handle = () => {};

      const outcome = await runCommand(hookJson(repo));

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toBe('');
      expect(outcome.stderr).toMatch(/^Leon: briefing unavailable/);
      expect(outcome.seconds).toBeLessThan(MAX_SECONDS + 1);
      const everything = [outcome.stdout, outcome.stderr, ...received.map((r) => r.url.href)];
      for (const text of everything) {
        expect(text).not.toContain(REMOTE_TOKEN);
        expect(text).not.toContain('utilisateur');
        expect(text).not.toContain(TOKEN);
      }
    },
    TEST_TIMEOUT_MS,
  );
});
