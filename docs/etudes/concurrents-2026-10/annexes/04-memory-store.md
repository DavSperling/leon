# Annexe 4 : memory.store (Memory Store)

Rapport de recherche, relevé le 12 octobre 2026 par un agent Claude. Éditeur : Autotelic Inc., San Francisco, YC Spring 2026. Légende : **[OFF]** vérifié sur une page officielle (memory.store, YC, GitHub de l'éditeur) ; **[TIERS]** source tierce ; **[DÉD]** déduction de l'agent.

Sans rapport avec Google Cloud Memorystore (Redis managé) ni avec le « Memory Store » d'Azure AI Foundry.

## 1. Produit

En une phrase : un « company brain » partagé, serveur MCP, qui agrège les échanges d'une équipe (Slack, Gmail, réunions) et les sert à ses membres et à leurs agents IA. [OFF] Hero : « One shared memory for your teammates, and agents » ; « Turn insights from Gmail, Slack, Granola, Claude, and Codex into memories for your team and agents » (https://memory.store/). Trois étapes affichées : « Sync from every tool » (Fathom, Slack, Granola « all flow in, automatically »), « Organize automatically » (regroupement par projet, personne, décision), « Access anywhere ». Fonction phare : « Briefs », docs vivants qui se mettent à jour quand de nouvelles mémoires arrivent (journal de décisions, statuts d'équipe, demandes clients) (https://www.ycombinator.com/launches/QPs-memory-store-your-company-s-brain). Le fondateur résume sur HN : « an MCP server that ingests context from your workplace tools (Slack, email, calendar) and makes it available to any MCP-compatible agent » (https://news.ycombinator.com/item?id=46941107).

## 2. Capture de la donnée

- Connecteurs « sources » (pull serveur via OAuth, [OFF] page d'accueil + privacy) : Slack, Gmail, Granola, Fathom, « Codex » (changements de code). La page tarifs promet « Unlimited Gmail & Slack sync » (https://memory.store/pricing). Le post HN cite aussi le calendrier. Pas de CRM, pas de Drive/Notion listés : non trouvé.
- Conversations LLM des employés : NON capturées de façon proactive. [OFF] Le MCP (https://memory.store/mcp) expose 4 outils : checkin (chargé automatiquement en début de conversation), record, recall, report_issue (https://memory.store/guides/memory-store-user-guide). Les gabarits de prompts disent au modèle « Record important information proactively, not just when asked » (https://memory.store/guides/memory-store-prompt-templates) : l'écriture dépend donc d'un appel d'outil décidé par le LLM, ou d'une demande explicite de l'utilisateur (« Sync this conversation to my memory store »). La politique de confidentialité le confirme : « Memory is stored when you, a connected client, or an agent acting under your instruction sends content to Memory Store » (https://memory.store/privacy). Pas d'extension navigateur ni d'agent local : non trouvé.
- Exception pour Claude Code : un plugin à hooks (SessionStart, PreToolUse, SessionEnd + file d'attente .memory-queue.jsonl) capturait automatiquement les sessions, mais le dépôt est archivé depuis le 27/12/2025, 9 étoiles (https://github.com/julep-ai/memory-store-plugin). [DÉD] Ils ont testé la capture proactive côté code puis l'ont abandonnée ou internalisée.

## 3. Restitution

[OFF] MCP (HTTPS/SSE) dans Claude web/desktop/Code, ChatGPT (Pro/Plus/Business uniquement, pas Teams), Cursor, Windsurf, Raycast, OpenCode, Linear, Codex, Claude Cowork, OpenClaw ; checkin injecte automatiquement les « active threads » en début de session ; recall = recherche sémantique ; Briefs = pages lisibles par les humains (https://memory.store/guides/memory-store-for-claude-and-chatgpt, https://memory.store/guides/memory-store-for-cursor). API publique : non trouvé (le profil API Evangelist n'a rien d'indexé : https://github.com/api-evangelist/memory-store).

## 4. Droits d'accès

[OFF] Page tarifs : « Team workspaces with role-based access », « Memory search across everyone's work » ; guide utilisateur : « Manage team access and sharing settings ». Aucune description des rôles, aucune mention d'héritage des permissions Slack/Gmail (canaux privés, boîtes mail individuelles). Produit individuel ET équipe (« Works for individuals and teams »). [DÉD] Granularité probablement grossière (workspace + rôles) ; le risque de fuite d'un mail perso vers « everyone's work » n'est pas adressé publiquement.

## 5. Cible

[OFF] Équipes de startups/early adopters IA, très orienté fondateurs et développeurs (Cursor, Claude Code, Codex). Géographie : San Francisco, États-Unis (https://www.ycombinator.com/companies/memory-store). [TIERS] YC Tier List juge le positionnement flou (« team's agents », dev ou non-tech ?) (https://yctierlist.com/s26/memory-store/).

## 6. Prix

[OFF] Plan « Teams » : 150 $ / utilisateur / mois, « Full refund in the first 30 days », support Slack partagé, onboarding ; à venir en tarification à l'usage : « /fast mode » (2,5-3x plus rapide) et « Reflect » (deep research multi-agents) (https://memory.store/pricing). Pas de plan gratuit ni individuel affiché. [TIERS] Un rapport externe citait 120 $/mois (https://fluenta.space/resources/reports/yc-spring-2026-batch-scored), probablement périmé. Les CGU précisent « non-refundable except… stated otherwise in writing » (https://memory.store/terms).

## 7. Hébergement et conformité

[OFF] « may process data in the United States and other countries » ; TLS, contrôles d'accès, sauvegardes 30 jours ; pas d'entraînement de modèles sur les données ; exclu pour PCI/données de santé. Aucune mention RGPD, UE, SOC 2, ISO (https://memory.store/privacy, mise à jour 08/06/2026). Droit du Delaware. La page /security renvoie une 404. Pas open source (l'org GitHub ne contient que des forks Terraform et un benchmark, https://github.com/memorystore/).

## 8. Traction

[OFF] Fondée en 2025, YC Spring 2026 (« P26 »), 4 personnes, SF. Fondateurs : Diwank Singh Tomer (CEO, Thiel Fellow, ex-Julep, 7K étoiles) et Ishita Jindal (CPO, ex-Jar, Lenskart, IBM). Financement : deal YC standard (500 k$) [DÉD], aucune levée annoncée. Utilisateurs/clients : non trouvé ; en bêta en février 2026 (HN) ; 35 entretiens + 90 sondés avant le code. [TIERS] Classé « Tier C » par YC Tier List (pas de démo, pas de clients nommés).

## 9. Faiblesses

- Écriture dépendante du LLM (point faible exact que Leon attaque). [OFF]
- Peu de connecteurs (5) ; pas de CRM, docs, Drive. [OFF]
- Prix élevé (150 $/siège) pour une PME. [OFF]
- Données aux États-Unis, zéro discours RGPD/SOC 2. [OFF]
- Permissions opaques. [OFF/DÉD]
- Produit jeune : docs 404, plugin archivé, aucun avis utilisateur trouvé sur Reddit/Product Hunt/G2. [TIERS] « most crowded thesis in AI infra » (mem0, Zep, Letta, Cognee) selon Fluenta.

## 10. Implications pour Leon

Concurrence frontale : même thèse (« une mémoire partagée pour humains et agents »), même restitution par MCP, même angle Slack/Gmail/réunions, même fonction « pages organisées » (Briefs ≈ fiches Leon). Si Memory Store ouvre l'Europe, c'est le concurrent le plus proche conceptuellement.

Différenciation claire pour Leon : (a) capture proactive des conversations LLM (Claude, ChatGPT, Gemini, Cursor, Claude Code) sans attendre un appel d'outil, là où Memory Store repose sur « record » appelé par le modèle ; (b) permissions héritées de la source et fiches à droits fins, point que Memory Store ne documente pas ; (c) hébergement UE + RGPD, absents chez eux ; (d) prix ~25 € vs 150 $ ; (e) cible PME non-tech françaises vs startups SF orientées devs. À surveiller : leurs Briefs auto-actualisés et le checkin automatique en début de session, deux idées d'UX à égaler.
