import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { pipedriveConnector } from './connector';
import activitiesPage1 from './fixtures/activities-page1.json';
import activitiesPage2 from './fixtures/activities-page2.json';
import notesPage1 from './fixtures/notes-page1.json';
import notesPage2 from './fixtures/notes-page2.json';
import users from './fixtures/users.json';
import usersMe from './fixtures/users-me.json';

const BASE = 'https://acme.pipedrive.com';
const ME = `${BASE}/api/v1/users/me`;
const USERS = `${BASE}/api/v1/users`;
const NOTES = `${BASE}/api/v1/notes`;
const ACTIVITIES = `${BASE}/api/v2/activities`;
const TOKEN = 'jeton-de-test-0123456789';
const config = { token: TOKEN, company: 'acme' };
const SINCE = new Date('2026-09-15T00:00:00Z');
const NO_NOTES = { success: true, data: null, additional_data: { pagination: {} } };
const NO_ACTIVITIES = { success: true, data: [], additional_data: { next_cursor: null } };

// Un premier passage complet : deux pages de notes, puis deux pages d'activités (la liste des
// utilisateurs n'est lue qu'une fois, quand la première activité en a besoin).
function firstPassRoutes(): FakeRoute[] {
  return [
    { url: NOTES, json: notesPage1 },
    { url: NOTES, json: notesPage2 },
    { url: ACTIVITIES, json: activitiesPage1 },
    { url: USERS, json: users },
    { url: ACTIVITIES, json: activitiesPage2 },
  ];
}

