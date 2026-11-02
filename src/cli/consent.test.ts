import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consentPath, consentWithdrawn, factsConsent, writeConsent } from './consent';

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

  it('en version 2, rend la version à transmettre avec les faits', async () => {
    await writeConsent(home, 'claude_code', 2);

    expect(await factsConsent(home, 'claude_code')).toBe(2);
  });

  it('une version plus haute est transmise telle quelle, une version sous 2 ne suffit pas', async () => {
    await writeConsent(home, 'claude_code', 3);
    expect(await factsConsent(home, 'claude_code')).toBe(3);

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

    expect(await factsConsent(home, 'claude_code')).toBe(2);
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
});
