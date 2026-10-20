import { describe, expect, it } from 'vitest';
import { TEST_ENV } from '@/test/test-env';
import { parseEnv } from '../env';
import { getLlm } from './get-llm';

const request = {
  step: 'reponse' as const,
  system: 'Système',
  messages: [{ role: 'user' as const, content: 'Où en est Acme ?' }],
  maxTokens: 100,
};

async function answer(env: ReturnType<typeof parseEnv>): Promise<string> {
  const llm = getLlm(env);
  if (!llm) throw new Error('aucun modèle');
  let text = '';
  for await (const delta of llm.streamText(request)) text += delta;
  return text;
}

describe('getLlm', () => {
  it('rend null sans clé Anthropic ni LEON_LLM : Leon garde et indexe, mais ne répond pas', () => {
    expect(getLlm(parseEnv(TEST_ENV))).toBeNull();
    expect(getLlm(parseEnv({ ...TEST_ENV, ANTHROPIC_API_KEY: '', LEON_LLM: '' }))).toBeNull();
  });

  it('rend le client Anthropic quand la clé est réglée', () => {
    const llm = getLlm(parseEnv({ ...TEST_ENV, ANTHROPIC_API_KEY: 'cle-de-test' }));

    expect(llm).not.toBeNull();
    expect(typeof llm?.streamText).toBe('function');
    expect(typeof llm?.runAgent).toBe('function');
  });

  it('rend le faux modèle de démonstration avec LEON_LLM=factice, sans clé', async () => {
    const text = await answer(parseEnv({ ...TEST_ENV, LEON_LLM: 'factice' }));

    expect(text).toContain('modèle factice');
    expect(text).toContain('[1]');
  });

  it('préfère le faux modèle à la clé : une démo ne dépense rien', async () => {
    const text = await answer(
      parseEnv({ ...TEST_ENV, LEON_LLM: 'factice', ANTHROPIC_API_KEY: 'cle-de-test' }),
    );

    expect(text).toContain('modèle factice');
  });

  it('refuse le faux modèle en production : l’environnement ne se charge pas', () => {
    expect(() =>
      getLlm(parseEnv({ ...TEST_ENV, LEON_LLM: 'factice', NODE_ENV: 'production' })),
    ).toThrow(/LEON_LLM.*production/s);
  });
});
