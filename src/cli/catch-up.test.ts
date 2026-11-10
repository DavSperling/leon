import {
  appendFile,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionFactsPayload } from '../capture/api-contract';
import type { IngestPayload, IngestResult } from '../capture/turn';
import {
  captureToolFile,
  captureToolHook,
  cursorPath,
  readCursor,
  type ToolCaptureDeps,
  turnsAfter,
} from './capture-session';
import {
  type CatchUpDeps,
  captureTools,
  catchUp,
  catchUpNeeded,
  ENTRY_MAX_AGE_MS,
  entriesDir,
  purgeOldEntries,
  readEntryFile,
} from './catch-up';
import {
  addUsage,
  recordCapture,
  recordServerWithdrawal,
  withdrawalToTell,
  writeConsent,
} from './consent';
import { IngestResponseError, TokenRefusedError } from './import-claude-code';
import { cursorSlug as cursorSlugOf } from './outils';

// Toujours dans un HOME temporaire, avec CODEX_HOME à côté : jamais les vraies sessions de Codex ni le vrai ~/.leon.
const FIXTURE = new URL('../capture/fixtures/codex/rollout-git.jsonl', import.meta.url);
const SANS_GIT = new URL('../capture/fixtures/codex/rollout-sans-git.jsonl', import.meta.url);
const THREAD = '019a5e10-0000-7000-8000-000000000001';
const RESULT: IngestResult = {
  sourceId: crypto.randomUUID(),
  inserted: 2,
  skipped: 0,
  ingestRunId: null,
};
const INSTALLE = new Date('2026-11-05T00:00:00Z');
const MAINTENANT = new Date('2026-11-06T12:00:00Z');

let dir: string;
let home: string;
let codexDir: string;
let env: Record<string, string | undefined>;
let sent: IngestPayload[];
let facts: SessionFactsPayload[];
let told: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'leon-rattrapage-'));
  home = join(dir, 'home');
  codexDir = join(dir, 'codex');
  env = { CODEX_HOME: codexDir };
  sent = [];
  facts = [];
  told = [];
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// Un rollout copié de la fixture sous sessions/2026/11/06, daté de `modified`.
async function rollout(name: string, modified: Date, from: URL = FIXTURE): Promise<string> {
  const folder = join(codexDir, 'sessions', '2026', '11', '06');
  await mkdir(folder, { recursive: true });
  const path = join(folder, `rollout-2026-11-06T09-00-00-${name}.jsonl`);
  await copyFile(from, path);
  await utimes(path, modified, modified);
  return path;
}

// git : le dépôt GitHub demo/leon pour tout dossier, sa racine est le dossier lui-même.
const git = vi.fn<ToolCaptureDeps['git']>(async (args, cwd) => {
  if (args[0] === 'remote') return 'https://github.com/demo/leon.git';
  if (args[0] === 'rev-parse') return 'true\n';
  if (args[0] === 'branch') return 'branche-lue';
  return cwd;
});

function captureDeps(overrides: Partial<ToolCaptureDeps> = {}): ToolCaptureDeps {
  return {
    send: async (payload) => {
      sent.push(payload);
      return RESULT;
    },
    facts: {
      accord: 2,
      accordLe: INSTALLE,
      send: async (payload) => {
        facts.push(payload);
      },
    },
    out: () => {},
    git,
    readFile: (path) => readFile(path, 'utf8'),
    stat: (path) => stat(path),
    home,
    ...overrides,
  };
}

function catchUpDeps(overrides: Partial<CatchUpDeps> = {}): CatchUpDeps {
  const { facts: _facts, ...capture } = captureDeps();
  return {
    ...capture,
    sendFacts: async (payload) => {
      facts.push(payload);
    },
    withdraw: async (outil) => {
      told.push(outil);
    },
    env,
    now: () => MAINTENANT,
    ...overrides,
  };
}

const sentIds = () => sent.flatMap((payload) => payload.turns.map((turn) => turn.external_id));

async function consentToCapture(when = INSTALLE) {
  await writeConsent(home, 'codex', 2, INSTALLE);
  await recordCapture(home, 'codex', when);
}

