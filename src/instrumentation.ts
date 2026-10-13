export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Valide l'environnement au démarrage plutôt qu'à la première requête.
  await import('@/server/env');
}
