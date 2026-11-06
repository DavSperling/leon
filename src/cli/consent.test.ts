import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addRefusal,
  addUsage,
  anyToolInstalled,
  CONSENT_AGAIN_HINT,
  CONSENT_WITHDRAWN_MESSAGE,
  consentPath,
  consentWithdrawn,
  factsConsent,
  withdrawalRecorded,
  writeConsent,
} from './consent';

// L'accord local (C7), toujours dans un HOME temporaire : jamais le vrai ~/.leon.
let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'leon-accord-'));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

async function writeRaw(content: string): Promise<void> {
  await mkdir(join(home, '.leon'), { recursive: true });
  await writeFile(consentPath(home), content);
}

describe('factsConsent : les faits ne partent que si l’accord le permet', () => {
  it('sans accord.json, aucun accord : seuls les textes partent', async () => {
    expect(await factsConsent(home, 'claude_code')).toBeNull();
  });

  it('en version 2, rend la version à transmettre avec les faits, et sa date', async () => {
    await writeConsent(home, 'claude_code', 2, new Date('2026-11-02T14:00:00Z'));

    expect(await factsConsent(home, 'claude_code')).toEqual({
      version: 2,
      installe_le: new Date('2026-11-02T14:00:00Z'),
      usages: [],
      usages_le: {},
      refus: [],
    });
  });

  it('une version plus haute est transmise telle quelle, une version sous 2 ne suffit pas', async () => {
    await writeConsent(home, 'claude_code', 3);
    expect((await factsConsent(home, 'claude_code'))?.version).toBe(3);

    await writeConsent(home, 'claude_code', 1);
    expect(await factsConsent(home, 'claude_code')).toBeNull();

    await writeConsent(home, 'claude_code', 0);
    expect(await factsConsent(home, 'claude_code')).toBeNull();
  });

  it.each([
    ['pas du JSON', '{ "outils": '],
    ['un tableau', '[]'],
    ['sans outils', '{}'],
    [
      'une version écrite en texte',
      '{"outils":{"claude_code":{"version":"2","installe_le":"2026-11-02T14:00:00Z"}}}',
    ],
    ['sans date', '{"outils":{"claude_code":{"version":2}}}'],
  ])('un fichier illisible (%s) ne vaut aucun accord', async (_name, content) => {
    await writeRaw(content);

    expect(await factsConsent(home, 'claude_code')).toBeNull();
  });

  it('lit la forme de C7, mot pour mot', async () => {
    await writeRaw(
      '{ "outils": { "claude_code": { "version": 2, "installe_le": "2026-11-02T14:00:00Z" } } }',
    );

    expect((await factsConsent(home, 'claude_code'))?.version).toBe(2);
  });

  it('lit une date à décalage horaire, et ne regarde que l’entrée de cet outil', async () => {
    await writeRaw(
      '{"outils":{"claude_code":{"version":2,"installe_le":"2026-11-02T15:00:00+01:00"},"codex":{"version":"x"}}}',
    );

    expect(await factsConsent(home, 'claude_code')).toEqual({
      version: 2,
      installe_le: new Date('2026-11-02T14:00:00Z'),
      usages: [],
      usages_le: {},
      refus: [],
    });
    expect(await consentWithdrawn(home, 'claude_code')).toBe(false);
  });

  it('lit les usages de C7 révisé, mot pour mot, et seulement ceux qu’il connaît', async () => {
    await writeRaw(
      '{ "outils": { "claude_code": { "version": 2, "installe_le": "2026-11-02T14:00:00Z", "usages": { "resume": "2026-11-05T09:00:00Z", "inconnu": "2026-11-05T09:00:00Z" } } } }',
    );

    expect(await factsConsent(home, 'claude_code')).toEqual({
      version: 2,
      installe_le: new Date('2026-11-02T14:00:00Z'),
      usages: ['resume'],
      usages_le: { resume: new Date('2026-11-05T09:00:00Z') },
      refus: [],
    });
  });

  // Une retouche à la main des usages ne fait jamais perdre l'accord du lot 1 : les gestes partent, sans usage.
  it.each([
    ['des usages en liste', '["resume"]'],
    ['un usage sans date', '{ "resume": true }'],
  ])('des usages illisibles (%s) : aucun usage, l’accord de base gardé', async (_name, usages) => {
    await writeRaw(
      `{"outils":{"claude_code":{"version":2,"installe_le":"2026-11-02T14:00:00Z","usages":${usages}}}}`,
    );

    expect(await factsConsent(home, 'claude_code')).toEqual({
      version: 2,
      installe_le: new Date('2026-11-02T14:00:00Z'),
      usages: [],
      usages_le: {},
      refus: [],
    });
  });
});

