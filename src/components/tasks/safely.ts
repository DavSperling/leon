// Un échec réseau ou serveur ne doit pas casser la page : il devient une erreur ordinaire,
// montrée comme celles que l'action renvoie elle-même.
export function safely<T extends { ok: boolean }>(
  call: Promise<T>,
): Promise<T | { ok: false; error: string }> {
  return call.catch(() => ({ ok: false as const, error: 'Connexion impossible. Réessayez.' }));
}
