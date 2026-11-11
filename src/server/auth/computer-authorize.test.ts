import { describe, expect, it } from 'vitest';
import { oauthReturnPath } from '@/server/oauth/authorize';
import {
  authorizePath,
  authorizeQuery,
  MEMORY_RETURN_PATH,
  parseAuthorizeParams,
  pathAfterSignIn,
  returnUrl,
} from './computer-authorize';

const ETAT = 'AbCdEfGhIjKlMnOpQrStUv'; // 22 caractères, le minimum de K3
const EMPREINTE = 'a1'.repeat(32);
const GOOD = { port: '4242', etat: ETAT, empreinte: EMPREINTE };
const PARAMS = { port: 4242, etat: ETAT, empreinte: EMPREINTE };

describe('parseAuthorizeParams (K3)', () => {
  it('rend les trois paramètres, le port en entier', () => {
    expect(parseAuthorizeParams(GOOD)).toEqual(PARAMS);
  });

  it('ignore les autres paramètres de l’adresse', () => {
    expect(
      parseAuthorizeParams({ ...GOOD, supprime: 'compte', url: 'https://evil.example' }),
    ).toEqual(PARAMS);
  });

  it('accepte les bornes : port 1024 et 65535, etat de 22 et de 64 caractères', () => {
    expect(parseAuthorizeParams({ ...GOOD, port: '1024' })?.port).toBe(1024);
    expect(parseAuthorizeParams({ ...GOOD, port: '65535' })?.port).toBe(65535);
    expect(parseAuthorizeParams({ ...GOOD, etat: `${'a_-'.repeat(21)}b` })).not.toBeNull(); // 64
    expect(parseAuthorizeParams({ ...GOOD, etat: 'Z'.repeat(22) })).not.toBeNull();
  });

  it.each([
    ['port 80', { port: '80' }],
    ['port 1023', { port: '1023' }],
    ['port 65536', { port: '65536' }],
    ['port 70000', { port: '70000' }],
    ['port 0', { port: '0' }],
    ['port négatif', { port: '-4242' }],
    ['port décimal', { port: '4242.5' }],
    ['port hexadécimal', { port: '0x1092' }],
    ['port avec zéro devant', { port: '04242' }],
    ['port avec espace', { port: ' 4242' }],
    ['port vide', { port: '' }],
    ['port absent', { port: undefined }],
    ['port qui cache une machine', { port: '1234@evil.example' }],
    ['port suivi d’un chemin', { port: '1234/retour' }],
    ['port répété', { port: ['4242', '4243'] }],
    ['etat de 21 caractères', { etat: 'A'.repeat(21) }],
    ['etat de 65 caractères', { etat: 'A'.repeat(65) }],
    ['etat hors alphabet', { etat: `${'A'.repeat(21)}&` }],
    ['etat avec un point', { etat: `${'A'.repeat(21)}.` }],
    ['etat absent', { etat: undefined }],
    ['empreinte de 63 caractères', { empreinte: 'a'.repeat(63) }],
    ['empreinte de 65 caractères', { empreinte: 'a'.repeat(65) }],
    ['empreinte en majuscules', { empreinte: 'A'.repeat(64) }],
    ['empreinte non hexadécimale', { empreinte: 'g'.repeat(64) }],
    ['empreinte absente', { empreinte: undefined }],
    ['empreinte répétée', { empreinte: [EMPREINTE, EMPREINTE] }],
  ])('refuse %s', (_name, over) => {
    expect(parseAuthorizeParams({ ...GOOD, ...over })).toBeNull();
  });

  it('refuse un paramètre qui n’est pas une chaîne (champ de formulaire fichier, nombre)', () => {
    expect(parseAuthorizeParams({ ...GOOD, port: 4242 })).toBeNull();
    expect(parseAuthorizeParams({ ...GOOD, etat: new File([], 'x') })).toBeNull();
    expect(parseAuthorizeParams({})).toBeNull();
  });
});

describe('authorizePath et authorizeQuery', () => {
  it('rebâtissent l’adresse de la page à partir des valeurs validées', () => {
    expect(authorizeQuery(PARAMS)).toBe(`port=4242&etat=${ETAT}&empreinte=${EMPREINTE}`);
    expect(authorizePath(PARAMS)).toBe(
      `/ordinateur/autoriser?port=4242&etat=${ETAT}&empreinte=${EMPREINTE}`,
    );
  });
});

