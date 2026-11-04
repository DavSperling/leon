import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import ConnectedPage, { generateMetadata } from './page';

const texts = (node: ReactNode): string[] => {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return texts(node.props.children);
};
const render = async (refus?: string | string[]) =>
  texts((await ConnectedPage({ searchParams: Promise.resolve({ refus }) })) as ReactElement);

describe('page /ordinateur/connecte', () => {
  it('dit que c’est fait', async () => {
    expect(await render()).toContain(
      'C’est fait. Vous pouvez fermer cet onglet et revenir au terminal.',
    );
  });

  it('avec ?refus=1, dit que rien n’a été autorisé', async () => {
    const text = await render('1');

    expect(text).toContain('Rien n’a été autorisé.');
    expect(text.join(' ')).not.toContain('C’est fait');
  });

  it('ne prend pour un refus que refus=1', async () => {
    for (const refus of ['0', 'oui', '', ['1', '1']]) {
      expect((await render(refus)).join(' ')).toContain('C’est fait');
    }
  });

  it('le titre de l’onglet suit le résultat', async () => {
    expect(await generateMetadata({ searchParams: Promise.resolve({}) })).toEqual({
      title: 'Ordinateur connecté',
    });
    expect(await generateMetadata({ searchParams: Promise.resolve({ refus: '1' }) })).toEqual({
      title: 'Connexion annulée',
    });
  });

  it('a ses textes en anglais', () => {
    expect(en.computer.connected).toMatchObject({
      done: 'All set. You can close this tab and go back to the terminal.',
      refused: 'Nothing was authorized.',
    });
    expect(fr.computer.connected.done).toBeDefined();
  });
});