async function runSync(routes: FakeRoute[], cursor: string | null = null) {
  const { http, calls } = testHttp(pipedriveConnector, config, routes);
  const pages = await collect(pipedriveConnector.sync(config, { cursor, since: SINCE }, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const itemOf = (pages: SyncPage[], externalId: string) =>
  itemsOf(pages).find((item) => item.externalId === externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const paramsOf = (url: string | undefined) => Object.fromEntries(new URL(url ?? '').searchParams);
const callsTo = (calls: Array<{ url: string }>, url: string) =>
  calls.filter((call) => call.url.split('?')[0] === url);

describe('pipedrive : configuration', () => {
  const schema = pipedriveConnector.configSchema;

  it('accepte un jeton et une entreprise, sans les espaces autour, avec l’entreprise en minuscules', () => {
    const parsed = schema.parse({ token: ` ${TOKEN} `, company: ' Acme ' });

    expect(parsed).toEqual(config);
  });

  it('refuse une entreprise qui n’est pas un sous-domaine simple', () => {
    for (const company of ['evil.com/x', 'a.b', 'a_b', '-acme', '', 'acme.pipedrive.com', 'a b']) {
      const result = schema.safeParse({ ...config, company });

      expect(result.success, company).toBe(false);
    }
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({ company: 'acme' }).success).toBe(false);
    expect(schema.safeParse({ token: TOKEN }).success).toBe(false);
    expect(schema.safeParse({ ...config, token: '   ' }).success).toBe(false);
  });

  it('fixe l’hôte d’après l’entreprise et le champ à chiffrer', () => {
    expect(pipedriveConnector.hosts(config)).toEqual(['acme.pipedrive.com']);
    expect(pipedriveConnector.secretFields).toEqual(['token']);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('pipedrive')).toBe(pipedriveConnector);
    const entry = listCatalog('fr').find((item) => item.id === 'pipedrive');
    expect(entry?.available).toBe(true);
    expect(entry?.fields.map((field) => field.name)).toEqual(['company', 'token']);
  });
});

describe('pipedrive : verify', () => {
  it('lit le compte avec la clé dans l’en-tête x-api-token et nomme l’entreprise', async () => {
    const { http, calls } = testHttp(pipedriveConnector, config, [{ url: ME, json: usersMe }]);

    const result = await pipedriveConnector.verify(config, http);

    expect(result).toEqual({ account: 'Marie Durand (Acme)' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(ME);
    expect(calls[0]?.headers).toMatchObject({ 'x-api-token': TOKEN, accept: 'application/json' });
  });

  it('refuse une clé rejetée', async () => {
    const { http } = testHttp(pipedriveConnector, config, [{ url: ME, status: 401 }]);

    await expect(pipedriveConnector.verify(config, http)).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );
  });

  it('dit que l’entreprise est introuvable quand Pipedrive répond 404 ou redirige', async () => {
    for (const status of [404, 302]) {
      const { http } = testHttp(pipedriveConnector, config, [{ url: ME, status }]);

      const failure = await pipedriveConnector
        .verify(config, http)
        .catch((error: unknown) => error);

      expect(failure, String(status)).toBeInstanceOf(ConnectorHttpError);
      expect((failure as Error).message).toBe(
        'Pipedrive account not found: check the company name',
      );
    }
  });
});

describe('pipedrive : sync, premier passage', () => {
  it('lit d’abord les notes modifiées depuis since, de la plus ancienne à la plus récente', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls[0]?.url.split('?')[0]).toBe(NOTES);
    expect(paramsOf(calls[0]?.url)).toEqual({
      updated_since: '2026-09-15T00:00:00Z',
      sort: 'update_time ASC,id ASC',
      limit: '100',
    });
  });

  it('envoie la clé dans l’en-tête x-api-token à chaque requête', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls).toHaveLength(5);
    for (const call of calls) expect(call.headers).toMatchObject({ 'x-api-token': TOKEN });
  });

  it('reprend la lecture des notes depuis la dernière note lue, sans décalage de page', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const notes = callsTo(calls, NOTES);
    expect(notes).toHaveLength(2);
    expect(paramsOf(notes[1]?.url)).toEqual({
      updated_since: '2026-10-05T14:30:12Z',
      sort: 'update_time ASC,id ASC',
      limit: '100',
    });
  });

  it('rend une note avec son contenu en texte brut, daté de sa dernière modification, et son lien', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemOf(pages, 'note:101')).toEqual({
      externalId: 'note:101',
      nature: 'note',
      title: 'Note · Contrat Acme',
      url: `${BASE}/deal/7`,
      updatedAt: '2026-10-02T10:00:00Z',
      origin: {
        company: 'acme',
        deal: 'Contrat Acme',
        person: 'Marie Durand',
        organization: 'Acme',
      },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Paul Martin', email: 'paul@acme.test' },
          text: 'Appel avec Marie Durand :\n\n- budget validé à 12 000 €\n- signature prévue le 20 octobre',
          ts: '2026-10-02T10:00:00Z',
        },
      ],
    });
  });

  it('nomme une note d’après sa personne ou son organisation, et pointe sur leur fiche', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const person = itemOf(pages, 'note:102');
    expect(person?.title).toBe('Note · Marie Durand');
    expect(person?.url).toBe(`${BASE}/person/5`);
    expect(person?.origin).toEqual({ company: 'acme', person: 'Marie Durand' });
    const organization = itemOf(pages, 'note:103');
    expect(organization?.title).toBe('Note · Acme');
    expect(organization?.url).toBe(`${BASE}/organization/3`);
  });

  it('ne rend ni la note supprimée, ni la note vide, ni deux fois la note déjà lue à la même seconde', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const notes = idsOf(pages).filter((id) => id.startsWith('note:'));
    expect(notes).toEqual(['note:101', 'note:102', 'note:103']);
  });

  it('enregistre après chaque page de notes l’instant de la dernière note lue et les notes lues à cet instant', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(cursorOf(pages[0])).toEqual({
      notes: { at: '2026-10-05T14:30:12Z', seen: ['102'] },
    });
    // La page suivante a lu 103 (même seconde), puis les notes supprimée et vide : le repère avance.
    expect(cursorOf(pages[1])).toEqual({
      notes: { at: '2026-10-09T16:45:00Z', seen: ['105'] },
    });
  });

  it('lit ensuite les activités modifiées depuis since, avec leur propre repère', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const activities = callsTo(calls, ACTIVITIES);
    expect(activities).toHaveLength(2);
    expect(paramsOf(activities[0]?.url)).toEqual({
      updated_since: '2026-09-15T00:00:00Z',
      sort_by: 'update_time',
      sort_direction: 'asc',
      limit: '100',
    });
    // La deuxième page repart du repère, sans curseur de page : les activités lues sont écartées.
    expect(paramsOf(activities[1]?.url)).toEqual({
      updated_since: '2026-10-07T09:00:00Z',
      sort_by: 'update_time',
      sort_direction: 'asc',
      limit: '100',
    });
  });

  it('rend une activité avec son type, son sujet, sa note et l’auteur trouvé dans les utilisateurs', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemOf(pages, 'activity:201')).toEqual({
      externalId: 'activity:201',
      nature: 'note',
      title: 'Appel · Rappel devis',
      url: `${BASE}/deal/7`,
      updatedAt: '2026-10-06T11:20:00Z',
      origin: { company: 'acme', dealId: '7', personId: '5', organizationId: '3' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Paul Martin', email: 'paul@acme.test' },
          text: 'Appel : Rappel devis (fait, échéance 2026-10-06)\n\nMarie confirme le budget.\n\nEnvoyer le devis signé avant le 20 octobre.',
          ts: '2026-10-06T11:20:00Z',
        },
      ],
    });
  });

  it('prend le propriétaire pour auteur sans créateur, et ajoute la description publique avant la note', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const meeting = itemOf(pages, 'activity:203');
    expect(meeting?.title).toBe('Réunion · Démonstration chez Acme');
    expect(meeting?.turns).toEqual([
      {
        externalId: 'body',
        role: 'document',
        author: { name: 'Marie Durand', email: 'marie@acme.test' },
        text: 'Réunion : Démonstration chez Acme (fait, échéance 2026-10-12)\n\nOrdre du jour : démonstration, questions, prochaines étapes.\n\nPaul a présenté l’import des contacts.\n\nMarie demande un essai de 15 jours.',
        ts: '2026-10-12T15:00:00Z',
      },
    ]);
  });

  it('ne rend pas une activité sans note ni description, ni une activité supprimée', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const activities = idsOf(pages).filter((id) => id.startsWith('activity:'));
    expect(activities).toEqual(['activity:201', 'activity:203']);
  });

  it('enregistre le repère des activités à côté de celui des notes', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(4);
    expect(cursorOf(pages[2])).toEqual({
      notes: { at: '2026-10-09T16:45:00Z', seen: ['105'] },
      activities: { at: '2026-10-07T09:00:00Z', seen: ['202'] },
    });
    expect(cursorOf(pages[3])).toEqual({
      notes: { at: '2026-10-09T16:45:00Z', seen: ['105'] },
      activities: { at: '2026-10-13T10:00:00Z', seen: ['204'] },
    });
  });

  it('lit la liste des utilisateurs une seule fois, et seulement si une activité en a besoin', async () => {
    const withActivities = await runSync(firstPassRoutes());
    const without = await runSync([
      { url: NOTES, json: notesPage1 },
      { url: NOTES, json: notesPage2 },
      { url: ACTIVITIES, json: NO_ACTIVITIES },
    ]);

    expect(callsTo(withActivities.calls, USERS)).toHaveLength(1);
    expect(callsTo(without.calls, USERS)).toHaveLength(0);
  });

  it('rend des éléments que le socle accepte, dates comprises', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages).length).toBeGreaterThan(0);
    for (const item of itemsOf(pages)) {
      expect(normalizeItem(item, 'pipedrive'), item.externalId).not.toBeNull();
    }
  });
});

