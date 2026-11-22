import { z } from 'zod';
import type { lignesFiche } from '@/server/db/schema/portrait';
import type { PortraitFacts } from './facts';

// Des faits (facts.ts) aux lignes de la fiche (0076) : une ligne par chose que la personne peut corriger ou retirer
// seule. Une fonction pure, comme computeFacts. La forme de la valeur de chaque genre est ici : celle que rend
// computeFacts, validée à chaque écriture et à chaque lecture (fiche.ts).

export type Genre = (typeof lignesFiche.$inferSelect)['genre'];

const count = z.number().int().nonnegative();
const part = z.number().min(0).max(1);
const formules = z.strictObject({
  formules: z
    .array(z.strictObject({ formule: z.string().min(1).max(100), mails: count }))
    .min(1)
    .max(10),
});
const delai = z.strictObject({
  medianeMinutes: z.number().nonnegative().nullable(),
  reponses: count,
});

const VALEURS = {
  // Clé : son adresse. `a`, `copie` : les mails où elle est en « à », ou seulement en copie.
  interlocuteur: z.strictObject({
    a: count,
    copie: count,
    dernier: z.iso.datetime(),
    type: z.enum(['interne', 'externe']).nullable(),
    registre: z.enum(['tutoiement', 'vouvoiement']).nullable(),
    tutoiement: count,
    vouvoiement: count,
  }),
  // Les faits de style. Clé : le type de destinataire, « tous », « interne » ou « externe ».
  mots: z.strictObject({ mediane: z.number().nonnegative() }),
  appels: formules,
  politesses: formules,
  registre: z.strictObject({ tutoiement: part, vouvoiement: part }),
  // Une ligne chacun, sans clé.
  rythme: z.strictObject({ mailsParSemaine: z.number().nonnegative() }),
  langues: z.strictObject({ fr: count, en: count, autre: count, inconnue: count }),
  'delai-reponse': z.strictObject({ tous: delai, interne: delai, externe: delai }),
  horaires: z.strictObject({ heures: z.array(count).length(24), jours: z.array(count).length(7) }),
  signature: z.strictObject({ texte: z.string().min(1).max(2000) }),
} satisfies Record<Genre, z.ZodType>;

export type LineValue = z.infer<(typeof VALEURS)[Genre]>;

// La valeur dans la forme de son genre, ou null.
export function parseValeur(genre: Genre, valeur: unknown): LineValue | null {
  const parsed = VALEURS[genre].safeParse(valeur);
  return parsed.success ? parsed.data : null;
}

// `mails` : le nombre de mails sur lequel la ligne repose.
export type ComputedLine = { genre: Genre; cle: string; valeur: LineValue; mails: number };

const SIDES = ['tous', 'interne', 'externe'] as const;

// Un fait nul ou vide ne donne pas de ligne, une valeur hors de la forme de son genre non plus (une signature de plus
// de 2 000 caractères) : le reste de la fiche s'écrit quand même.
export function factsToLines(facts: PortraitFacts): ComputedLine[] {
  const lines: ComputedLine[] = [];
  const add = (genre: Genre, cle: string, valeur: unknown, mails: number) => {
    const valid = parseValeur(genre, valeur);
    if (valid) lines.push({ genre, cle, valeur: valid, mails });
  };

  for (const { adresse, ...valeur } of facts.interlocuteurs)
    add('interlocuteur', adresse, valeur, valeur.a + valeur.copie);
  for (const side of SIDES) {
    const style = facts.style[side];
    if (style.mots.mediane !== null)
      add('mots', side, { mediane: style.mots.mediane }, style.mots.mails);
    if (style.appels.length > 0) add('appels', side, { formules: style.appels }, style.mails);
    if (style.politesses.length > 0)
      add('politesses', side, { formules: style.politesses }, style.mails);
    if (style.registre.mails > 0) {
      const { mails, ...parts } = style.registre;
      add('registre', side, parts, mails);
    }
  }
  if (facts.mailsParSemaine !== null)
    add('rythme', '', { mailsParSemaine: facts.mailsParSemaine }, facts.mails);
  if (facts.mails > 0) {
    add('langues', '', facts.langues, facts.mails);
    add('horaires', '', { heures: facts.heures, jours: facts.jours }, facts.mails);
  }
  if (facts.delaiReponse.tous.medianeMinutes !== null)
    add('delai-reponse', '', facts.delaiReponse, facts.delaiReponse.tous.reponses);
  if (facts.signature)
    add('signature', '', { texte: facts.signature.texte }, facts.signature.mails);
  return lines;
}
