import { describe, expect, it } from 'vitest';
import {
  authorizePath,
  authorizeQuery,
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