describe('pipedrive : sync, reprise et cas limites', () => {
  it('ne refait pas la première page quand on repart du dernier repère', async () => {
    const first = await runSync(firstPassRoutes());
    const last = first.pages.at(-1)?.cursor ?? null;

    const { pages, calls } = await runSync(
      [
        { url: NOTES, json: { ...notesPage2, data: notesPage2.data.slice(3) } },
        { url: ACTIVITIES, json: { ...activitiesPage2, data: activitiesPage2.data.slice(2) } },
      ],
      last,
    );

    expect(pages).toEqual([]);
    expect(paramsOf(calls[0]?.url).updated_since).toBe('2026-10-09T16:45:00Z');
    expect(paramsOf(calls[1]?.url).updated_since).toBe('2026-10-13T10:00:00Z');
  });

  it('repart de since quand le curseur est illisible', async () => {
    for (const cursor of ['pas du json', '{"notes":3}', '[]']) {
      const { calls } = await runSync(
        [
          { url: NOTES, json: NO_NOTES },
          { url: ACTIVITIES, json: NO_ACTIVITIES },
        ],
        cursor,
      );

      expect(paramsOf(calls[0]?.url).updated_since, cursor).toBe('2026-09-15T00:00:00Z');
      expect(paramsOf(calls[1]?.url).updated_since, cursor).toBe('2026-09-15T00:00:00Z');
    }
  });

  it('tourne la page quand toutes les notes d’une page sont déjà lues, au lieu de boucler', async () => {
    const cursor = JSON.stringify({ notes: { at: '2026-10-05T14:30:12Z', seen: ['102', '103'] } });
    const allSeen = {
      ...notesPage2,
      data: notesPage2.data.slice(0, 2),
      additional_data: { pagination: { more_items_in_collection: true, next_start: 2 } },
    };

    const { pages, calls } = await runSync(
      [
        { url: NOTES, json: allSeen },
        { url: NOTES, json: { ...notesPage2, data: notesPage2.data.slice(2, 4) } },
        { url: ACTIVITIES, json: NO_ACTIVITIES },
      ],
      cursor,
    );

    const notes = callsTo(calls, NOTES);
    expect(paramsOf(notes[1]?.url).start).toBe('2');
    expect(paramsOf(notes[1]?.url).updated_since).toBe('2026-10-05T14:30:12Z');
    expect(idsOf(pages)).toEqual([]);
    expect(cursorOf(pages[0]).notes).toEqual({ at: '2026-10-09T16:45:00Z', seen: ['105'] });
  });

  it('accepte une liste vide, que Pipedrive rend avec data nul', async () => {
    const { pages } = await runSync([
      { url: NOTES, json: NO_NOTES },
      { url: ACTIVITIES, json: NO_ACTIVITIES },
    ]);

    expect(pages).toEqual([]);
  });

  it('lit une date de note déjà en ISO 8601 avec fuseau, comme celles des activités', async () => {
    const note = { ...notesPage1.data[0], update_time: '2026-10-02T10:00:00Z' };

    const { pages } = await runSync([
      { url: NOTES, json: { ...notesPage1, data: [note], additional_data: { pagination: {} } } },
      { url: ACTIVITIES, json: NO_ACTIVITIES },
    ]);

    expect(itemOf(pages, 'note:101')?.updatedAt).toBe('2026-10-02T10:00:00Z');
  });

  it('refuse une date illisible sans reprendre le texte de la réponse', async () => {
    const note = { ...notesPage1.data[0], update_time: 'hier soir' };

    const failure = await runSync([{ url: NOTES, json: { ...notesPage1, data: [note] } }]).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Unexpected response');
  });

  it('rend la note sans auteur quand Pipedrive n’en donne pas', async () => {
    const note = { ...notesPage1.data[1], user: null, user_id: undefined };

    const { pages } = await runSync([
      { url: NOTES, json: { ...notesPage1, data: [note], additional_data: { pagination: {} } } },
      { url: ACTIVITIES, json: NO_ACTIVITIES },
    ]);

    expect(itemOf(pages, 'note:102')?.turns[0]?.author).toEqual({ name: null, email: null });
  });

  it('rend les activités sans nom d’auteur quand la liste des utilisateurs est interdite (403)', async () => {
    const { pages } = await runSync([
      { url: NOTES, json: NO_NOTES },
      { url: ACTIVITIES, json: activitiesPage1 },
      { url: USERS, status: 403 },
      { url: ACTIVITIES, json: { ...activitiesPage2, data: activitiesPage2.data.slice(0, 2) } },
    ]);

    const turn = itemOf(pages, 'activity:201')?.turns[0];
    expect(turn?.author).toEqual({ name: null, email: null });
    expect(turn?.text).toContain('Marie confirme le budget.');
  });

  it('remonte une clé refusée (401) sur la liste des utilisateurs', async () => {
    const failure = await runSync([
      { url: NOTES, json: NO_NOTES },
      { url: ACTIVITIES, json: activitiesPage1 },
      { url: USERS, status: 401 },
    ]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorAuthError);
  });

  it('garde la première page quand la clé est refusée (401) pendant la deuxième', async () => {
    const { http } = testHttp(pipedriveConnector, config, [
      { url: NOTES, json: notesPage1 },
      { url: NOTES, status: 401 },
    ]);
    const iterator = pipedriveConnector
      .sync(config, { cursor: null, since: SINCE }, http)
      [Symbol.asyncIterator]();

    const first = await iterator.next();
    const second = iterator.next();

    expect(first.done).toBe(false);
    expect(first.value?.items.map((item: ConnectorItem) => item.externalId)).toEqual([
      'note:101',
      'note:102',
    ]);
    await expect(second).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte une clé refusée (403) sur les notes, le point d’accès principal', async () => {
    const failure = await runSync([{ url: NOTES, status: 403 }]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte une limite de requêtes atteinte (429) sans reprendre le corps', async () => {
    const failure = await runSync([
      { url: NOTES, status: 429, text: 'jeton-secret' },
      { url: NOTES, status: 429, text: 'jeton-secret' },
      { url: NOTES, status: 429, text: 'jeton-secret' },
      { url: NOTES, status: 429, text: 'jeton-secret' },
    ]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Pipedrive rate limit reached');
  });
});
