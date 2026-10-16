import { redirect } from 'next/navigation';
import { describe, expect, it } from 'vitest';
import { safely } from './safely';

// L'erreur que lance redirect() : c'est elle que Next fait rejeter côté client.
function redirection(): unknown {
  try {
    redirect('/taches');
  } catch (error) {
    return error;
  }
}

describe('safely', () => {
  it('rend le résultat de l’action', async () => {
    await expect(safely(Promise.resolve({ ok: true }))).resolves.toEqual({ ok: true });
  });

  it('transforme un échec réseau en erreur ordinaire', async () => {
    await expect(safely(Promise.reject(new Error('réseau')))).resolves.toEqual({
      ok: false,
      error: 'Connexion impossible. Réessayez.',
    });
  });

  it('laisse passer la redirection d’une action : elle n’est pas un échec', async () => {
    const error = redirection();
    expect(error).toBeInstanceOf(Error);

    await expect(safely(Promise.reject(error))).rejects.toBe(error);
  });
});
