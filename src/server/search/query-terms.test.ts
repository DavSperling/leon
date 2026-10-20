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
    expect(queryTerms('budget Budget BUDGET acme').words).toEqual(['budget', 'acme']);
    const many = Array.from({ length: 40 }, (_, i) => `mot${i}`).join(' ');
    expect(queryTerms(many).words).toHaveLength(WIDE_WORDS_MAX);
    expect(queryTerms(many).text).toBe(many);
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
    for (const word of ['or', 'être', 'avoir', 'faire', 'dire', 'budget', 'contrat', 'plan']) {
      expect(FUNCTION_WORDS.has(word), word).toBe(false);
    }
  });
});
