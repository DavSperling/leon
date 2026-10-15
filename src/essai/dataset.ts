import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import { type IngestPayload, IngestPayloadSchema } from '@/capture/turn';
import {
  type Attendu,
  AttenduSchema,
  type Entreprise,
  EntrepriseSchema,
  MiniSchema,
} from './schema';

export const ESSAI_DIR = fileURLToPath(new URL('../../essai', import.meta.url));

export type ConversationEssai = {
  cle: string; // « hugo/2026-09-22-migration »
  personnage: string;
  payload: IngestPayload; // charge utile exacte de POST /api/v1/ingest
  attendu: Attendu;
};

export type JeuEssai = {
  entreprise: Entreprise;
  conversations: ConversationEssai[];
  mini: string[];
};

// Le message nomme le fichier, jamais son contenu : ni la cause brute de readFile (le chemin
// absolu du système), ni celle de JSON.parse (qui cite parfois un extrait du texte fautif).
async function readJson<T>(dir: string, path: string, schema: z.ZodType<T>): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(join(dir, path), 'utf8');
  } catch (error) {
    const code = (error as { code?: string }).code;
    throw new Error(
      code === 'ENOENT' ? `Fichier introuvable : ${path}` : `Fichier illisible : ${path}`,
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`JSON mal formé : ${path}`);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new Error(`Fichier invalide : ${path} (${parsed.error.issues[0]?.path.join('.')})`);
  return parsed.data;
}

// Dossiers uniquement (un fichier comme .DS_Store à ce niveau est ignoré).
async function sousDossiers(dir: string): Promise<string[]> {
  const entrees = await readdir(dir, { withFileTypes: true });
  return entrees
    .filter((e: Dirent) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

// Fichiers .json uniquement (un fichier comme .DS_Store à côté des conversations est ignoré).
async function fichiersJson(dir: string): Promise<string[]> {
  const entrees = await readdir(dir, { withFileTypes: true });
  return entrees
    .filter((e: Dirent) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => e.name)
    .sort();
}

export async function loadJeu(dir = ESSAI_DIR): Promise<JeuEssai> {
  const entreprise = await readJson(dir, 'entreprise.json', EntrepriseSchema);
  const mini = await readJson(dir, 'mini.json', MiniSchema);
  const conversations: ConversationEssai[] = [];
  const cles = new Set<string>();
  for (const personnage of await sousDossiers(join(dir, 'conversations'))) {
    for (const file of await fichiersJson(join(dir, 'conversations', personnage))) {
      const cle = `${personnage}/${file.slice(0, -'.json'.length)}`;
      cles.add(cle);
      conversations.push({
        cle,
        personnage,
        payload: await readJson(dir, `conversations/${cle}.json`, IngestPayloadSchema),
        attendu: await readJson(dir, `attendu/${cle}.json`, AttenduSchema),
      });
    }
  }
  // Un attendu sans conversation ne serait jamais lu ni vérifié : une faute de frappe le rendrait muet.
  for (const personnage of await sousDossiers(join(dir, 'attendu'))) {
    for (const file of await fichiersJson(join(dir, 'attendu', personnage))) {
      const cle = `${personnage}/${file.slice(0, -'.json'.length)}`;
      if (!cles.has(cle)) throw new Error(`Attendu sans conversation : attendu/${cle}.json`);
    }
  }
  return { entreprise, conversations, mini };
}

export const toursDe = (conversations: ConversationEssai[]) =>
  conversations.reduce((sum, c) => sum + c.payload.turns.length, 0);
