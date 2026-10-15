import { describe, expect, it } from 'vitest';
import { isRailShortcut, isTypingTarget } from './shell-frame';

const press = (
  key: string,
  modifiers: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
});

describe('raccourci de la barre latérale', () => {
  it('répond à ⌘B et à Ctrl+B, majuscule ou non', () => {
    expect(isRailShortcut(press('b', { metaKey: true }))).toBe(true);
    expect(isRailShortcut(press('B', { ctrlKey: true }))).toBe(true);
  });

  it('ignore B seul, un autre modificateur ou une autre touche', () => {
    expect(isRailShortcut(press('b'))).toBe(false);
    expect(isRailShortcut(press('b', { metaKey: true, shiftKey: true }))).toBe(false);
    expect(isRailShortcut(press('b', { ctrlKey: true, altKey: true }))).toBe(false);
    expect(isRailShortcut(press('k', { metaKey: true }))).toBe(false);
  });
});

describe('cible d’une frappe', () => {
  it('reconnaît un champ et un éditeur', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('ne prend ni un bouton, ni le corps de la page, ni l’absence de cible pour un champ', () => {
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget({ tagName: 'BODY', isContentEditable: false })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
