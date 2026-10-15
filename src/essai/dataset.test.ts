import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadJeu } from './dataset';

const ENTREPRISE = {
  organisation: 'Atelier Numérique Lebrun',
  slug: 'essai-atelier-lebrun',
  domaine: 'essai.leon.local',
  motDePasse: 'essai-leon-2026',
  personnages: [{ cle: 'hugo', nom: 'Hugo Martin', role: 'Dev' }],
  secrets: [],
};
const CONVERSATION = {
  source: { kind: 'claude_code', external_id: 'essai-hugo-1', title: 'Migration' },
  turns: [
    {
      external_id: 't-001',
      role: 'user',
      text: 'Bonjour',
      ts: '2026-09-22T09:00:00+02:00',
      capture_mode: 'file',
    },
  ],
};
const ATTENDU = { faits: [], pasRetenir: [], remplace: [], conflits: [] };

async function writeJson(path: string, value: unknown) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

async function jeuMinimal(options: { sansAttendu?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'essai-'));
  await writeJson(join(dir, 'entreprise.json'), ENTREPRISE);
  await writeJson(join(dir, 'mini.json'), ['hugo/2026-09-22-migration']);
  await writeJson(join(dir, 'conversations/hugo/2026-09-22-migration.json'), CONVERSATION);
  if (!options.sansAttendu)
    await writeJson(join(dir, 'attendu/hugo/2026-09-22-migration.json'), ATTENDU);
  return dir;
}

describe('loadJeu', () => {
  it('lit l entreprise, les conversations avec leur attendu et la liste mini', async () => {
    const jeu = await loadJeu(await jeuMinimal());
    expect(jeu.entreprise.personnages).toHaveLength(1);
    expect(jeu.mini).toEqual(['hugo/2026-09-22-migration']);
    expect(jeu.conversations).toEqual([
      expect.objectContaining({
        cle: 'hugo/2026-09-22-migration',
        personnage: 'hugo',
        payload: expect.objectContaining({ source: CONVERSATION.source }),
        attendu: ATTENDU,
      }),
    ]);
  });

  it('nomme le fichier fautif quand un attendu manque', async () => {
    await expect(loadJeu(await jeuMinimal({ sansAttendu: true }))).rejects.toThrow(
      'attendu/hugo/2026-09-22-migration.json',
    );
  });

  it('nomme le fichier fautif sur un JSON mal formé, sans en répéter le contenu', async () => {
    const dir = await jeuMinimal();
    await writeFile(
      join(dir, 'conversations/hugo/2026-09-22-migration.json'),
      '{"x": "sk-essai-secret',
    );
    const erreur = await loadJeu(dir).catch((e) => e as Error);
    expect(erreur).toBeInstanceOf(Error);
    expect((erreur as Error).message).toContain('conversations/hugo/2026-09-22-migration.json');
    expect((erreur as Error).message).not.toContain('sk-essai');
  });

  it('ignore les fichiers non-JSON (ex. .DS_Store) dans conversations/', async () => {
    const dir = await jeuMinimal();
    await writeFile(join(dir, 'conversations/hugo/.DS_Store'), '');
    const jeu = await loadJeu(dir);
    expect(jeu.conversations).toHaveLength(1);
  });

  it('ignore un fichier à la place d un dossier de personnage dans conversations/', async () => {
    const dir = await jeuMinimal();
    await writeFile(join(dir, 'conversations/.DS_Store'), '');
    const jeu = await loadJeu(dir);
    expect(jeu.conversations).toHaveLength(1);
  });

  it('signale un attendu sans conversation correspondante', async () => {
    const dir = await jeuMinimal();
    await writeJson(join(dir, 'attendu/hugo/2026-09-23-orpheline.json'), ATTENDU);
    await expect(loadJeu(dir)).rejects.toThrow(
      'Attendu sans conversation : attendu/hugo/2026-09-23-orpheline.json',
    );
  });
});
