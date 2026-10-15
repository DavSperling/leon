import { describe, expect, it } from 'vitest';
import {
  ariaKeys,
  type Binding,
  bindingKeys,
  GROUP_LABELS,
  type KeyInput,
  type KeyState,
  resolveKey,
  SHORTCUTS,
  type Shortcut,
  shortcutOf,
} from './shortcuts';

const FREE: KeyState = { busy: false, after: null };
const BUSY: KeyState = { busy: true, after: null };

// La frappe que produit une liaison : « ⌘K » est key « k » avec metaKey.
const pressing = (binding: Binding, extra: Partial<KeyInput> = {}): KeyInput => ({
  key: binding.key,
  metaKey: binding.mod === true,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...extra,
});

const press = (key: string, extra: Partial<KeyInput> = {}): KeyInput => pressing({ key }, extra);

const bindings = (): Array<{ shortcut: Shortcut; binding: Binding }> =>
  SHORTCUTS.flatMap((shortcut) => shortcut.bindings.map((binding) => ({ shortcut, binding })));

const signature = ({ key, mod, after }: Binding) => `${after ?? ''}>${mod ? '⌘' : ''}${key}`;

describe('table des raccourcis', () => {
  it('ne donne jamais deux actions à la même touche', () => {
    const signatures = bindings().map(({ binding }) => signature(binding));
    expect(signatures.filter((one, index) => signatures.indexOf(one) !== index)).toEqual([]);
  });

  it('ne donne qu’un identifiant à chaque action', () => {
    const ids = SHORTCUTS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('réserve la touche qui ouvre une séquence : elle n’a pas d’action seule', () => {
    const prefixes = bindings().flatMap(({ binding }) => (binding.after ? [binding.after] : []));
    expect(prefixes).toEqual(['g', 'g']);
    expect(bindings().filter(({ binding }) => binding.key === 'g' && !binding.after)).toEqual([]);
  });

  it('range chaque action dans un groupe de l’aide, avec un libellé et une touche', () => {
    for (const shortcut of SHORTCUTS) {
      expect(GROUP_LABELS[shortcut.group]).toBeTruthy();
      expect(shortcut.label).not.toBe('');
      expect(shortcut.bindings.length).toBeGreaterThan(0);
    }
  });

  it('couvre toutes les touches de la spec', () => {
    const keys = bindings().map(({ binding }) => bindingKeys(binding).join(' '));
    for (const expected of [
      '⌘K',
      'C',
      'J',
      'K',
      '↓',
      '↑',
      '↵',
      'X',
      'S',
      'P',
      'A',
      'L',
      'D',
      'F',
      'G T',
      'G M',
      '⌘B',
      'Échap',
      '?',
    ]) {
      expect(keys).toContain(expected);
    }
  });

  it('retrouve une action par son identifiant', () => {
    expect(shortcutOf('create').label).toBe('Nouvelle tâche');
    expect(() => shortcutOf('inconnu' as 'create')).toThrow('Raccourci inconnu');
  });
});

describe('resolveKey', () => {
  it('déclenche chaque raccourci lu par l’écouteur', () => {
    for (const { shortcut, binding } of bindings()) {
      if (shortcut.elsewhere) continue;
      const state = { busy: false, after: binding.after ?? null };
      expect(resolveKey(pressing(binding), state), signature(binding)).toEqual({
        run: shortcut.id,
      });
    }
  });

  it('laisse à d’autres ⌘K, ⌘B et Échap', () => {
    expect(resolveKey(press('k', { metaKey: true }), FREE)).toBeNull();
    expect(resolveKey(press('b', { ctrlKey: true }), FREE)).toBeNull();
    expect(resolveKey(press('Escape'), FREE)).toBeNull();
  });

  it('ne déclenche rien dans un champ, un éditeur, un menu ou un dialogue', () => {
    for (const { binding } of bindings()) {
      const state = { busy: true, after: binding.after ?? null };
      expect(resolveKey(pressing(binding), state), signature(binding)).toBeNull();
    }
    expect(resolveKey(press('g'), BUSY)).toBeNull();
  });

  it('compare event.key : la même lettre répond quelle que soit la disposition du clavier', () => {
    expect(resolveKey(press('c'), FREE)).toEqual({ run: 'create' });
    expect(resolveKey(press('C'), FREE)).toEqual({ run: 'create' }); // verrouillage majuscules
  });

  it('ignore une lettre avec Maj, Alt, ⌘ ou Ctrl : ⌘C copie, Maj+C n’est pas C', () => {
    expect(resolveKey(press('c', { shiftKey: true }), FREE)).toBeNull();
    expect(resolveKey(press('c', { altKey: true }), FREE)).toBeNull();
    expect(resolveKey(press('c', { metaKey: true }), FREE)).toBeNull();
    expect(resolveKey(press('c', { ctrlKey: true }), FREE)).toBeNull();
    expect(resolveKey(press('ArrowDown', { shiftKey: true }), FREE)).toBeNull();
  });

  it('prend « ? » avec Maj, comme on le tape au clavier', () => {
    expect(resolveKey(press('?', { shiftKey: true }), FREE)).toEqual({ run: 'help' });
  });

  it('ne laisse répéter que la navigation d’une ligne à l’autre', () => {
    expect(resolveKey(press('j', { repeat: true }), FREE)).toEqual({ run: 'next' });
    expect(resolveKey(press('ArrowUp', { repeat: true }), FREE)).toEqual({ run: 'previous' });
    expect(resolveKey(press('c', { repeat: true }), FREE)).toBeNull();
    expect(resolveKey(press('g', { repeat: true }), FREE)).toBeNull();
  });

  it('ignore une touche sans raccourci', () => {
    expect(resolveKey(press('q'), FREE)).toBeNull();
    expect(resolveKey(press('Tab'), FREE)).toBeNull();
    expect(resolveKey(press('Shift', { shiftKey: true }), FREE)).toBeNull();
  });
});

describe('séquence « G puis … »', () => {
  it('G ouvre la séquence, T et M la terminent', () => {
    expect(resolveKey(press('g'), FREE)).toEqual({ prefix: 'g' });
    expect(resolveKey(press('t'), { busy: false, after: 'g' })).toEqual({ run: 'go-tasks' });
    expect(resolveKey(press('m'), { busy: false, after: 'g' })).toEqual({ run: 'go-mine' });
  });

  it('T ou M sans G ne vont nulle part', () => {
    expect(resolveKey(press('t'), FREE)).toBeNull();
    expect(resolveKey(press('m'), FREE)).toBeNull();
  });

  it('une autre touche après G abandonne la séquence, sans lancer son action seule', () => {
    expect(resolveKey(press('c'), { busy: false, after: 'g' })).toBeNull();
    expect(resolveKey(press('g'), { busy: false, after: 'g' })).toBeNull();
    expect(resolveKey(press('Enter'), { busy: false, after: 'g' })).toBeNull();
  });

  it('une séquence ne continue pas sous un dialogue', () => {
    expect(resolveKey(press('t'), { busy: true, after: 'g' })).toBeNull();
  });
});

describe('bindingKeys', () => {
  it('écrit une capsule par touche', () => {
    expect(bindingKeys({ key: 'k', mod: true })).toEqual(['⌘K']);
    expect(bindingKeys({ key: 't', after: 'g' })).toEqual(['G', 'T']);
    expect(bindingKeys({ key: 'c' })).toEqual(['C']);
    expect(bindingKeys({ key: 'ArrowDown' })).toEqual(['↓']);
    expect(bindingKeys({ key: 'Enter' })).toEqual(['↵']);
    expect(bindingKeys({ key: '?' })).toEqual(['?']);
  });
});

describe('ariaKeys', () => {
  it('nomme les touches comme aria-keyshortcuts l’attend', () => {
    expect(ariaKeys('create')).toBe('C');
    expect(ariaKeys('escape')).toBe('Escape');
    expect(ariaKeys('go-tasks')).toBe('G T');
    expect(ariaKeys('palette')).toBe('Meta+K Control+K');
    expect(ariaKeys('next')).toBe('J');
  });
});
