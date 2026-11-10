import { describe, expect, it } from 'vitest';
import { adminPool } from '@/test/db';

// Migration 0062 : appels_modele accepte l'étape `fil`, l'état d'un fil de travail écrit par Leon (T43, D23).

// Insère un appel de l'étape donnée, puis annule : le tableau des admins ne compte pas ces lignes d'essai.
async function insertStep(step: string): Promise<void> {
  const client = await adminPool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into appels_modele (step, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
       values ($1, 'claude-haiku-5-5', 1, 1, 0, 0)`,
      [step],
    );
  } finally {
    await client.query('rollback');
    client.release();
  }
}

describe('appels_modele.step', () => {
  it.each(['reponse', 'discussion', 'point', 'resume', 'fil'])('accepte %s', async (step) => {
    await expect(insertStep(step)).resolves.toBeUndefined();
  });

  it('refuse une étape inconnue', async () => {
    await expect(insertStep('fils')).rejects.toThrow(/appels_modele_step_check/);
  });
});
