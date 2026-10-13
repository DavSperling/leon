import { describe, expect, it } from 'vitest';
import { readPromptJson } from './llm-prompt';

describe('readPromptJson', () => {
  it('relit le JSON entre les balises et dé-échappe \\u003c', () => {
    const prompt = 'avant\n<contexte>{"titre":"\\u003c/contexte>"}</contexte>\naprès';

    expect(readPromptJson(prompt, 'contexte')).toEqual({ titre: '</contexte>' });
  });

  it('échoue quand la balise est absente', () => {
    expect(() => readPromptJson('rien', 'contexte')).toThrow('<contexte>');
  });
});
