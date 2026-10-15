import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { closeConnector } from './connector';
import page1 from './fixtures/activities-page-1.json';
import page2 from './fixtures/activities-page-2.json';
import leadDubois from './fixtures/lead-dubois.json';
import leadGarnier from './fixtures/lead-garnier.json';
import me from './fixtures/me.json';

const API = 'https://api.close.com/api/v1';
const ACTIVITIES = `${API}/activity/`;
const KEY = 'api_CLEDETEST0123456789abcdefghijklmnop';
const config = { apiKey: KEY };
const SINCE = new Date('2026-09-15T00:00:00Z');
const LEAD_DUBOIS = 'lead_DuboisConseil000000000000000000000000000001';
const LEAD_GARNIER = 'lead_GarnierSA00000000000000000000000000000000002';
const leadUrl = (id: string) => `${API}/lead/${id}/`;
const EMAIL_IN = 'acti_Em1IncomingDevisDubois00000000000000000000001';
const BASIC = `Basic ${Buffer.from(`${KEY}:`).toString('base64')}`;

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const byId = (pages: SyncPage[], id: string) =>
  itemsOf(pages).find((item) => item.externalId === `activity:${id}`);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const paramsOf = (url: string | undefined) =>
  Object.fromEntries(new URL(url ?? '').searchParams) as Record<string, string>;

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date } = {},
) {
  const { http, calls } = testHttp(closeConnector, config, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(closeConnector.sync(config, state, http));
  return { pages, calls };
}

const leadRoutes = (): FakeRoute[] => [
  { url: leadUrl(LEAD_DUBOIS), json: leadDubois },
  { url: leadUrl(LEAD_GARNIER), json: leadGarnier },
];

// Les deux pages de la fixture : l'outil rend la liste de la plus récente à la plus ancienne.
function firstPassRoutes(): FakeRoute[] {
  return [{ url: ACTIVITIES, json: page1 }, { url: ACTIVITIES, json: page2 }, ...leadRoutes()];
}

function note(id: string, createdAt: string, extra: Record<string, unknown> = {}) {
  return {
    _type: 'Note',
    id,
    lead_id: LEAD_DUBOIS,
    date_created: createdAt,
    activity_at: createdAt,
    user_name: 'Marie Durand',
    note: `Texte de ${id}`,
    ...extra,
  };
}

const list = (data: unknown[], hasMore = false) => ({ data, has_more: hasMore });

describe('close : configuration', () => {
  const schema = closeConnector.configSchema;

  it('accepte une clé d’API, sans les espaces autour', () => {
    expect(schema.parse({ apiKey: `  ${KEY} ` })).toEqual({ apiKey: KEY });
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ apiKey: '   ' }).success).toBe(false);
  });

  it('fixe l’hôte et le champ à chiffrer', () => {
    expect(closeConnector.hosts(config)).toEqual(['api.close.com']);
    expect(closeConnector.secretFields).toEqual(['apiKey']);
  });

  it('est disponible dans le registre et dans le catalogue', () => {
    expect(getConnector('close')).toBe(closeConnector);
    const entry = listCatalog().find((item) => item.id === 'close');
    expect(entry?.available).toBe(true);
    expect(entry?.fields.map((field) => field.name)).toEqual(['apiKey']);
  });
});

describe('close : verify', () => {
  it('lit l’utilisateur de la clé, avec la clé en Basic (clé puis deux-points)', async () => {
    const { http, calls } = testHttp(closeConnector, config, [{ url: `${API}/me/`, json: me }]);

    const result = await closeConnector.verify(config, http);

    expect(result).toEqual({ account: 'Marie Durand (Acme)' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.authorization).toBe(BASIC);
  });

  it('retombe sur l’adresse e-mail quand l’organisation n’a pas de nom', async () => {
    const reply = { first_name: 'Marie', last_name: 'Durand', email: 'marie@acme.test' };
    const { http } = testHttp(closeConnector, config, [{ url: `${API}/me/`, json: reply }]);

    expect(await closeConnector.verify(config, http)).toEqual({
      account: 'Marie Durand (marie@acme.test)',
    });
  });

  it('refuse une clé rejetée, sans la reprendre dans le message', async () => {
    const { http } = testHttp(closeConnector, config, [{ url: `${API}/me/`, status: 401 }]);

    const failure = await closeConnector.verify(config, http).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorAuthError);
    expect((failure as Error).message).not.toContain(KEY);
  });
});

