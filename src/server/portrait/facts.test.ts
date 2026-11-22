import { describe, expect, it } from 'vitest';
import { companyDomains, computeFacts, type SentMail } from './facts';

// Mails inventés pour ces tests : Julie (acme.test) écrit à des collègues et à des clients qui n'existent pas.

const OPTIONS = { domains: ['acme.test'], timeZone: 'Europe/Paris' };
const MINUTE = 60_000;

// Un mail du mardi 10 novembre 2026 à 10 h, heure de Paris, à un collègue.
function sent(mail: Partial<Omit<SentMail, 'sentAt'>> & { sentAt?: string } = {}): SentMail {
  return {
    to: ['paul@acme.test'],
    cc: [],
    text: 'Bonjour Paul,\nVoici le devis.\nCordialement',
    repliesToAt: null,
    ...mail,
    sentAt: new Date(mail.sentAt ?? '2026-11-10T09:00:00Z'),
  };
}

const facts = (mails: SentMail[], options = OPTIONS) => computeFacts(mails, options);

describe('companyDomains', () => {
  it('garde les domaines des membres, une fois chacun, sans les messageries grand public', () => {
    const domains = companyDomains([
      'julie@acme.test',
      'Paul@ACME.test',
      'zoe@filiale-acme.test',
      'exemple-invente@gmail.com',
      'exemple-invente@orange.fr',
      '', // un ancien membre : son adresse n'est plus rendue
    ]);
    expect(domains).toEqual(['acme.test', 'filiale-acme.test']);
  });
});

