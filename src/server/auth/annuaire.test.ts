import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorAuthError } from '@/server/connectors/http';
import { fakeFetch } from '@/test/fake-fetch';
import {
  directoryState,
  type ImportMember,
  type ImportPlan,
  type Person,
  planImport,
  readDirectory,
  readPeople,
} from './annuaire';
import { auth } from './auth';

// Better Auth et la requête Next sont simulés : ici, la lecture des deux annuaires et le calcul de l'aperçu. L'écriture
// et la base : annuaire.db.test.ts.
vi.mock('./auth', () => ({
  auth: { api: { listUserAccounts: vi.fn(), getAccessToken: vi.fn() } },
  socialProviders: { google: {}, microsoft: {} },
}));
vi.mock('./session', () => ({ requestHeaders: vi.fn(async () => new Headers()) }));

const CTX = { tenantId: 't1', userId: 'u1', principals: ['u1', 't1'] };
const member = (id: string, managerId: string | null = null, byHand = false): ImportMember => ({
  id,
  name: id,
  email: `${id}@acme.test`,
  managerId,
  byHand,
});
const person = (id: string, manager: string | null): Person => ({
  emails: [`${id}@acme.test`],
  manager: manager && `${manager}@acme.test`,
});
const moves = (plan: ImportPlan) =>
  plan.changes.map((change) => `${change.memberId}→${change.managerId ?? 'personne'}`);

describe('planImport', () => {
  it("rattache chacun à son manager de l'annuaire et ignore les gens absents de Leon", () => {
    const plan = planImport(
      [
        person('claire', null),
        person('marc', 'claire'),
        person('ines', 'marc'),
        person('zoe', 'claire'),
      ],
      [member('claire'), member('marc'), member('ines', 'claire')],
    );
    expect(moves(plan)).toEqual(['ines→marc', 'marc→claire']);
    expect(plan.changes[0]).toMatchObject({ managerName: 'marc', beforeName: 'claire' });
    expect(plan.outside).toBe(1);
    expect(plan.kept).toBe(0);
  });

  it("remonte au-dessus d'un manager absent de Leon", () => {
    // Inès est sous Marc, qui n'est pas dans Leon, lui-même sous Claire.
    const plan = planImport(
      [person('claire', null), person('marc', 'claire'), person('ines', 'marc')],
      [member('claire'), member('ines')],
    );
    expect(moves(plan)).toEqual(['ines→claire']);
  });

  it("garde un rattachement fait à la main, même retiré, et compte ceux que l'annuaire contredit", () => {
    const plan = planImport(
      [person('claire', null), person('marc', 'claire'), person('ines', 'marc')],
      [member('claire'), member('marc', null, true), member('ines', 'claire', true)],
    );
    expect(moves(plan)).toEqual([]);
    expect(plan.kept).toBe(2);
  });

  it("retire le manager que l'annuaire n'a plus, sans toucher aux gens absents de l'annuaire", () => {
    const plan = planImport(
      [person('claire', null), person('marc', null)],
      [member('claire'), member('marc', 'claire'), member('paul', 'claire')],
    );
    expect(moves(plan)).toEqual(['marc→personne']);
  });

  it("n'écrit ni boucle ni personne sous soi-même", () => {
    const plan = planImport(
      [person('marc', 'ines'), person('ines', 'marc'), person('paul', 'paul')],
      [member('marc'), member('ines'), member('paul')],
    );
    expect(moves(plan)).toEqual(['ines→marc']);
  });

  it('ne ferme pas de boucle avec un rattachement fait à la main', () => {
    // Claire a été mise sous Marc à la main ; l'annuaire met Marc sous Claire.
    const plan = planImport(
      [person('claire', null), person('marc', 'claire')],
      [member('claire', 'marc', true), member('marc')],
    );
    expect(moves(plan)).toEqual([]);
  });

  it("reconnaît un manager à n'importe laquelle de ses adresses", () => {
    const plan = planImport(
      [
        { emails: ['claire@acme.test', 'claire@acme.onmicrosoft.com'], manager: null },
        { emails: ['marc@acme.test'], manager: 'claire@acme.onmicrosoft.com' },
      ],
      [member('claire'), member('marc')],
    );
    expect(moves(plan)).toEqual(['marc→claire']);
  });
});

