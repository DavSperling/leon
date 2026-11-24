import { describe, expect, it } from 'vitest';
import type {
  HomeBrouillon,
  HomeDemande,
  HomeInconnu,
  HomePreference,
  HomeRelance,
} from '@/server/portrait/screen';
import {
  CLOSED,
  confirmsDiscard,
  countsOf,
  isRelance,
  type Panel,
  type PanelAction,
  type PanelMail,
  panelMails,
  panelReducer,
  shownIndex,
} from './reply-drafts';

// Le panneau de l'agent « Brouillons de réponse », sans écran : le rendu de test n'a pas de clic. Données inventées.

const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const at = (day: number) => new Date(`2026-11-${String(day).padStart(2, '0')}T09:00:00Z`);
const source = { title: 'Fil', url: null, kind: 'gmail' };
const demande = (n: number, day: number, repondue = false): HomeDemande => ({
  id: id(n),
  from: `Demande ${n}`,
  receivedAt: at(day),
  questions: ['Mardi ?'],
  choix: [['Oui', 'Non']],
  repondue,
  relance: false,
  source,
});
const inconnu = (n: number, day: number): HomeInconnu => ({
  from: `Inconnu ${n}`,
  receivedAt: at(day),
  mail: { sourceId: id(n), message: `message:${n}` },
  source,
});
const preference = (n: number, day: number): HomePreference => ({
  id: id(n),
  from: `Préférence ${n}`,
  receivedAt: at(day),
  preference: 'Vous terminez vos mails par « Belle journée ».',
  source,
});
const pret = (n: number, day: number, depose = false): HomeBrouillon => ({
  id: id(n),
  from: `Prêt ${n}`,
  receivedAt: at(day),
  texte: 'Bonjour,\n\nC’est entendu.',
  depose,
  relance: false,
  source,
});
// Son mail resté sans réponse, envoyé ce jour-là : la question de relance.
const relance = (n: number, day: number, others = 0): HomeRelance => ({
  relance: true,
  from: `Relance ${n}`,
  others,
  receivedAt: at(day),
  mail: { sourceId: id(n), message: `message:${n}` },
  source,
});

// Ce que le panneau montre : chaque mail par son correspondant et sa sorte.
const seen = (mails: PanelMail[]) => mails.map((one) => `${one.mail.from} ${one.sorte}`);

describe('panelMails : l’ordre du panneau', () => {
  it('ce qui attend un geste d’elle d’abord, puis les brouillons prêts, puis ce que Leon écrit ; les plus récents d’abord dans chaque sorte', () => {
    const mails = panelMails(
      [demande(1, 10, true), demande(2, 12), inconnu(3, 14), demande(4, 9), demande(5, 16, true)],
      [pret(6, 8), pret(7, 20)],
      {},
    );

    expect(seen(mails)).toEqual([
      'Inconnu 3 inconnu',
      'Demande 2 questions',
      'Demande 4 questions',
      'Prêt 7 pret',
      'Prêt 6 pret',
      'Demande 5 ecrit',
      'Demande 1 ecrit',
    ]);
  });

  it('un mail fermé ici s’en va ; des réponses envoyées, un oui à un inconnu : Leon l’écrit, sur sa ligne', () => {
    const mails = panelMails([demande(1, 10), inconnu(2, 12), demande(3, 9)], [pret(4, 8)], {
      [`demande-${id(1)}`]: id(1),
      [`inconnu-${id(2)}`]: id(42),
      [`brouillon-${id(4)}`]: null,
      [`demande-${id(3)}`]: null,
    });

    expect(seen(mails)).toEqual(['Inconnu 2 ecrit', 'Demande 1 ecrit']);
    // Écarter son oui vise la ligne écrite par son oui, pas son fil.
    expect(mails.map((one) => one.id)).toEqual([id(42), id(1)]);
  });

  it('une demande et le brouillon qui la suit partagent la ligne, pas la clé : un brouillon arrivé ne reste pas fermé avec sa demande', () => {
    const mails = panelMails([], [pret(1, 10)], { [`demande-${id(1)}`]: id(1) });

    expect(mails).toMatchObject([{ key: `brouillon-${id(1)}`, id: id(1), sorte: 'pret' }]);
  });

  it('panneau ouvert, chaque mail garde sa place, même quand l’Accueil relu change sa sorte ; ce qui arrive se range après', () => {
    const order = [`demande-${id(2)}`, `demande-${id(1)}`, `brouillon-${id(3)}`];
    const mails = panelMails(
      // Ses réponses à la demande 2 sont parties : relue, elle est une demande où Leon écrit.
      [demande(2, 12, true), demande(1, 10), demande(5, 20)],
      [pret(3, 8), pret(4, 30)],
      {},
      order,
    );

    expect(seen(mails)).toEqual([
      'Demande 2 ecrit',
      'Demande 1 questions',
      'Prêt 3 pret',
      'Demande 5 questions',
      'Prêt 4 pret',
    ]);
  });
});

