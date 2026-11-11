// Contrat du câblage réel de `leon briefing` : la vraie commande, lancée comme le fait le crochet de démarrage de
// Claude Code (un processus fils dont le dossier est le dépôt de Leon, le JSON du crochet sur l'entrée standard),
// contre un faux serveur local, avec le vrai git et un vrai `fetch`. Les tests de briefing.test.ts injectent tout ;
// celui-ci garde ce qu'ils ne voient pas : le nom de la commande, l'entrée standard, le dossier du projet, sa
// branche, le code de sortie et ce qui passe sur la sortie standard (que Claude Code ajoute au contexte de la
// session).
//
// Vie privée : rien ici ne lit les vraies sessions ni les vrais réglages de Claude Code. HOME et CLAUDE_CONFIG_DIR
// pointent vers un dossier temporaire (l'accord, ~/.leon/accord.json, aussi), et l'environnement du fils ne reprend
// rien de celui du test.
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  API_PATHS,
  BRIEFING_PROJECT_PARAM,
  type BriefingResponse,
  CommandeSchema,
  type ContextResponse,
} from '../capture/api-contract';
import { addUsage, consentPath, writeConsent } from './consent';

const run = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TOKEN = `leon_${'x'.repeat(43)}`;
const REMOTE_TOKEN = 'ghp_FAUX0123456789abcdefghijklmnopqrstuv'; // un jeton de dépôt fictif, dans l'adresse du remote
const SESSION = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const BRANCH = 'amos/essai';
const MARKDOWN = '# Point du matin · github.com/acme/leon\n- La PR 22 est fusionnée [1].';
const BLOCK = `<contexte-leon>\n## Mes dernières sessions sur github.com/acme/leon\n- 01/11 18:02 · Claude Code\n</contexte-leon>\n${MARKDOWN}`;
// La commande dure environ une demi-seconde (démarrage de tsx compris), plus 3 s quand le serveur ne répond pas.
const MAX_SECONDS = 5;
const TEST_TIMEOUT_MS = 30_000;

type Outcome = { code: number | null; stdout: string; stderr: string; seconds: number };
type Received = {
  method: string | undefined;
  url: URL;
  authorization: string | undefined;
  body: string;
};

let dir: string;
let home: string;
let repo: string;
let elsewhere: string;
let server: Server;
let origin: string;
let received: Received[];
let handle: (request: IncomingMessage, response: ServerResponse) => void;

