# Dossier pour le conseil d'administration : Leon

Vous ne voyez pas la conversation avec les fondateurs. Ce dossier doit se suffire à lui-même. Répondez en français.

## L'idée

# Leon (nom de travail ; alternative : Marcel)

- **Ce que c'est :** la mémoire de l'équipe, qui garde tout ce qui s'est dit et décidé dans les outils de l'entreprise (emails, réunions, Notion, Linear, GitHub, HubSpot) et dans les conversations des employés avec les IA (Claude Code, ChatGPT), et répond en citant la source exacte, via le LLM que l'équipe utilise déjà (connexion MCP) ou une petite interface de recherche.
- **Pour qui :** les équipes de 5 à 100 personnes, de tout type (développeurs, commerciaux, support, agences, cabinets), en France puis en Europe, qui mélangent plusieurs outils (Google Workspace ou Microsoft 365, plus Notion, Linear, GitHub, HubSpot, des appels) et dont au moins une partie utilise des assistants IA au quotidien.
- **Ce que ça vend, à quel prix :** un abonnement par siège, prix de départ envisagé 25 € HT par siège et par mois (fourchette à tester : 15 à 28 €). Le produit : (1) le brut de toutes les sources, stocké avec les droits d'accès d'origine et indexé par mots exacts et par sens ; (2) une couche légère d'étiquetage automatique (date, participants, entités, marqueurs « décision », « engagement », « plainte ») qui permet de répondre aux questions « combien », « où en est » et « qu'a-t-on promis » ; (3) les décisions prises dans les conversations IA remontées à l'équipe sans exposer les conversations elles-mêmes ; (4) un serveur MCP pour que Claude, ChatGPT ou Cursor lisent cette mémoire, et un chat web en complément.
- **Où et comment :** SaaS hébergé dans l'Union européenne (Supabase à Francfort), vendu en ligne et en direct par les fondateurs, installation par connexion OAuth aux outils plus une extension navigateur et un agent local pour capter les conversations IA. Les clients arrivent par le réseau des fondateurs, LinkedIn, les communautés de développeurs et le bouche-à-oreille.
- **Budget et contraintes :** deux cofondateurs (David, Amos), pas encore de société immatriculée, pas de levée de fonds, autofinancement ; coûts fixes actuels d'environ 500 $/mois ; coût de service estimé 2,5 $ par siège et par mois si la lecture passe par le LLM du client, 4 à 11 $ avec un chat maison ; un premier jet de code existe (TypeScript, Postgres, pipeline, extension, serveur MCP). Déjà décidé : la capture des conversations IA sans dépendre du LLM, les droits d'accès les plus restrictifs sur tout ce qui est dérivé, l'hébergement en UE.

## Le contexte que les fondateurs ont donné

- Date : 17 octobre 2026. Les fondateurs sont deux (David, Amos), en France. Pas de société encore, pas de levée.
- Ils ont déjà construit un premier jet (septembre-octobre 2026) qui résumait la mémoire en « faits » extraits par un LLM. Coût mesuré : environ 7,70 $ par personne et par mois, dont 95 % pour l'extraction. L'extraction perdait de l'information et un modèle économique inventait parfois des citations. D'où l'idée d'inverser : le brut comme source de vérité, une couche d'étiquetage légère au-dessus.
- Le différenciateur revendiqué : personne ne capte les conversations des employés avec les IA (Claude Code, ChatGPT). Leon les capte à la source (extension navigateur, agent local), sans que le LLM ait à « penser à enregistrer ». Le brut d'une conversation reste privé à son auteur ; seuls les éléments partageables (décisions, choix techniques et leurs raisons) remontent à l'équipe.
- Exemples de questions que le produit doit savoir traiter : « Qu'est-ce qui s'est dit pendant mon call de la semaine dernière avec Acme ? », « Pourquoi on a choisi Postgres pour le billing ? », « On a déjà eu cette erreur, comment on l'avait réglée ? », « Qu'a-t-on promis à ce client, et quand ? », « Combien de clients se sont plaints de l'export ce trimestre ? », « Ce que savait Marc avant son départ ».

## Ce que la recherche de marché du 17/10/2026 a établi (faits sourcés, pas des opinions)

- Glean : 300 M$ de revenu annuel récurrent (mai 2026), valorisé 7,2 Md$, contrat médian ~99 k$/an, minimum 50 à 100 sièges, pas d'offre libre-service. Inaccessible aux équipes de 5 à 100 personnes.
- La recherche multi-sources avec IA est déjà incluse pour environ 20 $ par siège chez Claude Team (Drive, Gmail, GitHub, Slack, Microsoft 365, avec citations), ChatGPT Business (60+ connecteurs), Microsoft 365 Copilot Business (21 $), Gemini Enterprise Business (21 $), Notion Business (20 $, recherche d'entreprise et notes de réunion incluses). Dropbox Dash vise les moins de 100 personnes à 15 $.
- Dashworks, le « Glean pour PME » soutenu par Y Combinator, a été racheté par HubSpot en avril 2025 et le produit fermé le 16 juillet 2025. Onyx (open source) a été racheté par Zoom, Sana par Workday (1,1 Md$), Moveworks par ServiceNow (2,85 Md$).
- En France, Dust (Paris) occupe le créneau PME/ETI des agents sur données internes : 3 000 organisations, série B de 40 M$ en mai 2026. Mistral Le Chat Team à 19,99 $. LightOn (souverain, coté) n'a que 1,9 M€ de revenu récurrent fin 2025.
- Les outils de notes de réunion répondent déjà à « qu'est-ce qui s'est dit pendant mon call » : Granola (valorisé 1,5 Md$, 14 $), Fireflies (10 à 19 $), Modjo en France (~99 €, commerciaux).
- Sentra.app (San Francisco, seed 5 M$ en janvier 2026) est le concurrent le plus proche sur la « mémoire organisationnelle » avec faits datés et remplacés.
- Slack interdit depuis le 29 mai 2025 aux applications d'IA de stocker une copie des messages ; il faut l'interroger en direct.
- Adoption de l'IA par les entreprises européennes en 2025 : 17 % des 10-49 salariés, 30 % des moyennes.
- Douleurs documentées : 61 % des développeurs passent plus de 30 min par jour à chercher des réponses (Stack Overflow 2024) ; Glean annonce 1,5 h gagnée par personne et par semaine chez ses clients ; 20 % du temps des agents de support part en recherche (Zendesk) ; 42 % du savoir d'un poste n'est pas partagé (Panopto).
- Techniquement, une recherche par similarité seule ne traite ni les filtres de date et de participant, ni les comptages, ni « l'état actuel » d'une décision ; il faut des métadonnées et une couche d'entités. C'est ce que fait la couche légère d'étiquetage. Volume pour 30 personnes sur 2 ans : environ 1,1 million de morceaux de texte, 8 à 12 Go, Postgres suffit.
- Contrainte juridique à vérifier : capter les conversations des salariés avec les IA est un dispositif de suivi de l'activité ; en France, information préalable des salariés et consultation du CSE à partir de 50 salariés.
- Références de marché SaaS PME : attrition de 3 à 5 % par mois, remboursement du coût d'acquisition visé sous 12 mois.
