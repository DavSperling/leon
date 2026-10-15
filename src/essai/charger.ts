import { type IngestPayload, type IngestResult, TURNS_PER_BATCH_MAX } from '@/capture/turn';
import type { ConversationEssai } from './dataset';

const debut = (c: ConversationEssai) => Date.parse(c.payload.turns[0]?.ts ?? '');

// Ordre chronologique global : la mémoire se construit dans l'ordre où l'entreprise a parlé.
export function ordreEnvoi(conversations: ConversationEssai[]): ConversationEssai[] {
  return [...conversations].sort((a, b) => debut(a) - debut(b) || a.cle.localeCompare(b.cle));
}

export function lots(payload: IngestPayload, max = TURNS_PER_BATCH_MAX): IngestPayload[] {
  const result: IngestPayload[] = [];
  for (let i = 0; i < payload.turns.length; i += max)
    result.push({ source: payload.source, turns: payload.turns.slice(i, i + max) });
  return result;
}

export type Bilan = { envois: number; tours: number; inseres: number; runs: number };

// Un envoi à la fois, dans l'ordre : comme la capture, qui envoie au fil des conversations.
export async function envoyer(
  conversations: ConversationEssai[],
  jetons: Map<string, string>,
  send: (token: string, payload: IngestPayload) => Promise<IngestResult>,
  out: (line: string) => void,
): Promise<Bilan> {
  const bilan: Bilan = { envois: 0, tours: 0, inseres: 0, runs: 0 };
  for (const [index, c] of ordreEnvoi(conversations).entries()) {
    const token = jetons.get(c.personnage);
    if (!token) throw new Error(`Aucun jeton pour le personnage ${c.personnage}.`);
    for (const lot of lots(c.payload)) {
      const result = await send(token, lot);
      bilan.envois += 1;
      bilan.tours += lot.turns.length;
      bilan.inseres += result.inserted;
      if (result.ingestRunId) bilan.runs += 1;
    }
    out(`[${index + 1}/${conversations.length}] ${c.cle} (${c.payload.turns.length} tours)`);
  }
  return bilan;
}
