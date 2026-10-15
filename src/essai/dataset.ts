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

// Le message nomme le fichier, jamais son contenu.
async function readJson<T>(dir: string, path: string, schema: z.ZodType<T>): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(join(dir, path), 'utf8');
  } catch {
    throw new Error(`Fichier introuvable : ${path}`);
  }
  const parsed = schema.safeParse(JSON.parse(raw));
  if (!parsed.success)
    throw new Error(`Fichier invalide : ${path} (${parsed.error.issues[0]?.path.join('.')})`);
  return parsed.data;
}

export async function loadJeu(dir = ESSAI_DIR): Promise<JeuEssai> {
  const entreprise = await readJson(dir, 'entreprise.json', EntrepriseSchema);
  const mini = await readJson(dir, 'mini.json', MiniSchema);
  const conversations: ConversationEssai[] = [];
  for (const personnage of (await readdir(join(dir, 'conversations'))).sort()) {
    const files = (await readdir(join(dir, 'conversations', personnage))).filter((f) =>
      f.endsWith('.json'),
    );
    for (const file of files.sort()) {
      const cle = `${personnage}/${file.slice(0, -'.json'.length)}`;
      conversations.push({
        cle,
        personnage,
        payload: await readJson(dir, `conversations/${cle}.json`, IngestPayloadSchema),
        attendu: await readJson(dir, `attendu/${cle}.json`, AttenduSchema),
      });
    }
  }
  return { entreprise, conversations, mini };
}

export const toursDe = (conversations: ConversationEssai[]) =>
  conversations.reduce((sum, c) => sum + c.payload.turns.length, 0);
