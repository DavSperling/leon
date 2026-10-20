import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AgentTool } from './llm';
import { executeAgentTool } from './run-tool';

function chercher(run: (input: { requete: string }) => Promise<string>): AgentTool {
  return {
    name: 'chercher',
    description: 'Cherche dans la mémoire',
    input: z.object({ requete: z.string().trim().min(1) }),
    run: run as AgentTool['run'],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('executeAgentTool', () => {
  it('passe à l’outil son entrée validée par le schéma, pas celle du modèle', async () => {
    const run = vi.fn(async (_input: { requete: string }) => 'trois résultats');

    const result = await executeAgentTool([chercher(run)], 'chercher', { requete: '  acme  ' });

    expect(run).toHaveBeenCalledExactlyOnceWith({ requete: 'acme' });
    expect(result).toEqual({ text: 'trois résultats', isError: false });
  });

  it('répond au modèle sans lever quand l’outil n’existe pas', async () => {
    const result = await executeAgentTool([], 'supprimer', {});

    expect(result.isError).toBe(true);
    expect(result.text).toContain('supprimer');
  });

  it('répond au modèle sans lever quand l’entrée est invalide, et n’appelle pas l’outil', async () => {
    const run = vi.fn(async () => 'jamais');

    const result = await executeAgentTool([chercher(run)], 'chercher', { requete: 42 });

    expect(run).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.text).toContain('chercher');
    expect(result.text).toContain('requete');
  });

  it('ne recopie pas la valeur invalide dans le message d’erreur', async () => {
    const run = vi.fn(async () => 'jamais');

    const result = await executeAgentTool([chercher(run)], 'chercher', {
      requete: { zanzibar: 'confidentiel' },
    });

    expect(result.isError).toBe(true);
    expect(result.text).not.toContain('zanzibar');
    expect(result.text).not.toContain('confidentiel');
  });

  it('transforme l’échec de l’outil en résultat d’erreur à message fixe, et le journalise', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = vi.fn(async () => {
      throw new Error('zanzibar dans le message');
    });

    const result = await executeAgentTool([chercher(run)], 'chercher', { requete: 'acme' });

    expect(result.isError).toBe(true);
    expect(result.text).not.toContain('zanzibar');
    expect(error).toHaveBeenCalledOnce();
    expect((error.mock.calls[0] as unknown[])[1]).toBe('llm.outil');
    expect(JSON.stringify(error.mock.calls)).toContain('chercher');
  });
});
