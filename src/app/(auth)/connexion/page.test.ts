import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AuthForm } from '@/components/verre/auth/auth-form';
import { authorizePath } from '@/server/auth/computer-authorize';
import { oauthReturnPath } from '@/server/oauth/authorize';
import SignInPage from './page';

// Le formulaire importe les actions, donc Better Auth : seul ce que la page lui passe se teste ici.
vi.mock('@/components/verre/auth/auth-form', () => ({ AuthForm: vi.fn() }));
vi.mock('@/components/verre/auth/other-sign-in', () => ({ OtherSignIn: vi.fn() }));
vi.mock('@/server/auth/auth', () => ({ emailEnabled: true, socialProviders: {} }));
vi.mock('@/server/auth/sso', () => ({ anyVerifiedSso: vi.fn(async () => false) }));
vi.mock('next/server', () => ({ connection: vi.fn() }));

const PARAMS = { port: '4242', etat: 'AbCdEfGhIjKlMnOpQrStUv', empreinte: 'a1'.repeat(32) };

const elements = (node: ReactNode): ReactElement<Record<string, unknown>>[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
};
const formProps = async (searchParams: Record<string, string | undefined>) =>
  elements(await SignInPage({ searchParams: Promise.resolve(searchParams) })).find(
    (el) => el.type === AuthForm,
  )?.props;

describe('page de connexion', () => {
  it('passe au formulaire l’autorisation d’ordinateur qui l’a envoyée là, rebâtie', async () => {
    const props = await formProps({
      ...PARAMS,
      retour: 'https://evil.example',
      supprime: 'compte',
    });

    expect(props?.returnTo).toBe(
      authorizePath({ port: 4242, etat: PARAMS.etat, empreinte: PARAMS.empreinte }),
    );
  });

  // Les cases que `leon setup` demande (T64) survivent à la connexion, revalidées.
  it('garde le paramètre usages, sans ses valeurs inconnues', async () => {
    const props = await formProps({ ...PARAMS, usages: 'lecture,inconnu' });

    expect(props?.returnTo).toBe(
      authorizePath({
        port: 4242,
        etat: PARAMS.etat,
        empreinte: PARAMS.empreinte,
        usages: ['lecture'],
      }),
    );
    expect(props?.returnTo).toMatch(/&usages=lecture$/);
  });

  it.each([
    ['sans paramètres', {}],
    ['un port invalide', { ...PARAMS, port: '80' }],
    ['une empreinte incomplète', { ...PARAMS, empreinte: 'a1' }],
  ])('%s : aucun retour', async (_name, searchParams) => {
    expect((await formProps(searchParams))?.returnTo).toBeUndefined();
  });
});

// /oauth/autoriser, sans session : la connexion y revient par un chemin rebâti à partir des huit paramètres connus
// (forme seulement : la page d'autorisation juge le client et l'adresse de retour à son affichage).
describe('page de connexion : la demande OAuth d’un assistant', () => {
  const OAUTH = {
    response_type: 'code',
    client_id: 'un-client-id',
    redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
    state: 'etat',
    code_challenge: 'A'.repeat(43),
    code_challenge_method: 'S256',
    scope: 'leon',
    resource: 'http://localhost:3000/api/mcp',
  };

  it('la passe au formulaire, rebâtie : un paramètre en trop ne la suit pas', async () => {
    const props = await formProps({ ...OAUTH, retour: 'https://evil.example', supprime: 'compte' });

    expect(props?.returnTo).toBe(oauthReturnPath(OAUTH));
    expect(props?.returnTo).toMatch(/^\/oauth\/autoriser\?response_type=code&client_id=/);
    expect(props?.returnTo).not.toContain('evil');
  });

  it('l’autorisation d’un ordinateur, si elle est aussi là, passe avant', async () => {
    const props = await formProps({ ...PARAMS, ...OAUTH });

    expect(props?.returnTo).toBe(
      authorizePath({ port: 4242, etat: PARAMS.etat, empreinte: PARAMS.empreinte }),
    );
  });

  it.each([
    ['sans client_id', { ...OAUTH, client_id: undefined }],
    ['un client_id de plus de 4 Ko', { ...OAUTH, client_id: 'a'.repeat(4097) }],
    ['un état de plus de 512 caractères', { ...OAUTH, state: 'a'.repeat(513) }],
    ['un paramètre répété', { ...OAUTH, state: ['a', 'b'] }],
  ])('%s : aucun retour', async (_name, searchParams) => {
    expect((await formProps(searchParams as never))?.returnTo).toBeUndefined();
  });
});

// T55 : « Reconnectez-vous » dans la section Mémoire mène à /connexion?retour=memoire. La page bâtit elle-même le retour,
// une valeur fixe, sans recopier l'adresse ; toute connexion faite d'ici (mot de passe, 2FA, Google, Microsoft, SSO) le
// renvoie dans le même champ caché.
describe('page de connexion : la reconnexion de la section Mémoire', () => {
  it('retour=memoire : le formulaire et les autres connexions reviennent à /reglages#memoire', async () => {
    const props = await formProps({ retour: 'memoire' });

    expect(props?.returnTo).toBe('/reglages#memoire');
    expect(
      (props?.alternatives as ReactElement<{ returnTo?: string }> | undefined)?.props.returnTo,
    ).toBe('/reglages#memoire');
  });

  it.each([
    ['un retour inconnu', 'securite'],
    ['une adresse', '/reglages#memoire'],
    ['un autre site', 'https://evil.example'],
  ])('%s : aucun retour', async (_name, retour) => {
    expect((await formProps({ retour }))?.returnTo).toBeUndefined();
  });
});
