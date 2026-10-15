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
});