describe('turnsAfter : le curseur', () => {
  const tours = ['a', 'b', 'c'].map((id) => ({
    external_id: id,
    role: 'user' as const,
    text: id,
    ts: '2026-11-06T09:00:00.000Z',
    capture_mode: 'file' as const,
  }));
  const curseur = (n: number, dernier: string | null) => ({
    tours: n,
    dernier,
    mtime: 0,
    taille: 0,
  });

  it('rend les tours d’après le dernier envoyé', () => {
    expect(turnsAfter(tours, curseur(2, 'b')).map((t) => t.external_id)).toEqual(['c']);
    expect(turnsAfter(tours, curseur(3, 'c'))).toEqual([]);
  });

  // Une CLI d'avant la marque écartait les tours injectés, et son curseur ne les comptait pas. Les renvoyer maintenant
  // les daterait, chez Cursor, de l'heure du fichier : ils passeraient après les tours tapés qui les suivent.
  it('reprend après le dernier envoyé un curseur qui ne comptait pas les tours injectés', () => {
    const tour = (id: string, injecte?: boolean) => ({
      external_id: id,
      role: 'user' as const,
      text: id,
      ts: '2026-11-06T09:00:00.000Z',
      capture_mode: 'file' as const,
      ...(injecte === undefined ? {} : { injecte }),
    });
    const avecInjectes = [
      tour('a', false),
      tour('i1', true),
      tour('b'),
      tour('i2', true),
      tour('c', false),
    ];

    expect(turnsAfter(avecInjectes, curseur(2, 'b')).map((t) => t.external_id)).toEqual([
      'i2',
      'c',
    ]);
    expect(turnsAfter(avecInjectes, curseur(3, 'c'))).toEqual([]);
    expect(turnsAfter(avecInjectes, curseur(2, 'x'))).toHaveLength(5);
  });

  it('sans curseur, ou un fichier qui ne commence plus pareil, rend tout', () => {
    expect(turnsAfter(tours, null)).toHaveLength(3);
    expect(turnsAfter(tours, curseur(2, 'x'))).toHaveLength(3);
    expect(turnsAfter(tours, curseur(5, 'e'))).toHaveLength(3);
  });
});

