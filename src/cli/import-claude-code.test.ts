import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS } from '../capture/api-contract';
import { type IngestPayload, type IngestResult, TURN_TEXT_MAX } from '../capture/turn';
import {
  createIngestSender,
  type ImportDeps,
  importClaudeCode,
  TokenRefusedError,
} from './import-claude-code';

const FIXTURES = new URL('../capture/fixtures/claude-code/', import.meta.url);
const ACME_SESSION = '11111111-1111-4111-8111-111111111111';
const RESULT: IngestResult = {
  sourceId: crypto.randomUUID(),
  inserted: 2,
  skipped: 1,
  ingestRunId: null,
};

let baseDir: string;
let projectDir: string;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'leon-cc-'));
  projectDir = join(baseDir, 'projects', 'demo');
  await mkdir(projectDir, { recursive: true });
  for (const name of await readdir(FIXTURES)) {
    await copyFile(new URL(name, FIXTURES), join(projectDir, name));
  }
});
afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeDeps(send?: ImportDeps['send']) {
  const out = vi.fn<(line: string) => void>();
  const sendFn = vi.fn<ImportDeps['send']>(send ?? (async () => RESULT));
  return { deps: { send: sendFn, out }, out, send: sendFn };
}

const importOptions = () => ({ baseDir, dryRun: false });

