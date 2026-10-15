// Chargé uniquement par instrumentation.ts dans le runtime Node : webpack ne
// l'embarque donc pas dans le bundle edge (pg, fs).
export async function startNodeInstrumentation() {
  // Valide l'environnement au démarrage plutôt qu'à la première requête.
  const { env } = await import('@/server/env');
  // Next exécute register() pendant `next build` : le worker ne doit jamais y démarrer.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const [
    { recordStartCommit, recordStartLlm },
    { createConfiguredLlm, describeLlmConfig, missingLlmKeys },
  ] = await Promise.all([import('@/server/version'), import('@/server/llm/config')]);
  recordStartCommit();
  const llmConfig = describeLlmConfig(env);
  recordStartLlm(llmConfig);
  // Le pipeline ne tourne que si chaque fournisseur configuré a sa clé : on dit lesquelles manquent,
  // jamais leurs valeurs.
  const missing = missingLlmKeys(env);
  if (missing.length > 0) {
    console.warn(`[leon] ${missing.join(', ')} absente(s) : le pipeline ne tourne pas.`);
    return;
  }
  console.info('[leon]', 'llm.config', JSON.stringify(llmConfig));
  const { startPipelineWorker } = await import('@/server/pipeline/worker');
  await startPipelineWorker(createConfiguredLlm(env));
}
