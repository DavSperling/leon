import { z } from 'zod';
import type { Llm, LlmUsage } from '@/server/llm/llm';
import type { FaitProduit } from './collect';
import type { ConversationEssai } from './dataset';

export const JugeOutputSchema = z.object({
  paires: z.array(z.object({ produit: z.string(), correspond: z.string().nullable() })),
});
type JugeOutput = z.infer<typeof JugeOutputSchema>;

const SYSTEM = `Tu compares des faits extraits automatiquement d'une conversation (identifiants P…) à une liste de référence : les faits attendus (F…) et les faits qu'il ne fallait pas retenir (N…).
Pour chaque fait P, donne l'identifiant F ou N qui porte la même information sur le même sujet, même formulée autrement ou de façon partielle ; null si aucun ne correspond.
Plusieurs P peuvent viser le même F. N'invente aucun identifiant. Réponds pour chaque P, une seule fois.`;

// Un identifiant inventé ou un P oublié vaut « aucune correspondance » : jamais de paire hors des listes.
export function validerPaires(
  output: JugeOutput,
  produits: string[],
  attendus: string[],
): Map<string, string | null> {
  const connus = new Set(attendus);
  const donnees = new Map<string, string | null>();
  for (const { produit, correspond } of output.paires)
    if (!donnees.has(produit))
      donnees.set(produit, correspond !== null && connus.has(correspond) ? correspond : null);
  return new Map(produits.map((id) => [id, donnees.get(id) ?? null]));
}

// Paires « identifiant du fait produit → F…, N… ou null » pour une conversation.
export async function juger(
  llm: Llm,
  conversation: ConversationEssai,
  produits: FaitProduit[],
  onUsage?: (usage: LlmUsage) => Promise<void>,
): Promise<Map<string, string | null>> {
  if (produits.length === 0) return new Map();
  const locaux = produits.map((f, i) => ({ local: `P${i + 1}`, fait: f }));
  const prompt = JSON.stringify(
    {
      attendus: conversation.attendu.faits.map((f) => ({
        id: f.id,
        enonce: f.enonce,
        fiche: f.fiche,
      })),
      aNePasRetenir: conversation.attendu.pasRetenir.map((n) => ({ id: n.id, enonce: n.enonce })),
      produits: locaux.map(({ local, fait }) => ({
        id: local,
        enonce: fait.statement,
        fiche: fait.ficheTitre,
      })),
    },
    null,
    2,
  );
  const output = await llm.generateObject({
    step: 'juge',
    system: SYSTEM,
    prompt,
    schema: JugeOutputSchema,
    maxTokens: 4_000,
    onUsage,
  });
  const attendus = [
    ...conversation.attendu.faits.map((f) => f.id),
    ...conversation.attendu.pasRetenir.map((n) => n.id),
  ];
  const paires = validerPaires(
    output,
    locaux.map((l) => l.local),
    attendus,
  );
  return new Map(locaux.map(({ local, fait }) => [fait.id, paires.get(local) ?? null]));
}