describe('captureToolFile : Codex, à chaque Stop', () => {
  it('envoie les tours une fois, avec le projet ; au Stop suivant, seulement les nouveaux', async () => {
    const path = await rollout('1', MAINTENANT);

    expect(await captureToolFile('codex', path, { fin: false }, captureDeps())).toBe('capte');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.source).toEqual({
      kind: 'codex',
      external_id: THREAD,
      title: 'Ajoute le lecteur des sessions Codex, puis ouvre la PR.',
      project: 'github.com/demo/leon',
    });
    expect(sentIds()).toHaveLength(4);

    await appendFile(
      path,
      `${JSON.stringify({
        timestamp: '2026-11-06T09:05:00.000Z',
        ordinal: 27,
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Et la doc ?' }],
        },
      })}\n`,
    );
    sent = [];
    await captureToolFile('codex', path, { fin: false }, captureDeps());

    expect(sentIds()).toEqual(['o27@2026-11-06T09:05:00.000Z']);
  });

  it('les faits, à chaque fois, sur tout le fichier : le second Stop rend encore les commandes du premier', async () => {
    const path = await rollout('1', MAINTENANT);
    await captureToolFile('codex', path, { fin: false }, captureDeps());
    await captureToolFile('codex', path, { fin: true }, captureDeps());

    expect(facts.map((payload) => [payload.kind, payload.external_id, payload.fin])).toEqual([
      ['codex', THREAD, false],
      ['codex', THREAD, true],
    ]);
    expect(facts[1]?.faits.commandes).toHaveLength(4);
    expect(facts[1]?.faits.branche).toBe('demo/codex-faits');
    expect(facts[1]?.project).toBe('github.com/demo/leon');
  });

  it('envoie les tours injectés avec leur marque, et les messages tapés marqués false (T43)', async () => {
    const path = await rollout('2', MAINTENANT, SANS_GIT);
    await captureToolFile('codex', path, { fin: false }, captureDeps());

    expect(
      sent
        .flatMap((payload) => payload.turns)
        .map((turn) => [turn.role, 'injecte' in turn ? turn.injecte : 'sans marque']),
    ).toEqual([
      ['user', false],
      ['user', true],
      ['assistant', 'sans marque'],
    ]);
  });

  // Lire Leon par son serveur MCP (T44, D36) : reconnu à l'URL de `config.toml`, lue à la capture.
  it('un outil local du serveur MCP de Leon, reconnu à l’URL de config.toml : la session n’est pas externe', async () => {
    const MCP = 'http://localhost:3000/api/mcp';
    const path = await rollout('1', MAINTENANT);
    await appendFile(
      path,
      `${JSON.stringify({
        timestamp: '2026-11-06T09:05:00.000Z',
        ordinal: 27,
        type: 'event_msg',
        payload: {
          type: 'item_completed',
          item: {
            type: 'McpToolCall',
            id: 'm1',
            server: 'leon',
            tool: 'thread',
            status: 'completed',
          },
        },
      })}\n`,
    );
    const externe = async (url: string, mcpUrl: string | undefined) => {
      await writeFile(join(codexDir, 'config.toml'), `[mcp_servers.leon]\nurl = "${url}"\n`);
      facts = [];
      await captureToolFile('codex', path, { fin: false }, captureDeps({ env, mcpUrl }));
      return facts[0]?.faits.externe;
    };

    expect(await externe(MCP, MCP)).toBe(false);
    expect(await externe('https://autre.example/api/mcp', MCP)).toBe(true);
    expect(await externe(MCP, undefined)).toBe(true);
  });

  it('sans branche dans le rollout, prend celle que lit git à la capture', async () => {
    const path = await rollout('2', MAINTENANT, SANS_GIT);
    await captureToolFile('codex', path, { fin: false }, captureDeps());

    expect(facts[0]?.faits.branche).toBe('branche-lue');
  });

  it('sans accord des gestes (`facts` absent), les tours seuls', async () => {
    const path = await rollout('1', MAINTENANT);
    await captureToolFile('codex', path, { fin: false }, captureDeps({ facts: undefined }));

    expect(sent).toHaveLength(1);
    expect(facts).toEqual([]);
  });

  it('un envoi refusé n’avance pas le curseur : le Stop suivant renvoie tout', async () => {
    const path = await rollout('1', MAINTENANT);
    const failing = captureDeps({
      send: async () => {
        throw new IngestResponseError(500);
      },
    });

    await expect(captureToolFile('codex', path, { fin: false }, failing)).rejects.toThrow();
    expect(await readCursor(home, 'codex', path)).toBeNull();

    await captureToolFile('codex', path, { fin: false }, captureDeps());
    expect(sentIds()).toHaveLength(4);
  });

  it('le curseur ne garde aucun texte de la session, en 0600', async () => {
    const path = await rollout('1', MAINTENANT);
    await captureToolFile('codex', path, { fin: false }, captureDeps());

    const file = cursorPath(home, 'codex', path);
    const text = await readFile(file, 'utf8');
    expect(JSON.parse(text)).toEqual({
      tours: 4,
      dernier: 'o26@2026-11-06T09:02:05.000Z',
      mtime: MAINTENANT.getTime(),
      taille: (await stat(path)).size,
      dossier: '/Users/demo/projets/leon',
    });
    expect(text).not.toContain('Ajoute');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });
});

