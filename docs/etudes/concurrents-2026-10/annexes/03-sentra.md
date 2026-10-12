# Annexe 3 : Sentra (sentra.app)

Rapport de recherche, relevé le 12 octobre 2026 par un agent Claude. Éditeur : Dynamis Labs Inc., San Francisco. Légende : **[OFF]** vérifié sur une page officielle sentra.app ou le GitHub Dynamis-Labs ; **[TIERS]** presse, investisseurs, annuaires ; **[DED]** déduction de l'agent.

Attention : sentra.io (sécurité des données cloud) est une autre société. Les fiches G2 et Gartner « Sentra » et le domaine trust.sentra.io lui appartiennent.

## 1. Produit

En une phrase : « the managed organization memory », un graphe de faits horodatés, partagé par les humains et les agents IA, qui ingère Slack, e-mail, réunions, docs, code et CRM et les sert via REST et MCP [OFF] (https://www.sentra.app/).

En détail : graphe bi-temporel (quand un fait devient vrai / cesse de l'être), résolution « au moment de l'écriture » (entités liées, contradictions signalées, faits obsolètes marqués « superseded » plutôt que supprimés), provenance par nœud [OFF] (https://www.sentra.app/articles/knowledge-graphs-vs-memory-layers, https://www.sentra.app/articles/best-ai-agent-memory-tools). Fonctions produit listées : notes de réunion IA, briefs pré-réunion, « Risk Radar », « Commitment tracker », « Connection Intelligence », rapports, workflows automatisés [OFF] (https://www.sentra.app/pricing). Étude de cas Lenskart : 19 Md de tokens compilés, +1,5 Md/semaine, ~4 M de « fact chunks », 757 000 entités, 11 000 requêtes/semaine, travail bloqué -58 % en 4 semaines, mise en prod en 8 jours [OFF, chiffres auto-déclarés] (https://www.sentra.app/, https://nanothoughts.substack.com/p/making-people-more-productive-doesnt).

## 2. Capture de la donnée

- Connecteurs : « 150+ » sur la page intégrations, « 200+ » ailleurs sur le site [OFF] (https://www.sentra.app/integrations). Plan Team limité à Slack, Gmail, Calendar, Outlook, GitHub, Linear [OFF] (pricing). Composio est listé comme intégration « wire any tool quickly » [OFF] et cité dans un article tiers sur un déploiement [TIERS] (https://julfedorin.substack.com/p/this-ai-is-the-brain-of-a-12b-company-373) ; le « 200+ » repose probablement en partie sur un agrégateur [DED].
- Mécanisme : autorisation admin des sources, ingestion côté serveur en continu [OFF] (https://www.sentra.app/). Ingestion proactive : « The moment a fact enters through Slack, email, or a doc, Sentra parses it… and writes it into the graph » [OFF] (https://www.sentra.app/articles/sentra-vs-glean). Donc Sentra n'attend pas un tool call pour les sources SaaS, même thèse que Leon.
- Réunions : « Unlimited bot and desktop meeting recording » [OFF] (pricing). App desktop macOS ARM64 uniquement, v0.3.0 du 21/09/2026, notes de version vides [OFF] (https://github.com/Dynamis-Labs/sentra-desktop-releases).
- Conversations LLM des employés : le site et a16z parlent de capture d'« agent traces » [OFF/TIERS] (https://speedrun.a16z.com/companies/sentra), mais Claude, ChatGPT, Cursor, Codex, Windsurf sont listés uniquement comme destinations (« Reason over context »), jamais comme sources [OFF] (integrations). L'écriture par un agent passe par REST/MCP (« every agent and every person reads and writes ») et par des hooks commit/PR pour le code [OFF] (https://www.sentra.app/articles/give-coding-agents-codebase-memory). [DED] : les conversations ChatGPT/Claude d'un employé ne sont pas captées passivement ; elles n'entrent en mémoire que si l'agent appelle l'outil d'écriture, exactement la faiblesse que Leon contourne. Aucune extension navigateur trouvée.

## 3. Restitution

REST (« Brain API »), MCP HTTP (`claude mcp add --transport http sentra https://api.sentra.app/mcp/`) dans Cursor, Claude Code, Copilot, ChatGPT [OFF]. Chat IA, briefs proactifs, rapports, Slack [OFF] (pricing). Contradiction interne : « Sentra is not a chat app you open and talk to » [OFF] (https://www.sentra.app/articles/sentra-vs-coworker). Noms des outils MCP : non trouvés (docs.sentra.app n'existe pas, sentra.app/docs = 404). Accès API réservé au plan Enterprise [OFF] (pricing).

## 4. Droits d'accès

« Sentra inherits the access controls of every source it connects to… checked on every query » ; « Full transcripts and source material stay with the people who created them. Everyone else sees processed insights and summaries » [OFF] (https://www.sentra.app/trust). Permissions granulaires, audit logs, rétention : Enterprise seulement [OFF] (pricing). [DED] : héritage source + filtrage à la requête, pas de fiches avec droits propres comme Leon ; le modèle « résumés pour les autres » est un vrai choix de design à étudier.

## 5. Cible

Plan Team 2–20 utilisateurs en self-service, Enterprise 20+ [OFF] (pricing). Mais le CEO : « push comes to shove, you need to sell into the enterprise… that's where the real money is » ; ~12 design partners [TIERS] (https://prevetted.fm/episodes/161-ashwin-gopinath/). Clients cités : Lenskart (~20 000 salariés), Happy Scribe, Google Cloud [OFF] ; PoC payant avec une filiale US de SoftBank [TIERS] (https://siliconangle.com/2026/01/28/sentra-app-raises-5m-build-ai-teammate-organize-enterprise-memory/). Géographie : US ; politique de confidentialité « intended for visitors located within the United States » [OFF] (https://www.sentra.app/privacy). Aucune présence France/UE trouvée.

## 6. Prix

Team : 16 $/utilisateur/mois, « Launch Special : Free » (durée non précisée), 2 000 « Action Credits »/utilisateur/mois (non définis) ; Enterprise : sur devis [OFF] (https://www.sentra.app/pricing). Leurs propres articles disent encore « Pricing model: Not published » [OFF] ; grille récente et instable [DED].

## 7. Hébergement et conformité

Hébergé aux États-Unis, sous-traitants AWS, GCP, GitHub, Slack, OpenAI [OFF] (privacy). SOC 2 Type II et ISO 27001 affirmés sur le site, rapport non consultable [OFF, non vérifié indépendamment]. Options cloud / VPC isolé / on-prem air-gapped [OFF] (trust). Pas de région UE, pas de DPA, RGPD mentionné seulement via un opt-out tiers [OFF]. Pas d'entraînement sur les données clients [OFF].

## 8. Traction

Créée en 2025, SF, entité Dynamis Labs Inc. ; seed 5 M$ le 28/01/2026 co-mené par a16z speedrun (cohorte 006) et Together Fund, avec Parable, Precursor, Inovia, Backwards, Antigravity ; anges Gokul Rajaram, Siqi Chen [TIERS] (https://pulse2.com/sentra-5-million-seed-funding/, https://tracxn.com/d/companies/sentra/__QBxX4Fi8um0Y8oo5HowFC8d8JZrX6hLzPqNpwVnQmK0). Effectifs : 12 (a16z) à 18 (LinkedIn, 2 644 abonnés) [TIERS]. Fondateurs : Ashwin Gopinath (CEO selon a16z/Antigravity/Tracxn ; ex-MIT, co-auteur Reflexion), Andrey Starenky (CTO), Al Rey (CRO), Jae Gwan Park (présenté CEO dans la presse de janvier, incohérence non résolue) [TIERS]. GitHub : 6 dépôts, SpectralQuant 203 étoiles (recherche KV-cache, pas le produit) [OFF].

## 9. Faiblesses

- Zéro avis utilisateur : 0 résultat sur HN (API Algolia), rien sur Reddit/Product Hunt ; les fiches G2/Gartner « Sentra » concernent sentra.io [vérifié].
- Données US, pas d'UE, pas de DPA : bloquant pour une PME française [DED].
- Capture des conversations LLM dépendante d'un tool call ou de hooks ; pas d'extension, desktop macOS seulement.
- Team plan : 6 connecteurs, pas d'API, pas de permissions fines ni d'audit.
- « Action Credits » opaques ; prix contradictoire entre pages.
- Marketing SEO massif (dizaines d'articles « Sentra vs X ») vs produit jeune ; le CEO admet « people don't know exactly what memory is » [TIERS].
- OpenAI en sous-traitant : les données transitent chez un tiers US [OFF].

## 10. Implications pour Leon

Concurrence frontale : même thèse (ingestion proactive côté serveur, graphe de faits, lecture via MCP dans Claude/Cursor/ChatGPT), même point d'entrée tarifaire (16 $ vs ~25 €), même tranche 2–20 sièges en self-service. Sentra a 5 M$, un cas Lenskart et un storytelling « write-time resolution » très abouti ; Leon doit avoir une réponse crédible sur la résolution des contradictions et le versionnage des faits.

Différenciation réelle pour Leon : (1) capture des conversations LLM des employés sans dépendre d'un tool call, Sentra ne le fait pas, c'est le vide le plus net ; (2) hébergement UE, DPA, RGPD natif, contrat en français ; (3) tout inclus dès le premier siège (API, droits fins, audit) là où Sentra les réserve à l'Enterprise ; (4) fiches lisibles par un humain avec droits propres plutôt qu'un graphe filtré à la requête ; (5) Windows/multi-plateforme si un agent local est prévu. Risque : si Sentra ouvre une région UE et une extension de capture, l'écart se réduit à la proximité commerciale et au prix.
