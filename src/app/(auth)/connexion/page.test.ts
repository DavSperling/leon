import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AuthForm } from '@/components/verre/auth/auth-form';
import { authorizePath } from '@/server/auth/computer-authorize';
import SignInPage from './page';

// Le formulaire importe les actions, donc Better Auth : seul ce que la page lui passe se teste ici.
vi.mock('@/components/verre/auth/auth-form', () => ({ AuthForm: vi.fn() }));
vi.mock('@/server/auth/auth', () => ({ passwordResetEnabled: true }));
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

  it.each([
    ['sans paramètres', {}],
    ['un port invalide', { ...PARAMS, port: '80' }],
    ['une empreinte incomplète', { ...PARAMS, empreinte: 'a1' }],
  ])('%s : aucun retour', async (_name, searchParams) => {
    expect((await formProps(searchParams))?.returnTo).toBeUndefined();
  });
});
