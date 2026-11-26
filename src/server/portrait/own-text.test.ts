import { describe, expect, it } from 'vitest';
import { EXCERPT_CHARS, excerptOf, ownText } from './own-text';

// Mails inventés pour ces tests : aucune personne ni adresse réelle (domaines en .test).

const mail = (...lines: string[]) => lines.join('\n');

describe('ownText', () => {
  it('rend tel quel un mail sans citation ni signature', () => {
    const text = mail(
      'Bonjour Paul,',
      '',
      'Le devis 12 est prêt.',
      'On se voit lundi ?',
      '',
      'Julie',
    );
    expect(ownText(text)).toEqual({ text, signature: null });
  });

  it.each([
    ['Gmail en français', 'Le mar. 12 nov. 2026 à 10:02, Paul Durand <paul@client.test> a écrit :'],
    ['Gmail en anglais', 'On Tue, Nov 12, 2026 at 10:02 AM Paul Durand <paul@client.test> wrote:'],
    ['Apple Mail', 'Le 12 nov. 2026 à 10:02, Paul Durand <paul@client.test> a écrit :'],
  ])('retire la réponse citée de %s, en-tête compris', (_client, header) => {
    const text = mail('Oui, c’est bon pour moi.', '', header, '> Peux-tu confirmer ?', '> Paul');
    expect(ownText(text).text).toBe('Oui, c’est bon pour moi.');
  });

  it('reconnaît un en-tête que Gmail a coupé sur deux lignes', () => {
    const french = mail(
      'Entendu.',
      '',
      'Le mar. 12 nov. 2026 à 10:02, Paul Durand <paul.durand@client-exemple.test> a',
      'écrit :',
      '> Peux-tu confirmer ?',
    );
    const english = mail(
      'Noted.',
      '',
      'On Tue, Nov 12, 2026 at 10:02 AM Paul Durand <paul.durand@client-exemple.test>',
      'wrote:',
      '> Can you confirm?',
    );
    expect(ownText(french).text).toBe('Entendu.');
    expect(ownText(english).text).toBe('Noted.');
  });

  it('garde ce que la personne a écrit entre les lignes citées', () => {
    const text = mail(
      'Le 12 nov. 2026 à 10:02, Paul Durand <paul@client.test> a écrit :',
      '> Lundi ou mardi ?',
      'Mardi.',
      '> Et le devis ?',
      '>> Il part quand ?',
      'Il part ce soir.',
    );
    expect(ownText(text).text).toBe(mail('Mardi.', 'Il part ce soir.'));
  });

  // Un mail en HTML passé par htmlToText : la citation n'a pas de « > ».
  it('retire tout ce qui suit un en-tête de réponse sans lignes « > »', () => {
    const text = mail(
      'Je regarde demain.',
      '',
      'Le 12 nov. 2026 à 10:02, Paul Durand a écrit :',
      '',
      'Peux-tu confirmer ?',
      'Paul',
    );
    expect(ownText(text).text).toBe('Je regarde demain.');
  });

  it('garde une phrase de la personne qui ressemble à un en-tête', () => {
    const text = mail('Le client nous a écrit :', 'il veut le devis 12 avant lundi.');
    expect(ownText(text).text).toBe(text);
    // La ligne juste avant un en-tête d'une seule ligne n'en fait pas partie.
    const before = mail(
      'Le devis 12 est prêt.',
      'Le 12 nov. 2026 à 10:02, Paul Durand a écrit :',
      '> Merci',
    );
    expect(ownText(before).text).toBe('Le devis 12 est prêt.');
  });

  it.each([
    ['-----Original Message-----'],
    ['-----Message d’origine-----'],
    ['---------- Forwarded message ---------'],
    ['---------- Message transféré ---------'],
  ])('retire ce qui suit « %s »', (marker) => {
    const text = mail(
      'Pour info.',
      '',
      marker,
      'De : Paul Durand <paul@client.test>',
      'Objet : Devis',
      '',
      'Voici le devis.',
    );
    expect(ownText(text).text).toBe('Pour info.');
  });

  it('retire le bloc d’Outlook, en français et en anglais', () => {
    const french = mail(
      'Bien reçu, merci.',
      '',
      'De : Paul Durand <paul@client.test>',
      'Envoyé : mardi 12 novembre 2026 10:02',
      'À : Julie Martin <julie@acme.test>',
      'Objet : Devis',
      '',
      'Voici le devis.',
    );
    const english = mail(
      'Received, thanks.',
      '',
      'From: Paul Durand <paul@client.test>',
      'Sent: Tuesday, November 12, 2026 10:02 AM',
      'To: Julie Martin <julie@acme.test>',
      'Subject: Quote',
      '',
      'Here is the quote.',
    );
    const oneLine = mail('Vu.', 'De : Paul Durand Envoyé : mardi 12 novembre 2026 À : Julie');
    expect(ownText(french).text).toBe('Bien reçu, merci.');
    expect(ownText(english).text).toBe('Received, thanks.');
    expect(ownText(oneLine).text).toBe('Vu.');
  });

  // Le corps en texte que rend Graph : une réponse écrite dans Outlook sur le web porte un trait au-dessus du bloc.
  it('retire le trait qu’Outlook pose au-dessus du bloc', () => {
    const text = mail(
      'Bien reçu, merci.',
      'Julie',
      '________________________________',
      'De : Paul Durand <paul@client.test>',
      'Envoyé : mardi 12 novembre 2026 10:02',
      'À : Julie Martin <julie@acme.test>',
      'Objet : Devis',
      '',
      'Voici le devis.',
    );
    expect(ownText(text).text).toBe(mail('Bien reçu, merci.', 'Julie'));
  });

  // Relevé par Outlook, le transfert n'a pas de « > », et « Objet » suit « De ». La ligne qui l'annonce reste.
  it('retire le mail transféré depuis Apple Mail, en français et en anglais', () => {
    const french = mail(
      'Pour info.',
      'Début du message réexpédié :',
      '',
      'De: Paul Durand <paul@client.test>',
      'Objet: Devis',
      'Date: 12 novembre 2026 à 10:02:11 UTC+1',
      'À: Julie Martin <julie@acme.test>',
      '',
      'Tu peux regarder le devis ?',
    );
    const english = mail(
      'FYI',
      'Begin forwarded message:',
      '',
      'From: Paul Durand <paul@client.test>',
      'Subject: Quote',
      'Date: 12 November 2026 at 10:02:11 CET',
      'To: Julie Martin <julie@acme.test>',
      '',
      'Can you check the quote?',
    );
    expect(ownText(french).text).toBe(mail('Pour info.', 'Début du message réexpédié :'));
    expect(ownText(english).text).toBe(mail('FYI', 'Begin forwarded message:'));
  });

  it('sépare la signature qui suit la ligne « -- »', () => {
    const text = mail(
      'Bonjour,',
      'Voici le devis.',
      '',
      '-- ',
      'Julie Martin',
      'Directrice commerciale, Acme',
      '',
      'Le 12 nov. 2026 à 10:02, Paul Durand <paul@client.test> a écrit :',
      '> Merci',
    );
    expect(ownText(text)).toEqual({
      text: mail('Bonjour,', 'Voici le devis.'),
      signature: mail('Julie Martin', 'Directrice commerciale, Acme'),
    });
    // Sans l'espace final, que htmlToText retire.
    expect(ownText(mail('Ok.', '--', 'Julie')).signature).toBe('Julie');
  });

  it.each([
    ['Envoyé de mon iPhone'],
    ['Envoyé depuis mon mobile'],
    ['Envoyé de mon Galaxy S23'],
    ['Envoyé à partir de Outlook pour Android'],
    ['Sent from my iPhone'],
    ['Get Outlook for iOS<https://exemple.test/outlook>'],
  ])('retire la mention « %s »', (mention) => {
    expect(ownText(mail('Ok pour lundi.', '', mention))).toEqual({
      text: 'Ok pour lundi.',
      signature: null,
    });
  });

  it('garde une phrase de la personne qui commence comme une mention', () => {
    const text = mail('Envoyé de mon côté hier.', 'Tu l’as reçu ?');
    expect(ownText(text).text).toBe(text);
  });

  it('lit les fins de ligne de Windows et un mail vide', () => {
    expect(ownText('Bien reçu.\r\n\r\n> Merci\r\n').text).toBe('Bien reçu.');
    expect(ownText('')).toEqual({ text: '', signature: null });
  });

  // Une longue ligne qui commence comme un en-tête ne doit pas coûter un temps quadratique.
  it('lit vite un paragraphe piégé', () => {
    const line = `Le ${'1 '.repeat(50_000)}`;
    const start = performance.now();
    expect(ownText(line).text).toBe(line.trim());
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('excerptOf : le début lisible d’un mail', () => {
  it('ce que son auteur a écrit, sur une ligne : ni citation, ni signature, ni saut de ligne', () => {
    const text = mail(
      'Bonjour Claire,',
      '',
      'Merci pour la visite,   tout est clair.',
      '',
      '-- ',
      'Sophie Garnier',
      '',
      'Le 12 nov. 2026 à 10:02, Claire Lebrun <claire@atelier.test> a écrit :',
      '> Pouvez-vous confirmer ?',
    );

    expect(excerptOf(text)).toBe('Bonjour Claire, Merci pour la visite, tout est clair.');
  });

  it('un long mail se coupe à un mot, avec des points de suspension', () => {
    const excerpt = excerptOf(`Bonjour, ${'les plans arrivent mardi '.repeat(40)}`);

    expect(excerpt.length).toBeLessThanOrEqual(EXCERPT_CHARS + 1);
    expect(excerpt).toMatch(/^Bonjour, les plans arrivent mardi .*(?:les|plans|arrivent|mardi)…$/);
  });

  it('un texte sans espace se coupe net, sans demi-emoji', () => {
    const excerpt = excerptOf(`${'a'.repeat(EXCERPT_CHARS - 1)}😀${'b'.repeat(50)}`);

    expect(excerpt).toBe(`${'a'.repeat(EXCERPT_CHARS - 1)}…`);
    expect(excerpt.isWellFormed()).toBe(true);
  });

  it('un transfert sans un mot de son auteur : le début du texte tel qu’il est', () => {
    const text = mail(
      '---------- Forwarded message ---------',
      'De : Luc Morel <luc@fournisseur.test>',
      'Les plans de travail arrivent mardi.',
    );

    expect(excerptOf(text)).toBe(
      '---------- Forwarded message --------- De : Luc Morel <luc@fournisseur.test> Les plans de travail arrivent mardi.',
    );
  });

  it('l’hébreu, seul ou mêlé au français, reste tel qu’il est écrit ; un mail vide ne rend rien', () => {
    expect(excerptOf('שלום דוד,\n\nקיבלת את ההצעה? Merci de confirmer.')).toBe(
      'שלום דוד, קיבלת את ההצעה? Merci de confirmer.',
    );
    expect(excerptOf('  \n ')).toBe('');
  });
});
