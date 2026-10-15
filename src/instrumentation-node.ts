// Chargé uniquement par instrumentation.ts dans le runtime Node : webpack ne
// l'embarque donc pas dans le bundle edge (pg, fs).
export async function startNodeInstrumentation() {
  // Valide l'environnement au démarrage plutôt qu'à la première requête.
  const { env } = await import('@/server/env');
  // Next exécute register() pendant `next build` : le worker ne doit jamais y démarrer.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const [{ recordStartCommit, recordStartLlm }, { llmConfigProblems, startConfiguredLlm }] =
    await Promise.all([import('@/server/version'), import('@/server/llm/config')]);
  recordStartCommit();
  // Le pipeline ne tourne que si la configuration des modèles le permet : on dit pourquoi, jamais la
  // valeur d'une clé. Il ne tourne pas : /api/version rend alors llm: null, et le jeu d'essai refuse
  // de charger un passage.
  const problems = llmConfigProblems(env);
  if (problems.length > 0) {
    console.warn(`[leon] ${problems.join(' ; ')} : le pipeline ne tourne pas.`);
    return;
  }
  let started: Awaited<ReturnType<typeof startConfiguredLlm>>;
  try {
    started = await startConfiguredLlm(env);
  } catch (error) {
    // Message construit par config.ts : noms de variables et identifiants de modèles seulement.
    console.warn(`[leon] ${(error as Error).message} Le pipeline ne tourne pas.`);
    return;
  }
  recordStartLlm(started.description);
  console.info('[leon]', 'llm.config', JSON.stringify(started.description));
  const { startPipelineWorker } = await import('@/server/pipeline/worker');
  await startPipelineWorker(started.llm);
}
