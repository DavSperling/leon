import { describe, expect, it } from 'vitest';
import { parseQuery } from './parse-query';
import { FUNCTION_WORDS, queryTerms, WIDE_WORDS_MAX } from './query-terms';

// Les mots outils (T06b) : une question posée en phrase garde ses mots porteurs de sens. Pur : ni base, ni réseau.

const NOW = new Date('2026-10-19T10:00:00Z');

describe('queryTerms : les mots outils', () => {
  it('retire les interrogatifs, les articles et les auxiliaires d’une question', () => {
    expect(queryTerms('Quelles sont les sauvegardes quotidiennes ?')).toEqual({
      text: 'sauvegardes quotidiennes',
      words: ['sauvegardes', 'quotidiennes'],
      phrases: [],
      negated: [],
    });
    expect(queryTerms('Quelle remise vise le plan Zéphyr ?')).toEqual({
      text: 'remise vise plan Zéphyr',
      words: ['remise', 'vise', 'plan', 'Zéphyr'],
      phrases: [],
      negated: [],
    });
  });

  it('compare sans accents ni casse', () => {
    expect(queryTerms('QUELLES sauvegardes').text).toBe('sauvegardes');
    expect(queryTerms('ou est la facture').text).toBe('facture');
    expect(queryTerms('Où sont les factures ?').text).toBe('factures');
    expect(queryTerms('a quelle heure commence la réunion').text).toBe('heure commence réunion');
    expect(queryTerms('À quoi sert le jeton ?').text).toBe('sert jeton');
  });

  it('retire les élisions et les inversions', () => {
    expect(queryTerms('Qu’est-ce que l’équipe a décidé ?').text).toBe('équipe décidé');
    expect(queryTerms("Qu'est-ce que l'équipe a décidé ?").text).toBe('équipe décidé');
    expect(queryTerms('Y a-t-il une sauvegarde ?').text).toBe('sauvegarde');
    expect(queryTerms('Combien coûte l’hébergement d’Acme ?').text).toBe('coûte hébergement Acme');
  });

  it('retire aussi les mots outils anglais, contractions comprises, et garde l’IT et les US', () => {
    expect(queryTerms('What did Marc say about the Acme invoice?')).toEqual({
      text: 'Marc Acme invoice',
      words: ['Marc', 'Acme', 'invoice'],
      phrases: [],
      negated: [],
    });
    expect(queryTerms("What's the status of the OVH migration?").text).toBe('status OVH migration');
    expect(queryTerms('Don’t we have an invoice from Acme?').text).toBe('invoice Acme');
    expect(queryTerms('IT budget for the US office').text).toBe('IT budget US office');
  });

  it('retire les verbes vides au présent, et garde les mots qui leur ressemblent', () => {
    expect(queryTerms('Que fait Julie sur le projet ?').text).toBe('Julie projet');
    expect(queryTerms('Que dit le contrat ?').text).toBe('contrat');
    // « avoir » (la note de crédit) et « être » ne sont pas des formes conjuguées : ils restent.
    expect(queryTerms('Quel avoir pour Acme ?').text).toBe('avoir Acme');
  });

  it('ne touche ni aux expressions entre guillemets ni aux mots niés', () => {
    expect(queryTerms('"qui est la" facture')).toEqual({
      text: '"qui est la" facture',
      words: ['facture'],
      phrases: ['"qui est la"'],
      negated: [],
    });
    expect(queryTerms('Quel contrat -les -OVH')).toEqual({
      text: 'contrat -les -OVH',
      words: ['contrat'],
      phrases: [],
      negated: ['les', 'OVH'],
    });
    expect(queryTerms('remise -"plan Zéphyr"')).toEqual({
      text: 'remise -"plan Zéphyr"',
      words: ['remise'],
      phrases: [],
      negated: ['"plan Zéphyr"'],
    });
  });

  it('ne touche pas aux noms propres au milieu de la phrase', () => {
    expect(queryTerms('Quel est le budget de La Poste ?').text).toBe('budget La Poste');
    expect(queryTerms('contrat avec ON Semiconductor').text).toBe('contrat ON Semiconductor');
    // En début de phrase, une majuscule n'est pas un nom propre.
    expect(queryTerms('Quand ? Comment ? Le budget').text).toBe('budget');
  });

  it('ne lit pas la casse d’une question toute en capitales ou à majuscule partout', () => {
    expect(queryTerms('QUELLES SONT LES SAUVEGARDES QUOTIDIENNES ?')).toEqual({
      text: 'SAUVEGARDES QUOTIDIENNES',
      words: ['SAUVEGARDES', 'QUOTIDIENNES'],
      phrases: [],
      negated: [],
    });
    expect(queryTerms('QUELLE REMISE VISE LE PLAN ZÉPHYR ?').text).toBe('REMISE VISE PLAN ZÉPHYR');
    expect(queryTerms('Quelle Remise Vise Le Plan Zéphyr ?').text).toBe('Remise Vise Plan Zéphyr');
    // Un sigle seul, ou deux noms propres sur quatre mots, ne rendent pas la requête sans casse.
    expect(queryTerms('contrat OVH').text).toBe('contrat OVH');
    expect(queryTerms('Où en est le contrat de La Poste ?').text).toBe('contrat La Poste');
  });

  it('garde « dû » et « sûr », que la comparaison sans accents confondrait avec « du » et « sur »', () => {
    expect(queryTerms('Quel est le montant dû ?').text).toBe('montant dû');
    expect(queryTerms('Quel est le montant du devis ?').text).toBe('montant devis');
    expect(queryTerms('Es-tu sûr du chiffre ?').text).toBe('sûr chiffre');
    expect(queryTerms('MONTANT DÛ PAR ACME').text).toBe('MONTANT DÛ ACME');
    expect(queryTerms('le serveur sur le site').text).toBe('serveur site');
  });

  it('retire les prépositions, conjonctions, adverbes et verbes vides courants', () => {
    expect(
      queryTerms('Peut-on avoir plus de détails sur la migration avant la fin du mois ?').text,
    ).toBe('avoir détails migration fin mois');
    expect(queryTerms('Faut-il tout refaire depuis le début ?').text).toBe('refaire début');
    expect(queryTerms('Que font les commerciaux si le client doit payer ?').text).toBe(
      'commerciaux client payer',
    );
    // « sommes » (des montants) reste : « être » au présent n'y perd qu'un mot que la passe élargie rattrape.
    expect(queryTerms('Quelles sommes restent dues ?').text).toBe('sommes restent dues');
  });

  it('ne touche jamais aux filtres de parseQuery', () => {
    const parsed = parseQuery('Quelles sont les sauvegardes de:alice outil:github depuis:7j', NOW);
    expect(parsed.people).toEqual(['alice']);
    expect(parsed.filters.tools).toEqual(['github']);
    expect(queryTerms(parsed.text).text).toBe('sauvegardes');
    // Un filtre resté dans le texte (une clé inconnue de parseQuery) n'est pas un mot outil.
    expect(queryTerms('les tickets de:julie').text).toBe('tickets de:julie');
  });

  it('garde le texte d’origine quand tout est mot outil', () => {
    expect(queryTerms('qui ?')).toEqual({ text: 'qui ?', words: [], phrases: [], negated: [] });
    expect(queryTerms('le la les de du').text).toBe('le la les de du');
    expect(queryTerms('qui -ovh')).toEqual({
      text: 'qui -ovh',
      words: [],
      phrases: [],
      negated: ['ovh'],
    });
  });

  it('lit un tiret seul comme une ponctuation, et nie seulement un mot collé à un seul tiret', () => {
    // websearch_to_tsquery lirait « budget - plan » comme « budget sauf plan » : ici, comme chez Google, un tiret
    // entouré d'espaces sépare (« Compte rendu - budget »), il ne nie rien.
    expect(queryTerms('Compte rendu - budget')).toEqual({
      text: 'Compte rendu budget',
      words: ['Compte', 'rendu', 'budget'],
      phrases: [],
      negated: [],
    });
    expect(queryTerms('budget - "plan b"')).toEqual({
      text: 'budget "plan b"',
      words: ['budget'],
      phrases: ['"plan b"'],
      negated: [],
    });
    // Deux tirets ou plus : une option de ligne de commande, pas une négation (Postgres y lisait « !!force »,
    // c'est-à-dire « force »). Les deux passes cherchent le mot.
    expect(queryTerms('git push --force')).toEqual({
      text: 'git push force',
      words: ['git', 'push', 'force'],
      phrases: [],
      negated: [],
    });
    expect(queryTerms('budget -plan').negated).toEqual(['plan']);
  });

  it('lit « or » suivi d’une ponctuation comme l’opérateur, et retire un « or » final', () => {
    // Postgres lit « or, » comme l'opérateur : la passe élargie ne doit pas en faire un mot.
    expect(queryTerms('budget or, plan')).toEqual({
      text: 'budget or plan',
      words: ['budget', 'plan'],
      phrases: [],
      negated: [],
    });
    // Postgres garderait « or » final comme un mot exigé : ici, un opérateur sans second terme disparaît.
    expect(queryTerms('budget or').text).toBe('budget');
  });

  it('garde « or » entre deux mots, et le retire des mots de la passe élargie', () => {
    expect(queryTerms('quel contrat or quelle facture')).toEqual({
      text: 'contrat or facture',
      words: ['contrat', 'facture'],
      phrases: [],
      negated: [],
    });
    expect(queryTerms('qui or contrat').text).toBe('contrat');
    expect(queryTerms('contrat or le').text).toBe('contrat');
  });

  it('dédoublonne les mots de la passe élargie et en borne le nombre', () => {
    expect(WIDE_WORDS_MAX).toBe(8);
    expect(queryTerms('budget Budget BUDGET acme').words).toEqual(['budget', 'acme']);
    const many = Array.from({ length: 40 }, (_, i) => `mot${i}`).join(' ');
    expect(queryTerms(many).words).toHaveLength(WIDE_WORDS_MAX);
    expect(queryTerms(many).text).toBe(many);
  });

  it('garde pour la passe élargie les noms propres, les mots à chiffres, puis les plus longs', () => {
    // Treize mots : « v2 », « OVH » et « Zéphyr » d'abord, puis les cinq plus longs, dans l'ordre de la requête.
    const terms = queryTerms(
      'devis facture contrat remise plan budget v2 OVH Zéphyr migration hébergement serveur site',
    );
    expect(terms.words).toEqual([
      'facture',
      'contrat',
      'v2',
      'OVH',
      'Zéphyr',
      'migration',
      'hébergement',
      'serveur',
    ]);
    // La première passe garde tous les mots.
    expect(terms.text).toBe(
      'devis facture contrat remise plan budget v2 OVH Zéphyr migration hébergement serveur site',
    );
  });

  it('ne lève rien sur les entrées bizarres', () => {
    for (const raw of [
      '',
      ' ',
      '?',
      '"',
      '""',
      '-',
      '--',
      '-"',
      "'",
      '’',
      'qu’',
      'l’',
      '-qui',
      '"a" "b"',
      '- -',
      '---x',
      'or',
      'or,',
      'OR OR',
      'DÛ',
      'É',
    ]) {
      const terms = queryTerms(raw);
      expect(typeof terms.text).toBe('string');
      expect(terms.words.every((word) => /[\p{L}\p{N}]/u.test(word))).toBe(true);
    }
  });
});