describe('addUsage : un usage accepté à part, daté (C7 révisé)', () => {
  it('ajoute l’usage sans toucher à la version, à sa date, ni aux autres outils', async () => {
    const codex = { version: 2, installe_le: '2026-11-01T10:00:00.000Z', note: 'à la main' };
    await writeRaw(
      JSON.stringify({
        outils: { codex, claude_code: { version: 2, installe_le: '2026-11-02T14:00:00.000Z' } },
      }),
    );

    await addUsage(home, 'claude_code', 'resume', new Date('2026-11-05T09:00:00Z'));

    expect(JSON.parse(await readFile(consentPath(home), 'utf8'))).toEqual({
      outils: {
        codex,
        claude_code: {
          version: 2,
          installe_le: '2026-11-02T14:00:00.000Z',
          usages: { resume: '2026-11-05T09:00:00.000Z' },
        },
      },
    });
    expect((await factsConsent(home, 'claude_code'))?.usages).toEqual(['resume']);
    expect((await stat(consentPath(home))).mode & 0o777).toBe(0o600);
  });

  it.each([
    ['sans accord', null],
    ['sous la version 2', 1],
    ['après le retrait', 0],
  ])('refuse %s, et n’écrit rien', async (_name, version) => {
    if (version !== null) await writeConsent(home, 'claude_code', version);
    const before = version === null ? null : await readFile(consentPath(home), 'utf8');

    await expect(addUsage(home, 'claude_code', 'resume')).rejects.toThrow();

    if (before === null) expect(await readdir(home)).toEqual([]);
    else expect(await readFile(consentPath(home), 'utf8')).toBe(before);
  });

  it('le retrait (version 0) efface les usages', async () => {
    await writeConsent(home, 'claude_code', 2);
    await addUsage(home, 'claude_code', 'resume');

    await writeConsent(home, 'claude_code', 0, new Date('2026-11-05T10:00:00Z'));

    expect(JSON.parse(await readFile(consentPath(home), 'utf8')).outils.claude_code).toEqual({
      version: 0,
      installe_le: '2026-11-05T10:00:00.000Z',
    });
  });
});

// C7 révisé, A16 : un refus s'écrit daté, comme un usage, et n'ouvre rien.
describe('addRefusal : un usage refusé, daté (C7 révisé)', () => {
  it('ajoute le refus sans toucher à la version, à sa date, aux usages ni aux autres outils', async () => {
    const codex = { version: 2, installe_le: '2026-11-01T10:00:00.000Z', note: 'à la main' };
    await writeRaw(
      JSON.stringify({
        outils: {
          codex,
          claude_code: {
            version: 2,
            installe_le: '2026-11-02T14:00:00.000Z',
            usages: { lecture: '2026-11-04T09:00:00.000Z' },
          },
        },
      }),
    );

    await addRefusal(home, 'claude_code', 'resume', new Date('2026-11-05T09:00:00Z'));

    expect(JSON.parse(await readFile(consentPath(home), 'utf8'))).toEqual({
      outils: {
        codex,
        claude_code: {
          version: 2,
          installe_le: '2026-11-02T14:00:00.000Z',
          usages: { lecture: '2026-11-04T09:00:00.000Z' },
          refus: { resume: '2026-11-05T09:00:00.000Z' },
        },
      },
    });
    expect(await factsConsent(home, 'claude_code')).toEqual({
      version: 2,
      installe_le: new Date('2026-11-02T14:00:00Z'),
      usages: ['lecture'],
      usages_le: { lecture: new Date('2026-11-04T09:00:00Z') },
      refus: ['resume'],
    });
    expect((await stat(consentPath(home))).mode & 0o777).toBe(0o600);
  });

  it('un refus n’ouvre rien : l’usage refusé n’est pas accepté', async () => {
    await writeConsent(home, 'claude_code', 2);

    await addRefusal(home, 'claude_code', 'resume');

    expect((await factsConsent(home, 'claude_code'))?.usages).toEqual([]);
  });

  it.each([
    ['sans accord', null],
    ['après le retrait', 0],
  ])('refuse %s, et n’écrit rien', async (_name, version) => {
    if (version !== null) await writeConsent(home, 'claude_code', version);
    const before = version === null ? null : await readFile(consentPath(home), 'utf8');

    await expect(addRefusal(home, 'claude_code', 'resume')).rejects.toThrow();

    if (before === null) expect(await readdir(home)).toEqual([]);
    else expect(await readFile(consentPath(home), 'utf8')).toBe(before);
  });

  // Une retouche à la main des refus ne fait perdre ni l'accord ni les usages : elle se lit comme aucun refus.
  it.each([
    ['des refus en liste', '["resume"]'],
    ['un refus sans date', '{ "resume": true }'],
  ])(
    'des refus illisibles (%s) : aucun refus, l’accord et les usages gardés',
    async (_n, refus) => {
      await writeRaw(
        `{"outils":{"claude_code":{"version":2,"installe_le":"2026-11-02T14:00:00Z","usages":{"resume":"2026-11-05T09:00:00Z"},"refus":${refus}}}}`,
      );

      expect(await factsConsent(home, 'claude_code')).toEqual({
        version: 2,
        installe_le: new Date('2026-11-02T14:00:00Z'),
        usages: ['resume'],
        usages_le: { resume: new Date('2026-11-05T09:00:00Z') },
        refus: [],
      });
    },
  );

  it('le retrait (version 0) efface les usages et les refus', async () => {
    await writeConsent(home, 'claude_code', 2);
    await addUsage(home, 'claude_code', 'lecture');
    await addRefusal(home, 'claude_code', 'resume');

    await writeConsent(home, 'claude_code', 0, new Date('2026-11-05T10:00:00Z'));

    expect(JSON.parse(await readFile(consentPath(home), 'utf8')).outils.claude_code).toEqual({
      version: 0,
      installe_le: '2026-11-05T10:00:00.000Z',
    });
  });
});

