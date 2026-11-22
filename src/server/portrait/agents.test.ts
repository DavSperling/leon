import { describe, expect, it } from 'vitest';
import type { ProviderId } from '@/capture/turn';
import { AGENTS, proposeAgents } from './agents';
import type { FicheLine } from './fiche';

// La règle qui propose les agents de départ : une fonction pure des outils que la personne a branchés elle-même et des
// lignes de sa fiche. Données inventées.

let next = 0;
const line = (genre: FicheLine['genre'], valeur: FicheLine['valeur']): FicheLine => ({
  id: `${String(++next).padStart(8, '0')}-1111-4111-8111-111111111111`,
  genre,
  cle: '',
  valeur,
  provenance: genre === 'role' ? 'synthese' : 'calcul',
  mails: genre === 'role' ? null : 40,
  corrigeeLe: null,
});

const delai = (reponses: number) => {
  const side = { medianeMinutes: reponses > 0 ? 42 : null, reponses };
  return line('delai-reponse', { tous: side, interne: side, externe: side });
};
const rythme = (mailsParSemaine: number) => line('rythme', { mailsParSemaine });
const ROLE = line('role', { texte: 'Commerciale.' });
// Une fiche qui montre qu'elle envoie des mails et qu'elle y répond.
const FICHE = [ROLE, rythme(12), delai(3)];

const RECORDERS = [
  'granola',
  'fathom',
  'fireflies',
  'tldv',
  'circleback',
  'claap',
  'leexi',
  'gong',
] as const;
const ALL_TOOLS: ProviderId[] = ['gmail', 'outlook', 'fathom'];

describe('proposeAgents : la règle commune', () => {
  it('sans fiche, aucune proposition, quels que soient ses outils', () => {
    expect(proposeAgents(ALL_TOOLS, [])).toEqual([]);
  });

  it('sans outil branché par elle, aucune proposition, même avec une fiche', () => {
    expect(proposeAgents([], FICHE)).toEqual([]);
  });

  it('un outil qui n’est ni une boîte, ni un enregistreur, ni un agenda ne propose rien', () => {
    expect(proposeAgents(['notion', 'hubspot', 'slack', 'drive'], FICHE)).toEqual([]);
  });

  it('avec tout ce qu’il faut, les cinq agents, dans l’ordre du catalogue', () => {
    expect(proposeAgents(ALL_TOOLS, FICHE)).toEqual([
      'suite-reunion',
      'brouillon-reponse',
      'brief-rendez-vous',
      'relance',
      'point-du-jour',
    ]);
    expect(proposeAgents(ALL_TOOLS, FICHE)).toEqual([...AGENTS]);
  });

  it('l’ordre est celui du catalogue, pas celui des outils ni des lignes', () => {
    expect(proposeAgents([...ALL_TOOLS].reverse(), [...FICHE].reverse())).toEqual([...AGENTS]);
  });
});

describe('proposeAgents : chaque agent et ses conditions', () => {
  it.each(RECORDERS)('suite-reunion : proposé avec l’enregistreur %s, sans boîte', (recorder) => {
    expect(proposeAgents([recorder], FICHE)).toEqual(['suite-reunion']);
  });

  it('suite-reunion : pas sans enregistreur', () => {
    expect(proposeAgents(['gmail', 'outlook'], FICHE)).not.toContain('suite-reunion');
  });

  it.each(['gmail', 'outlook'] as const)(
    'brouillon-reponse : proposé avec sa boîte %s et une fiche qui compte au moins une réponse',
    (mailbox) => {
      expect(proposeAgents([mailbox], [ROLE, delai(1)])).toContain('brouillon-reponse');
    },
  );

  it('brouillon-reponse : pas sans boîte, pas sans la ligne, pas avec zéro réponse', () => {
    expect(proposeAgents(['fathom'], FICHE)).not.toContain('brouillon-reponse');
    expect(proposeAgents(['gmail'], [ROLE, rythme(12)])).not.toContain('brouillon-reponse');
    expect(proposeAgents(['gmail'], [ROLE, delai(0)])).not.toContain('brouillon-reponse');
  });

  it('brief-rendez-vous : proposé avec Outlook seulement, le seul agenda lu', () => {
    expect(proposeAgents(['outlook'], [ROLE])).toContain('brief-rendez-vous');
    expect(proposeAgents(['gmail', 'fathom'], FICHE)).not.toContain('brief-rendez-vous');
  });

  it.each(['gmail', 'outlook'] as const)(
    'relance : proposé avec sa boîte %s et une fiche qui montre des mails envoyés',
    (mailbox) => {
      expect(proposeAgents([mailbox], [ROLE, rythme(0.5)])).toContain('relance');
    },
  );

  it('relance : pas sans boîte, pas sans la ligne, pas avec zéro mail par semaine', () => {
    expect(proposeAgents(['fathom'], FICHE)).not.toContain('relance');
    expect(proposeAgents(['gmail'], [ROLE, delai(3)])).not.toContain('relance');
    expect(proposeAgents(['gmail'], [ROLE, rythme(0)])).not.toContain('relance');
  });

  it.each(['gmail', 'outlook'] as const)(
    'point-du-jour : proposé avec sa boîte %s et une fiche, quelle qu’elle soit',
    (mailbox) => {
      expect(proposeAgents([mailbox], [ROLE])).toContain('point-du-jour');
    },
  );

  it('point-du-jour : pas sans boîte', () => {
    expect(proposeAgents(['fathom', 'notion'], FICHE)).not.toContain('point-du-jour');
  });

  it('une boîte Gmail et une fiche sans mesure : le point du jour seul', () => {
    expect(proposeAgents(['gmail'], [ROLE])).toEqual(['point-du-jour']);
  });
});