describe('countsOf : ce que la ligne de l’Accueil compte', () => {
  it('les mails à compléter (questions et inconnus), les brouillons prêts, et ce que Leon écrit', () => {
    const mails = panelMails(
      [demande(1, 10), inconnu(2, 11), demande(3, 12, true)],
      [pret(4, 8), pret(5, 9), pret(6, 7)],
      {},
    );

    expect(countsOf(mails)).toEqual({
      toComplete: 2,
      toConfirm: 0,
      toFollowUp: 0,
      ready: 3,
      writing: 1,
    });
    expect(countsOf([])).toEqual({
      toComplete: 0,
      toConfirm: 0,
      toFollowUp: 0,
      ready: 0,
      writing: 0,
    });
  });

  it('les préférences à valider, à part : elles aussi attendent un geste d’elle', () => {
    const mails = panelMails(
      [demande(1, 10), preference(2, 11), preference(3, 12), demande(4, 13, true)],
      [pret(5, 8)],
      {},
    );

    expect(countsOf(mails)).toEqual({
      toComplete: 1,
      toConfirm: 2,
      toFollowUp: 0,
      ready: 1,
      writing: 1,
    });
  });
});

describe('panelMails : une préférence d’écriture proposée', () => {
  it('se range avec ce qui attend un geste d’elle, par date du mail ; « Oui » ou « Non » la ferme', () => {
    const all = [demande(1, 10), preference(2, 12), inconnu(3, 11), demande(4, 16, true)];
    const mails = panelMails(all, [pret(5, 20)], {});

    expect(seen(mails)).toEqual([
      'Préférence 2 preference',
      'Inconnu 3 inconnu',
      'Demande 1 questions',
      'Prêt 5 pret',
      'Demande 4 ecrit',
    ]);
    expect(mails[0]).toMatchObject({ key: `preference-${id(2)}`, id: id(2) });
    expect(confirmsDiscard(mails[0] as PanelMail)).toBe(false);

    const closed = panelReducer(CLOSED, {
      type: 'close',
      mails,
      key: `preference-${id(2)}`,
      id: null,
    });
    expect(seen(panelMails(all, [pret(5, 20)], closed.done))).not.toContain(
      'Préférence 2 preference',
    );
    expect(closed.at).toBe(id(3));
  });
});

describe('panelMails : son mail resté sans réponse, et la relance qui suit', () => {
  it('la question de relance est un geste d’elle : avec les autres demandes, avant les brouillons prêts, par date du mail', () => {
    const mails = panelMails(
      [demande(1, 10), relance(2, 12), inconnu(3, 11), demande(4, 16, true)],
      [pret(5, 20)],
      {},
    );

    expect(seen(mails)).toEqual([
      'Relance 2 relance',
      'Inconnu 3 inconnu',
      'Demande 1 questions',
      'Prêt 5 pret',
      'Demande 4 ecrit',
    ]);
    // Sa clé et son fil : pas ceux du mail d'un inconnu.
    expect(mails[0]).toMatchObject({ key: `relance-${id(2)}`, id: id(2) });
    expect(isRelance(mails[0] as PanelMail)).toBe(true);
    expect(mails.filter(isRelance)).toHaveLength(1);
  });

  it('« Oui » : Leon l’écrit sur la ligne de son oui, à sa place ; « Non » : elle s’en va', () => {
    const all = [relance(1, 10), relance(2, 9)];
    const mails = panelMails(all, [], { [`relance-${id(1)}`]: id(42), [`relance-${id(2)}`]: null });

    expect(seen(mails)).toEqual(['Relance 1 ecrit']);
    expect(mails[0]).toMatchObject({ id: id(42), sorte: 'ecrit' });
    expect(isRelance(mails[0] as PanelMail)).toBe(true);
  });

  it('ses questions, la relance où Leon écrit, la relance prête : des mails de relance, comptés avec les autres', () => {
    const mails = panelMails(
      [
        { ...demande(1, 10), relance: true },
        { ...demande(2, 11, true), relance: true },
        relance(3, 12, 2),
        relance(4, 13),
        demande(5, 14),
      ],
      [{ ...pret(6, 8), relance: true }, pret(7, 9)],
      {},
    );

    expect(mails.map((one) => [one.mail.from, isRelance(one)])).toEqual([
      ['Demande 5', false],
      ['Relance 4', true],
      ['Relance 3', true],
      ['Demande 1', true],
      ['Prêt 7', false],
      ['Prêt 6', true],
      ['Demande 2', true],
    ]);
    // Les relances à décider à part ; ses questions sont des mails à compléter.
    expect(countsOf(mails)).toEqual({
      toComplete: 2,
      toConfirm: 0,
      toFollowUp: 2,
      ready: 2,
      writing: 1,
    });
  });
});