describe('importClaudeCode', () => {
  it('en dryRun, écrit une ligne JSON par payload, texte masqué, sans jamais envoyer', async () => {
    const { deps, out, send } = makeDeps();

    const summary = await importClaudeCode({ baseDir, dryRun: true }, deps);

    expect(send).not.toHaveBeenCalled();
    const payloads = out.mock.calls.map(([line]) => JSON.parse(line) as IngestPayload);
    expect(payloads.map((p) => p.source.external_id).sort()).toEqual([
      ACME_SESSION,
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);
    expect(payloads.every((p) => p.source.kind === 'claude_code')).toBe(true);
    expect(out.mock.calls.map(([line]) => line).join('')).not.toContain('sk-ant-FAKE');
    expect(summary).toEqual({ sessions: 3, turnsSent: 12, inserted: 0, skipped: 0, failures: 0 });
  });

  it('envoie chaque session et additionne les résultats du serveur', async () => {
    const { deps, send } = makeDeps();

    const summary = await importClaudeCode(importOptions(), deps);

    expect(send).toHaveBeenCalledTimes(3);
    const acme = send.mock.calls.map(([p]) => p).find((p) => p.source.external_id === ACME_SESSION);
    expect(acme?.source.title).toBe('Offre ACME');
    expect(summary).toEqual({ sessions: 3, turnsSent: 12, inserted: 6, skipped: 3, failures: 0 });
  });

  it('ne garde que les sessions dont le cwd commence par project', async () => {
    const { deps, send } = makeDeps();

    const summary = await importClaudeCode(
      { baseDir, dryRun: false, project: '/Users/demo/projets/acme' },
      deps,
    );

    expect(summary.sessions).toBe(1);
    expect(send.mock.calls[0]?.[0].source.external_id).toBe(ACME_SESSION);
  });

  it('ignore un dossier voisin dont le nom prolonge celui de project', async () => {
    const acme = await readFile(new URL('session-simple.jsonl', FIXTURES), 'utf8');
    await writeFile(
      join(projectDir, 'acme-bis.jsonl'),
      acme
        .replaceAll('/Users/demo/projets/acme', '/Users/demo/projets/acme-bis')
        .replaceAll(ACME_SESSION, '44444444-4444-4444-8444-444444444444'),
    );
    const { deps, send } = makeDeps();

    const summary = await importClaudeCode(
      { baseDir, dryRun: false, project: '/Users/demo/projets/acme' },
      deps,
    );

    expect(summary.sessions).toBe(1);
    expect(send.mock.calls.map(([p]) => p.source.external_id)).toEqual([ACME_SESSION]);
  });

  it("n'envoie pas deux fois un tour recopié par une session reprise", async () => {
    const acme = await readFile(new URL('session-simple.jsonl', FIXTURES), 'utf8');
    const resumed = '55555555-5555-4555-8555-555555555555';
    const newTurn = JSON.stringify({
      type: 'user',
      uuid: 'reprise-1',
      sessionId: resumed,
      timestamp: '2026-10-14T09:00:00.000Z',
      message: { content: 'On reprend.' },
    });
    await writeFile(
      join(projectDir, 'reprise.jsonl'),
      `${acme.replaceAll(ACME_SESSION, resumed).trimEnd()}\n${newTurn}\n`,
    );
    const { deps, send } = makeDeps();

    const summary = await importClaudeCode(importOptions(), deps);

    const sent = send.mock.calls.flatMap(([p]) => p.turns.map((turn) => turn.external_id));
    expect(new Set(sent).size).toBe(sent.length);
    expect(sent).toContain('reprise-1');
    expect(summary.turnsSent).toBe(13);
  });

  it('rattache les tours recopiés à la session d’origine, quel que soit le nom des fichiers', async () => {
    const acme = await readFile(new URL('session-simple.jsonl', FIXTURES), 'utf8');
    const resumed = '00000000-0000-4000-8000-000000000000';
    // Le fichier de la reprise vient avant l'original dans l'ordre alphabétique, mais il est plus récent.
    const resumedFile = join(projectDir, `${resumed}.jsonl`);
    await writeFile(resumedFile, acme.replaceAll(ACME_SESSION, resumed));
    await utimes(
      join(projectDir, 'session-simple.jsonl'),
      new Date(2026, 9, 1),
      new Date(2026, 9, 1),
    );
    await utimes(resumedFile, new Date(2026, 9, 14), new Date(2026, 9, 14));
    const { deps, send } = makeDeps();

    await importClaudeCode(importOptions(), deps);

    const sources = send.mock.calls.map(([p]) => p.source.external_id);
    expect(sources).toContain(ACME_SESSION);
    expect(sources).not.toContain(resumed);
  });

  it('since écarte les tours plus anciens et les sessions sans tour récent', async () => {
    const { deps, send } = makeDeps();

    const summary = await importClaudeCode(
      { baseDir, dryRun: false, since: new Date('2026-10-13T09:00:30Z') },
      deps,
    );

    expect(summary).toMatchObject({ sessions: 2, turnsSent: 4 });
    const ids = send.mock.calls.map(([p]) => p.source.external_id);
    expect(ids).not.toContain(ACME_SESSION);
  });

  it("compte l'échec d'une session sans arrêter les suivantes", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, send } = makeDeps(async (payload) => {
      if (payload.source.external_id === ACME_SESSION) throw new Error('réseau coupé');
      return RESULT;
    });

    const summary = await importClaudeCode(importOptions(), deps);

    expect(send).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({ sessions: 3, failures: 1, inserted: 4 });
  });

  it('arrête tout quand le jeton est refusé', async () => {
    const { deps, send } = makeDeps(async () => {
      throw new TokenRefusedError();
    });

    await expect(importClaudeCode(importOptions(), deps)).rejects.toThrow(
      'Jeton refusé par le serveur Leon.',
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('envoie un tour de 60 000 caractères tronqué', async () => {
    await writeFile(
      join(projectDir, 'enorme.jsonl'),
      `${JSON.stringify({
        type: 'user',
        uuid: 'e1',
        sessionId: 'enorme',
        timestamp: '2026-10-13T11:00:00.000Z',
        message: { content: 'a'.repeat(60_000) },
      })}\n`,
    );
    const { deps, send } = makeDeps();

    await importClaudeCode(importOptions(), deps);

    const payload = send.mock.calls.map(([p]) => p).find((p) => p.source.external_id === 'enorme');
    const text = payload?.turns[0]?.text ?? '';
    expect(text.length).toBeLessThanOrEqual(TURN_TEXT_MAX);
    expect(text.endsWith('[…tronqué]')).toBe(true);
  });

  it('découpe une longue session en lots de 200 tours au plus', async () => {
    const lines = Array.from({ length: 450 }, (_, i) =>
      JSON.stringify({
        type: i % 2 === 0 ? 'user' : 'assistant',
        uuid: `long-${i}`,
        sessionId: 'longue',
        timestamp: '2026-10-13T12:00:00.000Z',
        message: { content: `Tour ${i}` },
      }),
    );
    await writeFile(join(projectDir, 'longue.jsonl'), lines.join('\n'));
    const { deps, send } = makeDeps();

    await importClaudeCode(importOptions(), deps);

    const sizes = send.mock.calls
      .map(([p]) => p)
      .filter((p) => p.source.external_id === 'longue')
      .map((p) => p.turns.length);
    expect(sizes).toEqual([200, 200, 50]);
  });

  it('ignore les sous-dossiers et ne plante pas sans dossier projects', async () => {
    await mkdir(join(projectDir, 'sous-agents'));
    await copyFile(
      new URL('session-simple.jsonl', FIXTURES),
      join(projectDir, 'sous-agents', 'x.jsonl'),
    );
    const { deps, send } = makeDeps();

    await importClaudeCode(importOptions(), deps);
    expect(send).toHaveBeenCalledTimes(3);

    const empty = await importClaudeCode({ baseDir: join(baseDir, 'absent'), dryRun: true }, deps);
    expect(empty.sessions).toBe(0);
  });
});

describe('createIngestSender', () => {
  const env = { url: 'http://localhost:3000', token: `leon_${'a'.repeat(43)}` };
  const payload: IngestPayload = {
    source: { kind: 'claude_code', external_id: 's1' },
    turns: [
      {
        external_id: 't1',
        role: 'user',
        text: 'Salut',
        ts: '2026-10-13T08:00:00Z',
        capture_mode: 'file',
      },
    ],
  };

  it('poste le payload avec le jeton et valide la réponse', async () => {
    const fetchImpl = vi.fn(async () => Response.json(RESULT, { status: 202 }));

    const result = await createIngestSender(fetchImpl as typeof fetch, env)(payload);

    expect(result).toEqual(RESULT);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe(new URL(API_PATHS.ingest, env.url).href);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });

  it('lève TokenRefusedError sur 401, une erreur sur les autres refus', async () => {
    const reply = (status: number) =>
      createIngestSender((async () => new Response('{}', { status })) as typeof fetch, env);

    await expect(reply(401)(payload)).rejects.toBeInstanceOf(TokenRefusedError);
    await expect(reply(500)(payload)).rejects.toThrow('500');
  });

  it('refuse une réponse non conforme', async () => {
    const sender = createIngestSender(
      (async () => Response.json({ ok: true })) as typeof fetch,
      env,
    );

    await expect(sender(payload)).rejects.toThrow();
  });
});
