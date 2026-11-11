import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type Connection,
  clearConnection,
  connectionPath,
  readConnection,
  writeConnection,
} from './connection';

// La connexion de l'ordinateur (K2 du plan « CLI sans clone »), toujours dans un HOME temporaire : jamais le vrai ~/.leon.
const TOKEN = `leon_${'a'.repeat(43)}`;
const CONNECTION: Connection = {
  url: 'https://leon.example',
  jeton: TOKEN,
  ordinateur: 'MacBook-Pro',
  espace: 'Acme',
  cree_le: '2026-11-03T10:00:00.000Z',
};

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'leon-connexion-'));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

async function writeRaw(content: string): Promise<void> {
  await mkdir(join(home, '.leon'), { recursive: true });
  await writeFile(connectionPath(home), content);
}

const modeOf = async (path: string) => (await stat(path)).mode & 0o777;

describe('writeConnection et readConnection', () => {
  it('écrit ~/.leon/connexion.json en 0600 (dossier en 0700), le relit tel quel, sans fichier voisin laissé', async () => {
    await writeConnection(home, CONNECTION);

    expect(connectionPath(home)).toBe(join(home, '.leon', 'connexion.json'));
    expect(await modeOf(connectionPath(home))).toBe(0o600);
    expect(await modeOf(join(home, '.leon'))).toBe(0o700);
    expect(JSON.parse(await readFile(connectionPath(home), 'utf8'))).toEqual(CONNECTION);
    expect(await readConnection(home)).toEqual(CONNECTION);
    expect(await readdir(join(home, '.leon'))).toEqual(['connexion.json']);
  });

  // `par` (C16 du plan de la mémoire à disposition) : « jeton » quand `leon login --with-token` l'a écrite. Facultatif, et
  // jamais une raison de croire l'ordinateur déconnecté.
  it('relit `par`, et une connexion sans lui reste valide', async () => {
    await writeConnection(home, { ...CONNECTION, par: 'jeton' });
    expect(await readConnection(home)).toEqual({ ...CONNECTION, par: 'jeton' });

    await writeConnection(home, CONNECTION);
    const saved = await readConnection(home);
    expect(saved).toEqual(CONNECTION);
    expect(saved).not.toHaveProperty('par');
  });

  it.each([
    ['une autre valeur', 'navigateur'],
    ['autre chose qu’un texte', 1],
    ['nul', null],
  ])(
    'un `par` retouché à la main (%s) laisse la connexion valide, sans lui',
    async (_name, par) => {
      await writeRaw(JSON.stringify({ ...CONNECTION, par }));

      const saved = await readConnection(home);

      expect(saved).toMatchObject(CONNECTION);
      expect(saved?.par).toBeUndefined();
    },
  );

  it('remplace une connexion existante, toujours en 0600', async () => {
    await writeConnection(home, CONNECTION);
    const other = { ...CONNECTION, jeton: `leon_${'b'.repeat(43)}`, espace: 'Autre' };

    await writeConnection(home, other);

    expect(await readConnection(home)).toEqual(other);
    expect(await modeOf(connectionPath(home))).toBe(0o600);
    expect(await readdir(join(home, '.leon'))).toEqual(['connexion.json']);
  });

  it('accepte http sur 127.0.0.1 et localhost (les essais en local), comme LEON_URL', async () => {
    for (const url of ['http://127.0.0.1:3000', 'http://localhost:3000']) {
      await writeConnection(home, { ...CONNECTION, url });
      expect((await readConnection(home))?.url).toBe(url);
    }
  });

  it('un fichier absent, ou un ~/.leon qui n’est pas un dossier, vaut « pas connecté »', async () => {
    expect(await readConnection(home)).toBeNull();

    await writeFile(join(home, '.leon'), '');
    expect(await readConnection(home)).toBeNull();
  });

  it.each([
    ['pas du JSON', '{ "url": '],
    ['un tableau', '[]'],
    ['vide', ''],
    ['sans jeton', JSON.stringify({ ...CONNECTION, jeton: undefined })],
    ['un jeton hors motif', JSON.stringify({ ...CONNECTION, jeton: 'leon_trop-court' })],
    [
      'une adresse en http hors de la machine',
      JSON.stringify({ ...CONNECTION, url: 'http://leon.example' }),
    ],
    ['une adresse qui n’en est pas une', JSON.stringify({ ...CONNECTION, url: 'pas une url' })],
    ['un nom d’ordinateur absent', JSON.stringify({ ...CONNECTION, ordinateur: undefined })],
    ['une date illisible', JSON.stringify({ ...CONNECTION, cree_le: 'hier' })],
  ])('un fichier illisible ou invalide (%s) vaut « pas connecté »', async (_name, content) => {
    await writeRaw(content);

    expect(await readConnection(home)).toBeNull();
  });

  it('refuse un lien symbolique à la place du fichier : ni lu, ni écrit à travers', async () => {
    const real = join(home, 'ailleurs.json');
    await writeFile(real, `${JSON.stringify(CONNECTION)}\n`);
    await mkdir(join(home, '.leon'), { recursive: true });
    await symlink(real, connectionPath(home));

    expect(await readConnection(home)).toBeNull();
    await expect(writeConnection(home, { ...CONNECTION, espace: 'Autre' })).rejects.toThrow(
      /symbolic link/,
    );
    expect(JSON.parse(await readFile(real, 'utf8')).espace).toBe('Acme');
    expect(await readdir(join(home, '.leon'))).toEqual(['connexion.json']);
  });
});

describe('clearConnection', () => {
  it('efface le fichier et dit s’il y en avait un', async () => {
    await writeConnection(home, CONNECTION);

    expect(await clearConnection(home)).toBe(true);
    expect(await readConnection(home)).toBeNull();
    expect(await clearConnection(home)).toBe(false);
  });

  it('efface aussi un fichier invalide : se déconnecter doit toujours aboutir', async () => {
    await writeRaw('pas du JSON');

    expect(await clearConnection(home)).toBe(true);
    expect(await readdir(join(home, '.leon'))).toEqual([]);
  });
});
