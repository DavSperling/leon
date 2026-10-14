import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveMessageId } from './message-id';

describe('deriveMessageId', () => {
  it('donne le même id pour la même entrée', async () => {
    const first = await deriveMessageId('u', ['conv', 'parent', 'Bonjour']);
    expect(await deriveMessageId('u', ['conv', 'parent', 'Bonjour'])).toBe(first);
  });

  it('préfixe les 40 premiers hex du SHA-256 des parties jointes par \\n', async () => {
    const hex = createHash('sha256').update('conv\nparent\nBonjour').digest('hex');
    expect(await deriveMessageId('a', ['conv', 'parent', 'Bonjour'])).toBe(`a-${hex.slice(0, 40)}`);
  });

  it("change avec l'entrée", async () => {
    const one = await deriveMessageId('u', ['conv', 'parent', 'Bonjour']);
    expect(await deriveMessageId('u', ['conv', 'parent', 'Bonsoir'])).not.toBe(one);
  });
});