// Les cases que `leon setup` demande (T64, C16) : facultatives, et jamais une raison de refuser le lien. La page ne
// montre que ce qu'elle sait montrer à ce lot (`lecture`).
describe('le paramètre usages (T64)', () => {
  it('rend les cases demandées que la page sait montrer, sans doublon', () => {
    expect(parseAuthorizeParams({ ...GOOD, usages: 'lecture' })).toEqual({
      ...PARAMS,
      usages: ['lecture'],
    });
    expect(parseAuthorizeParams({ ...GOOD, usages: 'lecture,lecture' })?.usages).toEqual([
      'lecture',
    ]);
    // Dans l'ordre de la page (AUTHORIZE_USAGES), sans `noter`, qu'elle ne montre pas encore (T57).
    expect(parseAuthorizeParams({ ...GOOD, usages: 'rappel,lecture,noter' })?.usages).toEqual([
      'lecture',
      'rappel',
    ]);
  });

  it.each([
    ['une valeur inconnue', 'inconnu'],
    ['un usage que la page ne montre pas encore', 'noter'],
    ['un usage qui n’est jamais coché par défaut', 'resume'],
    ['vide', ''],
    ['une chaîne trop longue', `lecture,${'x'.repeat(300)}`],
    ['un paramètre répété', ['lecture', 'lecture']],
    ['autre chose qu’une chaîne', 42],
    ['un fichier', new File([], 'lecture')],
  ])('écarte %s, sans jamais refuser le lien', (_name, usages) => {
    const params = parseAuthorizeParams({ ...GOOD, usages });
    expect(params).toEqual(PARAMS);
    expect(params?.usages).toBeUndefined();
  });

  it('authorizeQuery ne l’ajoute que s’il en reste : sans lui, l’adresse est celle d’avant', () => {
    expect(authorizeQuery({ ...PARAMS, usages: ['lecture'] })).toBe(
      `port=4242&etat=${ETAT}&empreinte=${EMPREINTE}&usages=lecture`,
    );
    const ignored = parseAuthorizeParams({ ...GOOD, usages: 'noter' });
    expect(ignored && authorizeQuery(ignored)).toBe(authorizeQuery(PARAMS));
  });

  it('pathAfterSignIn le garde, et en retire une valeur inconnue', () => {
    const asked = authorizePath({ ...PARAMS, usages: ['lecture'] });

    expect(pathAfterSignIn(asked)).toBe(asked);
    expect(pathAfterSignIn(`${authorizePath(PARAMS)}&usages=lecture%2Cinconnu`)).toBe(asked);
    expect(pathAfterSignIn(`${authorizePath(PARAMS)}&usages=inconnu`)).toBe(authorizePath(PARAMS));
  });

  it('returnUrl ne le porte jamais : les cases ne partent que dans le code signé', () => {
    const params = { ...PARAMS, usages: ['lecture' as const] };

    expect([...new URL(returnUrl(params, { code: 'a.b' })).searchParams.keys()]).toEqual([
      'code',
      'etat',
    ]);
    expect(returnUrl(params, 'refus')).toBe(`http://127.0.0.1:4242/retour?refus=1&etat=${ETAT}`);
  });
});

describe('returnUrl (K3)', () => {
  it('« Autoriser » : le code et l’etat, sur 127.0.0.1 au port validé', () => {
    expect(returnUrl(PARAMS, { code: 'charge.signature' })).toBe(
      `http://127.0.0.1:4242/retour?code=charge.signature&etat=${ETAT}`,
    );
  });

  it('« Annuler » : refus=1 et l’etat', () => {
    expect(returnUrl(PARAMS, 'refus')).toBe(`http://127.0.0.1:4242/retour?refus=1&etat=${ETAT}`);
  });

  it('ne sort jamais de 127.0.0.1, quel que soit le port', () => {
    for (const port of [1024, 5180, 65535]) {
      const url = new URL(returnUrl({ ...PARAMS, port }, { code: 'a.b' }));
      expect([url.protocol, url.hostname, url.port, url.pathname]).toEqual([
        'http:',
        '127.0.0.1',
        String(port),
        '/retour',
      ]);
    }
  });
});

