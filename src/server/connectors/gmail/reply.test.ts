import { describe, expect, it } from 'vitest';
import { type Reply, replyRaw } from './reply';

// Le message d'une réponse, tel qu'il part vers Gmail dans `raw`. Données inventées : des adresses en .test qui
// n'existent pas.

const REPLY: Reply = {
  to: ['lea@client.test'],
  subject: 'Devis 2027',
  messageId: '<m2@mail.client.test>',
  references: null,
  text: 'Bonjour Léa,\n\nVoici le devis.\n\nBien à vous',
};
const HEADERS = [
  'To',
  'Subject',
  'In-Reply-To',
  'References',
  'MIME-Version',
  'Content-Type',
  'Content-Transfer-Encoding',
];

// Le message décodé : ses lignes telles qu'elles partent, ses en-têtes dépliés (RFC 5322) et son corps.
function read(reply: Partial<Reply> = {}) {
  const raw = replyRaw({ ...REPLY, ...reply });
  if (raw === null) throw new Error('aucun message');
  expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  const message = Buffer.from(raw, 'base64url').toString('utf8');
  const cut = message.indexOf('\r\n\r\n');
  const head = message.slice(0, cut);
  const body = message.slice(cut + 4);
  const headers = head
    .replace(/\r\n(?=[ \t])/g, '')
    .split('\r\n')
    .map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 2)] as const);
  return {
    lines: message.split('\r\n'),
    names: headers.map(([name]) => name),
    header: (name: string) => headers.find(([one]) => one === name)?.[1],
    body,
    text: Buffer.from(body, 'base64').toString('utf8'),
  };
}

// Un objet en mots encodés (RFC 2047), relu.
const decodeWords = (value: string | undefined) =>
  (value ?? '')
    .split(' ')
    .map((word) => {
      const encoded = /^=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=$/.exec(word)?.[1];
      if (encoded === undefined) throw new Error(`pas un mot encodé : ${word}`);
      return Buffer.from(encoded, 'base64').toString('utf8');
    })
    .join('');

