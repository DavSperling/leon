import { describe, expect, it } from 'vitest';
import { computeFacts, type SentMail } from './facts';
import { type ComputedLine, factsToLines, parseValeur } from './lines';

// Mails inventés pour ces tests : Julie (acme.test) écrit à des collègues et à des clients qui n'existent pas.

const OPTIONS = { domains: ['acme.test'], timeZone: 'Europe/Paris' };

// Un mail du mardi 10 novembre 2026 à 10 h, heure de Paris, à un collègue.
function sent(mail: Partial<Omit<SentMail, 'sentAt'>> & { sentAt?: string } = {}): SentMail {
  return {
    to: ['paul@acme.test'],
    cc: [],
    text: 'Salut Paul,\nPeux-tu relire le devis ?\nMerci',
    repliesToAt: null,
    ...mail,
    sentAt: new Date(mail.sentAt ?? '2026-11-10T09:00:00Z'),
  };
}

const lines = (mails: SentMail[], options = OPTIONS) => factsToLines(computeFacts(mails, options));
const keys = (list: ComputedLine[]) => list.map((line) => `${line.genre}:${line.cle}`).sort();
const line = (list: ComputedLine[], genre: string, cle = '') =>
  list.find((one) => one.genre === genre && one.cle === cle);

// Deux mails à Paul, un collègue qu'elle tutoie, puis une réponse en 42 minutes à Léa, une cliente qu'elle vouvoie.
const THREE = [
  sent({ sentAt: '2026-11-02T09:00:00Z' }),
  sent({ text: 'Salut Paul,\nTu as le contrat ?\nMerci' }),
  sent({
    sentAt: '2026-11-16T09:00:00Z',
    to: ['lea@client.test'],
    text: 'Bonjour Léa,\nVoici votre devis.\nCordialement\n-- \nJulie Martin',
    repliesToAt: new Date('2026-11-16T08:18:00Z'),
  }),
];

describe('factsToLines', () => {
  it('ne donne aucune ligne sans aucun mail', () => {
    expect(lines([])).toEqual([]);
  });

  it('donne une ligne par interlocuteur, par fait de style et type de destinataire, et une pour chaque autre fait', () => {
    const result = lines(THREE);
    expect(keys(result)).toEqual([
      'appels:externe',
      'appels:interne',
      'appels:tous',
      'delai-reponse:',
      'horaires:',
      'interlocuteur:lea@client.test',
      'interlocuteur:paul@acme.test',
      'langues:',
      'mots:externe',
      'mots:interne',
      'mots:tous',
      'politesses:externe',
      'politesses:interne',
      'politesses:tous',
      'registre:externe',
      'registre:interne',
      'registre:tous',
      'rythme:',
      'signature:',
    ]);
    // La valeur est celle de computeFacts, et chaque ligne dit sur combien de mails elle repose.
    expect(line(result, 'interlocuteur', 'paul@acme.test')).toEqual({
      genre: 'interlocuteur',
      cle: 'paul@acme.test',
      valeur: {
        a: 2,
        copie: 0,
        dernier: '2026-11-10T09:00:00.000Z',
        type: 'interne',
        registre: 'tutoiement',
        tutoiement: 2,
        vouvoiement: 0,
      },
      mails: 2,
    });
    expect(line(result, 'mots', 'externe')).toMatchObject({ valeur: { mediane: 6 }, mails: 1 });
    expect(line(result, 'appels', 'tous')).toMatchObject({
      valeur: {
        formules: [
          { formule: 'Salut', mails: 2 },
          { formule: 'Bonjour', mails: 1 },
        ],
      },
      mails: 3,
    });
    expect(line(result, 'politesses', 'interne')).toMatchObject({
      valeur: { formules: [{ formule: 'Merci', mails: 2 }] },
      mails: 2,
    });
    expect(line(result, 'registre', 'externe')).toMatchObject({
      valeur: { tutoiement: 0, vouvoiement: 1 },
      mails: 1,
    });
    expect(line(result, 'rythme')).toMatchObject({ valeur: { mailsParSemaine: 1.5 }, mails: 3 });
    expect(line(result, 'langues')).toMatchObject({
      valeur: { fr: 3, en: 0, autre: 0, inconnue: 0 },
      mails: 3,
    });
    expect(line(result, 'delai-reponse')).toMatchObject({
      valeur: {
        tous: { medianeMinutes: 42, reponses: 1 },
        interne: { medianeMinutes: null, reponses: 0 },
        externe: { medianeMinutes: 42, reponses: 1 },
      },
      mails: 1,
    });
    expect(line(result, 'horaires')).toMatchObject({
      valeur: { jours: [2, 1, 0, 0, 0, 0, 0] },
      mails: 3,
    });
    expect(line(result, 'signature')).toMatchObject({
      valeur: { texte: 'Julie Martin' },
      mails: 1,
    });
  });

  it("sans domaine de société, ne donne le style que pour tous ses mails, et aucun type à l'interlocuteur", () => {
    const result = lines(THREE, { ...OPTIONS, domains: [] });
    expect(keys(result).filter((key) => /^(mots|appels|politesses|registre):/.test(key))).toEqual([
      'appels:tous',
      'mots:tous',
      'politesses:tous',
      'registre:tous',
    ]);
    expect(line(result, 'interlocuteur', 'paul@acme.test')?.valeur).toMatchObject({ type: null });
    expect(line(result, 'interlocuteur', 'lea@client.test')?.valeur).toMatchObject({ type: null });
  });

  it('garde la ligne d’un interlocuteur sans registre, pour que la personne puisse le dire', () => {
    // À deux destinataires, un « vous » peut être un pluriel : le registre ne se lit pour aucun.
    const result = lines([sent({ to: ['paul@acme.test', 'noa@acme.test'] })]);
    expect(line(result, 'interlocuteur', 'noa@acme.test')).toMatchObject({
      valeur: { a: 1, registre: null, tutoiement: 0, vouvoiement: 0 },
      mails: 1,
    });
    expect(line(result, 'interlocuteur', 'paul@acme.test')?.valeur).toMatchObject({
      registre: null,
    });
  });

  it('ne donne pas de ligne pour un fait nul ou vide', () => {
    // Un seul mail, sans formule ni signature, qui ne répond à rien : ni rythme, ni délai, ni registre à plusieurs.
    const result = lines([
      sent({ to: ['paul@acme.test', 'noa@acme.test'], text: 'Voici le devis du client.' }),
    ]);
    expect(keys(result)).toEqual([
      'horaires:',
      'interlocuteur:noa@acme.test',
      'interlocuteur:paul@acme.test',
      'langues:',
      'mots:interne',
      'mots:tous',
    ]);
  });

  it('ne donne pas de ligne pour une valeur hors de la forme de son genre, et garde les autres', () => {
    const result = lines([sent({ text: `Salut Paul,\nMerci\n-- \n${'x'.repeat(2001)}` })]);
    expect(line(result, 'signature')).toBeUndefined();
    expect(line(result, 'langues')).toBeDefined();
  });
});

