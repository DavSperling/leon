import { describe, expect, it } from 'vitest';
import { hiddenLabel } from './list-notices';

describe('hiddenLabel', () => {
  it('accorde le mot avec le nombre', () => {
    expect(hiddenLabel(1)).toBe('1 tâche masquée');
    expect(hiddenLabel(9)).toBe('9 tâches masquées');
  });
});