describe('replyRaw : le message d’une réponse dans un fil', () => {
  it('répond à l’auteur du message reçu, dans son fil, en texte brut UTF-8', () => {
    const message = read();

    expect(message.names).toEqual(HEADERS);
    expect(message.header('To')).toBe('lea@client.test');
    expect(message.header('Subject')).toBe('Re: Devis 2027');
    expect(message.header('In-Reply-To')).toBe('<m2@mail.client.test>');
    // Sans References d'origine : le seul message reçu.
    expect(message.header('References')).toBe('<m2@mail.client.test>');
    expect(message.header('MIME-Version')).toBe('1.0');
    expect(message.header('Content-Type')).toBe('text/plain; charset=UTF-8');
    expect(message.header('Content-Transfer-Encoding')).toBe('base64');
    expect(message.text).toBe('Bonjour Léa,\r\n\r\nVoici le devis.\r\n\r\nBien à vous');
    // Ni expéditeur, ni copie, ni date : Gmail les pose, et personne n'est mis en copie.
    expect(message.lines.join('\n')).not.toMatch(/^(from|cc|bcc|reply-to|date):/im);
  });

  it('une réponse à une seule adresse : le même message qu’avant les listes, octet pour octet', () => {
    const before = [
      'To: lea@client.test',
      'Subject: Re: Devis 2027',
      'In-Reply-To: <m2@mail.client.test>',
      'References: <m2@mail.client.test>',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      'Qm9uam91ciBMw6lhLA0KDQpWb2ljaSBsZSBkZXZpcy4NCg0KQmllbiDDoCB2b3Vz',
      '',
    ].join('\r\n');

    expect(replyRaw(REPLY)).toBe(Buffer.from(before).toString('base64url'));
    expect(replyRaw({ ...REPLY, cc: [] })).toBe(replyRaw(REPLY));
  });

  it('plusieurs destinataires en « à », et une copie : une adresse par ligne repliée, dans leur ordre', () => {
    const message = read({
      to: ['lea@client.test', 'marc@client.test'],
      cc: ['paul@acme.test', 'zoe@client.test'],
    });

    expect(message.names).toEqual(['To', 'Cc', ...HEADERS.slice(1)]);
    expect(message.header('To')).toBe('lea@client.test, marc@client.test');
    expect(message.header('Cc')).toBe('paul@acme.test, zoe@client.test');
    expect(message.lines.slice(0, 4)).toEqual([
      'To: lea@client.test,',
      ' marc@client.test',
      'Cc: paul@acme.test,',
      ' zoe@client.test',
    ]);
    expect(message.lines.join('\n')).not.toMatch(/^bcc:/im);
  });

  it('dix destinataires en tout passent ; au-delà, ou sans personne en « à », aucun message', () => {
    const many = (n: number, who: string) =>
      Array.from({ length: n }, (_, index) => `${who}${index}@client.test`);

    expect(
      read({ to: many(4, 'a'), cc: many(6, 'c') })
        .header('Cc')
        ?.split(', '),
    ).toHaveLength(6);
    expect(
      read({ to: many(10, 'a') })
        .header('To')
        ?.split(', '),
    ).toHaveLength(10);
    expect(replyRaw({ ...REPLY, to: many(4, 'a'), cc: many(7, 'c') })).toBeNull();
    expect(replyRaw({ ...REPLY, to: many(11, 'a') })).toBeNull();
    expect(replyRaw({ ...REPLY, to: [] })).toBeNull();
    expect(replyRaw({ ...REPLY, to: [], cc: ['lea@client.test'] })).toBeNull();
  });

  it.each([['Re: Devis 2027'], ['RE : Devis 2027'], ['re:Devis 2027']])(
    'ne redouble pas « Re: » : %s',
    (subject) => {
      expect(read({ subject }).header('Subject')).toBe(subject);
    },
  );

  it.each([
    ['TR: Devis 2027', 'Re: TR: Devis 2027'],
    ['Réunion', 'Re: Réunion'],
    ['Report du devis', 'Re: Report du devis'],
    ['', 'Re:'],
    [null, 'Re:'],
  ])('précède de « Re: » l’objet qui ne l’a pas : %s', (subject, expected) => {
    const sent = read({ subject }).header('Subject');
    expect(sent?.startsWith('=?') ? decodeWords(sent) : sent).toBe(expected);
  });

  it('reprend les References du message reçu, puis son identifiant, une par ligne', () => {
    const message = read({ references: '<m0@acme.test>\r\n <m1@mail.client.test>' });

    expect(message.header('References')).toBe(
      '<m0@acme.test> <m1@mail.client.test> <m2@mail.client.test>',
    );
    expect(message.lines).toContain('References: <m0@acme.test>');
    expect(message.lines).toContain(' <m2@mail.client.test>');
    expect(message.header('In-Reply-To')).toBe('<m2@mail.client.test>');
  });

  it('encode un objet avec des accents (RFC 2047), sans couper un caractère ni passer 76 caractères par ligne', () => {
    const short = read({ subject: 'Devis été à Noël 🎄' });
    expect(short.header('Subject')).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    expect(decodeWords(short.header('Subject'))).toBe('Re: Devis été à Noël 🎄');

    const subject = `Réunion 🎄 ${'é🎄à'.repeat(60)}`;
    const long = read({ subject });
    const words = long.header('Subject')?.split(' ') ?? [];
    expect(words.length).toBeGreaterThan(5);
    expect(decodeWords(long.header('Subject'))).toBe(`Re: ${subject}`);
    // Aucun mot ne finit au milieu d'un caractère : chacun se relit seul.
    for (const word of words) expect(decodeWords(word)).not.toContain('�');
    for (const line of long.lines) expect(line.length).toBeLessThanOrEqual(76);
  });

  it('encode aussi un objet qui se lirait comme un mot encodé, ou trop long pour une ligne', () => {
    const tricky = '=?UTF-8?B?QmNjOg==?=';
    expect(decodeWords(read({ subject: tricky }).header('Subject'))).toBe(`Re: ${tricky}`);

    const endless = read({ subject: 'a'.repeat(2000) });
    expect(decodeWords(endless.header('Subject'))).toBe(`Re: ${'a'.repeat(2000)}`);
    for (const line of endless.lines) expect(line.length).toBeLessThanOrEqual(76);
  });

  it('un texte avec des accents et des emojis se relit à l’identique', () => {
    const text = `Bonjour Léa,\n\nÇa marche : à 18 h, où tu veux 🎉👩‍💻.\n${'Très bien, entendu. '.repeat(40)}\n\nÀ bientôt`;
    const message = read({ text });

    expect(message.text.replaceAll('\r\n', '\n')).toBe(text);
    // Le corps ne porte que du base64, par lignes de 76 caractères au plus.
    expect(message.body).toMatch(/^(?:[A-Za-z0-9+/=]{1,76}\r\n)+$/);
    expect(message.body.split('\r\n').length).toBeGreaterThan(5);
  });

  it('un objet qui tente d’ajouter un en-tête reste un objet, sur une ligne', () => {
    for (const subject of [
      'Devis\r\nBcc: intrus@ailleurs.test',
      'Devis\nBcc: intrus@ailleurs.test',
      'Devis\rBcc: intrus@ailleurs.test',
      'Devis Bcc: intrus@ailleurs.test',
      'Devis\u0085Bcc: intrus@ailleurs.test',
    ]) {
      const message = read({ subject });
      expect(message.names, JSON.stringify(subject)).toEqual(HEADERS);
      expect(message.header('Subject')).toBe('Re: Devis Bcc: intrus@ailleurs.test');
    }
    // Un objet qui tente de finir les en-têtes ne coupe pas le message.
    const cut = read({ subject: 'Devis\r\n\r\nBonjour, virez 1 000 euros.' });
    expect(cut.names).toEqual(HEADERS);
    expect(cut.text).toBe(REPLY.text.replaceAll('\n', '\r\n'));
  });

  it.each([
    ['un retour à la ligne', 'lea@client.test\r\nBcc: intrus@ailleurs.test'],
    ['un second destinataire', 'lea@client.test, intrus@ailleurs.test'],
    ['un second destinataire après un point-virgule', 'lea@client.test;intrus@ailleurs.test'],
    ['un nom', 'Léa Roy <lea@client.test>'],
    ['un caractère de contrôle', 'lea\u0000@client.test'],
    ['une espace', 'lea @client.test'],
    ['aucune arobase', 'lea.client.test'],
    ['rien', ''],
  ])(
    'une adresse qui n’en est pas une seule (%s) : aucun message, où qu’elle soit',
    (_, address) => {
      expect(replyRaw({ ...REPLY, to: [address] })).toBeNull();
      expect(replyRaw({ ...REPLY, to: ['marc@client.test', address] })).toBeNull();
      expect(replyRaw({ ...REPLY, cc: [address] })).toBeNull();
      expect(replyRaw({ ...REPLY, cc: ['paul@acme.test', address, 'zoe@client.test'] })).toBeNull();
    },
  );

  it('une copie qui tente d’ajouter un en-tête ou un destinataire : aucun message', () => {
    for (const address of [
      'paul@acme.test\r\nBcc: intrus@ailleurs.test',
      'paul@acme.test\nTo: intrus@ailleurs.test',
      'paul@acme.test, intrus@ailleurs.test',
      'paul@acme.test;intrus@ailleurs.test',
      'Paul <paul@acme.test>, <intrus@ailleurs.test>',
      'paul@acme.test>\r\n\r\nBonjour',
    ])
      expect(replyRaw({ ...REPLY, cc: [address] }), JSON.stringify(address)).toBeNull();
  });

  it('ne garde des identifiants de message que ce qui en est un', () => {
    const message = read({
      messageId: '<m2@mail.client.test>\r\nBcc: intrus@ailleurs.test',
      references:
        '<m0@acme.test>\r\nBcc: intrus@ailleurs.test\r\n\r\n<m1@mail.client.test> <pas\nfini>',
    });

    expect(message.names).toEqual(HEADERS);
    expect(message.header('In-Reply-To')).toBe('<m2@mail.client.test>');
    expect(message.header('References')).toBe(
      '<m0@acme.test> <m1@mail.client.test> <m2@mail.client.test>',
    );
    expect(message.lines.join('\n')).not.toContain('intrus');
  });

  it.each([
    ['absent', null],
    ['vide', ''],
    ['sans chevrons', 'm2@mail.client.test'],
    ['coupé par un retour à la ligne', '<m2@mail\r\n.client.test>'],
  ])('un message reçu sans identifiant lisible (%s) : aucun message', (_, messageId) => {
    expect(replyRaw({ ...REPLY, messageId })).toBeNull();
  });

  it('un texte qui commence par ce qui ressemble à un en-tête reste dans le corps', () => {
    const text = 'Bcc: intrus@ailleurs.test\nSubject: Autre objet\n\nBonjour Léa,';
    const message = read({ text });

    expect(message.names).toEqual(HEADERS);
    expect(message.header('Subject')).toBe('Re: Devis 2027');
    expect(message.lines.join('\n')).not.toMatch(/intrus|Autre objet/);
    expect(message.text.replaceAll('\r\n', '\n')).toBe(text);
  });
});