describe('confirmsDiscard : « Écarter » demande d’abord', () => {
  it('pour un brouillon déposé dans Gmail seulement', () => {
    const mails = panelMails(
      [demande(1, 10), inconnu(2, 11), demande(3, 12, true)],
      [pret(4, 8, true), pret(5, 9)],
      {},
    );

    expect(mails.map((one) => [one.mail.from, confirmsDiscard(one)])).toEqual([
      ['Inconnu 2', false],
      ['Demande 1', false],
      ['Prêt 5', false],
      ['Prêt 4', true],
      ['Demande 3', false],
    ]);
  });
});

describe('panelReducer : mail par mail', () => {
  const DEMANDES = [demande(1, 20), inconnu(2, 19), demande(3, 18)];
  const PRETS = [pret(4, 17, true)];
  // Le panneau ouvert, puis des gestes ; ce qu'il montre ensuite : le mail, sa place et le total.
  const replay = (actions: Array<(mails: PanelMail[]) => PanelAction>) => {
    let panel: Panel = panelReducer(CLOSED, {
      type: 'open',
      keys: panelMails(DEMANDES, PRETS, {}).map((one) => one.key),
    });
    for (const action of actions)
      panel = panelReducer(panel, action(panelMails(DEMANDES, PRETS, panel.done, panel.order)));
    const mails = panelMails(DEMANDES, PRETS, panel.done, panel.order);
    const index = shownIndex(mails, panel.at);
    return {
      panel,
      mails,
      shown: mails[index] ? `${mails[index].mail.from} ${index + 1}/${mails.length}` : 'rien',
    };
  };
  const close =
    (n: number, id: string | null = null) =>
    (mails: PanelMail[]): PanelAction => ({
      type: 'close',
      mails,
      key: mails[n]?.key ?? '',
      id,
    });
  const show =
    (n: number) =>
    (mails: PanelMail[]): PanelAction => ({
      type: 'show',
      id: mails[n]?.id ?? '',
    });

  it('s’ouvre sur le premier mail ; « Mail suivant » et « Mail précédent » vont et viennent', () => {
    expect(replay([]).shown).toBe('Demande 1 1/4');
    expect(replay([show(1)]).shown).toBe('Inconnu 2 2/4');
    expect(replay([show(3), show(2)]).shown).toBe('Demande 3 3/4');
  });

  it('ses réponses envoyées : le mail reste à sa place, Leon l’écrit, et le panneau passe au suivant', () => {
    const { mails, shown } = replay([close(0, id(1))]);

    expect(shown).toBe('Inconnu 2 2/4');
    expect(seen(mails)[0]).toBe('Demande 1 ecrit');
  });

  it('son oui à un inconnu, avec la ligne de son oui : pareil, et « Écarter » visera cette ligne', () => {
    const { mails, shown } = replay([show(1), close(1, id(42))]);

    expect(shown).toBe('Demande 3 3/4');
    expect(mails[1]).toMatchObject({ sorte: 'ecrit', id: id(42) });
  });

  it('« Non », « Écarter », ou un mail qui n’est plus ouvert : il s’en va, et le suivant prend sa place', () => {
    const { mails, shown } = replay([show(1), close(1)]);

    expect(shown).toBe('Demande 3 2/3');
    expect(seen(mails)).not.toContain('Inconnu 2 inconnu');
  });

  it('au dernier mail : parti, le panneau montre celui d’avant ; écrit par Leon, il reste sur lui, qui le dit', () => {
    expect(replay([show(3), close(3)]).shown).toBe('Demande 3 3/3');
    expect(replay([show(2), close(2, id(3)), show(3), close(3)]).shown).toBe('Demande 3 3/3');
    const last = replay([show(3), close(3), close(2, id(3))]);
    expect(last.shown).toBe('Demande 3 3/3');
    expect(seen(last.mails)[2]).toBe('Demande 3 ecrit');
  });

  it('plus rien : « C’est tout pour l’instant », et la ligne de l’Accueil n’a plus rien à compter', () => {
    const { panel, mails, shown } = replay([close(0), close(0), close(0), close(0)]);

    expect(shown).toBe('rien');
    expect(panel.at).toBeNull();
    expect(countsOf(mails)).toEqual({
      toComplete: 0,
      toConfirm: 0,
      toFollowUp: 0,
      ready: 0,
      writing: 0,
    });
  });

  it('rouvert, le panneau reprend au premier mail, ce que Leon écrit rangé à la fin', () => {
    const before = replay([close(0, id(1)), close(1)]);
    const panel = panelReducer(before.panel, {
      type: 'open',
      keys: panelMails(DEMANDES, PRETS, before.panel.done).map((one) => one.key),
    });
    const mails = panelMails(DEMANDES, PRETS, panel.done, panel.order);

    expect(seen(mails)).toEqual(['Demande 3 questions', 'Prêt 4 pret', 'Demande 1 ecrit']);
    expect(shownIndex(mails, panel.at)).toBe(0);
  });

  it('un brouillon arrivé pendant qu’elle regarde sa demande : le panneau le suit, par sa ligne', () => {
    const mails = panelMails([], [pret(1, 20), pret(2, 21)], {});

    expect(shownIndex(mails, id(1))).toBe(1);
    expect(shownIndex(mails, 'disparu')).toBe(0);
  });
});
