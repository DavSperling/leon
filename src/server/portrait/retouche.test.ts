import { describe, expect, it } from 'vitest';
import { issueOf } from './retouche';

// Ce qu'elle a fait d'un brouillon de Leon, vu sur ce qu'elle a envoyé. Mails inventés : Julie écrit à Léa et à Paul,
// des adresses en .test qui n'existent pas.

// 23 mots : « bonjour », « léa », « merci », « pour »… « bien », « à », « vous ».
const DRAFT =
  'Bonjour Léa,\n\nMerci pour votre message. Je vous envoie le devis vendredi, avec les deux options dont nous avons parlé.\n\nBien à vous';

describe('issueOf : envoyé tel quel', () => {
  it('les mêmes mots dans le même ordre : les espaces, la ponctuation, la casse et les retours à la ligne ne comptent pas', () => {
    expect(issueOf(DRAFT, DRAFT)).toBe('tel-quel');
    expect(
      issueOf(
        DRAFT,
        'bonjour Léa ! Merci pour votre message ;  je vous envoie le devis Vendredi avec les deux options dont nous avons parlé...   Bien à vous.',
      ),
    ).toBe('tel-quel');
  });

  it('sa signature après « -- » et la citation du mail reçu ne sont pas d’elle : elles ne comptent pas', () => {
    const sent = [
      DRAFT,
      '',
      '-- ',
      'Julie Martin',
      'Globex, 01 00 00 00 00',
      '',
      'Le jeu. 19 nov. 2026 à 09:12, Léa Roy <lea@client.test> a écrit :',
      '> Bonjour Julie, pouvez-vous m’envoyer le devis ?',
    ].join('\n');

    expect(issueOf(DRAFT, sent)).toBe('tel-quel');
  });
});

describe('issueOf : retouché, elle a gardé la moitié des mots du brouillon au moins, dans l’ordre', () => {
  it('un seul mot changé suffit : « vendredi » devient « lundi » (22 mots sur 23)', () => {
    expect(issueOf(DRAFT, DRAFT.replace('vendredi', 'lundi'))).toBe('retouche');
  });

  it('ses formules à elle : « Hello » et « Belle journée » au lieu de « Bonjour » et « Bien à vous » (19 sur 23)', () => {
    const sent = DRAFT.replace('Bonjour', 'Hello').replace('Bien à vous', 'Belle journée');

    expect(issueOf(DRAFT, sent)).toBe('retouche');
  });

  it('une phrase ajoutée : tout le brouillon reste, et sa réponse est plus longue', () => {
    const sent = DRAFT.replace(
      'parlé.',
      'parlé. N’hésitez pas à m’appeler si besoin, je suis au bureau toute la semaine.',
    );

    expect(issueOf(DRAFT, sent)).toBe('retouche');
  });

  it('plus courte : une fin de phrase en moins (15 sur 23)', () => {
    const sent =
      'Bonjour Léa,\n\nJe vous envoie le devis vendredi, avec les deux options.\n\nBien à vous';

    expect(issueOf(DRAFT, sent)).toBe('retouche');
  });

  it('la borne : la moitié exacte des mots du brouillon est une retouche, un de moins une réécriture', () => {
    // 10 mots : « bonjour paul le contrat signé part demain matin bonne journée ».
    const draft = 'Bonjour Paul,\n\nLe contrat signé part demain matin.\n\nBonne journée';

    // « bonjour paul le contrat … bonne » : 5 sur 10.
    expect(
      issueOf(draft, 'Bonjour Paul,\n\nLe contrat ne partira que lundi, désolée.\n\nBonne soirée'),
    ).toBe('retouche');
    // « bonjour paul le contrat » : 4 sur 10.
    expect(
      issueOf(draft, 'Bonjour Paul,\n\nLe contrat attend la signature de Marc.\n\nMerci'),
    ).toBe('reecrit');
  });
});

describe('issueOf : réécrit, moins de la moitié des mots du brouillon reste', () => {
  it('un autre mail sous les mêmes formules : deux mails sans rapport partagent toujours quelques mots (8 sur 23)', () => {
    const sent =
      'Bonjour Léa,\n\nJe ne pourrai pas vous répondre avant mon retour de congés, le 4 décembre. Paul suit le dossier en attendant.\n\nBien à vous';

    expect(issueOf(DRAFT, sent)).toBe('reecrit');
  });

  it('une réponse d’une ligne, même avec ses formules (5 sur 23)', () => {
    expect(issueOf(DRAFT, 'Bonjour Léa, c’est noté. Bien à vous')).toBe('reecrit');
  });

  it('coupé de plus de la moitié, même sans un mot à elle (11 sur 23) : le brouillon n’est plus le sien', () => {
    expect(issueOf(DRAFT, 'Bonjour Léa,\n\nJe vous envoie le devis vendredi.\n\nBien à vous')).toBe(
      'reecrit',
    );
  });

  it('rien d’elle : un transfert sans un mot, ou la seule citation du mail reçu', () => {
    const quoteOnly =
      'Le jeu. 19 nov. 2026 à 09:12, Léa Roy <lea@client.test> a écrit :\n> Bonjour Julie';

    expect(issueOf(DRAFT, quoteOnly)).toBe('reecrit');
    expect(issueOf(DRAFT, '')).toBe('reecrit');
  });
});