describe('close : sync, premier passage', () => {
  it('demande les activités créées depuis since, 100 par page, la clé dans l’en-tête seulement', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls[0]?.url.startsWith(`${ACTIVITIES}?`)).toBe(true);
    const params = paramsOf(calls[0]?.url);
    expect(params.date_created__gte).toBe('2026-09-15T00:00:00.000Z');
    expect(params._limit).toBe('100');
    expect(params._skip).toBe('0');
    for (const call of calls) {
      expect(call.headers.authorization).toBe(BASIC);
      expect(call.url).not.toContain(KEY);
    }
  });

  it('ne demande que les champs lus (texte, transcriptions, auteur), pas le HTML', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const fields = paramsOf(calls[0]?.url)._fields?.split(',');
    expect(fields).toEqual(
      expect.arrayContaining([
        '_type',
        'id',
        'lead_id',
        'date_created',
        'activity_at',
        'user_name',
        'note',
        'subject',
        'body_text',
        'text',
        'direction',
        'status',
        'recording_transcript',
        'voicemail_transcript',
      ]),
    );
    expect(fields).not.toContain('body_html');
  });

  it('lit la page suivante en sautant les activités déjà reçues', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const activityCalls = calls.filter((call) => call.url.startsWith(ACTIVITIES));
    expect(activityCalls.map((call) => paramsOf(call.url)._skip)).toEqual(['0', '5']);
  });

  it('rend les activités dans l’ordre de leur création, quel que soit l’ordre de la liste', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(1);
    expect(idsOf(pages)).toEqual([
      'activity:acti_Em3OutgoingDemoGarnier0000000000000000000000008',
      'activity:acti_Wa1OutgoingLienDemoGarnier000000000000000000007',
      'activity:acti_No1SalonDubois0000000000000000000000000006',
      'activity:acti_Sm1InboundDemoGarnier0000000000000000000000004',
      'activity:acti_Ca1OutboundQualifDubois0000000000000000000003',
      `activity:${EMAIL_IN}`,
    ]);
  });

  it('ne rend ni les autres types d’activité, ni les brouillons, ni ce qui n’a pas de texte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const ids = idsOf(pages).join(' ');
    expect(ids).not.toContain('acti_Lsc1'); // changement de statut
    expect(ids).not.toContain('acti_Cr1'); // création de la fiche
    expect(ids).not.toContain('acti_Em2'); // e-mail en brouillon
    expect(ids).not.toContain('acti_No2'); // note vide
    expect(ids).not.toContain('acti_Ca2'); // appel sans note ni transcription
  });

  it('range un e-mail reçu en tour participant, signé de son expéditeur, daté de son envoi', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(byId(pages, EMAIL_IN)).toEqual({
      externalId: `activity:${EMAIL_IN}`,
      nature: 'fil',
      title: 'Dubois Conseil',
      url: `https://app.close.com/lead/${LEAD_DUBOIS}/`,
      updatedAt: '2026-10-14T16:20:00.000Z',
      origin: { lead: 'Dubois Conseil', type: 'E-mail' },
      turns: [
        {
          externalId: 'body',
          role: 'participant',
          author: { name: 'Claire Dubois', email: 'claire.dubois@dubois.test' },
          text: 'E-mail reçu\nObjet : Re: Devis formation équipe\n\nBonjour Marie,\n\nNous validons le devis de 12 000 € HT, à condition que la formation soit incluse.\n\nClaire Dubois',
          ts: '2026-10-14T16:20:00.000Z',
        },
      ],
    });
  });

  it('range un e-mail envoyé au nom de l’utilisateur de Close, avec une date à décalage horaire en UTC', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = byId(pages, 'acti_Em3OutgoingDemoGarnier0000000000000000000000008');
    expect(item?.title).toBe('Garnier SA');
    expect(item?.updatedAt).toBe('2026-10-10T08:00:00.000Z');
    expect(item?.turns).toEqual([
      {
        externalId: 'body',
        role: 'participant',
        author: { name: 'David Martin', email: 'david@acme.test' },
        text: 'E-mail envoyé\nObjet : Démo de Leon\n\nBonjour Paul,\n\nVoici les créneaux pour la démo : mardi 14h ou jeudi 10h.\n\nDavid',
        ts: '2026-10-10T08:00:00.000Z',
      },
    ]);
  });

  it('range une note en tour document, au nom de son auteur', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = byId(pages, 'acti_No1SalonDubois0000000000000000000000000006');
    expect(item?.nature).toBe('note');
    expect(item?.origin).toEqual({ lead: 'Dubois Conseil', type: 'Note' });
    expect(item?.turns).toEqual([
      {
        externalId: 'body',
        role: 'document',
        author: { name: 'David Martin', email: null },
        text: 'Premier contact au salon. Intéressée par la formation.\n\nÀ rappeler la semaine prochaine.',
        ts: '2026-10-12T09:15:00.000Z',
      },
    ]);
  });

  it('range un appel avec sa note, son résumé et sa transcription par locuteur', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = byId(pages, 'acti_Ca1OutboundQualifDubois0000000000000000000003');
    expect(item?.nature).toBe('note');
    expect(item?.updatedAt).toBe('2026-10-14T10:00:00.000Z');
    expect(item?.origin).toEqual({ lead: 'Dubois Conseil', type: 'Appel' });
    expect(item?.turns).toEqual([
      {
        externalId: 'body',
        role: 'document',
        author: { name: 'Marie Durand', email: null },
        text: [
          'Appel sortant (5 min)',
          'Appel de qualification : budget confirmé.',
          '',
          'Résumé : Claire confirme le budget de 12 000 € pour cette année.',
          '',
          'Transcription :',
          'Marie Durand : Bonjour Claire, merci de me répondre. Je voulais faire le point sur le devis.',
          'Claire Dubois : Bonjour Marie. Oui, le budget est validé pour cette année.',
        ].join('\n'),
        ts: '2026-10-14T10:00:00.000Z',
      },
    ]);
  });

  it('range un SMS reçu sans auteur nommé, et un message WhatsApp envoyé au nom de l’utilisateur', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const sms = byId(pages, 'acti_Sm1InboundDemoGarnier0000000000000000000000004');
    expect(sms?.nature).toBe('fil');
    expect(sms?.turns[0]).toMatchObject({
      role: 'participant',
      author: { name: null, email: null },
      text: 'SMS reçu\nPeut-on décaler la démo à jeudi ?',
    });
    const whatsapp = byId(pages, 'acti_Wa1OutgoingLienDemoGarnier000000000000000000007');
    expect(whatsapp?.origin).toEqual({ lead: 'Garnier SA', type: 'WhatsApp' });
    expect(whatsapp?.turns[0]).toMatchObject({
      author: { name: 'David Martin', email: null },
      text: 'Message WhatsApp envoyé\nBonjour, voici le lien de la démo.',
    });
  });

  it('cherche le nom de chaque fiche une seule fois, avec le seul champ utile', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const leadCalls = calls.filter((call) => call.url.startsWith(`${API}/lead/`));
    expect(leadCalls).toHaveLength(2);
    for (const call of leadCalls) {
      expect(paramsOf(call.url)).toEqual({ _fields: 'display_name' });
      expect(call.headers.authorization).toBe(BASIC);
    }
  });

  it('range le curseur après la dernière activité lue', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(cursorOf(pages.at(-1))).toEqual({
      at: Date.parse('2026-10-14T16:20:05.123Z'),
      seen: [EMAIL_IN],
    });
  });

  it('rend des dates que le socle accepte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    for (const item of itemsOf(pages))
      expect(normalizeItem(item, 'close'), item.externalId).not.toBeNull();
  });

  it('ne refait pas la première page avec le dernier curseur rendu', async () => {
    const first = await runSync(firstPassRoutes());
    const cursor = first.pages.at(-1)?.cursor ?? null;

    const { pages, calls } = await runSync(
      [
        { url: ACTIVITIES, json: page1 },
        { url: ACTIVITIES, json: page2 },
      ],
      { cursor },
    );

    expect(pages).toEqual([]);
    expect(paramsOf(calls[0]?.url).date_created__gte).toBe('2026-10-14T16:20:05.123Z');
  });

  it('ne rend aucune page quand il n’y a rien de nouveau', async () => {
    const { pages, calls } = await runSync([{ url: ACTIVITIES, json: list([]) }]);

    expect(pages).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

describe('close : sync, pages et curseur', () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 0, minutes)).toISOString();

  it('rend au plus 100 éléments par page, avec un curseur après chacun', async () => {
    const rows = Array.from({ length: 101 }, (_, i) =>
      note(`acti_${String(i).padStart(3, '0')}`, at(100 - i)),
    );

    const { pages } = await runSync([
      { url: ACTIVITIES, json: list(rows) },
      { url: leadUrl(LEAD_DUBOIS), json: leadDubois },
    ]);

    expect(pages.map((page) => page.items.length)).toEqual([100, 1]);
    // Dans l'ordre croissant : acti_100 est la plus ancienne (minute 0), acti_000 la plus récente.
    expect(cursorOf(pages[0])).toEqual({ at: Date.parse(at(99)), seen: ['acti_001'] });
    expect(cursorOf(pages[1])).toEqual({ at: Date.parse(at(100)), seen: ['acti_000'] });
  });

  it('avance le curseur sur les activités ignorées, pour ne pas les relire à chaque passage', async () => {
    const status = (id: string, minutes: number) => ({
      _type: 'LeadStatusChange',
      id,
      lead_id: LEAD_DUBOIS,
      date_created: at(minutes),
      activity_at: at(minutes),
    });
    const rows = [status('acti_s2', 3), status('acti_s1', 2), note('acti_n', at(1))];

    const { pages } = await runSync([
      { url: ACTIVITIES, json: list(rows) },
      { url: leadUrl(LEAD_DUBOIS), json: leadDubois },
    ]);

    expect(idsOf(pages)).toEqual(['activity:acti_n']);
    expect(cursorOf(pages.at(-1))).toEqual({ at: Date.parse(at(3)), seen: ['acti_s2'] });
  });

  it('avance le curseur même quand il n’y a que des activités ignorées', async () => {
    const created = {
      _type: 'Created',
      id: 'acti_c',
      lead_id: LEAD_DUBOIS,
      date_created: at(5),
      activity_at: at(5),
    };

    const { pages, calls } = await runSync([{ url: ACTIVITIES, json: list([created]) }]);

    expect(pages).toHaveLength(1);
    expect(pages[0]?.items).toEqual([]);
    expect(cursorOf(pages[0])).toEqual({ at: Date.parse(at(5)), seen: ['acti_c'] });
    expect(calls).toHaveLength(1); // aucune fiche cherchée
  });

  it('ne rend jamais deux fois la même activité, même si la liste glisse entre deux pages', async () => {
    const dup = note('acti_dup', at(5));

    const { pages } = await runSync([
      { url: ACTIVITIES, json: list([dup], true) },
      { url: ACTIVITIES, json: list([dup, note('acti_new', at(6))]) },
      { url: leadUrl(LEAD_DUBOIS), json: leadDubois },
    ]);

    expect(idsOf(pages)).toEqual(['activity:acti_dup', 'activity:acti_new']);
  });

  it('reprend après le curseur : relit depuis son instant, écarte les activités déjà rendues, garde les autres du même instant', async () => {
    const mark = { at: Date.parse(at(10)), seen: ['acti_x'] };
    const rows = [
      note('acti_z', at(11)),
      note('acti_y', at(10)),
      note('acti_x', at(10)),
      note('acti_before', new Date(mark.at - 1).toISOString()),
    ];

    const { pages, calls } = await runSync(
      [
        { url: ACTIVITIES, json: list(rows) },
        { url: leadUrl(LEAD_DUBOIS), json: leadDubois },
      ],
      { cursor: JSON.stringify(mark) },
    );

    expect(paramsOf(calls[0]?.url).date_created__gte).toBe(at(10));
    expect(idsOf(pages)).toEqual(['activity:acti_y', 'activity:acti_z']);
    expect(cursorOf(pages.at(-1))).toEqual({ at: Date.parse(at(11)), seen: ['acti_z'] });
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { calls } = await runSync([{ url: ACTIVITIES, json: list([]) }], {
      cursor: 'pas du JSON',
    });

    expect(paramsOf(calls[0]?.url).date_created__gte).toBe('2026-09-15T00:00:00.000Z');
  });

  it('ne tourne pas en rond quand la page suivante ne ramène rien de neuf', async () => {
    const row = note('acti_a', at(1));

    const { pages, calls } = await runSync([
      { url: ACTIVITIES, json: list([row], true) },
      { url: ACTIVITIES, json: list([row], true) },
      { url: leadUrl(LEAD_DUBOIS), json: leadDubois },
    ]);

    expect(calls.filter((call) => call.url.startsWith(ACTIVITIES))).toHaveLength(2);
    expect(idsOf(pages)).toEqual(['activity:acti_a']);
  });

  it('écarte une activité dont la date n’a pas de fuseau', async () => {
    const naive = note('acti_naive', '2026-10-01T10:00:00');

    const { pages } = await runSync([{ url: ACTIVITIES, json: list([naive]) }]);

    expect(pages).toEqual([]);
  });
});

