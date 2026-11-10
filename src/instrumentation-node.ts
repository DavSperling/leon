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
  // Le point du matin (T13) : un appel au modèle par recalcul. Sans modèle, son worker démarre quand même et termine
  // chaque job sans rien faire (aucune reprise en boucle) : la route et l'outil MCP disent alors qu'aucun modèle
  // n'est réglé, et ne mettent rien en file. Avant la relève, comme l'indexation : l'indexation y signale les projets
  // touchés.
  const { getLlm } = await import('@/server/llm/get-llm');
  const llm = getLlm(env);
  if (!llm) {
    console.info('[leon] ANTHROPIC_API_KEY absente : les points du matin ne sont pas préparés.');
  }
  const { startBriefingWorker } = await import('@/server/briefing/worker');
  await startBriefingWorker({ llm });
  // Le résumé des sessions (T23) : comme le point du matin, sans modèle chaque job finit sans rien faire.
  const { startResumeWorker } = await import('@/server/sessions/resume-worker');
  await startResumeWorker({ llm });
  // Le rangement des sessions en fils (T40, T41) : par les clés de leurs faits, sinon par le vecteur de leur résumé avec
  // le fournisseur de l'indexation ; sans modèle.
  const { startThreadsWorker } = await import('@/server/sessions/threads');
  await startThreadsWorker({ embedder });
  // La liaison des sources aux fils (T42) : par leurs clés exactes, sinon par la proximité de leurs vecteurs.
  const { startThreadLinksWorker } = await import('@/server/sessions/thread-links');
  await startThreadLinksWorker({ embedder });
  // L'état des fils (T43) : par le modèle après un résumé nouveau ; sans modèle, la liste déterministe.
  // shortcut: démarré sans modèle, la liste déterministe seule : tant que `leon retirer-crochets` n'appelle pas la
  // route du retrait, une session retirée sur le poste seul garde l'usage `resume` ici. La PR 3b du lot 12 lui donne
  // `llm`, avec l'appel de la route et le rattrapage des retraits faits avant elle.
  const { startFilStateWorker } = await import('@/server/sessions/thread-state-worker');
  await startFilStateWorker({ llm: null });
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
