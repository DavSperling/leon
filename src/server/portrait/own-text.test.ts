import { describe, expect, it } from 'vitest';
import { EXCERPT_CHARS, excerptOf, LINK_MAX_CHARS, ownText, shownText } from './own-text';

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

  it('un mail qui mêle l’hébreu et le français : une ligne par changement de sens de lecture, les lignes d’un même sens réunies', () => {
    const text = mail(
      'Bonjour Claire,',
      '',
      'Merci pour les plans. Voici leur réponse :',
      '',
      'הפגישה ביום חמישי בשעה 10:00 מתאימה לנו.',
      'נביא את הדוגמאות.',
      '',
      'Pouvez-vous confirmer l’adresse ?',
      '12/12',
      'Dana',
    );

    expect(excerptOf(text)).toBe(
      [
        'Bonjour Claire, Merci pour les plans. Voici leur réponse :',
        'הפגישה ביום חמישי בשעה 10:00 מתאימה לנו. נביא את הדוגמאות.',
        // Une ligne sans lettre garde le sens de celle qui la précède.
        'Pouvez-vous confirmer l’adresse ? 12/12 Dana',
      ].join('\n'),
    );
    // Un mot d'hébreu dans une phrase en français ne change pas son sens : elle commence en français.
    expect(excerptOf('Bonjour,\nLe mot שלום veut dire bonjour.')).toBe(
      'Bonjour, Le mot שלום veut dire bonjour.',
    );
  });

  it('l’hébreu, seul ou mêlé au français, reste tel qu’il est écrit ; un mail vide ne rend rien', () => {
    expect(excerptOf('שלום דוד,\n\nקיבלת את ההצעה? Merci de confirmer.')).toBe(
      'שלום דוד, קיבלת את ההצעה? Merci de confirmer.',
    );
    expect(excerptOf('  \n ')).toBe('');
  });
});

describe('shownText : le texte d’un mail tel que l’accueil le montre', () => {
  // Une adresse réécrite par un filtre de sécurité : plusieurs centaines de caractères, illisible.
  const REWRITTEN = `https://filtre.exemple.test/securelink/?url=http://www.exemple.test&key=${'eyJ'.padEnd(400, 'x')}`;
  // Le texte brut d'un mail écrit en HTML dans Outlook : les images en « [cid:…] », l'adresse de chaque lien entre
  // chevrons après son mot, « mailto: » après chaque adresse.
  const outlook = mail(
    'Bonjour,',
    '',
    'Le dossier est complet.',
    '',
    'Camille Renard',
    'Service clients',
    '[cid:image001.png@01DB2C3D.4E5F6A70]',
    '12, rue des Lilas 69000 Lyon',
    `www.exemple.test<${REWRITTEN}>`,
    '[cid:image002.png@01DB2C3D.4E5F6A70]',
    '',
    '________________________________',
    'De : noreply@exemple.test<mailto:noreply@exemple.test> <noreply@exemple.test<mailto:noreply@exemple.test>>',
    'À : Service clients <clients@exemple.test<mailto:clients@exemple.test>>',
    'Email déclarant : paul@exemple.test<mailto:paul@exemple.test>',
  );

  it('retire les renvois d’images, l’adresse illisible d’un lien et les « mailto: » qui répètent l’adresse', () => {
    expect(shownText(outlook)).toBe(
      mail(
        'Bonjour,',
        '',
        'Le dossier est complet.',
        '',
        'Camille Renard',
        'Service clients',
        '12, rue des Lilas 69000 Lyon',
        'www.exemple.test',
        '',
        '________________________________',
        'De : noreply@exemple.test <noreply@exemple.test>',
        'À : Service clients <clients@exemple.test>',
        'Email déclarant : paul@exemple.test',
      ),
    );
  });

  it('une adresse entre chevrons qui répète le mot d’avant part, courte ou non', () => {
    expect(
      shownText('Voir https://exemple.test/tarifs<https://exemple.test/tarifs> ce soir.'),
    ).toBe('Voir https://exemple.test/tarifs ce soir.');
    expect(shownText('Notre site : www.exemple.test<http://www.exemple.test/>')).toBe(
      'Notre site : www.exemple.test',
    );
    expect(shownText('Écrivez à paul@exemple.test <mailto:Paul@Exemple.test>.')).toBe(
      'Écrivez à paul@exemple.test.',
    );
  });

  it('garde ce qui se lit : un lien court sous un mot, une adresse qu’un nom ne dit pas, une adresse écrite en clair', () => {
    for (const kept of [
      'Notre grille <https://exemple.test/tarifs> est à jour.',
      'Écrivez à Camille<mailto:camille@exemple.test>.',
      `Le lien en clair : ${REWRITTEN}`,
      'Un crochet [à compléter] et un chevron <non fermé',
      '',
    ]) {
      expect(shownText(kept)).toBe(kept);
    }
  });

  it('une adresse trop longue pour se lire part, son mot reste ; à la limite, elle reste', () => {
    const at = (length: number) => `https://exemple.test/${'a'.repeat(length - 21)}`;
    expect(at(LINK_MAX_CHARS)).toHaveLength(LINK_MAX_CHARS);
    expect(shownText(`Cliquez ici <${at(LINK_MAX_CHARS)}> pour valider.`)).toBe(
      `Cliquez ici <${at(LINK_MAX_CHARS)}> pour valider.`,
    );
    expect(shownText(`Cliquez ici <${at(LINK_MAX_CHARS + 1)}> pour valider.`)).toBe(
      'Cliquez ici pour valider.',
    );
  });

  it('une image liée part avec son lien ; une ligne vidée disparaît, les lignes vides du mail restent', () => {
    expect(
      shownText(mail('Bonjour,', '', '[cid:logo.png@01DB]<https://exemple.test>', '', 'À demain.')),
    ).toBe(mail('Bonjour,', '', '', 'À demain.'));
    expect(shownText('Le plan [cid:plan.png@01DB] est joint.')).toBe('Le plan  est joint.');
    // les fins de ligne de Windows
    expect(shownText('Bonjour,\r\n[cid:a.png@01DB]\r\nÀ demain.')).toBe('Bonjour,\r\nÀ demain.');
  });

  it('l’extrait de la carte part du texte montré : ni renvoi d’image, ni adresse de lien', () => {
    const excerpt = excerptOf(
      shownText(mail('[cid:logo.png@01DB]', 'Bonjour,', `Voir le site<${REWRITTEN}>.`)),
    );
    expect(excerpt).toBe('Bonjour, Voir le site.');
  });

  it('lit vite un texte piégé', () => {
    const start = performance.now();
    shownText(`${'<https://'.repeat(20_000)}${'[cid:'.repeat(20_000)}`);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
