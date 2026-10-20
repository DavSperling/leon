import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { SyncPage } from '../types';
import { outlookConnector } from './connector';
import events from './fixtures/events.json';
import me from './fixtures/me.json';
import inbox1 from './fixtures/messages-inbox-1.json';
import inbox2 from './fixtures/messages-inbox-2.json';
import sent from './fixtures/messages-sent.json';
import { eventToItem } from './map';
import { outlookOAuth } from './oauth';
import type { GraphEvent } from './schemas';

// Un jeton généré à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const ACCESS = `eyJ.${randomBytes(12).toString('hex')}`;
type TestConfig = Parameters<typeof outlookConnector.hosts>[0];
const config: TestConfig = {
  authMode: 'oauth',
  accessToken: ACCESS,
  refreshToken: 'jeton-de-rafraichissement',
  expiresAt: null,
};
const SINCE = new Date('2026-09-15T12:00:00Z');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const INBOX = `${GRAPH}/me/mailFolders/inbox/messages`;
const SENT = `${GRAPH}/me/mailFolders/sentitems/messages`;
const EVENTS = `${GRAPH}/me/events`;
const PREFER = 'outlook.body-content-type="text"';

const empty = { value: [] };
const quiet = (): FakeRoute[] => [
  { url: INBOX, json: empty },
  { url: SENT, json: empty },
  { url: EVENTS, json: empty },
];
const param = (url: string | undefined, name: string) => new URL(url ?? '').searchParams.get(name);
const mark = (at: string, ...seen: string[]) => ({ at, seen });
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');

async function runSync(routes: FakeRoute[], cursor: string | null = null, since = SINCE) {
  const { http, calls } = testHttp(outlookConnector, config, routes);
  const pages = await collect(outlookConnector.sync(config, { cursor, since }, http));
  return { pages, calls };
}

// Le premier passage de la fixture : deux pages de la boîte de réception, les éléments envoyés, l'agenda.
const fullRoutes = (): FakeRoute[] => [
  { url: INBOX, json: inbox1 },
  { url: INBOX, json: inbox2 },
  { url: SENT, json: sent },
  { url: EVENTS, json: events },
];

describe('outlookConnector : configuration', () => {
  const accepts = (value: unknown) => outlookConnector.configSchema.safeParse(value).success;

  it('n’accepte que la forme du bouton : pas de clé collée', () => {
    expect(accepts({ authMode: 'oauth', accessToken: ACCESS })).toBe(true);
    expect(accepts(config)).toBe(true);
    expect(accepts({ accessToken: ACCESS })).toBe(false);
    expect(accepts({ authMode: 'key', accessToken: ACCESS })).toBe(false);
    expect(accepts({ authMode: 'oauth' })).toBe(false);
    expect(accepts({ authMode: 'oauth', accessToken: '' })).toBe(false);
    expect(accepts({})).toBe(false);
  });

  it('ne met aucun jeton dans secretFields : le socle scelle les jetons du bouton', () => {
    expect(outlookConnector.secretFields).toEqual([]);
  });

  it('n’appelle que Microsoft Graph', () => {
    expect(outlookConnector.hosts(config)).toEqual(['graph.microsoft.com']);
  });

  it('est rangé dans le registre avec son bouton', () => {
    expect(getConnector('outlook')).toBe(outlookConnector);
    expect(outlookConnector.oauth).toBe(outlookOAuth);
  });
});

