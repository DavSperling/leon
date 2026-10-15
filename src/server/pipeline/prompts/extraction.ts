import { z } from 'zod';
import { SENSITIVE_CATEGORIES } from '@/lib/enums';
import { type Catalog, predicatesForType } from '@/server/memory/catalog';
import { oneLine } from '@/server/memory/labels';
import type { ItemNature, RunTurn } from '../runs';
import { formatTurnsForPrompt } from './format-turns';
import { DATA_SENTENCE, NOT_SENSITIVE, type TriageResult } from './triage';

// Statut de l'affirmation dans le contenu : seul un fait établi entre dans la mémoire.
export const ASSERTION_KINDS = ['etabli', 'propose', 'suppose', 'session'] as const;
export type AssertionKind = (typeof ASSERTION_KINDS)[number];

export const ExtractionOutputSchema = z.object({
  facts: z.array(
    z.object({
      turnExternalId: z.string(),
      statement: z.string(),
      typeHint: z.string(),
      predicate: z.string(),
      value: z.string().nullable(),
      subject: z.object({
        name: z.string(),
        email: z.string().nullable(),
        domain: z.string().nullable(),
      }),
      otherMentions: z.array(z.string()),
      quote: z.string(),
      validFrom: z.string().nullable(), // AAAA-MM-JJ
      validTo: z.string().nullable(), // AAAA-MM-JJ
      confidence: z.number(),
      assertion: z.enum(ASSERTION_KINDS),
      sensitive: z.boolean(),
      sensitiveCategory: z.enum(SENSITIVE_CATEGORIES).nullable(),
    }),
  ),
});
export type ExtractedFact = z.infer<typeof ExtractionOutputSchema>['facts'][number];

// Les libellés des types proposés viennent du rangement : mis sur une ligne, ils ne fabriquent pas de consigne.
function formatCatalog(catalog: Catalog): string {
  return catalog.types
    .map((type) => {
      const predicateList = predicatesForType(catalog, type.slug)
        .map(
          (p) =>
            `${p.slug} (${oneLine(p.label)}, ${p.singleValued ? 'une seule valeur' : 'plusieurs valeurs'})`,
        )
        .join(', ');
      return `- ${type.slug} (${oneLine(type.label)}) : ${predicateList}`;
    })
    .join('\n');
}