describe('consentWithdrawn : après `leon retirer-crochets`, plus rien ne part', () => {
  it('vrai en version 0 seulement : un accord absent garde l’envoi des textes d’avant ce chantier', async () => {
    expect(await consentWithdrawn(home, 'claude_code')).toBe(false);

    await writeConsent(home, 'claude_code', 2);
    expect(await consentWithdrawn(home, 'claude_code')).toBe(false);

    await writeConsent(home, 'claude_code', 0);
    expect(await consentWithdrawn(home, 'claude_code')).toBe(true);
  });

  it('un ~/.leon qui n’est pas un dossier vaut un accord absent', async () => {
    await writeFile(join(home, '.leon'), '');

    expect(await consentWithdrawn(home, 'claude_code')).toBe(false);
  });

  it('un fichier sans entrée pour cet outil ne retire rien', async () => {
    await writeRaw('{"outils":{}}');

    expect(await consentWithdrawn(home, 'claude_code')).toBe(false);
  });

  // Un fichier abîmé (retouché à la main, écriture coupée) ne lève jamais un retrait : il le vaut.
  it.each([
    [
      'la version 0 à côté d’un autre outil hors schéma',
      '{"outils":{"claude_code":{"version":0,"installe_le":"2026-11-02T14:00:00.000Z"},"codex":{"version":2}}}',
    ],
    [
      'la version 0 avec une date à décalage horaire',
      '{"outils":{"claude_code":{"version":0,"installe_le":"2026-11-02T15:00:00+01:00"}}}',
    ],
    ['la version 0 sans date', '{"outils":{"claude_code":{"version":0}}}'],
    ['un fichier coupé', '{"outils": {"claude_code": {"vers'],
    ['un fichier vide', ''],
    ['sans objet outils', '{}'],
  ])('%s : retiré, et aucun accord pour les faits', async (_name, content) => {
    await writeRaw(content);

    expect(await consentWithdrawn(home, 'claude_code')).toBe(true);
    expect(await factsConsent(home, 'claude_code')).toBeNull();
  });
});

describe('withdrawalRecorded : le retrait est bien écrit', () => {
  it('vrai seulement quand le fichier se lit et que l’outil y est en version 0', async () => {
    expect(await withdrawalRecorded(home, 'claude_code')).toBe(false);

    await writeConsent(home, 'claude_code', 2);
    expect(await withdrawalRecorded(home, 'claude_code')).toBe(false);

    await writeConsent(home, 'claude_code', 0);
    expect(await withdrawalRecorded(home, 'claude_code')).toBe(true);

    await writeRaw('{"outils": {"claude_code": {"vers');
    expect(await withdrawalRecorded(home, 'claude_code')).toBe(false);
  });
});

describe('anyToolInstalled : le lanceur sert tant qu’un outil n’est pas retiré', () => {
  const entry = (version: unknown) => ({ version, installe_le: '2026-11-02T14:00:00.000Z' });

  it('faux sans accord, ou quand tous les outils sont en version 0', async () => {
    expect(await anyToolInstalled(home)).toBe(false);

    await writeRaw(JSON.stringify({ outils: { claude_code: entry(0), codex: { version: 0 } } }));
    expect(await anyToolInstalled(home)).toBe(false);

    await writeRaw('{"outils":{}}');
    expect(await anyToolInstalled(home)).toBe(false);
  });

  it('vrai dès qu’un outil a un accord en cours, quelle que soit sa version', async () => {
    await writeRaw(JSON.stringify({ outils: { claude_code: entry(0), codex: entry(2) } }));
    expect(await anyToolInstalled(home)).toBe(true);

    await writeRaw(JSON.stringify({ outils: { claude_code: entry(3) } }));
    expect(await anyToolInstalled(home)).toBe(true);
  });

  // Dans le doute, le lanceur reste : un faux « plus aucun outil » le ferait effacer sous des crochets encore posés.
  it.each([
    ['une entrée hors schéma', '{"outils":{"codex":{"version":"2"}}}'],
    ['un fichier coupé', '{"outils": {"claude_code": {"vers'],
    ['un fichier qui n’a pas d’objet outils', '[]'],
  ])('vrai pour %s', async (_name, content) => {
    await writeRaw(content);

    expect(await anyToolInstalled(home)).toBe(true);
  });
});