const answer = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};
const briefingBody: BriefingResponse = {
  markdown: MARKDOWN,
  projet: 'github.com/acme/leon',
  preparedAt: '2026-10-20T04:00:00.000Z',
};
// Un serveur à jour : le bloc sur `/contexte`.
const answerBlock = (request: IncomingMessage, response: ServerResponse) => {
  if (request.url?.startsWith(API_PATHS.contexte)) {
    answer(response, 200, { texte: BLOCK } satisfies ContextResponse);
  } else {
    answer(response, 404, {});
  }
};
// Un serveur plus ancien que la route du bloc : le point du matin seul.
const answerBriefingOnly = (request: IncomingMessage, response: ServerResponse) => {
  if (request.url?.startsWith(API_PATHS.briefing)) answer(response, 200, briefingBody);
  else answer(response, 404, {});
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'leon-contrat-point-'));
  home = join(dir, 'home');
  repo = join(dir, 'depot');
  elsewhere = join(dir, 'ailleurs');
  await run('mkdir', ['-p', home, repo, elsewhere]);
  await run('git', ['init', '--quiet', `--initial-branch=${BRANCH}`], {
    cwd: repo,
    env: { ...process.env, HOME: home },
  });
  await run(
    'git',
    ['remote', 'add', 'origin', `https://utilisateur:${REMOTE_TOKEN}@github.com/Acme/Leon.git`],
    { cwd: repo, env: { ...process.env, HOME: home } },
  );
  // L'accord du bloc (T07) ; le test « sans accord » le retire.
  await writeConsent(home, 'claude_code', 2);

  received = [];
  handle = answerBlock;
  server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += String(chunk);
    received.push({
      method: request.method,
      url: new URL(request.url ?? '/', 'http://local'),
      authorization: request.headers.authorization,
      body,
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
    session_id: SESSION,
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
    'affiche le bloc du projet, de la branche et de la session du crochet, et lui seul, sur la sortie standard',
    async () => {
      const outcome = await runCommand(hookJson(repo), { INIT_CWD: elsewhere });

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toBe(`${BLOCK}\n`);
      expect(outcome.stderr).toBe('');
      expect(outcome.seconds).toBeLessThan(MAX_SECONDS);
      expect(received).toHaveLength(1);
      const [request] = received;
      expect(request?.method).toBe('POST');
      // Rien dans l'adresse : la branche n'a rien à faire dans les journaux d'URL.
      expect(request?.url.pathname).toBe(API_PATHS.contexte);
      expect(request?.url.search).toBe('');
      expect(request?.authorization).toBe(`Bearer ${TOKEN}`);
      expect(JSON.parse(request?.body ?? '')).toEqual({
        projet: 'github.com/acme/leon',
        branche: BRANCH,
        session: SESSION,
      });
    },
    TEST_TIMEOUT_MS,
  );

  // T46 : depuis ce clone, sans lanceur dans le HOME du test, la consigne citera pnpm dans le dépôt qui lance la commande.
  it(
    "avec l'usage `lecture`, envoie aussi les usages de Claude Code et la commande de ce clone",
    async () => {
      await addUsage(home, 'claude_code', 'lecture');
      const clone = `pnpm --dir ${resolve(REPO_ROOT)} leon`;

      const outcome = await runCommand(hookJson(repo));

      expect(outcome).toMatchObject({ code: 0, stdout: `${BLOCK}\n`, stderr: '' });
      expect(JSON.parse(received[0]?.body ?? '')).toEqual({
        projet: 'github.com/acme/leon',
        branche: BRANCH,
        session: SESSION,
        usages: ['lecture'],
        commande: CommandeSchema.safeParse(clone).success ? clone : 'leon',
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'avec un serveur plus ancien que la route du bloc, affiche le point du matin seul, comme avant',
    async () => {
      handle = answerBriefingOnly;

      const outcome = await runCommand(hookJson(repo));

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toBe(`${MARKDOWN}\n`);
      expect(outcome.stderr).toBe('');
      expect(outcome.seconds).toBeLessThan(MAX_SECONDS);
      expect(received.map((request) => request.url.pathname)).toEqual([
        API_PATHS.contexte,
        API_PATHS.briefing,
      ]);
      expect(received[1]?.url.searchParams.get(BRIEFING_PROJECT_PARAM)).toBe(
        'github.com/acme/leon',
      );
    },
    TEST_TIMEOUT_MS,
  );

  // Crochets installés avant ce chantier, CLI mise à jour par `git pull` : rien de plus que ce qui a été accepté.
  it(
    'sans accord, demande et affiche le point du matin seul, sans envoyer la branche ni la session',
    async () => {
      handle = answerBriefingOnly;
      await rm(consentPath(home));

      const outcome = await runCommand(hookJson(repo));

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toBe(`${MARKDOWN}\n`);
      expect(outcome.stderr).toBe('');
      expect(received).toHaveLength(1);
      const [request] = received;
      expect(request?.method).toBe('GET');
      expect(request?.url.pathname).toBe(API_PATHS.briefing);
      expect(request?.url.searchParams.get(BRIEFING_PROJECT_PARAM)).toBe('github.com/acme/leon');
      for (const text of [request?.url.href, request?.body]) {
        expect(text).not.toContain(BRANCH);
        expect(text).not.toContain(SESSION);
      }
    },
    TEST_TIMEOUT_MS,
  );

  // Cursor reprend les crochets de Claude Code (T06) : la commande sort sans rien écrire, pas même le retrait.
  it(
    "sous Cursor (CURSOR_VERSION posé), avec l'accord retiré : code 0, rien d'écrit ni de demandé",
    async () => {
      await writeConsent(home, 'claude_code', 0);

      const outcome = await runCommand(hookJson(repo), { CURSOR_VERSION: '2.4.27' });

      expect(outcome).toMatchObject({ code: 0, stdout: '', stderr: '' });
      expect(received).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'sans JSON du crochet et avec une entrée standard jamais fermée, prend INIT_CWD sans rester suspendue',
    async () => {
      const outcome = await runCommand(null, { INIT_CWD: repo });

      expect(outcome.code).toBe(0);
      expect(outcome.seconds).toBeLessThan(MAX_SECONDS);
      expect(JSON.parse(received[0]?.body ?? '')).toMatchObject({
        projet: 'github.com/acme/leon',
        branche: BRANCH,
      });
      expect(outcome.stdout).toBe(`${BLOCK}\n`);
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
      const everything = [
        outcome.stdout,
        outcome.stderr,
        ...received.flatMap((r) => [r.url.href, r.body]),
      ];
      for (const text of everything) {
        expect(text).not.toContain(REMOTE_TOKEN);
        expect(text).not.toContain('utilisateur');
        expect(text).not.toContain(TOKEN);
      }
    },
    TEST_TIMEOUT_MS,
  );
});
