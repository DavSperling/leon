// Contrat du câblage réel du retrait qui atteint le serveur (T43) : les vraies commandes `leon rattraper`,
// `leon retirer-crochets` et `leon installer-crochets`, lancées comme le script `leon` (sans pnpm ni .env.local), contre
// un faux serveur local, avec un vrai `fetch`. Les tests d'uninstall-hooks.test.ts et de setup.test.ts injectent
// l'envoi ; celui-ci garde ce qu'ils ne voient pas : la condition qui fait travailler `rattraper`, la route, le jeton,
// et ce que le serveur a appris, écrit dans retraits-serveur.json.
//
// Vie privée : HOME et CLAUDE_CONFIG_DIR pointent vers un dossier temporaire, et l'environnement du fils ne reprend
// rien de celui du test.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PATHS } from '../capture/api-contract';
import { consentPath, factsConsent, serverWithdrawalsPath, writeConsent } from './consent';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TOKEN = `leon_${'x'.repeat(43)}`;
const TEST_TIMEOUT_MS = 60_000;

type Received = { url: string; authorization: string | undefined; body: unknown; version: unknown };
type Outcome = { code: number | null; stdout: string; stderr: string };

let dir: string;
let home: string;
let configDir: string;
let server: Server;
let origin: string;
let received: Received[];

// La version de Claude Code dans accord.json au moment où le serveur reçoit la requête.
const versionNow = () => {
  try {
    return JSON.parse(readFileSync(consentPath(home), 'utf8')).outils.claude_code?.version;
  } catch {
    return undefined;
  }
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'leon-retrait-'));
  home = join(dir, 'home');
  configDir = join(dir, 'claude');
  await mkdir(home, { recursive: true });
  received = [];
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      received.push({
        url: request.url ?? '',
        authorization: request.headers.authorization,
        body: text ? JSON.parse(text) : null,
        version: versionNow(),
      });
      // La route du retrait répond 204, sans corps.
      response.writeHead(request.url === API_PATHS.retrait ? 204 : 404);
      response.end();
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

function leon(args: string[]): Promise<Outcome> {
  return new Promise((done, fail) => {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '',
      HOME: home,
      TMPDIR: tmpdir(),
      CLAUDE_CONFIG_DIR: configDir,
      LEON_URL: origin,
      LEON_TOKEN: TOKEN,
    };
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli/leon.ts', ...args], {
      cwd: REPO_ROOT,
      env: env as NodeJS.ProcessEnv,
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
    child.on('close', (code) => done({ code, stdout, stderr }));
    child.stdin.end('');
  });
}

const told = (outil: string, version: unknown = 0): Received => ({
  url: API_PATHS.retrait,
  authorization: `Bearer ${TOKEN}`,
  body: { outil },
  version,
});

const toldAt = async () =>
  JSON.parse(await readFile(serverWithdrawalsPath(home), 'utf8')).outils.claude_code;

describe('le retrait atteint le serveur : les vraies commandes', () => {
  // Un retrait fait avant la route (ou hors ligne), et aucun outil dont la capture est acceptée : `rattraper` travaille
  // quand même, une fois.
  it(
    'leon rattraper dit au serveur un retrait qu’il n’a pas appris, date sa réponse, puis ne le redit plus',
    async () => {
      await writeConsent(home, 'claude_code', 0);

      const first = await leon(['rattraper']);

      expect(first.code).toBe(0);
      expect(received).toEqual([told('claude_code')]);
      expect(await toldAt()).toEqual(expect.any(String));

      const second = await leon(['rattraper']);

      expect(second.code).toBe(0);
      expect(received).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'leon retirer-crochets le dit au serveur avec le jeton du poste, sans un mot d’erreur',
    async () => {
      await writeConsent(home, 'claude_code', 2);

      const run = await leon(['retirer-crochets']);

      expect(run.code).toBe(0);
      expect(run.stderr).toBe('');
      expect(received).toEqual([told('claude_code')]);
      expect(await toldAt()).toEqual(expect.any(String));
    },
    TEST_TIMEOUT_MS,
  );

  // Un nouvel accord réécrit l'entrée et effacerait l'attente : le retrait se dit d'abord.
  it(
    'leon installer-crochets dit au serveur un retrait qu’il n’a pas appris avant d’écrire le nouvel accord',
    async () => {
      await writeConsent(home, 'claude_code', 0);

      const run = await leon(['installer-crochets', '--oui']);

      expect(run.code).toBe(0);
      expect(received).toEqual([told('claude_code', 0)]);
      expect((await factsConsent(home, 'claude_code'))?.version).toBe(2);
    },
    TEST_TIMEOUT_MS,
  );
});