describe('outlookConnector : catalogue', () => {
  const item = listCatalog().find((entry) => entry.id === 'outlook');

  it('est disponible, sans clé collée, et dit que le texte reste privé à son auteur', () => {
    expect(item).toMatchObject({ available: true, keyAccepted: false, fields: [] });
    expect(item?.warning).toContain('reste privé');
    expect(item?.warning).toContain('vous seul le voyez');
  });

  it('explique à l’utilisateur qu’il faut d’abord l’accord de l’administrateur Microsoft', () => {
    expect(item?.oauthHelp).toContain('administrateur');
    expect(item?.docsUrl).toMatch(/^https:\/\/learn\.microsoft\.com\//);
  });
});

describe('outlookConnector.verify', () => {
  const run = (answer: unknown) => {
    const { http, calls } = testHttp(outlookConnector, config, [
      { url: `${GRAPH}/me`, json: answer },
    ]);
    return { result: outlookConnector.verify(config, http), calls };
  };

  it('lit le profil avec le jeton en Bearer et rend le nom et l’adresse', async () => {
    const { result, calls } = run(me);

    await expect(result).resolves.toEqual({ account: 'Marie Durand (marie.durand@acme.test)' });
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${ACCESS}`);
    expect(param(calls[0]?.url, '$select')).toBe('displayName,mail,userPrincipalName');
  });

  it('se rabat sur le nom d’utilisateur quand le profil n’a pas d’adresse', async () => {
    const { result } = run({ ...me, mail: null });

    await expect(result).resolves.toEqual({ account: 'Marie Durand (marie.durand@acme.test)' });
  });

  it('rend l’adresse seule quand le profil n’a pas de nom', async () => {
    const { result } = run({ mail: 'marie.durand@acme.test', userPrincipalName: 'm@acme.test' });

    await expect(result).resolves.toEqual({ account: 'marie.durand@acme.test' });
  });

  it('lève ConnectorAuthError sur un 401', async () => {
    const { http } = testHttp(outlookConnector, config, [
      { url: `${GRAPH}/me`, status: 401, json: { error: { code: 'InvalidAuthenticationToken' } } },
    ]);

    await expect(outlookConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('outlookConnector.sync : premier passage', () => {
  it('lit la boîte de réception puis les éléments envoyés depuis `since`, avec le corps en texte', async () => {
    const { calls } = await runSync(fullRoutes());

    const [first, second, third] = calls;
    expect(calls.map((call) => call.url.split('?')[0])).toEqual([INBOX, INBOX, SENT, EVENTS]);
    expect(first?.headers.authorization).toBe(`Bearer ${ACCESS}`);
    expect(first?.headers.prefer).toBe(PREFER);
    expect(param(first?.url, '$filter')).toBe('receivedDateTime ge 2026-09-15T12:00:00Z');
    // Graph exige la même propriété dans le tri et dans le filtre.
    expect(param(first?.url, '$orderby')).toBe('receivedDateTime asc');
    expect(param(first?.url, '$top')).toBe('25');
    expect(param(first?.url, '$select')).toContain('body');
    expect(param(third?.url, '$filter')).toBe('receivedDateTime ge 2026-09-15T12:00:00Z');
    // La page suivante est l'adresse rendue par Graph, telle quelle, avec les mêmes en-têtes.
    expect(param(second?.url, '$skip')).toBe('25');
    expect(param(second?.url, '$filter')).toBe('receivedDateTime ge 2026-09-15T12:00:00Z');
    expect(second?.headers.prefer).toBe(PREFER);
  });

  it('ne lit ni les brouillons, ni les indésirables, ni les éléments supprimés', async () => {
    const { calls } = await runSync(fullRoutes());

    const paths = calls.map((call) => new URL(call.url).pathname);
    expect(
      paths.every((path) => /\/me\/(mailFolders\/(inbox|sentitems)\/messages|events)$/.test(path)),
    ).toBe(true);
  });

  it('rend deux pages de la boîte de réception, puis les envoyés, puis l’agenda', async () => {
    const { pages } = await runSync(fullRoutes());

    expect(pages.map((page) => page.items.map((item) => item.externalId))).toEqual([
      ['thread:AAQkAGEx-conv-devis', 'thread:AAQkAGEx-conv-lancement'],
      ['thread:AAQkAGEx-conv-devis'],
      ['thread:AAQkAGEx-conv-devis'],
      ['event:AAMkAGEx-event-1', 'event:AAMkAGEx-event-annule'],
    ]);
  });

  it('regroupe les messages d’un fil dans un élément « fil », dans l’ordre', async () => {
    const { pages } = await runSync(fullRoutes());

    const devis = pages[0]?.items[0];
    expect(devis).toMatchObject({
      nature: 'fil',
      title: 'Devis site web',
      updatedAt: '2026-10-12T14:40:00.000Z',
      origin: {},
    });
    expect(devis?.url).toContain('AAMkAGEx-inbox-2');
    expect(devis?.turns.map((turn) => [turn.externalId, turn.role, turn.ts])).toEqual([
      ['message:AAMkAGEx-inbox-1', 'participant', '2026-10-12T08:15:00.000Z'],
      ['message:AAMkAGEx-inbox-2', 'participant', '2026-10-12T14:40:00.000Z'],
    ]);
    expect(devis?.turns[0]?.author).toEqual({
      name: 'Paul Lambert',
      email: 'paul.lambert@client.test',
    });
    // Les fins de ligne de Windows ne passent pas dans le texte.
    expect(devis?.turns[0]?.text).toBe(
      'Bonjour Marie,\n\nPouvez-vous nous envoyer le devis pour le nouveau site avant vendredi ?\n\nPaul',
    );
    expect(devis?.turns[1]?.text).toContain('notre budget est de 12 000 euros');
  });

  it('range les fils d’une page du moins récemment animé au plus récent', async () => {
    const message = (id: string, conversationId: string, receivedDateTime: string) => ({
      ...inbox2.value[0],
      id,
      conversationId,
      receivedDateTime,
      body: { contentType: 'text', content: `Texte de ${id}` },
    });
    const { pages } = await runSync([
      {
        url: INBOX,
        json: {
          value: [
            message('A1', 'fil-A', '2026-10-14T08:00:00Z'),
            message('B1', 'fil-B', '2026-10-14T09:00:00Z'),
            message('A2', 'fil-A', '2026-10-14T10:00:00Z'),
          ],
        },
      },
      { url: SENT, json: empty },
      { url: EVENTS, json: empty },
    ]);

    expect(pages[0]?.items.map((item) => item.externalId)).toEqual([
      'thread:fil-B',
      'thread:fil-A',
    ]);
    expect(pages[0]?.items[1]?.turns.map((turn) => turn.externalId)).toEqual([
      'message:A1',
      'message:A2',
    ]);
  });

  it('retire les « RE: » de l’objet pour que le titre du fil ne change pas à chaque réponse', async () => {
    const { pages } = await runSync(fullRoutes());

    expect(pages[1]?.items[0]?.title).toBe('Devis site web');
    expect(pages[2]?.items[0]?.title).toBe('Devis site web');
  });

  it('convertit en texte un corps que Graph rend en HTML malgré la demande', async () => {
    const { pages } = await runSync(fullRoutes());

    const lancement = pages[0]?.items[1];
    expect(lancement?.title).toBe('Réunion de lancement');
    expect(lancement?.turns[0]?.text).toContain('Le lancement du projet est prévu mardi à 10 h.');
    expect(lancement?.turns[0]?.text).not.toContain('<');
  });

  it('ne donne un côté qu’aux messages envoyés : ceux de la boîte de réception n’en ont pas', async () => {
    const { pages } = await runSync(fullRoutes());

    expect(pages[0]?.items.flatMap((item) => item.turns).map((turn) => turn.side)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    const envoye = pages[2]?.items[0]?.turns[0];
    expect(envoye).toMatchObject({
      externalId: 'message:AAMkAGEx-sent-1',
      side: 'team',
      author: { name: 'Marie Durand', email: 'marie.durand@acme.test' },
    });
  });

  it('ne rend pas un message sans texte, mais fait avancer le curseur', async () => {
    const { pages } = await runSync(fullRoutes());

    expect(pages[2]?.items).toHaveLength(1);
    expect(cursorOf(pages[2]).sent).toEqual(mark('2026-10-13T07:30:00.000Z', 'AAMkAGEx-sent-2'));
  });

  it('rend le fil sans objet sous « Sans objet »', async () => {
    const message = { ...inbox2.value[0], subject: null };
    const { pages } = await runSync([
      { url: INBOX, json: { value: [message] } },
      { url: SENT, json: empty },
      { url: EVENTS, json: empty },
    ]);

    expect(pages[0]?.items[0]?.title).toBe('Sans objet');
  });

  it('passe chaque élément rendu par normalizeItem sans le faire refuser', async () => {
    const { pages } = await runSync(fullRoutes());

    const items = pages.flatMap((page) => page.items);
    expect(items).toHaveLength(6);
    for (const item of items) expect(normalizeItem(item, 'outlook')).not.toBeNull();
  });
});

describe('outlookConnector.sync : agenda', () => {
  it('lit les événements modifiés depuis `since`, dans l’ordre de leur modification', async () => {
    const { calls } = await runSync(fullRoutes());

    const call = calls.at(-1);
    expect(call?.url.split('?')[0]).toBe(EVENTS);
    expect(param(call?.url, '$filter')).toBe('lastModifiedDateTime ge 2026-09-15T12:00:00Z');
    expect(param(call?.url, '$orderby')).toBe('lastModifiedDateTime asc');
    expect(call?.headers.prefer).toBe(PREFER);
  });

  it('rend un événement en « réunion » : un tour document avec le lieu, les participants et la description', async () => {
    const { pages } = await runSync(fullRoutes());

    const point = pages[3]?.items[0];
    expect(point).toMatchObject({
      externalId: 'event:AAMkAGEx-event-1',
      nature: 'reunion',
      title: "Point d'avancement projet Acme",
      updatedAt: '2026-10-11T10:30:12.456Z',
      origin: { participants: 'Paul Lambert, Sophie Bernard' },
    });
    expect(point?.url).toContain('AAMkAGEx-event-1');
    expect(point?.turns).toEqual([
      {
        externalId: 'body',
        role: 'document',
        author: { name: 'Marie Durand', email: 'marie.durand@acme.test' },
        side: 'team',
        text: [
          'Début : 2026-10-14T09:00:00Z',
          'Fin : 2026-10-14T10:00:00Z',
          'Lieu : Salle Montmartre',
          'Organisateur : Marie Durand',
          'Participants : Paul Lambert, Sophie Bernard',
          '',
          'Ordre du jour :',
          '- budget',
          '- calendrier',
        ].join('\n'),
        ts: '2026-10-11T10:30:12.456Z',
      },
    ]);
  });

  it('signale un événement annulé, avec le texte HTML converti et sans côté pour un autre organisateur', async () => {
    const { pages } = await runSync(fullRoutes());

    const annule = pages[3]?.items[1];
    expect(annule?.turns[0]?.text).toContain('Statut : annulée');
    expect(annule?.turns[0]?.text).toContain('Atelier reporté à une date ultérieure.');
    expect(annule?.turns[0]?.text).not.toContain('<');
    expect(annule?.turns[0]?.author).toEqual({
      name: 'Paul Lambert',
      email: 'paul.lambert@client.test',
    });
    expect(annule?.turns[0]?.side).toBeUndefined();
  });

  it('laisse de côté un événement privé, et un événement sans participant ni description', async () => {
    const { pages } = await runSync(fullRoutes());

    const ids = pages[3]?.items.map((item) => item.externalId);
    expect(ids).not.toContain('event:AAMkAGEx-event-prive');
    expect(ids).not.toContain('event:AAMkAGEx-event-vide');
    // L'événement privé a pu être relevé avant de le devenir : la page demande de le retirer.
    expect(pages[3]?.removed).toEqual(['event:AAMkAGEx-event-prive']);
    // Les deux ont été vus : le curseur passe derrière eux et jusqu'au dernier.
    expect(cursorOf(pages[3]).events).toEqual({
      at: '2026-10-12T09:10:00.000Z',
      seen: ['AAMkAGEx-event-annule'],
    });
  });

  it('laisse aussi de côté un événement personnel ou confidentiel, quelle que soit la casse', () => {
    for (const sensitivity of ['personal', 'confidential', 'Private', 'PERSONAL']) {
      expect(eventToItem({ ...events.value[0], sensitivity } as GraphEvent)).toBeNull();
    }
    expect(eventToItem({ ...events.value[0], sensitivity: 'normal' } as GraphEvent)).not.toBeNull();
  });

  it('garde le texte brut des courriers et de l’agenda privé à celui qui branche', () => {
    expect(outlookConnector.privateRaw).toBe(true);
  });

  it('écrit l’heure d’un fuseau autre que UTC avec son nom', async () => {
    const zoned = {
      ...events.value[0],
      start: { dateTime: '2026-10-14T09:00:00.0000000', timeZone: 'Romance Standard Time' },
    };
    const { pages } = await runSync([
      { url: INBOX, json: empty },
      { url: SENT, json: empty },
      { url: EVENTS, json: { value: [zoned] } },
    ]);

    expect(pages[0]?.items[0]?.turns[0]?.text).toContain(
      'Début : 2026-10-14T09:00:00 (Romance Standard Time)',
    );
  });

  it('laisse l’agenda de côté quand Microsoft le refuse (droit Calendars.Read absent)', async () => {
    const { pages } = await runSync([
      { url: INBOX, json: inbox2 },
      { url: SENT, json: empty },
      { url: EVENTS, status: 403, json: { error: { code: 'ErrorAccessDenied' } } },
    ]);

    expect(pages).toHaveLength(1);
    expect(pages[0]?.items[0]?.externalId).toBe('thread:AAQkAGEx-conv-devis');
  });
});

describe('outlookConnector.sync : curseur', () => {
  it('garde une position par dossier et par agenda', async () => {
    const { pages } = await runSync(fullRoutes());

    expect(cursorOf(pages[0])).toEqual({
      inbox: mark('2026-10-13T09:00:00.000Z', 'AAMkAGEx-inbox-3'),
      sent: null,
      events: null,
    });
    expect(cursorOf(pages[1]).inbox).toEqual(mark('2026-10-13T16:20:00.000Z', 'AAMkAGEx-inbox-4'));
    expect(cursorOf(pages[2]).sent).toEqual(mark('2026-10-13T07:30:00.000Z', 'AAMkAGEx-sent-2'));
  });

  it('repart du dernier curseur sans refaire la première page', async () => {
    const first = await runSync(fullRoutes());
    const cursor = first.pages.at(-1)?.cursor ?? null;

    // Graph rend l'élément du curseur lui-même : « ge » est inclusif.
    const again = await runSync(
      [
        { url: INBOX, json: { value: inbox2.value } },
        { url: SENT, json: { value: [sent.value[1]] } },
        { url: EVENTS, json: { value: [events.value[3]] } },
      ],
      cursor,
    );

    expect(again.pages).toEqual([]);
    expect(param(again.calls[0]?.url, '$filter')).toBe('receivedDateTime ge 2026-10-13T16:20:00Z');
    expect(param(again.calls[1]?.url, '$filter')).toBe('receivedDateTime ge 2026-10-13T07:30:00Z');
    expect(param(again.calls[2]?.url, '$filter')).toBe(
      'lastModifiedDateTime ge 2026-10-12T09:10:00Z',
    );
  });

  it('rend ce qui est arrivé après le curseur, et rien de ce qu’il a déjà vu', async () => {
    const first = await runSync(fullRoutes());
    const cursor = first.pages.at(-1)?.cursor ?? null;
    const nouveau = {
      ...inbox2.value[0],
      id: 'AAMkAGEx-inbox-5',
      receivedDateTime: '2026-10-14T07:00:00Z',
      body: { contentType: 'text', content: 'Pouvons-nous avancer la réunion ?' },
    };

    const again = await runSync(
      [
        { url: INBOX, json: { value: [...inbox2.value, nouveau] } },
        { url: SENT, json: empty },
        { url: EVENTS, json: empty },
      ],
      cursor,
    );

    expect(again.pages).toHaveLength(1);
    expect(again.pages[0]?.items[0]?.turns.map((turn) => turn.externalId)).toEqual([
      'message:AAMkAGEx-inbox-5',
    ]);
    expect(cursorOf(again.pages[0]).inbox).toEqual(
      mark('2026-10-14T07:00:00.000Z', 'AAMkAGEx-inbox-5'),
    );
  });

  it('distingue deux messages reçus à la même seconde', async () => {
    const at = '2026-10-14T08:00:00Z';
    const message = (id: string) => ({
      ...inbox2.value[0],
      id,
      receivedDateTime: at,
      body: { contentType: 'text', content: `Texte de ${id}` },
    });
    const cursor = JSON.stringify({
      inbox: mark('2026-10-14T08:00:00.000Z', 'A', 'B'),
      sent: null,
      events: null,
    });

    const { pages } = await runSync(
      [
        { url: INBOX, json: { value: [message('A'), message('B'), message('C')] } },
        { url: SENT, json: empty },
        { url: EVENTS, json: empty },
      ],
      cursor,
    );

    expect(pages[0]?.items[0]?.turns.map((turn) => turn.externalId)).toEqual(['message:C']);
    expect(cursorOf(pages[0]).inbox).toEqual(mark('2026-10-14T08:00:00.000Z', 'A', 'B', 'C'));
  });

  it('repart de `since` quand le curseur est illisible', async () => {
    const { calls } = await runSync(quiet(), 'pas du json');

    expect(param(calls[0]?.url, '$filter')).toBe('receivedDateTime ge 2026-09-15T12:00:00Z');
    expect(param(calls[2]?.url, '$filter')).toBe('lastModifiedDateTime ge 2026-09-15T12:00:00Z');
  });

  it('ne rend aucune page quand il n’y a rien de nouveau', async () => {
    const { pages } = await runSync(quiet());

    expect(pages).toEqual([]);
  });
});

describe('outlookConnector.sync : erreurs', () => {
  it('remonte un 401 ou un 403 sur la boîte de réception : la connexion a perdu son accès', async () => {
    for (const status of [401, 403]) {
      const { http } = testHttp(outlookConnector, config, [
        { url: INBOX, status, json: { error: { code: 'ErrorAccessDenied' } } },
      ]);

      await expect(
        collect(outlookConnector.sync(config, { cursor: null, since: SINCE }, http)),
      ).rejects.toBeInstanceOf(ConnectorAuthError);
    }
  });

  it('refuse une page suivante qui pointe hors de Microsoft Graph', async () => {
    const hijacked = { ...inbox1, '@odata.nextLink': 'https://evil.test/v1.0/me/messages?x=1' };

    const failure = await runSync([{ url: INBOX, json: hijacked }]).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Adresse non autorisée');
  });

  it('ne reprend pas le texte de l’erreur de Microsoft', async () => {
    const { http } = testHttp(outlookConnector, config, [
      {
        url: INBOX,
        status: 404,
        json: { error: { code: 'MailboxNotEnabledForRESTAPI', message: 'secret-du-serveur' } },
      },
    ]);

    const failure = await collect(
      outlookConnector.sync(config, { cursor: null, since: SINCE }, http),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).not.toContain('secret-du-serveur');
  });
});