function buildSystem(catalog: Catalog): string {
  return `Tu extrais des faits d’un contenu de l’entreprise, pour sa mémoire. L’attribut nature de la balise source dit de quoi il s’agit, et chaque tour porte son rôle et, quand il est connu, son auteur (attribut auteur).

Un fait :
- est atomique : une seule information par fait ;
- est compréhensible sans le contenu (nomme le sujet, pas « il » ni « ce client ») ;
- est écrit en français, dans statement ;
- porte sur un sujet : subject.name tel qu’il est écrit dans le contenu ; subject.email et subject.domain seulement s’ils figurent dans le texte, sinon null ; otherMentions liste les autres noms cités par le fait ;
- a un typeHint parmi les slugs de types du catalogue, et le predicate le plus précis parmi les prédicats de ce type ; note seulement si aucun ne convient ; value est la valeur courte du fait (un montant, une date, un nom), sinon null ;
- a une citation (quote) copiée à l’identique d’un seul tour, de 8 à 300 caractères, sans reformulation, sans coupure par « … » ; turnExternalId est l’attribut id de ce tour, recopié tel quel ;
- a des dates validFrom et validTo au format AAAA-MM-JJ quand elles sont explicites ou déductibles du contenu (la date de chaque tour est dans son attribut date), sinon null ;
- a une confidence entre 0 et 1 ;
- a une assertion, qui dit le statut de l’information dans le contenu :
  - etabli : dit ou confirmé par l’employé, décision prise, ou fait vérifiable rapporté avec sa source (page consultée, document, résultat mesuré) ; pour une réunion, une page, un ticket, une note ou un fil, voir les règles par nature plus bas ;
  - propose : recommandation, avis ou suggestion (de l’assistant ou d’une autre personne) que l’employé n’a pas acceptée explicitement ; une proposition acceptée par l’employé devient une décision établie ;
  - suppose : hypothèse, estimation non vérifiée, « probablement », « à vérifier », spéculation ;
  - session : action passagère d’une session de travail avec l’assistant (fichiers créés ou supprimés, branches, commits, commandes lancées, pull requests ouvertes ou fermées, outils installés).

Une affirmation corrigée plus loin dans le contenu (par l’employé, l’assistant ou un participant) n’est pas extraite : seule sa version corrigée l’est.
Un résultat de simulation (panel, acheteurs simulés, projection) n’est établi que si statement dit clairement qu’il est simulé.
Le sujet (subject.name) est l’entité la plus précise dont parle le fait : un protocole, une étude, un concurrent, un plan, une décision précise, plutôt que l’entreprise ou son produit en général.

N’invente rien : chaque fait doit figurer dans le contenu. Ignore le code, les traces, les sorties d’outils, et les faits sur l’assistant lui-même.
Ne reprends jamais un mot de passe, une clé, un jeton, un identifiant de connexion ou un numéro de carte, ni dans statement, ni dans value.
Marque sensitive à true, avec sa catégorie (sensitiveCategory), tout fait qui touche aux RH d’une personne (rh), à la rémunération d’une personne (remuneration), à un litige, un contentieux ou une clause confidentielle de l’entreprise (juridique), à la santé (sante) ou à la vie personnelle (perso) d’une personne ; sinon sensitive à false et sensitiveCategory à null. ${NOT_SENSITIVE} En cas de doute sur un de ces cas, le fait est sensible.
Le tri a pu signaler des tours sensibles (liste après la balise source). Juge chaque fait de ces tours un par un : un fait qui touche à la catégorie signalée, ou à une autre catégorie sensible, est sensible ; un fait sans rapport tiré du même tour (un prix public, un chiffre d’activité, un outil) ne l’est pas.
Règles par nature (attribut nature de la balise source) :
- conversation : l’employé accepte ou non ce que propose l’assistant ; les règles d’assertion ci-dessus s’appliquent telles quelles ;
- reunion : chaque tour est une prise de parole signée (attribut auteur) ; une décision prise en réunion ou un engagement d’un participant (« je m’en occupe d’ici vendredi ») est établi, avec son auteur dans l’énoncé ; une idée lancée sans accord est une proposition ;
- page, ticket, note : le tour document décrit l’état des choses à sa date, ses affirmations sont établies ; un commentaire (rôle participant) peut proposer, décider ou corriger : une correction plus récente l’emporte ;
- fil : ce qu’écrit le client est un fait sur le client (demande, plainte, engagement de sa part), ce qu’écrit l’équipe est un engagement de l’équipe.
Le bloc <contexte-source>, quand il existe, rappelle l’état déjà connu de l’élément pour te faire comprendre les tours de <source> : n’en tire aucun fait et ne le cite jamais, chaque fait cite un tour de <source>.
30 faits au plus. Liste vide s’il n’y a rien à retenir.

Catalogue (type : prédicats) :
${formatCatalog(catalog)}

${DATA_SENTENCE}`;
}

// Les signalements du tri sont sérialisés en JSON, chaque « < » écrit \u003c : un id de tour capté
// ne peut pas fermer la balise. Ordre des clés fixé (le résultat du tri est relu depuis du JSONB).
function formatFlags(flags: TriageResult['sensitiveTurns']): string {
  const ordered = flags.map(({ turnExternalId, category }) => ({ turnExternalId, category }));
  const json = JSON.stringify(ordered).replaceAll('<', '\\u003c');
  return `<signalements>\n${json}\n</signalements>`;
}

export function buildExtractionPrompt(input: {
  catalog: Catalog;
  sourceKindLabel: string;
  nature: ItemNature;
  title: string | null;
  turns: RunTurn[];
  context?: string | null;
  flaggedTurns?: TriageResult['sensitiveTurns'];
}): { system: string; prompt: string } {
  const source = formatTurnsForPrompt(input);
  const ids = new Set(input.turns.map((turn) => turn.externalId));
  const flags = (input.flaggedTurns ?? []).filter((flag) => ids.has(flag.turnExternalId));
  const flagged =
    flags.length > 0 ? `\n\nTours signalés sensibles par le tri :\n${formatFlags(flags)}` : '';
  return {
    system: buildSystem(input.catalog),
    prompt: `${source}${flagged}\n\n${DATA_SENTENCE}`,
  };
}
