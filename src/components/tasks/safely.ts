import { unstable_rethrow } from 'next/navigation';

// Un échec réseau ou serveur ne doit pas casser la page : il devient une erreur ordinaire,
// montrée comme celles que l'action renvoie elle-même. Une action qui redirige rejette sa
// promesse avec une erreur de redirection : Next mène lui-même la navigation, il faut la laisser
// remonter, sinon une réussite s'affiche comme un échec.
export function safely<T extends { ok: boolean }>(
  call: Promise<T>,
): Promise<T | { ok: false; error: string }> {
  return call.catch((error: unknown) => {
    unstable_rethrow(error);
    return { ok: false as const, error: 'Connexion impossible. Réessayez.' };
  });
}
