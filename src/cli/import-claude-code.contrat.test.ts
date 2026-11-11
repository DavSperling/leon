// Contrat du câblage réel de `leon import-claude-code` : la vraie commande (un processus fils, comme le script `leon`
// sans pnpm), contre un faux serveur local, avec un vrai `fetch` et de vrais fichiers de session inventés. Les tests
// d'import-claude-code.test.ts injectent `usagesDepuis` ; celui-ci garde ce qu'ils ne voient pas : que runImport
// (leon.ts) le tire bien de l'accord (`usagesDepuis: accord.usages_le`), et qu'un usage ne part qu'avec les sessions
// dont le fichier a bougé après sa date.
//
// Vie privée : rien ici ne lit les vraies sessions de Claude Code. Les sessions sont écrites dans un dossier
// temporaire, CLAUDE_CONFIG_DIR et HOME y pointent (l'accord aussi), et l'environnement du fils ne reprend rien de
// celui du test.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PATHS } from '../capture/api-contract';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TOKEN = `leon_${'x'.repeat(43)}`;
const TEST_TIMEOUT_MS = 30_000;
const BEFORE_RESUME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AFTER_RESUME = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type Received = { url: string; body: Record<string, unknown> };
type Outcome = { code: number | null; stdout: string; stderr: string };

let dir: string;
let home: string;
let configDir: string;
let server: Server;
let origin: string;
let received: Received[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'leon-contrat-import-'));
  home = join(dir, 'home');
  configDir = join(dir, 'claude');
  await mkdir(join(configDir, 'projects', 'projet'), { recursive: true });
  await mkdir(join(home, '.leon'), { recursive: true });

  received = [];
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      received.push({
        url: request.url ?? '',
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      });
      if (request.url === API_PATHS.faits) {
        response.writeHead(202).end();
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          sourceId: crypto.randomUUID(),
          inserted: 1,
          skipped: 0,
          ingestRunId: null,
        }),
      );
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

// Une session inventée, d'un seul tour, dont le fichier est daté de `mtime` (c'est cette date que l'import compare à
// celles de l'accord).
async function writeSession(sessionId: string, day: string, mtime: Date): Promise<void> {
  const path = join(configDir, 'projects', 'projet', `${sessionId}.jsonl`);
  await writeFile(
    path,
    JSON.stringify({
      type: 'user',
      uuid: `tour-${sessionId}`,
      sessionId,
      timestamp: `${day}T08:00:00.000Z`,
      cwd: dir,
      isSidechain: false,
      message: { role: 'user', content: 'Un message inventé pour l’essai.' },
    }),
  );
  await utimes(path, mtime, mtime);
}

function runImport(): Promise<Outcome> {
  return new Promise((done, fail) => {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '',
      HOME: home,
      TMPDIR: tmpdir(),
      CLAUDE_CONFIG_DIR: configDir,
      LEON_URL: origin,
      LEON_TOKEN: TOKEN,
    };
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'src/cli/leon.ts', 'import-claude-code'],
      { cwd: REPO_ROOT, env: env as NodeJS.ProcessEnv },
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
    child.on('close', (code) => done({ code, stdout, stderr }));
    child.stdin.end('');
  });
}

describe('leon import-claude-code : la vraie commande', () => {
  it(
    'un usage ne part qu’avec les sessions dont le fichier a bougé après sa date (usagesDepuis)',
    async () => {
      await writeFile(
        join(home, '.leon', 'accord.json'),
        JSON.stringify({
          outils: {
            claude_code: {
              version: 2,
              installe_le: '2026-10-30T10:00:00.000Z',
              usages: { resume: '2026-11-02T10:00:00.000Z' },
            },
          },
        }),
        { mode: 0o600 },
      );
      await writeSession(BEFORE_RESUME, '2026-11-01', new Date('2026-11-01T10:00:00Z'));
      await writeSession(AFTER_RESUME, '2026-11-03', new Date('2026-11-03T10:00:00Z'));

      const outcome = await runImport();

      expect(outcome.code).toBe(0);
      const facts = received.filter((request) => request.url === API_PATHS.faits);
      expect(facts.map((request) => request.body.external_id)).toEqual([
        BEFORE_RESUME,
        AFTER_RESUME,
      ]);
      expect(facts[0]?.body).toMatchObject({ accord: 2 });
      expect(facts[0]?.body).not.toHaveProperty('usages');
      expect(facts[0]?.body).not.toHaveProperty('accord_le');
      // La date de l'accord part avec les usages (T43, le retrait daté).
      expect(facts[1]?.body).toMatchObject({
        accord: 2,
        usages: ['resume'],
        accord_le: '2026-10-30T10:00:00.000Z',
      });
    },
    TEST_TIMEOUT_MS,
  );
});
