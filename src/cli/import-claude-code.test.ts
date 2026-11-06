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
import { API_PATHS, type SessionFactsPayload } from '../capture/api-contract';
import { extractClaudeCodeFacts } from '../capture/session-facts';
import { type IngestPayload, type IngestResult, TURN_TEXT_MAX } from '../capture/turn';
import { CONSENT_WITHDRAWN_MESSAGE } from './consent';
import {
  countOf,
  createFactsSender,
  createIngestSender,
  type FactsSender,
  type ImportDeps,
  IngestResponseError,
  importClaudeCode,
  parseSince,
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

  it('met la clé de projet dans la source de chaque envoi, et dans la sortie en dryRun', async () => {
    const { deps, send, out } = makeDeps();

    await importClaudeCode({ ...importOptions(), projectKey: 'github.com/acme/leon' }, deps);
    await importClaudeCode({ baseDir, dryRun: true, projectKey: 'dossier:0123456789abcdef' }, deps);

    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.map(([p]) => p.source.project)).toEqual([
      'github.com/acme/leon',
      'github.com/acme/leon',
      'github.com/acme/leon',
    ]);
    const dry = out.mock.calls.map(([line]) => JSON.parse(line) as IngestPayload);
    expect(dry.map((p) => p.source.project)).toEqual([
      'dossier:0123456789abcdef',
      'dossier:0123456789abcdef',
      'dossier:0123456789abcdef',
    ]);
  });

  it('avec git, calcule la clé de projet de chaque session sur son dossier de départ', async () => {
    const { deps, send } = makeDeps();
    const remotes: Record<string, string> = {
      '/Users/demo/projets/acme': 'git@github.com:Acme/Offres.git',
    };
    const git = vi.fn(async (_args: string[], cwd: string) => remotes[cwd] ?? null);

    await importClaudeCode(importOptions(), { ...deps, git });

    const keys = new Map(send.mock.calls.map(([p]) => [p.source.external_id, p.source.project]));
    expect(keys.get(ACME_SESSION)).toBe('github.com/acme/offres');
    // Pas de remote GitHub : la clé du dossier, la même que celle du crochet de fin de session.
    expect(keys.get('22222222-2222-4222-8222-222222222222')).toMatch(/^dossier:[0-9a-f]{16}$/);
  });

  it("sans clé de projet, la source n'a pas de champ project (comme avant)", async () => {
    const { deps, send } = makeDeps();

    await importClaudeCode(importOptions(), deps);

    for (const [payload] of send.mock.calls) {
      expect(Object.keys(payload.source)).not.toContain('project');
    }
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

  it("compte l'échec d'une session sans arrêter les suivantes, avec un message fixe", async () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, send } = makeDeps(async (payload) => {
      if (payload.source.external_id === ACME_SESSION) throw new Error('réseau coupé');
      return RESULT;
    });

    const summary = await importClaudeCode(importOptions(), deps);

    expect(send).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({ sessions: 3, failures: 1, inserted: 4 });
    // Le message d'une erreur peut citer du texte de conversation : la CLI n'en recopie rien (et n'importe plus
    // server/log, que le fichier construit n'embarque pas).
    expect(stderr.mock.calls).toEqual([
      ['Leon: a session could not be imported (unexpected error).'],
    ]);
  });

  it('arrête tout quand le jeton est refusé', async () => {
    const { deps, send } = makeDeps(async () => {
      throw new TokenRefusedError();
    });

    await expect(importClaudeCode(importOptions(), deps)).rejects.toThrow(
      'Token refused by the Leon server.',
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

// Au rattrapage, les faits de chaque session partent après ses tours, seulement quand l'accord le permet
// (`deps.facts`, posé par leon.ts d'après consent.ts).
describe('importClaudeCode : les faits de chaque session', () => {
  const ORION_SESSION = '22222222-2222-4222-8222-222222222222';

  function makeFactsDeps(sendFacts?: FactsSender) {
    const events: string[] = [];
    const { deps, out } = makeDeps(async (payload) => {
      events.push(`tours ${payload.source.external_id}`);
      return RESULT;
    });
    const facts = vi.fn<FactsSender>(
      sendFacts ??
        (async (payload) => {
          events.push(`faits ${payload.external_id}`);
        }),
    );
    return { deps: { ...deps, facts: { accord: 2, send: facts } }, facts, events, out };
  }
  const factsOf = (facts: { mock: { calls: Array<[SessionFactsPayload]> } }) =>
    new Map(facts.mock.calls.map(([payload]) => [payload.external_id, payload]));

  it('envoie les faits de chaque session après ses tours, avec la version de l’accord', async () => {
    const { deps, facts, events } = makeFactsDeps();

    await importClaudeCode({ ...importOptions(), projectKey: 'github.com/acme/leon' }, deps);

    expect(facts).toHaveBeenCalledTimes(3);
    for (const id of [ACME_SESSION, ORION_SESSION]) {
      expect(events.indexOf(`faits ${id}`)).toBeGreaterThan(events.lastIndexOf(`tours ${id}`));
    }
    const acme = factsOf(facts).get(ACME_SESSION);
    const content = await readFile(new URL('session-simple.jsonl', FIXTURES), 'utf8');
    expect(acme).toEqual({
      kind: 'claude_code',
      external_id: ACME_SESSION,
      project: 'github.com/acme/leon',
      accord: 2,
      faits: extractClaudeCodeFacts(content, '/Users/demo/projets/acme'),
      fin: false,
    });
  });

  // C2 : les usages de l'accord partent avec les faits ; sans usage, le corps reste celui qu'un serveur d'avant accepte.
  it('envoie les usages de l’accord avec les faits, et rien quand il n’y en a pas', async () => {
    const { deps, facts } = makeFactsDeps();

    await importClaudeCode(importOptions(), {
      ...deps,
      facts: { ...deps.facts, usages: ['resume'] },
    });
    await importClaudeCode(importOptions(), { ...deps, facts: { ...deps.facts, usages: [] } });

    const sent = facts.mock.calls.map(([payload]) => payload);
    expect(sent.filter((payload) => payload.external_id === ACME_SESSION)).toEqual([
      expect.objectContaining({ usages: ['resume'] }),
      expect.not.objectContaining({ usages: expect.anything() }),
    ]);
  });

  // Vigilance 4 du plan : accepter `resume` puis rattraper ne fait pas résumer les sessions finies avant ce oui.
  it('n’envoie un usage qu’avec les sessions modifiées après sa date ; les faits, eux, partent', async () => {
    const usageDate = new Date(Date.now() - 60 * 60_000);
    const before = new Date(usageDate.getTime() - 60_000);
    await utimes(join(projectDir, 'session-simple.jsonl'), before, before);
    const { deps, facts } = makeFactsDeps();

    await importClaudeCode(importOptions(), {
      ...deps,
      facts: { ...deps.facts, usages: ['resume'], usagesDepuis: { resume: usageDate } },
    });

    const acme = factsOf(facts).get(ACME_SESSION);
    expect(acme).toBeDefined();
    expect(acme).not.toHaveProperty('usages');
    expect(factsOf(facts).get(ORION_SESSION)?.usages).toEqual(['resume']);
  });

  it('fin vaut vrai pour un fichier qui n’a pas bougé depuis 30 min, faux sinon', async () => {
    const old = new Date(Date.now() - 31 * 60_000);
    await utimes(join(projectDir, 'session-simple.jsonl'), old, old);
    const recent = new Date(Date.now() - 29 * 60_000);
    await utimes(join(projectDir, 'session-bruit.jsonl'), recent, recent);
    const { deps, facts } = makeFactsDeps();

    await importClaudeCode(importOptions(), deps);

    expect(factsOf(facts).get(ACME_SESSION)?.fin).toBe(true);
    expect(factsOf(facts).get(ORION_SESSION)?.fin).toBe(false);
  });

  it('n’envoie que les faits des fichiers modifiés après l’accord ; les tours, eux, partent tous', async () => {
    const accordDate = new Date(Date.now() - 60 * 60_000);
    const before = new Date(accordDate.getTime() - 60_000);
    await utimes(join(projectDir, 'session-simple.jsonl'), before, before);
    const { deps, facts, events } = makeFactsDeps();

    await importClaudeCode(importOptions(), {
      ...deps,
      facts: { ...deps.facts, depuis: accordDate },
    });

    expect(facts).toHaveBeenCalledTimes(2);
    expect(factsOf(facts).has(ACME_SESSION)).toBe(false);
    expect(factsOf(facts).has(ORION_SESSION)).toBe(true);
    expect(events).toContain(`tours ${ACME_SESSION}`);
  });

  it('sans dossier de départ écrit dans la session, envoie les tours sans les faits', async () => {
    await rm(projectDir, { recursive: true });
    await mkdir(projectDir);
    await writeFile(
      join(projectDir, 'sans-dossier.jsonl'),
      JSON.stringify({
        type: 'user',
        uuid: 'sd-1',
        sessionId: 'sans-dossier',
        timestamp: '2026-10-13T08:00:00.000Z',
        message: { content: 'Bonjour' },
      }),
    );
    const { deps, facts, events } = makeFactsDeps();

    const summary = await importClaudeCode(importOptions(), deps);

    expect(events).toEqual(['tours sans-dossier']);
    expect(facts).not.toHaveBeenCalled();
    expect(summary.failures).toBe(0);
  });

  it.each([404, 400])(
    'un %i : un message fixe, une seule fois, plus aucun fait envoyé, et ce n’est pas un échec',
    async (status) => {
      const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { deps, facts } = makeFactsDeps(async () => {
        throw new IngestResponseError(status);
      });

      const summary = await importClaudeCode(importOptions(), deps);

      expect(facts).toHaveBeenCalledTimes(1);
      expect(summary).toMatchObject({ sessions: 3, failures: 0 });
      expect(stderr).toHaveBeenCalledTimes(1);
      expect(stderr.mock.calls.flat().join('\n')).toMatch(/older than the CLI/);
      expect(stderr.mock.calls.flat().join('\n')).not.toContain(String(status));
    },
  );

  it('une autre erreur des faits compte comme l’échec de la session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, facts } = makeFactsDeps(async () => {
      throw new IngestResponseError(500);
    });

    const summary = await importClaudeCode(importOptions(), deps);

    expect(facts).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({ sessions: 3, failures: 3 });
  });

  // Le retrait relu avant chaque session : un `leon retirer-crochets` lancé pendant un long import l'arrête.
  it('un retrait écrit entre deux sessions : plus rien ne part, ni tours ni faits', async () => {
    const { deps, facts, events } = makeFactsDeps();
    const withdrawn = async () => events.length > 0;

    await expect(importClaudeCode(importOptions(), { ...deps, withdrawn })).rejects.toThrow(
      CONSENT_WITHDRAWN_MESSAGE,
    );

    expect(facts).toHaveBeenCalledTimes(1);
    expect(new Set(events.map((event) => event.split(' ')[1])).size).toBe(1);
  });

  it('arrête tout quand le jeton est refusé à l’envoi des faits', async () => {
    const { deps, facts } = makeFactsDeps(async () => {
      throw new TokenRefusedError();
    });

    await expect(importClaudeCode(importOptions(), deps)).rejects.toBeInstanceOf(TokenRefusedError);
    expect(facts).toHaveBeenCalledTimes(1);
  });

  it('en dryRun, écrit aussi la ligne des faits de chaque session, sans rien envoyer', async () => {
    const { deps, facts, out } = makeFactsDeps();

    await importClaudeCode({ baseDir, dryRun: true }, deps);

    expect(facts).not.toHaveBeenCalled();
    const lines = out.mock.calls.map(([line]) => JSON.parse(line) as Record<string, unknown>);
    const factLines = lines.filter((line) => 'faits' in line);
    expect(factLines.map((line) => line.external_id).sort()).toEqual([
      ACME_SESSION,
      ORION_SESSION,
      '33333333-3333-4333-8333-333333333333',
    ]);
    expect(factLines.every((line) => line.accord === 2)).toBe(true);
  });
});