describe('pathAfterSignIn', () => {
  it('renvoie à l’autorisation en cours quand le champ en porte une valide', () => {
    expect(pathAfterSignIn(authorizePath(PARAMS))).toBe(authorizePath(PARAMS));
  });

  it('rebâtit le chemin : un paramètre en trop disparaît', () => {
    expect(pathAfterSignIn(`${authorizePath(PARAMS)}&suite=https://evil.example`)).toBe(
      authorizePath(PARAMS),
    );
  });

  it.each([
    ['rien', null],
    ['autre chose qu’une chaîne', 42],
    ['un fichier', new File([], 'x')],
    ['vide', ''],
    ['une adresse absolue', `https://evil.example/ordinateur/autoriser?${authorizeQuery(PARAMS)}`],
    ['une adresse sans schéma', `//evil.example/ordinateur/autoriser?${authorizeQuery(PARAMS)}`],
    ['une autre page de Leon', `/reglages?${authorizeQuery(PARAMS)}`],
    ['la page, sans paramètres', '/ordinateur/autoriser'],
    [
      'la page, un port invalide',
      `/ordinateur/autoriser?${authorizeQuery({ ...PARAMS, port: 80 })}`,
    ],
    ['un chemin qui remonte', `/ordinateur/autoriser/../reglages?${authorizeQuery(PARAMS)}`],
  ])('va à l’accueil pour %s', (_name, value) => {
    expect(pathAfterSignIn(value)).toBe('/');
  });
});

// La demande OAuth d'un assistant (M05) : seule la forme est revalidée ici (chemin fixe, huit paramètres connus,
// bornés, rebâtis). La page revalide le client et l'adresse de retour à chaque affichage.
describe('pathAfterSignIn : la demande OAuth d’un assistant', () => {
  const REQUEST = {
    response_type: 'code',
    client_id: 'un-client-id',
    redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
    state: 'etat du client',
    code_challenge: 'A'.repeat(43),
    code_challenge_method: 'S256',
    scope: 'leon',
    resource: 'http://localhost:3000/api/mcp',
  };
  const OAUTH = `/oauth/autoriser?${new URLSearchParams(REQUEST)}`;

  it('renvoie à la demande en cours, rebâtie', () => {
    expect(pathAfterSignIn(OAUTH)).toBe(OAUTH);
    expect(pathAfterSignIn(OAUTH)).toBe(oauthReturnPath(REQUEST));
  });

  it('rebâtit le chemin : un paramètre en trop disparaît', () => {
    expect(pathAfterSignIn(`${OAUTH}&suite=https://evil.example&port=4242`)).toBe(OAUTH);
  });

  it.each([
    ['une adresse absolue', `https://evil.example${OAUTH}`],
    ['une adresse sans schéma', `//evil.example${OAUTH}`],
    ['une autre page de Leon', OAUTH.replace('/oauth/autoriser', '/reglages')],
    ['un chemin qui remonte', OAUTH.replace('/oauth/autoriser', '/oauth/autoriser/../../reglages')],
    ['la page, sans paramètres', '/oauth/autoriser'],
    ['la page, sans client_id', OAUTH.replace(/client_id=[^&]*&/, '')],
    ['un client_id de plus de 4 Ko', OAUTH.replace('un-client-id', 'a'.repeat(4097))],
    ['un état de plus de 512 caractères', OAUTH.replace('etat+du+client', 'a'.repeat(513))],
    ['la page sans le « ? »', `/oauth/autoriser&client_id=x`],
  ])('va à l’accueil pour %s', (_name, value) => {
    expect(pathAfterSignIn(value)).toBe('/');
  });

  it('une demande d’ordinateur et une demande OAuth ne se mélangent pas', () => {
    expect(pathAfterSignIn(`/ordinateur/autoriser?${new URLSearchParams(REQUEST)}`)).toBe('/');
    expect(pathAfterSignIn(authorizePath(PARAMS))).toBe(authorizePath(PARAMS));
  });
});

// T55 : la reconnexion demandée par la section Mémoire (/connexion?retour=memoire) y ramène, par une valeur fixe.
describe('pathAfterSignIn : le retour vers la section Mémoire', () => {
  it('accepte la valeur fixe /reglages#memoire', () => {
    expect(MEMORY_RETURN_PATH).toBe('/reglages#memoire');
    expect(pathAfterSignIn('/reglages#memoire')).toBe('/reglages#memoire');
  });

  it.each([
    ['un autre site', 'https://evil.example/reglages#memoire'],
    ['une adresse sans schéma', '//evil.example/reglages#memoire'],
    ['la valeur courte de l’adresse', 'memoire'],
    ['les réglages sans la section', '/reglages'],
    ['une autre section', '/reglages#securite'],
    ['un paramètre en plus', '/reglages?x=1#memoire'],
    ['un autre chemin', '/reglages/../x#memoire'],
  ])('refuse %s : l’accueil', (_name, value) => {
    expect(pathAfterSignIn(value)).toBe('/');
  });
});
