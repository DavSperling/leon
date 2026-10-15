// Chargé uniquement par instrumentation.ts dans le runtime Node : webpack ne
// l'embarque donc pas dans le bundle edge (pg, fs).
export async function startNodeInstrumentation() {
  // Valide l'environnement au démarrage plutôt qu'à la première requête.
  const { env } = await import('@/server/env');
  // Next exécute register() pendant `next build` : le worker ne doit jamais y démarrer.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { recordStartCommit } = await import('@/server/version');
  recordStartCommit();
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