describe('FUNCTION_WORDS', () => {
  it('est en minuscules et contient les interrogatifs demandés', () => {
    for (const word of FUNCTION_WORDS) expect(word).toBe(word.toLowerCase());
    for (const word of [
      'quel',
      'quelle',
      'quels',
      'quelles',
      'qui',
      'que',
      'qu’',
      'quoi',
      'comment',
      'pourquoi',
      'où',
      'quand',
      'combien',
      'est-ce',
    ]) {
      expect(FUNCTION_WORDS.has(word), word).toBe(true);
    }
  });

  it('ne contient ni l’opérateur « or », ni les infinitifs, ni des mots porteurs de sens', () => {
    for (const word of [
      'or',
      'être',
      'avoir',
      'faire',
      'dire',
      'budget',
      'contrat',
      'plan',
      'sommes',
      'bien',
      'dû',
      'sûr',
      'it',
      'us',
      'may',
      'but',
      'done',
      'up',
      'down',
      'out',
      'off',
    ]) {
      expect(FUNCTION_WORDS.has(word), word).toBe(false);
    }
  });

  it('contient les mots outils anglais', () => {
    for (const word of ['what', 'the', 'of', 'about', 'is', 'did', 'what’s', 'don’t']) {
      expect(FUNCTION_WORDS.has(word), word).toBe(true);
    }
  });

  it('contient être, avoir, faire et dire au présent', () => {
    for (const word of ['suis', 'est', 'sont', 'ai', 'a', 'ont', 'fais', 'fait', 'font', 'dit']) {
      expect(FUNCTION_WORDS.has(word), word).toBe(true);
    }
  });
});