describe('createFactsSender', () => {
  const env = { url: 'http://localhost:3000', token: `leon_${'a'.repeat(43)}` };
  const payload: SessionFactsPayload = {
    kind: 'claude_code',
    external_id: 's1',
    accord: 2,
    faits: extractClaudeCodeFacts('', '/r'),
    fin: true,
  };

  it('poste les faits sur leur route, avec le jeton, et accepte le 202 sans corps', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const controller = new AbortController();

    await createFactsSender(fetchImpl as typeof fetch, env, { signal: controller.signal })(payload);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe(new URL(API_PATHS.faits, env.url).href);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(init.signal).toBe(controller.signal);
  });

  it('lève TokenRefusedError sur 401, une erreur qui porte le code sur les autres refus', async () => {
    const reply = (status: number) =>
      createFactsSender((async () => new Response('{}', { status })) as typeof fetch, env);

    await expect(reply(401)(payload)).rejects.toBeInstanceOf(TokenRefusedError);
    await expect(reply(404)(payload)).rejects.toMatchObject({ status: 404 });
    await expect(reply(400)(payload)).rejects.toBeInstanceOf(IngestResponseError);
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

  it("passe le signal d'interruption à l'envoi, quand on en donne un", async () => {
    const fetchImpl = vi.fn(async () => Response.json(RESULT, { status: 202 }));
    const controller = new AbortController();

    await createIngestSender(fetchImpl as typeof fetch, env, { signal: controller.signal })(
      payload,
    );

    const [, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it("n'ajoute aucun signal sans demande : l'import par lots n'a pas de délai global", async () => {
    const fetchImpl = vi.fn(async () => Response.json(RESULT, { status: 202 }));

    await createIngestSender(fetchImpl as typeof fetch, env)(payload);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.signal).toBeUndefined();
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

describe('parseSince', () => {
  const tz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tz;
  });

  it('prend minuit à l’heure locale', () => {
    process.env.TZ = 'Europe/Paris';
    expect(parseSince('2026-10-13')?.toISOString()).toBe('2026-10-12T22:00:00.000Z');
  });

  it('refuse une date mal écrite et laisse passer l’absence de date', () => {
    expect(() => parseSince('13/10/2026')).toThrow('YYYY-MM-DD');
    expect(parseSince(undefined)).toBeUndefined();
  });
});

describe('countOf', () => {
  it('met le pluriel sauf pour un seul : 0 turns, 1 turn, 2 turns', () => {
    expect([0, 1, 2].map((count) => countOf(count, 'turn'))).toEqual([
      '0 turns',
      '1 turn',
      '2 turns',
    ]);
  });
});