describe('parseValeur', () => {
  const paul = {
    a: 2,
    copie: 0,
    dernier: '2026-11-10T09:00:00.000Z',
    type: 'interne',
    registre: 'tutoiement',
    tutoiement: 2,
    vouvoiement: 0,
  };

  it('rend la valeur qui a la forme de son genre', () => {
    expect(parseValeur('interlocuteur', paul)).toEqual(paul);
    expect(parseValeur('signature', { texte: 'Julie Martin' })).toEqual({ texte: 'Julie Martin' });
  });

  it("refuse la forme d'un autre genre, une valeur hors liste, un champ manquant ou de trop", () => {
    expect(parseValeur('signature', paul)).toBeNull();
    expect(parseValeur('interlocuteur', { ...paul, registre: 'familier' })).toBeNull();
    expect(parseValeur('interlocuteur', { ...paul, dernier: 'hier' })).toBeNull();
    expect(parseValeur('interlocuteur', { ...paul, a: undefined })).toBeNull();
    expect(parseValeur('signature', { texte: 'Julie Martin', note: 'en trop' })).toBeNull();
    expect(parseValeur('signature', { texte: '' })).toBeNull();
    expect(parseValeur('horaires', { heures: [1, 2], jours: [0, 0, 0, 0, 0, 0, 0] })).toBeNull();
    expect(parseValeur('registre', { tutoiement: 2, vouvoiement: 0 })).toBeNull();
    expect(parseValeur('rythme', null)).toBeNull();
  });
});

describe('parseValeur, pour le rôle et les tâches qu’écrit un modèle', () => {
  const SOURCE = '00000000-0000-4000-8000-000000000001';
  const tache = {
    titre: 'Répondre aux demandes de devis',
    detail: 'Un client demande un prix ; elle répond par mail.',
    sources: [SOURCE],
  };

  it('rend un rôle de 1 à 300 caractères', () => {
    const role = { texte: 'Commerciale : suit les clients et prépare les devis.' };
    expect(parseValeur('role', role)).toEqual(role);
    expect(parseValeur('role', { texte: 'x'.repeat(300) })).not.toBeNull();
    expect(parseValeur('role', { texte: '' })).toBeNull();
    expect(parseValeur('role', { texte: 'x'.repeat(301) })).toBeNull();
    expect(parseValeur('role', tache)).toBeNull();
  });

  it('rend une tâche : un titre de 1 à 80 caractères, un détail de 300 au plus, 20 sources au plus', () => {
    expect(parseValeur('tache', tache)).toEqual(tache);
    // Le détail et les sources peuvent être vides : la personne peut les retirer en corrigeant la ligne.
    expect(parseValeur('tache', { ...tache, detail: '', sources: [] })).not.toBeNull();
    expect(
      parseValeur('tache', { ...tache, sources: Array.from({ length: 20 }, () => SOURCE) }),
    ).not.toBeNull();

    expect(parseValeur('tache', { ...tache, titre: '' })).toBeNull();
    expect(parseValeur('tache', { ...tache, titre: 'x'.repeat(81) })).toBeNull();
    expect(parseValeur('tache', { ...tache, detail: 'x'.repeat(301) })).toBeNull();
    expect(parseValeur('tache', { ...tache, detail: undefined })).toBeNull();
    expect(
      parseValeur('tache', { ...tache, sources: Array.from({ length: 21 }, () => SOURCE) }),
    ).toBeNull();
    expect(parseValeur('tache', { ...tache, sources: ['pas-un-id'] })).toBeNull();
    expect(parseValeur('tache', { ...tache, rang: 1 })).toBeNull();
  });
});
