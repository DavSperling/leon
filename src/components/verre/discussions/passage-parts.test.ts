import { describe, expect, it } from 'vitest';
import { passageBlocks, passageParts } from './passage-parts';

const marked = (parts: { text: string; hit: boolean }[]) =>
  parts
    .filter((part) => part.hit)
    .map((part) => part.text)
    .join('|');

const LONG =
  'Réunion du 12 novembre avec ACME. Karim présente le planning de la V2 et les risques sur la migration des données. ' +
  'Sophie rappelle que le contrat prévoit une recette de deux semaines avant toute mise en production, et que le client ' +
  'attend une démonstration complète. On convient de garder la date du 15 novembre pour la livraison, sous réserve que ' +
  'les tests de charge passent. Prochaine réunion la semaine prochaine, même heure.';

describe('passageParts', () => {
  it('marque le passage cité dans son tour', () => {
    const parts = passageParts('Avant. Le passage cité. Après.', 'Le passage cité.', []);
    expect(parts).toEqual([
      { text: 'Avant. ', hit: false },
      { text: 'Le passage cité.', hit: true },
      { text: ' Après.', hit: false },
    ]);
  });

  it('ne marque que les mots que la réponse a pris au passage', () => {
    const parts = passageParts(
      'Voilà : devis en cours côté Karim. Rien sur les prospects.',
      undefined,
      [],
      ['Un devis est en cours côté Karim'],
    );
    // « devis » seul ne compte pas (ni nombre, ni nom) ; « en » est un petit mot
    expect(marked(parts)).toBe('cours côté Karim');
  });

  it('un long tour cité en entier : la meilleure suite reprise par la réponse, pas un bloc', () => {
    expect(LONG.length).toBeGreaterThan(400);
    const parts = passageParts(LONG, LONG, [], ['La livraison reste prévue le 15 novembre']);
    expect(marked(parts)).toBe('15 novembre');
    expect(parts.map((part) => part.text).join('')).toBe(LONG);
  });

  it('un long tour cité en entier, sans mot repris : aucune marque', () => {
    const parts = passageParts(LONG, LONG, [], ['Tout va bien de ce côté']);
    expect(parts).toEqual([{ text: LONG, hit: false }]);
  });

  it('un passage au milieu d’un long tour, sans mot repris : aucune marque, son début repéré', () => {
    const before = 'Ouverture de séance. '.repeat(40);
    const text = before + LONG;
    const parts = passageParts(text, LONG, [], ['Tout va bien de ce côté']);
    expect(marked(parts)).toBe('');
    expect(parts).toEqual([
      { text: before, hit: false },
      { text: LONG, hit: false, anchor: true },
    ]);
    // une phrase de la réponse ou du point sans citation précise (liste vide) : rien non plus
    expect(marked(passageParts(text, LONG, [], []))).toBe('');
  });

  it('ouvert depuis un résultat de recherche (sans phrases) : un long tour, sa première phrase', () => {
    expect(passageParts(LONG, LONG, [])).toEqual([
      { text: 'Réunion du 12 novembre avec ACME.', hit: true },
      { text: LONG.slice('Réunion du 12 novembre avec ACME.'.length), hit: false },
    ]);
  });

  it('marque sur le texte affiché, sans les marques du Markdown', () => {
    const raw = '**Refonte devis** : point du **16/10**. Montant retenu : 80 k€.';
    const parts = passageParts(raw, raw, [], ['La refonte des devis est à 80 k€']);
    expect(parts.map((part) => part.text).join('')).toBe(
      'Refonte devis : point du 16/10. Montant retenu : 80 k€.',
    );
    expect(marked(parts)).not.toContain('*');
    expect(marked(parts)).toContain('80');
  });

  it('une première phrase trop longue est coupée à un mot', () => {
    const text = `${'mot '.repeat(150)}fin.`;
    const parts = passageParts(text, text, []);
    const hit = marked(parts);
    expect(hit.length).toBeLessThanOrEqual(200);
    expect(hit.endsWith('mot')).toBe(true);
  });

  it('un passage introuvable : un long tour reste sans marque, un court est marqué entier', () => {
    expect(passageParts('x'.repeat(500), 'absent', []).every((part) => !part.hit)).toBe(true);
    expect(passageParts('Court.', 'absent', [])).toEqual([{ text: 'Court.', hit: true }]);
  });

  it('sans passage, les mots cherchés', () => {
    expect(marked(passageParts('Le contrat ACME est signé.', undefined, ['contrat']))).toBe(
      'contrat',
    );
  });
});

describe('passageBlocks', () => {
  const plain = (text: string) => [{ text, hit: false }];
  const words = (line: Array<{ text: string }>) => line.map((part) => part.text).join('');

  it('garde un texte simple en un paragraphe, ses lignes comprises', () => {
    expect(passageBlocks(plain('Bonjour,\nvoici le point.\n\nÀ jeudi.'))).toEqual([
      { type: 'p', parts: [...plain('Bonjour,'), ...plain('\n'), ...plain('voici le point.')] },
      { type: 'p', parts: plain('À jeudi.') },
    ]);
  });

  it('dessine le tableau d’une page Notion, sans ses barres ni son en-tête vide', () => {
    const [intro, table] = passageBlocks(
      plain(
        'Fiche client\n| | |\n|---|---|\n| Ville | La Roche-sur-Yon |\n| Statut | Client pilote |',
      ),
    );
    expect(intro).toEqual({ type: 'p', parts: plain('Fiche client') });
    expect(table?.type).toBe('table');
    if (table?.type !== 'table') return;
    expect(table.head).toBeNull();
    expect(table.rows.map((row) => row.map(words))).toEqual([
      ['Ville', 'La Roche-sur-Yon'],
      ['Statut', 'Client pilote'],
    ]);
  });

  it('garde l’en-tête d’un tableau et la marque dans sa case', () => {
    const [table] = passageBlocks([
      { text: '| Client | Montant |\n|:--|--:|\n| ACME | ', hit: false },
      { text: '12 400 €', hit: true },
      { text: ' |', hit: false },
    ]);
    if (table?.type !== 'table') throw new Error('pas un tableau');
    expect(table.head?.map(words)).toEqual(['Client', 'Montant']);
    expect(table.rows).toEqual([[plain('ACME'), [{ text: '12 400 €', hit: true }]]]);
  });

  it('fait une liste des lignes à puce, et laisse « 2026. » dans son paragraphe', () => {
    expect(
      passageBlocks(plain('À faire :\n- relancer ACME\n- envoyer le devis\nFin\n12. rue')),
    ).toEqual([
      { type: 'p', parts: plain('À faire :') },
      { type: 'list', ordered: false, items: [plain('relancer ACME'), plain('envoyer le devis')] },
      { type: 'p', parts: [...plain('Fin'), ...plain('\n'), ...plain('12. rue')] },
    ]);
    expect(passageBlocks(plain('1. un\n2. deux'))).toEqual([
      { type: 'list', ordered: true, items: [plain('un'), plain('deux')] },
    ]);
  });
});