describe('readPeople', () => {
  it('lit Google page par page, le manager dans les relations', async () => {
    const users = 'https://admin.googleapis.com/admin/directory/v1/users';
    const fetchImpl = fakeFetch([
      {
        url: users,
        json: {
          users: [
            { primaryEmail: 'Claire@Acme.test' },
            {
              primaryEmail: 'marc@acme.test',
              relations: [
                { type: 'assistant', value: 'zoe@acme.test' },
                { type: 'manager', value: 'claire@acme.test' },
              ],
            },
          ],
          nextPageToken: 'p2',
        },
      },
      {
        url: users,
        json: {
          users: [
            {
              primaryEmail: 'ines@acme.test',
              relations: [{ type: 'manager', value: 'Marc@Acme.test' }],
            },
          ],
        },
      },
    ]);
    expect(await readPeople('google', 'jeton', fetchImpl)).toEqual([
      { emails: ['claire@acme.test'], manager: null },
      { emails: ['marc@acme.test'], manager: 'claire@acme.test' },
      { emails: ['ines@acme.test'], manager: 'marc@acme.test' },
    ]);
    expect(fetchImpl.calls.map((call) => new URL(call.url).search)).toEqual([
      '?customer=my_customer',
      '?customer=my_customer&pageToken=p2',
    ]);
    expect(fetchImpl.calls[0]?.headers.authorization).toBe('Bearer jeton');
  });

  it('lit Microsoft page par page, par mail ou nom de connexion', async () => {
    const next = 'https://graph.microsoft.com/v1.0/users?$skiptoken=abc';
    const fetchImpl = fakeFetch([
      {
        url: 'https://graph.microsoft.com/v1.0/users',
        json: {
          value: [
            {
              mail: 'Claire@acme.test',
              userPrincipalName: 'claire@acme.onmicrosoft.com',
              manager: null,
            },
            {
              mail: null,
              userPrincipalName: 'marc@acme.test',
              manager: { mail: null, userPrincipalName: 'claire@acme.onmicrosoft.com' },
            },
          ],
          '@odata.nextLink': next,
        },
      },
      {
        url: next,
        json: {
          value: [
            {
              mail: 'ines@acme.test',
              userPrincipalName: 'ines@acme.test',
              manager: { mail: 'marc@acme.test' },
            },
          ],
        },
      },
    ]);
    expect(await readPeople('microsoft', 'jeton', fetchImpl)).toEqual([
      { emails: ['claire@acme.test', 'claire@acme.onmicrosoft.com'], manager: null },
      { emails: ['marc@acme.test'], manager: 'claire@acme.onmicrosoft.com' },
      { emails: ['ines@acme.test'], manager: 'marc@acme.test' },
    ]);
    expect(fetchImpl.calls[0]?.url).toContain('$expand=manager($select=mail,userPrincipalName)');
    expect(fetchImpl.calls[1]?.url).toBe(next);
  });

  it("lève ConnectorAuthError quand l'annuaire refuse", async () => {
    const fetchImpl = fakeFetch([
      { url: 'https://graph.microsoft.com/v1.0/users', status: 403, json: {} },
    ]);
    await expect(readPeople('microsoft', 'jeton', fetchImpl)).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );
  });
});

describe('readDirectory et directoryState', () => {
  const account = { id: 'compte-google', providerId: 'google' };
  beforeEach(() => {
    vi.mocked(auth.api.listUserAccounts).mockResolvedValue([account] as never);
    vi.mocked(auth.api.getAccessToken).mockResolvedValue({ accessToken: 'jeton' } as never);
  });

  it("lit l'annuaire avec le jeton du compte Google de la personne", async () => {
    const fetchImpl = fakeFetch([
      {
        url: 'https://admin.googleapis.com/admin/directory/v1/users',
        json: { users: [{ primaryEmail: 'a@acme.test' }] },
      },
    ]);
    expect(await readDirectory('google', fetchImpl)).toEqual([
      { emails: ['a@acme.test'], manager: null },
    ]);
    expect(vi.mocked(auth.api.getAccessToken).mock.calls[0]?.[0]).toMatchObject({
      body: { accountId: 'compte-google' },
    });
  });

  it("rend 'droits' sans compte relié, ou quand l'annuaire refuse ; 'injoignable' sinon", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await readDirectory('microsoft')).toBe('droits');
    const users = 'https://admin.googleapis.com/admin/directory/v1/users';
    expect(await readDirectory('google', fakeFetch([{ url: users, status: 403, json: {} }]))).toBe(
      'droits',
    );
    expect(await readDirectory('google', fakeFetch([{ url: users, status: 404, json: {} }]))).toBe(
      'injoignable',
    );
  });

  it('traduit le retour de Google ou de Microsoft', async () => {
    const providers = ['google', 'microsoft'];
    expect(await directoryState(CTX, undefined, undefined)).toEqual({ providers });
    expect(await directoryState(CTX, 'refus', 'email_does_not_match')).toEqual({
      providers,
      error: 'adresse',
    });
    expect(await directoryState(CTX, 'refus', 'access_denied')).toEqual({
      providers,
      error: 'refus',
    });
    expect(await directoryState(CTX, 'microsoft', undefined)).toEqual({
      providers,
      provider: 'microsoft',
      error: 'droits',
    });
  });
});