describe('captureToolHook', () => {
  const hook = (transcript_path: unknown) =>
    JSON.stringify({
      session_id: THREAD,
      transcript_path,
      cwd: '/ailleurs',
      hook_event_name: 'Stop',
    });

  it('lit le rollout que nomme le crochet, sous le dossier des sessions de Codex', async () => {
    const path = await rollout('1', MAINTENANT);

    expect(await captureToolHook('codex', 'tour', hook(path), { ...captureDeps(), env })).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('ne lit jamais un fichier hors du dossier des sessions, ni une entrée illisible', async () => {
    const outside = join(dir, 'secret.jsonl');
    await copyFile(FIXTURE, outside);
    const readSpy = vi.fn(async () => '');
    const deps = { ...captureDeps({ readFile: readSpy }), env };
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    for (const input of [
      hook(outside),
      hook(join(codexDir, 'sessions', '..', 'secret.jsonl')),
      hook('sessions/relatif.jsonl'),
      hook(null),
      'pas du json',
    ]) {
      expect(await captureToolHook('codex', 'tour', input, deps)).toBe(0);
    }
    expect(readSpy).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      'Leon: could not read the hook input, session not captured.',
    );
    stderr.mockRestore();
  });

  it('un jeton refusé : un message fixe, le code 0', async () => {
    const path = await rollout('1', MAINTENANT);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = {
      ...captureDeps({
        send: async () => {
          throw new TokenRefusedError();
        },
      }),
      env,
    };

    expect(await captureToolHook('codex', 'fin', hook(path), deps)).toBe(0);
    expect(stderr).toHaveBeenCalledWith('Leon: token refused by the server, session not captured.');
    stderr.mockRestore();
  });
});

describe('l’entrée du crochet de fin', () => {
  it('lue puis effacée : après la fin, le fichier d’entrée n’existe plus', async () => {
    await mkdir(entriesDir(home), { recursive: true });
    const entry = join(entriesDir(home), 'fin.abc123');
    await writeFile(entry, '{"transcript_path":"/x"}');

    expect(await readEntryFile(home, entry)).toBe('{"transcript_path":"/x"}');
    await expect(stat(entry)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('effacée même quand elle ne se lit pas (trop grosse)', async () => {
    await mkdir(entriesDir(home), { recursive: true });
    const entry = join(entriesDir(home), 'fin.big');
    await writeFile(entry, 'x'.repeat(70 * 1024));

    expect(await readEntryFile(home, entry)).toBe('');
    await expect(stat(entry)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('un fichier hors de ~/.leon/entrees n’est ni lu ni effacé', async () => {
    const other = join(dir, 'autre.json');
    await writeFile(other, 'garde-moi');

    expect(await readEntryFile(home, other)).toBe('');
    expect(await readFile(other, 'utf8')).toBe('garde-moi');
  });

  it('le rattrapage efface les entrées de plus de 24 h, garde les autres', async () => {
    await mkdir(entriesDir(home), { recursive: true });
    const vieille = join(entriesDir(home), 'fin.vieille');
    const recente = join(entriesDir(home), 'fin.recente');
    await writeFile(vieille, '{}');
    await writeFile(recente, '{}');
    const old = new Date(MAINTENANT.getTime() - ENTRY_MAX_AGE_MS - 60_000);
    await utimes(vieille, old, old);
    await utimes(recente, MAINTENANT, MAINTENANT);

    await purgeOldEntries(home, MAINTENANT);

    await expect(stat(vieille)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await stat(recente)).isFile()).toBe(true);
  });
});

// La condition qui fait lancer `leon rattraper` au démarrage d'une session (scheduleCatchUp, leon.ts) et le fait
// travailler : une capture acceptée (T19), ou un retrait que le serveur n'a pas appris (T43), même sans aucune capture.
describe('catchUpNeeded : le rattrapage a-t-il quelque chose à faire', () => {
  it('rien d’accepté ni de retiré : non', async () => {
    expect(await catchUpNeeded(home)).toBe(false);
    await writeConsent(home, 'claude_code', 2);
    expect(await catchUpNeeded(home)).toBe(false);
  });

  it('une capture acceptée : oui', async () => {
    await consentToCapture();
    expect(await catchUpNeeded(home)).toBe(true);
  });

  it('un retrait que le serveur n’a pas appris, sans aucune capture : oui, puis non une fois appris', async () => {
    await writeConsent(home, 'claude_code', 0);
    expect(await catchUpNeeded(home)).toBe(true);

    await recordServerWithdrawal(
      home,
      'claude_code',
      (await withdrawalToTell(home, 'claude_code'))?.entree ?? '',
    );
    expect(await catchUpNeeded(home)).toBe(false);
  });
});

describe('catchUp : le rattrapage', () => {
  it('sans accord de capture, aucun rollout n’est ouvert (crochets de Leon recopiés par Codex, accord du lot 4)', async () => {
    await rollout('1', MAINTENANT);
    const readSpy = vi.fn(async () => '');

    expect(await catchUp(catchUpDeps({ readFile: readSpy }))).toEqual({ sessions: 0, failures: 0 });
    // L'accord du lot 4 : le bloc de démarrage seul, sans `capture_le`.
    await writeConsent(home, 'codex', 2, INSTALLE);
    expect(await captureTools(home)).toEqual([]);
    expect(await catchUp(catchUpDeps({ readFile: readSpy }))).toEqual({ sessions: 0, failures: 0 });

    expect(readSpy).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it('accord retiré (version 0) : rien non plus', async () => {
    await consentToCapture();
    await writeConsent(home, 'codex', 0);
    await rollout('1', MAINTENANT);

    expect(await catchUp(catchUpDeps())).toEqual({ sessions: 0, failures: 0 });
    expect(sent).toEqual([]);
  });

  it('ignore un fichier modifié avant l’accord de capture', async () => {
    await consentToCapture(new Date('2026-11-06T08:00:00Z'));
    await rollout('ancien', new Date('2026-11-06T07:00:00Z'));
    const recent = await rollout('recent', new Date('2026-11-06T11:00:00Z'), SANS_GIT);

    expect(await catchUp(catchUpDeps())).toEqual({ sessions: 1, failures: 0 });
    expect(sent.map((payload) => payload.source.external_id)).toEqual([
      '019a5e10-0000-7000-8000-000000000002',
    ]);
    expect(await readCursor(home, 'codex', recent)).not.toBeNull();
  });

  it('ne relit pas un fichier inchangé depuis sa dernière capture ; relit un fichier qui a bougé', async () => {
    await consentToCapture();
    const path = await rollout('1', MAINTENANT);
    await captureToolFile('codex', path, { fin: false }, captureDeps());
    sent = [];
    const readSpy = vi.fn((file: string) => readFile(file, 'utf8'));

    expect(await catchUp(catchUpDeps({ readFile: readSpy }))).toEqual({ sessions: 0, failures: 0 });
    expect(readSpy).not.toHaveBeenCalled();

    const later = new Date(MAINTENANT.getTime() + 60_000);
    await utimes(path, later, later);
    expect(await catchUp(catchUpDeps({ readFile: readSpy }))).toEqual({ sessions: 1, failures: 0 });
    expect(sent).toEqual([]); // rien de nouveau : aucun tour renvoyé
  });

  it('une session restée immobile 30 min est finie ; les usages ne partent qu’avec les fichiers modifiés après leur date', async () => {
    await consentToCapture();
    await addUsage(home, 'codex', 'resume', new Date('2026-11-06T11:30:00Z'));
    await rollout('immobile', new Date('2026-11-06T11:00:00Z'));
    await rollout('active', new Date('2026-11-06T11:50:00Z'), SANS_GIT);

    await catchUp(catchUpDeps());

    expect(facts.map((payload) => [payload.external_id, payload.fin, payload.usages])).toEqual([
      [THREAD, true, undefined],
      ['019a5e10-0000-7000-8000-000000000002', false, ['resume']],
    ]);
  });

  it('un échec compte, sans arrêter les autres sessions ; un jeton refusé arrête tout', async () => {
    await consentToCapture();
    await rollout('a', MAINTENANT);
    await rollout('b', MAINTENANT, SANS_GIT);
    let calls = 0;
    const flaky = async (payload: IngestPayload) => {
      calls += 1;
      if (calls === 1) throw new IngestResponseError(500);
      sent.push(payload);
      return RESULT;
    };

    expect(await catchUp(catchUpDeps({ send: flaky }))).toEqual({ sessions: 1, failures: 1 });

    const refused = async () => {
      throw new TokenRefusedError();
    };
    await expect(catchUp(catchUpDeps({ send: refused }))).rejects.toBeInstanceOf(TokenRefusedError);
  });

  it('un seul rattrapage à la fois : le second s’arrête tout de suite', async () => {
    await consentToCapture();
    await rollout('1', MAINTENANT);
    await mkdir(join(home, '.leon', 'curseurs'), { recursive: true });
    await writeFile(join(home, '.leon', 'curseurs', 'rattrapage.verrou'), 'en cours');

    expect(await catchUp(catchUpDeps({ now: () => new Date() }))).toEqual({
      sessions: 0,
      failures: 0,
    });
    expect(sent).toEqual([]);
  });
});

// Les retraits que le serveur n'a pas appris (T43) se disent sous le verrou du rattrapage, avant les captures : deux
// `leon rattraper` lancés ensemble ne les disent qu'une fois.
describe('catchUp : les retraits que le serveur n’a pas appris', () => {
  it('les dit une fois, même sans aucune capture acceptée', async () => {
    await writeConsent(home, 'claude_code', 0);

    await catchUp(catchUpDeps());
    await catchUp(catchUpDeps());

    expect(told).toEqual(['claude_code']);
  });

  it('verrou déjà pris par un autre rattrapage : rien n’est dit', async () => {
    await writeConsent(home, 'claude_code', 0);
    await mkdir(join(home, '.leon', 'curseurs'), { recursive: true });
    await writeFile(join(home, '.leon', 'curseurs', 'rattrapage.verrou'), 'en cours');

    await catchUp(catchUpDeps({ now: () => new Date() }));

    expect(told).toEqual([]);
  });

  // Le serveur n'ignore les usages des faits partis sous l'ancien accord qu'une fois le retrait appris (record-facts.ts) :
  // avant (poste hors ligne, envoi du retrait pas encore fait), ils y remettraient l'usage `resume`. L'accord est relu
  // juste avant.
  it('un retrait écrit pendant l’envoi des tours : les faits ne partent pas', async () => {
    await consentToCapture();
    await rollout('1', MAINTENANT);
    const send: CatchUpDeps['send'] = async (payload) => {
      sent.push(payload);
      await writeConsent(home, 'codex', 0);
      return RESULT;
    };

    await catchUp(catchUpDeps({ send }));

    expect(sent).not.toEqual([]);
    expect(facts).toEqual([]);
  });
});

// T28, T29 : Cursor. Son transcript ne dit ni le dossier ni l'heure : le crochet donne le dossier, le fichier son heure.
describe('Cursor : capter à chaque stop, rattraper', () => {
  const CURSOR_FIXTURE = new URL(
    '../capture/fixtures/cursor/transcript-simple.jsonl',
    import.meta.url,
  );
  const CONVERSATION = 'c0ffee00-0000-4000-8000-000000000001';

  async function transcript(slug: string, modified: Date): Promise<string> {
    const folder = join(home, '.cursor', 'projects', slug, 'agent-transcripts', CONVERSATION);
    await mkdir(folder, { recursive: true });
    const path = join(folder, `${CONVERSATION}.jsonl`);
    await copyFile(CURSOR_FIXTURE, path);
    await utimes(path, modified, modified);
    return path;
  }
  const stopJson = (workspace: string) =>
    JSON.stringify({
      conversation_id: CONVERSATION,
      generation_id: 'g',
      hook_event_name: 'stop',
      status: 'completed',
      workspace_roots: [workspace],
      cursor_version: '3.27.0',
    });

  it('le crochet stop : le transcript déduit du dossier, les tours sous le kind cursor, le projet du dossier', async () => {
    const workspace = join(dir, 'projets', 'leon');
    await mkdir(workspace, { recursive: true });
    const path = await transcript(cursorSlugOf(workspace), MAINTENANT);

    expect(
      await captureToolHook('cursor', 'tour', stopJson(workspace), { ...captureDeps(), env }),
    ).toBe(0);

    expect(sent[0]?.source).toMatchObject({
      kind: 'cursor',
      external_id: CONVERSATION,
      project: 'github.com/demo/leon',
    });
    // Cinq tours, et les deux messages que Cursor écrit lui-même, marqués (T43).
    expect(sentIds()).toHaveLength(7);
    expect(facts[0]).toMatchObject({
      kind: 'cursor',
      fin: false,
      faits: { branche: 'branche-lue' },
    });
    // Le dossier du crochet est gardé pour le rattrapage.
    expect((await readCursor(home, 'cursor', path))?.dossier).toBe(workspace);
  });

  it('le rattrapage retrouve le dossier d’une conversation qu’aucun crochet n’a vue, par son slug', async () => {
    await writeConsent(home, 'cursor', 2, INSTALLE);
    await recordCapture(home, 'cursor', INSTALLE);
    const workspace = join(dir, 'mon-projet', 'leon');
    await mkdir(workspace, { recursive: true });
    await transcript(cursorSlugOf(workspace), MAINTENANT);
    const directories: string[] = [];
    const spyGit = vi.fn<ToolCaptureDeps['git']>(async (args, cwd) => {
      directories.push(cwd);
      return git(args, cwd);
    });

    expect(await catchUp(catchUpDeps({ git: spyGit }))).toEqual({ sessions: 1, failures: 0 });
    expect(sent[0]?.source.kind).toBe('cursor');
    expect(new Set(directories)).toEqual(new Set([workspace]));
  });

  it('sans accord de capture de Cursor, aucun transcript n’est ouvert', async () => {
    await transcript('Users-x', MAINTENANT);
    const readSpy = vi.fn(async () => '');

    await catchUp(catchUpDeps({ readFile: readSpy }));

    expect(readSpy).not.toHaveBeenCalled();
  });
});

// T33, T34 : Antigravity. Stop ne capte qu'une conversation inactive ; le rattrapage retrouve l'espace de travail dans
// history.jsonl.
describe('Antigravity : capter quand la conversation est inactive, rattraper', () => {
  const AGY_FIXTURE = new URL(
    '../capture/fixtures/antigravity/transcript-simple.jsonl',
    import.meta.url,
  );
  const CONVERSATION = 'a1b2c3d4-0000-4000-8000-000000000001';

  async function transcript(modified: Date, name = 'transcript.jsonl'): Promise<string> {
    const folder = join(
      home,
      '.gemini',
      'antigravity',
      'brain',
      CONVERSATION,
      '.system_generated',
      'logs',
    );
    await mkdir(folder, { recursive: true });
    const path = join(folder, name);
    await copyFile(AGY_FIXTURE, path);
    await utimes(path, modified, modified);
    return path;
  }
  const stopJson = (path: string, fullyIdle: boolean) =>
    JSON.stringify({
      conversationId: CONVERSATION,
      transcriptPath: path,
      workspacePaths: ['/Users/demo/projets/leon'],
      executionNum: 1,
      fullyIdle,
    });

  it('Stop pendant que l’agent travaille : rien ; une fois inactive : les tours sous le kind antigravity', async () => {
    const path = await transcript(MAINTENANT);
    const deps = { ...captureDeps(), env };

    await captureToolHook('antigravity', 'tour', stopJson(path, false), deps);
    expect(sent).toEqual([]);

    await captureToolHook('antigravity', 'tour', stopJson(path, true), deps);
    expect(sent[0]?.source).toMatchObject({
      kind: 'antigravity',
      external_id: CONVERSATION,
      project: 'github.com/demo/leon',
    });
    expect(facts[0]?.faits.commits).toEqual(['5e6f7a8']);
  });

  it('lit transcript_full.jsonl d’abord, à côté de celui que nomme le crochet', async () => {
    const path = await transcript(MAINTENANT);
    const full = await transcript(MAINTENANT, 'transcript_full.jsonl');
    const readSpy = vi.fn((file: string) => readFile(file, 'utf8'));

    await captureToolHook('antigravity', 'tour', stopJson(path, true), {
      ...captureDeps({ readFile: readSpy }),
      env,
    });

    expect(readSpy).toHaveBeenCalledWith(full);
  });

  it('le rattrapage prend l’espace de travail de history.jsonl quand le transcript n’en dit rien', async () => {
    await writeConsent(home, 'antigravity', 2, INSTALLE);
    await recordCapture(home, 'antigravity', INSTALLE);
    const folder = join(
      home,
      '.gemini',
      'antigravity',
      'brain',
      CONVERSATION,
      '.system_generated',
      'logs',
    );
    await mkdir(folder, { recursive: true });
    const path = join(folder, 'transcript.jsonl');
    await writeFile(
      path,
      `${JSON.stringify({ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', created_at: '2026-11-06T10:00:00Z', content: '<USER_REQUEST>Salut</USER_REQUEST>' })}\n`,
    );
    await utimes(path, MAINTENANT, MAINTENANT);
    const workspace = join(dir, 'espace');
    await writeFile(
      join(home, '.gemini', 'antigravity', 'history.jsonl'),
      `${JSON.stringify({ conversationId: CONVERSATION, workspace: `file://${workspace}` })}\n`,
    );
    const directories: string[] = [];
    const spyGit = vi.fn<ToolCaptureDeps['git']>(async (args, cwd) => {
      directories.push(cwd);
      return git(args, cwd);
    });

    expect(await catchUp(catchUpDeps({ git: spyGit }))).toEqual({ sessions: 1, failures: 0 });
    expect(new Set(directories)).toEqual(new Set([workspace]));
  });
});
