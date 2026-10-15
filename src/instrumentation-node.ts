// Chargé uniquement par instrumentation.ts dans le runtime Node : webpack ne
// l'embarque donc pas dans le bundle edge (pg, fs).
export async function startNodeInstrumentation() {
  // Valide l'environnement au démarrage plutôt qu'à la première requête.
  const { env } = await import('@/server/env');
  // Next exécute register() pendant `next build` : le worker ne doit jamais y démarrer.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  // La relève des connecteurs ne dépend pas du pipeline : sans clé Anthropic, les sources entrent
  // et leurs runs attendent. Elle a besoin de sa propre clé, celle qui déchiffre les clés des outils.
  if (env.LEON_CONNECTORS_KEY) {
    const { startConnectorWorker } = await import('@/server/connectors/worker');
    await startConnectorWorker();
  } else {
    console.warn('[leon] LEON_CONNECTORS_KEY absente : les connecteurs ne tournent pas.');
  }
  // Une paire d'appli OAuth à moitié remplie désactive le bouton sans rien dire : on le dit.
  const { warnIncompleteOAuthPairs } = await import('@/server/connectors/oauth-env');
  warnIncompleteOAuthPairs();
  if (!env.ANTHROPIC_API_KEY) {
    console.warn('[leon] ANTHROPIC_API_KEY absente : le pipeline ne tourne pas.');
    return;
  }
  const [{ createAnthropicLlm }, { startPipelineWorker }] = await Promise.all([
    import('@/server/llm/anthropic-llm'),
    import('@/server/pipeline/worker'),
  ]);
  await startPipelineWorker(createAnthropicLlm({ apiKey: env.ANTHROPIC_API_KEY }));
}