describe('computeFacts', () => {
  it('ne devine rien sans aucun mail', () => {
    const empty = { mails: 0, mots: { mediane: null, mails: 0 }, appels: [], politesses: [] };
    const noRegister = { tutoiement: null, vouvoiement: null, mails: 0 };
    expect(facts([])).toEqual({
      mails: 0,
      automatiques: 0,
      periode: null,
      mailsParSemaine: null,
      langues: { fr: 0, en: 0, autre: 0, inconnue: 0 },
      interlocuteurs: [],
      style: {
        tous: { ...empty, registre: noRegister },
        interne: { ...empty, registre: noRegister },
        externe: { ...empty, registre: noRegister },
      },
      delaiReponse: {
        tous: { medianeMinutes: null, reponses: 0 },
        interne: { medianeMinutes: null, reponses: 0 },
        externe: { medianeMinutes: null, reponses: 0 },
      },
      heures: new Array(24).fill(0),
      jours: new Array(7).fill(0),
      signature: null,
    });
  });

  it('lit un seul mail, sans rythme ni délai', () => {
    const result = facts([sent({ text: 'Bonjour Paul,\nPeux-tu relire le devis ?\nMerci' })]);
    expect(result).toMatchObject({
      mails: 1,
      periode: { debut: '2026-11-10T09:00:00.000Z', fin: '2026-11-10T09:00:00.000Z' },
      mailsParSemaine: null,
      langues: { fr: 1, en: 0, autre: 0, inconnue: 0 },
      interlocuteurs: [
        {
          adresse: 'paul@acme.test',
          a: 1,
          copie: 0,
          dernier: '2026-11-10T09:00:00.000Z',
          type: 'interne',
          registre: 'tutoiement',
          tutoiement: 1,
          vouvoiement: 0,
        },
      ],
      delaiReponse: { interne: { medianeMinutes: null, reponses: 0 } },
      signature: null,
    });
    expect(result.style.interne).toEqual({
      mails: 1,
      mots: { mediane: 7, mails: 1 }, // le « ? » isolé n'est pas un mot
      appels: [{ formule: 'Bonjour', mails: 1 }],
      politesses: [{ formule: 'Merci', mails: 1 }],
      registre: { tutoiement: 1, vouvoiement: 0, mails: 1 },
    });
    expect(result.heures[10]).toBe(1);
    expect(result.jours).toEqual([0, 1, 0, 0, 0, 0, 0]);
  });

  it('se sérialise en JSON sans rien perdre', () => {
    const result = facts([sent(), sent({ to: ['lea@client.test'] })]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('compte la période et le rythme par semaine', () => {
    const result = facts([
      sent({ sentAt: '2026-11-02T09:00:00Z' }),
      sent({ sentAt: '2026-11-10T09:00:00Z' }),
      sent({ sentAt: '2026-11-16T09:00:00Z' }),
    ]);
    expect(result.periode).toEqual({
      debut: '2026-11-02T09:00:00.000Z',
      fin: '2026-11-16T09:00:00.000Z',
    });
    expect(result.mailsParSemaine).toBe(1.5); // 3 mails sur 2 semaines
    // Sur six jours, pas de rythme par semaine.
    const short = facts([
      sent({ sentAt: '2026-11-02T09:00:00Z' }),
      sent({ sentAt: '2026-11-08T09:00:00Z' }),
    ]);
    expect(short.mailsParSemaine).toBeNull();
  });

  describe('les interlocuteurs', () => {
    it('compte une adresse en « à » et en copie une seule fois par mail, en « à »', () => {
      const result = facts([
        sent({
          to: ['paul@acme.test', 'Paul@acme.test'],
          cc: ['paul@acme.test', 'lea@client.test'],
        }),
        sent({ to: ['lea@client.test'], cc: ['paul@acme.test'], sentAt: '2026-11-12T09:00:00Z' }),
      ]);
      expect(result.interlocuteurs).toMatchObject([
        { adresse: 'lea@client.test', a: 1, copie: 1, dernier: '2026-11-12T09:00:00.000Z' },
        { adresse: 'paul@acme.test', a: 1, copie: 1, dernier: '2026-11-12T09:00:00.000Z' },
      ]);
    });

    it('garde les 30 premiers par nombre de mails en « à », sans ceux qui ne sont qu’en copie', () => {
      const others = Array.from({ length: 31 }, (_, index) =>
        sent({
          to: [`client${String(index).padStart(2, '0')}@client.test`],
          cc: ['noa@acme.test'],
        }),
      );
      const result = facts([sent(), sent(), ...others]);
      expect(result.interlocuteurs).toHaveLength(30);
      expect(result.interlocuteurs[0]).toMatchObject({ adresse: 'paul@acme.test', a: 2 });
      expect(result.interlocuteurs.map((one) => one.adresse)).not.toContain('noa@acme.test');
      expect(result.interlocuteurs.at(-1)?.adresse).toBe('client28@client.test');
    });

    it('dit interne le domaine de la société, jamais une messagerie grand public', () => {
      const mails = [
        sent({ to: ['paul@acme.test'] }),
        sent({ to: ['lea@client.test'] }),
        sent({ to: ['exemple-invente@gmail.com'] }),
      ];
      const types = (domains: string[]) =>
        Object.fromEntries(
          facts(mails, { ...OPTIONS, domains }).interlocuteurs.map((one) => [
            one.adresse,
            one.type,
          ]),
        );
      expect(types(['ACME.test', 'gmail.com'])).toEqual({
        'paul@acme.test': 'interne',
        'lea@client.test': 'externe',
        'exemple-invente@gmail.com': 'externe',
      });
      // Sans domaine de société connu, personne n'est dit interne ni externe.
      expect(types(['gmail.com'])).toEqual({
        'paul@acme.test': null,
        'lea@client.test': null,
        'exemple-invente@gmail.com': null,
      });
      expect(facts(mails, { ...OPTIONS, domains: [] }).style.externe.mails).toBe(0);
    });
  });

  describe('le registre', () => {
    const registers = (...texts: string[]) => {
      const [person] = facts(texts.map((text) => sent({ text }))).interlocuteurs;
      return [person?.registre, person?.tutoiement, person?.vouvoiement];
    };

    it('lit le tutoiement et le vouvoiement dans les mails à une seule personne', () => {
      expect(
        registers('Bonjour, peux-tu relire ?', 'Je t’envoie le devis.', 'Merci pour ton aide'),
      ).toEqual(['tutoiement', 3, 0]);
      // Les plus courts, sans autre mot courant du français que la marque.
      expect(registers('Tu viens lundi ?', 'Ton avis ?')).toEqual(['tutoiement', 2, 0]);
      expect(
        registers('Bonjour, pouvez-vous relire ?', 'Voici votre devis et vos factures.'),
      ).toEqual(['vouvoiement', 0, 2]);
    });

    it('ne compte ni un mot qui contient une marque, ni un rendez-vous, ni un mail qui a les deux', () => {
      expect(registers('Bonjour, la côte est belle cet été.')).toEqual([null, 0, 0]);
      expect(registers('Bonjour, le rendez-vous est pour lundi.')).toEqual([null, 0, 0]);
      expect(registers('Bonjour, je te vouvoie : vous allez bien ?')).toEqual([null, 0, 0]);
    });

    it('ne lit pas le registre dans le texte cité', () => {
      const reply = [
        'Bonjour, pouvez-vous confirmer ?',
        'Le 9 nov. 2026 à 10:02, Paul Durand <paul@acme.test> a écrit :',
        '> Peux-tu m’envoyer le devis ?',
      ].join('\n');
      expect(registers(reply)).toEqual(['vouvoiement', 0, 1]);
    });

    // Une signature complète sur ses nouveaux mails, une courte sur ses réponses : seule la courte, majoritaire,
    // est retirée. La mention légale de l'autre dit « vous » à tout le monde.
    it('ne lit pas le registre dans une ligne que ses mails répètent, sauf une formule de politesse', () => {
      const legal =
        'Ce message est confidentiel. Si vous n’êtes pas le destinataire, merci de le détruire.';
      const fresh = (x: number) =>
        `Bonjour Paul,\nLe devis ${x} est prêt.\nJulie Martin\nDirectrice commerciale, Acme\n${legal}`;
      const reply = (x: number) => `Ok pour le devis ${x}, je te rappelle.\nJulie`;
      expect(
        registers(...[1, 2, 3, 4, 5].map(fresh), ...[6, 7, 8, 9, 10, 11, 12].map(reply)),
      ).toEqual(['tutoiement', 7, 0]);
      const polite = (x: number) => `Bonjour Paul,\nLe devis ${x} est prêt.\nBien à toi,\nJulie`;
      expect(registers(...[1, 2, 3, 4, 5, 6].map(polite))).toEqual(['tutoiement', 6, 0]);
    });

    it('reste inconnu à égalité, et suit le plus fréquent sinon', () => {
      expect(registers('Bonjour, tu viens ?', 'Bonjour, vous venez ?')).toEqual([null, 1, 1]);
      expect(
        registers('Bonjour, tu viens ?', 'Bonjour, vous venez ?', 'Bonjour, tu es là ?'),
      ).toEqual(['tutoiement', 2, 1]);
    });

    it('ne se lit ni à plusieurs, ni avec une copie, ni en anglais', () => {
      const result = facts([
        sent({ to: ['paul@acme.test', 'noa@acme.test'], text: 'Bonjour, vous venez lundi ?' }),
        sent({ cc: ['noa@acme.test'], text: 'Bonjour, vous venez lundi ?' }),
        sent({ text: 'Hi Paul, can you send the file? Tu is not a word here. Thanks' }),
      ]);
      expect(result.interlocuteurs.map((one) => [one.tutoiement, one.vouvoiement])).toEqual([
        [0, 0],
        [0, 0],
      ]);
      expect(result.style.interne.registre).toEqual({
        tutoiement: null,
        vouvoiement: null,
        mails: 0,
      });
    });
  });

  it('reconnaît la langue de chaque mail', () => {
    const result = facts([
      sent({ text: 'Bonjour Paul,\nVoici le devis pour la semaine prochaine.\nCordialement' }),
      sent({ text: 'Hello Paul, tu peux me renvoyer le fichier ? Merci' }),
      sent({ text: 'Hi Paul,\nPlease find the quote for next week.\nBest' }),
      sent({ text: 'Hola Paul, te envío la factura de la semana pasada. Un saludo' }),
      // Un seul mot courant du français (« du ») sur quatorze : pas assez pour le dire français.
      sent({
        text: 'Hallo Paul, anbei das Angebot für nächste Woche. Kannst du es prüfen? Viele Grüße',
      }),
      sent({ text: 'Tu viens lundi ?' }),
      // Trop courts pour dire une langue étrangère, et un transfert sans un mot.
      sent({ text: 'Ok' }),
      sent({ text: 'Ci-joint le contrat signé.' }),
      sent({ text: '---------- Forwarded message ---------\nBonjour, voici le devis.' }),
    ]);
    expect(result.langues).toEqual({ fr: 3, en: 1, autre: 2, inconnue: 3 });
  });

  describe('le style par type de destinataire', () => {
    it('range un mail à l’extérieur dès qu’une personne de l’extérieur le lit', () => {
      const result = facts([
        sent({ to: ['paul@acme.test', 'noa@acme.test'] }),
        sent({ to: ['paul@acme.test'], cc: ['lea@client.test'] }),
        sent({ to: ['lea@client.test', 'paul@acme.test'] }),
        sent({ to: [], cc: [] }), // des destinataires en copie cachée, ou un mail relevé avant qu'on les garde
      ]);
      expect(result.style.interne.mails).toBe(1);
      expect(result.style.externe.mails).toBe(2);
    });

    it('rend la médiane des mots, sans les mails où elle n’a rien écrit', () => {
      const words = (count: number) => sent({ text: Array(count).fill('mot').join(' ') });
      const forward = sent({ text: '---------- Forwarded message ---------\nBonjour à tous' });
      expect(facts([words(3), words(40), words(10), forward]).style.interne.mots).toEqual({
        mediane: 10,
        mails: 3,
      });
      expect(facts([words(3), words(40), words(10), words(20)]).style.interne.mots).toEqual({
        mediane: 15,
        mails: 4,
      });
    });

    it('ne compte dans les mots ni la citation ni la signature', () => {
      const text = [
        'Bonjour Paul,',
        'Voici le devis.',
        '-- ',
        'Julie Martin, directrice commerciale',
        'Le 9 nov. 2026 à 10:02, Paul Durand <paul@acme.test> a écrit :',
        '> Peux-tu m’envoyer le devis ?',
      ].join('\n');
      expect(facts([sent({ text })]).style.interne.mots.mediane).toBe(5);
    });

    it('rend les trois formules d’appel les plus fréquentes, sans le prénom', () => {
      const openings = [
        'Bonjour Paul,',
        'bonjour Paul, merci pour ton retour.',
        'Bonjour,',
        'Salut Paul',
        'Salut !',
        'Hello Paul,',
        'Bonjour à tous,',
        'Hier j’ai vu Paul.', // « hi » n'ouvre pas « Hier »
        'Paul,',
      ];
      const result = facts(
        openings.map((opening) => sent({ text: `${opening}\nVoici le devis.` })),
      );
      expect(result.style.interne.appels).toEqual([
        { formule: 'Bonjour', mails: 3 },
        { formule: 'Salut', mails: 2 },
        { formule: 'Bonjour à tous', mails: 1 },
      ]);
    });

    it('rend les trois formules de politesse les plus fréquentes, même suivies d’un prénom', () => {
      const endings = [
        'Cordialement',
        'Cordialement,\nJulie',
        'cordialement.\nJulie Martin\nAcme',
        'Bonne journée !',
        'Bonne journée,',
        'Merci d’avance',
        'Best,\nJulie',
        'Merci pour le devis, je regarde.', // une phrase, pas une formule
        'Cordialement,\nJulie Martin\nDirectrice commerciale\nAcme\n01 23 45 67 89',
      ];
      const result = facts(
        endings.map((ending) => sent({ text: `Bonjour,\nVoici le devis.\n${ending}` })),
      );
      expect(result.style.interne.politesses).toEqual([
        { formule: 'Cordialement', mails: 3 },
        { formule: 'Bonne journée', mails: 2 },
        { formule: 'Best', mails: 1 },
      ]);
    });

    it('rend la part de tutoiement et de vouvoiement de chaque type', () => {
      const result = facts([
        sent({ text: 'Bonjour, tu viens ?' }),
        sent({ text: 'Bonjour, tu es là ?' }),
        sent({ text: 'Bonjour, tu as le devis ?' }),
        sent({ text: 'Bonjour, vous venez ?' }),
        sent({ text: 'Bonjour, le devis est prêt.' }),
        sent({ to: ['lea@client.test'], text: 'Bonjour, voici votre devis.' }),
      ]);
      expect(result.style.interne.registre).toEqual({
        tutoiement: 0.75,
        vouvoiement: 0.25,
        mails: 4,
      });
      expect(result.style.externe.registre).toEqual({ tutoiement: 0, vouvoiement: 1, mails: 1 });
    });
  });

  it('rend la médiane du délai de réponse, interne et externe, sur les seules réponses', () => {
    const reply = (minutes: number, to = 'paul@acme.test') =>
      sent({
        to: [to],
        repliesToAt: new Date(Date.parse('2026-11-10T09:00:00Z') - minutes * MINUTE),
      });
    const result = facts([
      reply(5),
      reply(30),
      reply(600),
      sent(), // un premier mail, ou une relance : pas une réponse
      reply(-10), // un mail « reçu » après l'envoi : une horloge fausse, écartée
      reply(20, 'lea@client.test'),
      reply(41, 'lea@client.test'),
    ]);
    expect(result.delaiReponse).toEqual({
      tous: { medianeMinutes: 30, reponses: 5 },
      interne: { medianeMinutes: 30, reponses: 3 },
      externe: { medianeMinutes: 31, reponses: 2 },
    });
  });

  it("remplit le style et le délai de tous ses mails quand la société n'a pas de domaine", () => {
    // Une boîte sur une messagerie grand public : personne n'est dit interne ni externe.
    const all = facts(
      [
        sent({ text: 'Bonjour Paul,\nTu as le devis ?\nMerci' }),
        sent({ repliesToAt: new Date('2026-11-10T08:30:00Z') }),
      ],
      { domains: [], timeZone: 'Europe/Paris' },
    );
    expect(all.style.tous.mails).toBe(2);
    expect(all.style.tous.appels).toEqual([{ formule: 'Bonjour', mails: 2 }]);
    expect(all.style.tous.registre).toEqual({ tutoiement: 1, vouvoiement: 0, mails: 1 });
    expect(all.delaiReponse.tous).toEqual({ medianeMinutes: 30, reponses: 1 });
    expect(all.style.interne.mails + all.style.externe.mails).toBe(0);
  });

  describe('les envois automatiques', () => {
    // La notification d'un outil, envoyée du compte de Julie : les mêmes libellés, des valeurs qui changent.
    const lead = (n: number) =>
      sent({
        to: ['alertes@acme.test'],
        text: `Nouveau contact ajouté au tableau\nNom : Exemple Inventé ${n}\nTéléphone : 01 00 00 00 ${10 + n}\nCode postal : 7500${n}`,
        sentAt: `2026-11-0${n}T09:00:00Z`,
      });

    it('écarte un même gabarit envoyé cinq fois aux mêmes destinataires, et le compte', () => {
      const all = facts([
        ...[1, 2, 3, 4, 5, 6].map(lead),
        sent(),
        sent({ to: ['zoe@client.test'] }),
      ]);
      expect(all.mails).toBe(2);
      expect(all.automatiques).toBe(6);
      expect(all.interlocuteurs.map((one) => one.adresse)).toEqual([
        'paul@acme.test',
        'zoe@client.test',
      ]);
      expect(all.style.tous.mails).toBe(2);
    });

    it("garde ce qui revient moins de cinq fois, ou vers d'autres destinataires", () => {
      expect(facts([1, 2, 3, 4].map(lead)).automatiques).toBe(0);
      const spread = [1, 2, 3, 4, 5].map((n) => ({ ...lead(n), to: [`contact${n}@client.test`] }));
      expect(facts(spread).automatiques).toBe(0);
    });
  });

  it('range les envois par heure et par jour dans le fuseau demandé', () => {
    const mails = [
      sent({ sentAt: '2026-11-10T09:15:00Z' }), // mardi 10 h 15 à Paris
      sent({ sentAt: '2026-11-10T09:45:00Z' }),
      sent({ sentAt: '2026-11-15T23:30:00Z' }), // dimanche à Londres, lundi 0 h 30 à Paris
      sent({ sentAt: '2026-07-01T22:30:00Z' }), // l'heure d'été : jeudi 0 h 30 à Paris
    ];
    const paris = facts(mails);
    expect(paris.heures[10]).toBe(2);
    expect(paris.heures[0]).toBe(2);
    expect(paris.jours).toEqual([1, 2, 0, 1, 0, 0, 0]);
    const london = facts(mails, { ...OPTIONS, timeZone: 'Europe/London' });
    expect(london.heures[9]).toBe(2);
    expect(london.heures[23]).toBe(2);
    expect(london.jours).toEqual([0, 2, 1, 0, 0, 0, 1]);
  });

  describe('la signature', () => {
    it('rend la signature la plus fréquente après « -- »', () => {
      const signed = (signature: string) =>
        sent({ text: `Bonjour,\nVoici le devis.\n-- \n${signature}` });
      const result = facts([
        signed('Julie Martin\nAcme'),
        signed('Julie Martin\nAcme'),
        signed('Julie'),
        sent({ text: 'Ok pour lundi.' }),
      ]);
      expect(result.signature).toEqual({ texte: 'Julie Martin\nAcme', mails: 2 });
    });

    it('repère sans séparateur le bloc de fin que la plupart des mails répètent', () => {
      const block = 'Julie Martin\nDirectrice commerciale\n\nAcme · 01 23 45 67 89';
      const signed = (body: string) =>
        sent({ text: `Bonjour Paul,\n${body}\nCordialement,\n${block}` });
      const result = facts([
        signed('Voici le devis.'),
        signed('Le devis est signé.'),
        signed('Le devis est parti.'),
        signed('Je relance le client.'),
        signed('On se voit lundi.'),
        sent({ text: 'Ok pour lundi.' }),
        sent({ text: 'Bien reçu.\nJulie' }),
      ]);
      expect(result.signature).toEqual({
        texte: 'Julie Martin\nDirectrice commerciale\nAcme · 01 23 45 67 89',
        mails: 5,
      });
      // La formule de politesse reste du texte, la signature n'en est plus : 7 mots, pas 18.
      expect(result.style.interne.politesses).toEqual([{ formule: 'Cordialement', mails: 5 }]);
      expect(result.style.interne.mots.mediane).toBe(7);
    });

    it('ne prend pas pour une signature une fin trop peu répétée', () => {
      const signed = sent({ text: 'Voici le devis.\nJulie Martin' });
      const other = sent({ text: 'Ok pour lundi.' });
      // Quatre mails : moins que le minimum.
      expect(facts([signed, signed, signed, signed]).signature).toBeNull();
      // Cinq sur dix : pas la plupart.
      expect(
        facts([signed, signed, signed, signed, signed, other, other, other, other, other])
          .signature,
      ).toBeNull();
      // Une formule de politesse que tous répètent n'est pas une signature.
      const polite = sent({ text: 'Voici le devis.\nCordialement' });
      expect(facts([polite, polite, polite, polite, polite, polite]).signature).toBeNull();
    });
  });
});
