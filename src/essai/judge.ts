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
Un P dont le chiffre, le montant, la date ou le nom contredit un F ne correspond pas à ce F ; si plusieurs F portent sur le même sujet, choisis celui qui porte la même valeur.
Un P vague, qui n'apporte pas l'information clé du F (valeur, date, nom), ne correspond pas à ce F.
Le « tour » donné pour chaque F, N et P aide à départager une version ancienne d'une version récente du même sujet.
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

// Au-delà, le prompt grossirait trop : on juge par lots, chaque lot voyant les listes de référence en entier.
const TAILLE_LOT = 80;

function decouper<T>(items: T[], taille: number): T[][] {
  const lots: T[][] = [];
  for (let i = 0; i < items.length; i += taille) lots.push(items.slice(i, i + taille));
  return lots;
}

// Paires « identifiant du fait produit → F…, N… ou null » pour une conversation.
export async function juger(
  llm: Llm,
  conversation: ConversationEssai,
  produits: FaitProduit[],
  onUsage?: (usage: LlmUsage) => Promise<void>,
): Promise<Map<string, string | null>> {
  if (produits.length === 0) return new Map();
  const resultat = new Map<string, string | null>();
  for (const lot of decouper(produits, TAILLE_LOT))
    for (const [id, correspond] of await jugerLot(llm, conversation, lot, onUsage))
      resultat.set(id, correspond);
  return resultat;
}

async function jugerLot(
  llm: Llm,
  conversation: ConversationEssai,
  produits: FaitProduit[],
  onUsage?: (usage: LlmUsage) => Promise<void>,
): Promise<Map<string, string | null>> {
  const locaux = produits.map((f, i) => ({ local: `P${i + 1}`, fait: f }));
  const prompt = JSON.stringify(
    {
      attendus: conversation.attendu.faits.map((f) => ({
        id: f.id,
        enonce: f.enonce,
        fiche: f.fiche,
        tour: f.tour,
      })),
      aNePasRetenir: conversation.attendu.pasRetenir.map((n) => ({
        id: n.id,
        enonce: n.enonce,
        tour: n.tour,
      })),
      produits: locaux.map(({ local, fait }) => ({
        id: local,
        enonce: fait.statement,
        tour: fait.turnExternalId,
      })),
    },
    null,
    2,
  );
  // Un prompt qui grandit avec le lot a besoin de plus de place pour la réponse, dans une limite raisonnable.
  const maxTokens = Math.min(16_000, 1_000 + 40 * produits.length);
  const output = await llm.generateObject({
    step: 'juge',
    system: SYSTEM,
    prompt,
    schema: JugeOutputSchema,
    maxTokens,
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
