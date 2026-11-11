import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePath } from '@/server/auth/computer-authorize';
import { verifyComputerCode } from '@/server/auth/computer-code';
import { getUserContext } from '@/server/auth/session';
import { authorizeComputerAction } from './actions';

vi.mock('@/server/auth/session', () => ({ getUserContext: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

const CTX = { userId: 'u1', tenantId: 't1', principals: ['u1', 't1'] };
const ETAT = 'AbCdEfGhIjKlMnOpQrStUv';
const EMPREINTE = 'a1'.repeat(32);
const FIELDS = { port: '4242', etat: ETAT, empreinte: EMPREINTE };

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

// L'adresse vers laquelle l'action renvoie le navigateur (le mock de redirect la glisse dans l'erreur). `ticked` : les
// cases cochées, une valeur par case, comme les poste un formulaire natif.
const target = async (fields: Record<string, string>, ticked: string[] = []) => {
  const data = form(fields);
  for (const usage of ticked) data.append('usage', usage);
  const error = await authorizeComputerAction(data).then(
    () => new Error('pas de redirection'),
    (caught: Error) => caught,
  );
  expect(error.message).toMatch(/^NEXT_REDIRECT /);
  return error.message.slice('NEXT_REDIRECT '.length);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserContext).mockResolvedValue(CTX);
});

describe('« Autoriser »', () => {
  it('renvoie vers 127.0.0.1 avec un code que l’empreinte reçue permet d’échanger', async () => {
    const url = new URL(await target({ ...FIELDS, decision: 'allow' }));

    expect([url.protocol, url.hostname, url.port, url.pathname]).toEqual([
      'http:',
      '127.0.0.1',
      '4242',
      '/retour',
    ]);
    expect([...url.searchParams.keys()]).toEqual(['code', 'etat']);
    expect(url.searchParams.get('etat')).toBe(ETAT);
    expect(verifyComputerCode(url.searchParams.get('code') ?? '')).toMatchObject({
      v: 1,
      e: EMPREINTE,
      u: 'u1',
      t: 't1',
    });
  });

  it('relit la session et l’espace : le formulaire ne dit pas qui autorise', async () => {
    vi.mocked(getUserContext).mockResolvedValue({ ...CTX, userId: 'u2', tenantId: 't2' });

    const url = new URL(
      await target({ ...FIELDS, decision: 'allow', u: 'pirate', t: 'autre-espace' }),
    );

    expect(verifyComputerCode(url.searchParams.get('code') ?? '')).toMatchObject({
      u: 'u2',
      t: 't2',
    });
    expect(getUserContext).toHaveBeenCalledTimes(1);
  });

  it('sans session ni espace, ne signe rien et rend la main à la page', async () => {
    vi.mocked(getUserContext).mockResolvedValue(null);

    expect(await target({ ...FIELDS, decision: 'allow' })).toBe(
      authorizePath({ port: 4242, etat: ETAT, empreinte: EMPREINTE }),
    );
  });
});

// Les cases (T64, C16) : la page envoie celles qu'elle montre (`usages`, revalidé ici) et celles qui sont cochées
// (`usage`) ; l'action met les premières dans `m`, et les cochées parmi elles dans `g`.
describe('« Autoriser » : les cases de la page', () => {
  const claims = async (fields: Record<string, string>, ticked: string[] = []) => {
    const url = new URL(await target({ ...FIELDS, decision: 'allow', ...fields }, ticked));
    expect([...url.searchParams.keys()]).toEqual(['code', 'etat']);
    return verifyComputerCode(url.searchParams.get('code') ?? '');
  };

  it('montrée et cochée : dans m et dans g', async () => {
    expect(await claims({ usages: 'lecture' }, ['lecture'])).toMatchObject({
      m: ['lecture'],
      g: ['lecture'],
    });
  });

  it('montrée et décochée : dans m seulement', async () => {
    expect(await claims({ usages: 'lecture' })).toMatchObject({ m: ['lecture'], g: [] });
  });

  it('une case postée que la page ne montrait pas est ignorée : g reste dans m', async () => {
    const payload = await claims({}, ['lecture', 'noter']);

    expect(payload?.m).toBeUndefined();
    expect(payload?.g).toBeUndefined();
    expect(await claims({ usages: 'lecture' }, ['lecture', 'noter', 'resume'])).toMatchObject({
      m: ['lecture'],
      g: ['lecture'],
    });
  });

  it('une valeur inconnue est écartée, de m comme de g', async () => {
    expect(
      await claims({ usages: 'lecture,inconnu,resume' }, ['inconnu', 'lecture']),
    ).toMatchObject({ m: ['lecture'], g: ['lecture'] });
    const none = await claims({ usages: 'inconnu' }, ['inconnu']);
    expect(none?.m).toBeUndefined();
  });

  it('« Annuler » ne signe rien et ne porte aucun usage', async () => {
    expect(await target({ ...FIELDS, usages: 'lecture', decision: 'cancel' }, ['lecture'])).toBe(
      `http://127.0.0.1:4242/retour?refus=1&etat=${ETAT}`,
    );
    expect(getUserContext).not.toHaveBeenCalled();
  });

  it('sans session, rend la main à la page avec ses cases', async () => {
    vi.mocked(getUserContext).mockResolvedValue(null);

    expect(await target({ ...FIELDS, usages: 'lecture', decision: 'allow' }, ['lecture'])).toBe(
      authorizePath({ port: 4242, etat: ETAT, empreinte: EMPREINTE, usages: ['lecture'] }),
    );
  });
});

describe('« Annuler »', () => {
  it('renvoie vers 127.0.0.1 avec refus=1, sans signer ni lire la session', async () => {
    expect(await target({ ...FIELDS, decision: 'cancel' })).toBe(
      `http://127.0.0.1:4242/retour?refus=1&etat=${ETAT}`,
    );
    expect(getUserContext).not.toHaveBeenCalled();
  });

  it('vaut aussi pour une décision absente ou inconnue : seul « allow » signe', async () => {
    const refus = `http://127.0.0.1:4242/retour?refus=1&etat=${ETAT}`;

    expect(await target(FIELDS)).toBe(refus);
    expect(await target({ ...FIELDS, decision: 'ALLOW' })).toBe(refus);
    expect(getUserContext).not.toHaveBeenCalled();
  });
});

describe('paramètres invalides', () => {
  it.each([
    ['un port sous 1024', { port: '80' }],
    ['un port au-dessus de 65535', { port: '70000' }],
    ['un port qui cache une machine', { port: '1234@evil.example' }],
    ['une empreinte de 63 caractères', { empreinte: 'a'.repeat(63) }],
    ['un etat trop court', { etat: 'court' }],
  ])(
    '%s : rien n’est signé, le navigateur retourne sur la page, qui l’explique',
    async (_name, over) => {
      for (const decision of ['allow', 'cancel']) {
        expect(await target({ ...FIELDS, ...over, decision })).toBe('/ordinateur/autoriser');
      }
      expect(getUserContext).not.toHaveBeenCalled();
    },
  );

  it('un paramètre manquant, de même', async () => {
    expect(await target({ port: '4242', decision: 'allow' })).toBe('/ordinateur/autoriser');
  });
});
