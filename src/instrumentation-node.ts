// Chargé uniquement par instrumentation.ts dans le runtime Node : webpack ne
// l'embarque donc pas dans le bundle edge (pg, fs).
export async function startNodeInstrumentation() {
  // Valide l'environnement au démarrage plutôt qu'à la première requête.
  const { env } = await import('@/server/env');
  // Next exécute register() pendant `next build` : le worker ne doit jamais y démarrer.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  // L'indexation de la recherche ne dépend d'aucun modèle : ni de la clé Anthropic, ni d'aucun appel au modèle.
  // Le plein texte tourne seul ; les vecteurs s'ajoutent dès qu'un fournisseur est réglé (LEON_EMBEDDINGS).
  // Elle démarre avant la relève des connecteurs, qui met des jobs dans sa file dès son premier passage.
  const { getEmbedder } = await import('@/server/embeddings/registry');
  // Échec franc, comme pour une variable d'environnement invalide, si le fournisseur réglé n'existe pas encore
  // (Voyage, Mistral et bge-m3 arrivent avec T30) : un fournisseur nul après un simple avertissement laisserait
  // la recherche en plein texte seul sans que personne le voie.
  const embedder = getEmbedder(env);
  if (!embedder) {
    console.info('[leon] LEON_EMBEDDINGS absente : la recherche se fait par le texte seul.');
  }
  const { startSearchWorker } = await import('@/server/search/worker');
  await startSearchWorker({ embedder });
  // La relève des connecteurs a besoin de sa propre clé, celle qui déchiffre les clés des outils.
  if (env.LEON_CONNECTORS_KEY) {
    const { startConnectorWorker } = await import('@/server/connectors/worker');
    await startConnectorWorker();
  } else {
    console.warn('[leon] LEON_CONNECTORS_KEY absente : les connecteurs ne tournent pas.');
  }
  // Une paire d'appli OAuth à moitié remplie désactive le bouton sans rien dire : on le dit.
  const { warnIncompleteOAuthPairs } = await import('@/server/connectors/oauth-env');
  warnIncompleteOAuthPairs();
}