describe('close : sync, cas particuliers', () => {
  const when = '2026-10-01T10:00:00.000000+00:00';

  it('garde l’élément, avec un titre par défaut, quand la fiche est supprimée (404)', async () => {
    const { pages } = await runSync([
      { url: ACTIVITIES, json: list([note('acti_n', when)]) },
      { url: leadUrl(LEAD_DUBOIS), status: 404 },
    ]);

    const item = itemsOf(pages)[0];
    expect(item?.title).toBe('Prospect Close');
    expect(item?.origin).toEqual({ type: 'Note' });
  });

  it('garde l’élément sans nom de fiche quand la clé n’a pas le droit de la lire (403)', async () => {
    const { pages } = await runSync([
      { url: ACTIVITIES, json: list([note('acti_n', when)]) },
      { url: leadUrl(LEAD_DUBOIS), status: 403 },
    ]);

    expect(itemsOf(pages)[0]?.title).toBe('Prospect Close');
  });

  it('garde l’élément d’une activité sans fiche, sans chercher de nom', async () => {
    const orphan = note('acti_orphan', when, { lead_id: null });

    const { pages, calls } = await runSync([{ url: ACTIVITIES, json: list([orphan]) }]);

    expect(itemsOf(pages)[0]?.title).toBe('Prospect Close');
    expect(itemsOf(pages)[0]?.url).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('retombe sur la date de création quand l’activité n’a pas de date propre', async () => {
    const row = note('acti_n', when, { activity_at: null });

    const { pages } = await runSync([
      { url: ACTIVITIES, json: list([row]) },
      { url: leadUrl(LEAD_DUBOIS), json: leadDubois },
    ]);

    expect(itemsOf(pages)[0]?.updatedAt).toBe('2026-10-01T10:00:00.000Z');
  });

  it('rend un appel avec sa seule transcription, et un message vocal laissé par le prospect', async () => {
    const call = {
      _type: 'Call',
      id: 'acti_call',
      lead_id: LEAD_DUBOIS,
      date_created: when,
      activity_at: when,
      user_name: 'Marie Durand',
      note: '',
      direction: 'inbound',
      duration: 45,
      voicemail_transcript: {
        utterances: [
          { speaker_label: null, speaker_side: 'contact', text: 'Rappelez-moi demain.' },
        ],
      },
    };

    const { pages } = await runSync([
      { url: ACTIVITIES, json: list([call]) },
      { url: leadUrl(LEAD_DUBOIS), json: leadDubois },
    ]);

    expect(itemsOf(pages)[0]?.turns[0]?.text).toBe(
      'Appel entrant (45 s)\nMessage vocal :\nContact : Rappelez-moi demain.',
    );
  });

  it('tolère les champs en plus et les formes inattendues d’un champ secondaire', async () => {
    const odd = {
      ...note('acti_odd', when),
      nouveauChamp: { a: 1 },
      envelope: 'pas un objet',
      recording_transcript: 'pas une transcription',
      duration: 'douze',
    };
    const email = {
      _type: 'Email',
      id: 'acti_mail',
      lead_id: LEAD_DUBOIS,
      date_created: '2026-10-01T10:01:00.000000+00:00',
      activity_at: '2026-10-01T10:01:00.000000+00:00',
      subject: 'Sans enveloppe',
      body_text: 'Texte.',
      direction: 'incoming',
      sender: 'paul@garnier.test',
      status: 'inbox',
      envelope: 'pas un objet',
    };

    const { pages } = await runSync([
      { url: ACTIVITIES, json: list([odd, email]) },
      { url: leadUrl(LEAD_DUBOIS), json: leadDubois },
    ]);

    expect(idsOf(pages)).toEqual(['activity:acti_odd', 'activity:acti_mail']);
    expect(byId(pages, 'acti_mail')?.turns[0]?.author).toEqual({
      name: null,
      email: 'paul@garnier.test',
    });
  });
});

describe('close : erreurs', () => {
  it.each([401, 403])(
    'remonte un %i sur la liste des activités comme une clé refusée',
    async (status) => {
      const failure = await runSync([{ url: ACTIVITIES, status }]).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ConnectorAuthError);
    },
  );

  it('remonte une clé retirée au milieu de la lecture', async () => {
    const failure = await runSync([
      { url: ACTIVITIES, json: list([note('acti_a', '2026-10-01T10:00:00.000000+00:00')], true) },
      { url: ACTIVITIES, status: 401 },
    ]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte une clé retirée pendant la recherche du nom d’une fiche', async () => {
    const failure = await runSync([
      { url: ACTIVITIES, json: list([note('acti_a', '2026-10-01T10:00:00.000000+00:00')]) },
      { url: leadUrl(LEAD_DUBOIS), status: 401 },
    ]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorAuthError);
  });

  it('refuse une réponse qui n’a pas la forme attendue, sans en reprendre le texte', async () => {
    const failure = await runSync([{ url: ACTIVITIES, json: { data: { secret: KEY } } }]).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Réponse inattendue');
    expect((failure as Error).message).not.toContain(KEY);
  });

  it('remonte un refus de la requête (400) sans reprendre le corps', async () => {
    const failure = await runSync([
      { url: ACTIVITIES, status: 400, json: { error: `clé ${KEY} mal formée` } },
    ]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Close a répondu 400');
  });
});