describe('writeConsent', () => {
  it('écrit ~/.leon/accord.json en 0600, dans un dossier en 0700', async () => {
    await writeConsent(home, 'claude_code', 2, new Date('2026-11-02T14:00:00Z'));

    expect(consentPath(home)).toBe(join(home, '.leon', 'accord.json'));
    expect(JSON.parse(await readFile(consentPath(home), 'utf8'))).toEqual({
      outils: { claude_code: { version: 2, installe_le: '2026-11-02T14:00:00.000Z' } },
    });
    expect((await stat(consentPath(home))).mode & 0o777).toBe(0o600);
    expect((await stat(join(home, '.leon'))).mode & 0o777).toBe(0o700);
  });

  it('remet en 0600 un fichier qui existait avec plus de droits', async () => {
    await writeRaw('{}');
    await chmod(consentPath(home), 0o644);

    await writeConsent(home, 'claude_code', 2);

    expect((await stat(consentPath(home))).mode & 0o777).toBe(0o600);
  });

  it('garde les autres outils de l’accord', async () => {
    await writeRaw('{"outils":{"codex":{"version":2,"installe_le":"2026-11-01T10:00:00.000Z"}}}');

    await writeConsent(home, 'claude_code', 2, new Date('2026-11-02T14:00:00Z'));

    expect(JSON.parse(await readFile(consentPath(home), 'utf8'))).toEqual({
      outils: {
        codex: { version: 2, installe_le: '2026-11-01T10:00:00.000Z' },
        claude_code: { version: 2, installe_le: '2026-11-02T14:00:00.000Z' },
      },
    });
  });

  it('garde mot pour mot l’entrée d’un autre outil, même hors schéma', async () => {
    const codex = { version: 2, installe_le: '2026-11-01T11:00:00+01:00', note: 'à la main' };
    await writeRaw(JSON.stringify({ outils: { codex } }));

    await writeConsent(home, 'claude_code', 3, new Date('2026-11-02T14:00:00Z'));

    expect(JSON.parse(await readFile(consentPath(home), 'utf8')).outils).toEqual({
      codex,
      claude_code: { version: 3, installe_le: '2026-11-02T14:00:00.000Z' },
    });
  });

  it('réécrit un fichier coupé avec ce seul outil, sans laisser de fichier voisin', async () => {
    await writeRaw('{"outils": {"claude_code": {"vers');

    await writeConsent(home, 'claude_code', 0, new Date('2026-11-02T14:00:00Z'));

    expect(JSON.parse(await readFile(consentPath(home), 'utf8'))).toEqual({
      outils: { claude_code: { version: 0, installe_le: '2026-11-02T14:00:00.000Z' } },
    });
    expect(await readdir(join(home, '.leon'))).toEqual(['accord.json']);
  });
});

// Le message de `briefing`, de `capter-session` et de `leon retirer-crochets` : le même texte pour la forme installée
// (le lanceur ~/.leon/bin/leon) et pour le clone (pnpm), sans commande qui n'existe que dans l'une des deux.
describe('les messages de l’accord retiré : un texte juste pour les deux formes', () => {
  it('dit comment redonner l’accord sous la forme installée, puis depuis un clone', () => {
    expect(CONSENT_AGAIN_HINT).toBe(
      'To give it again, run `~/.leon/bin/leon setup` (if that file is gone, run the install command of Leon again: `curl -fsSL <address of Leon>/install | sh`; from a Leon clone: `pnpm leon installer-crochets`).',
    );
    expect(CONSENT_WITHDRAWN_MESSAGE).toBe(
      `Leon: your consent for Claude Code was withdrawn (\`leon retirer-crochets\`): nothing is sent. ${CONSENT_AGAIN_HINT}`,
    );
  });

  it('n’envoie pas à pnpm celui qui n’a pas de clone', () => {
    expect(CONSENT_WITHDRAWN_MESSAGE).not.toMatch(/\(pnpm leon retirer-crochets\)/);
    expect(CONSENT_WITHDRAWN_MESSAGE).not.toMatch(/run pnpm/);
  });
});
