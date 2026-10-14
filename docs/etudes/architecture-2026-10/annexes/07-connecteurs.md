# Connecteurs « outils métier » : lesquels, dans quel ordre

Recherche du 12 octobre 2026. Périmètre : Leon, mémoire d'entreprise pour équipes de 5 à 100 personnes.

## Méthode et constat général

Neuf concurrents ou annuaires ont été relevés : Glean (105 connecteurs sur la doc, « 275+ » en marketing), Sentra (~200, par catégories), Dust (85), Notion AI (10), Slack Enterprise Search (13), Microsoft 365 Copilot (galerie Microsoft), ChatGPT, annuaire Claude, memory.store (Slack, Gmail, Granola, Fathom, Linear, Cursor, Codex). Côté annuaires : Zapier (« Popular apps »), Composio (tri popularité), Nango (« Popular »), classements de serveurs MCP.

Le noyau est le même partout : **Google Workspace, Slack, GitHub, Notion, Linear/Jira, Microsoft 365**. OpenAI a branché en premier GitHub (deep research, mai 2025) puis Google Drive, Box, SharePoint, OneDrive, Dropbox le 4 juin 2025, avec Gmail, Outlook, Teams, Linear en bêta. Zapier classe dans l'ordre Google Sheets, Gmail, Slack, Google Calendar, Google Drive, HubSpot, puis Notion. Composio trie Gmail, Google Calendar, Google Drive, Outlook en tête. Les classements MCP convergent sur GitHub (« le plus installé, de loin »), puis Linear, Notion, Jira, Slack.

Paradoxe central : les sources les plus riches en décisions et engagements (Slack, Teams, email, réunions) sont précisément les plus verrouillées.

## 1. Les 20 connecteurs les plus fréquents

Nombre sur 9 concurrents (comptage manuel à partir des pages citées). « Mis en avant » = présent dans la section populaire de Glean, le top Zapier/Composio ou la première vague ChatGPT. Richesse : D = décisions, E = engagements, F = faits.

| # | Connecteur | /9 | Mis en avant | Difficulté d'accès API | Richesse mémoire |
|---|---|---|---|---|---|
| 1 | Gmail | 9 | Oui (Zapier 2, Composio 1) | OAuth + **CASA Tier 2** (scope restreint, 540–4 500 $/an, 4–8 sem.) | E+++ F++ |
| 2 | Google Drive | 8 | Oui (ChatGPT 1re vague) | OAuth + CASA (`drive.readonly` restreint) | D++ F+++ |
| 3 | Slack | 8 | Oui (Zapier 3) | **Marketplace obligatoire** ; hors Marketplace `conversations.history` bridé à 1 req/min, 15 messages ; politique « zéro copie », pas d'export en masse | D+++ E+++ |
| 4 | GitHub | 8 | Oui (MCP 1, ChatGPT 1er) | GitHub App, aucune revue | D++ F++ |
| 5 | Linear | 8 | MCP, Notion AI | OAuth public immédiat, GraphQL + webhooks | D+ E++ F+++ |
| 6 | SharePoint/OneDrive | 8 | ChatGPT 1re vague | Graph + consentement admin, vérification éditeur (MPN) | F+++ |
| 7 | Microsoft Teams | 8 | Notion AI | **API protégées** : formulaire d'approbation Microsoft | D+++ E+++ |
| 8 | Outlook | 8 | Composio 4 | Graph + consentement admin | E+++ |
| 9 | Notion | 7 | Oui (Zapier 9, Composio 9) | OAuth public, revue seulement pour la galerie ; 3 req/s | D++ F+++ |
| 10 | Jira | 7 | Glean, MCP | OAuth 3LO, toggle partage + politique de confidentialité | F+++ E+ |
| 11 | Asana | 7 | Glean, Claude | OAuth simple | E++ F++ |
| 12 | Confluence | 6 | Glean | Même app 3LO que Jira | F+++ D+ |
| 13 | HubSpot | 6 | Oui (Zapier 6) | OAuth public, pas de revue hors Marketplace ; 110 req/10 s/compte | E+++ F++ |
| 14 | Google Calendar | 6 | Composio 2, Zapier 4 | Scope sensible (vérification, pas CASA) | E++ |
| 15 | Box / Dropbox | 6 | ChatGPT 1re vague | OAuth simple | F++ |
| 16 | Salesforce | 5 | Glean | Connected App, OAuth ; grand compte | E++ F++ |
| 17 | Zendesk | 5 | Glean | Client OAuth global = soumission Marketplace | F++ |
| 18 | Réunions (Gong, Zoom, Granola, Fathom) | 5 | memory.store, Dust | Hétérogène ; Granola sans API publique vérifiée | D+++ E+++ |
| 19 | GitLab | 4 | — | OAuth simple | D+ F++ |
| 20 | Intercom | 4 | Dust, Sentra | Revue obligatoire même non listé (vidéo, 7 j) | F++ E+ |

Hors tableau mais pertinents pour la cible : Pipedrive, Attio, folk (Sentra, Dust, Nango seulement) ; Discord (Sentra seul) ; ClickUp, monday, Trello (4/9).

## 2. Les 3 outils indispensables par équipe

- **Dev** : GitHub, Linear (Jira au-delà de ~50 personnes ou hors startup), Notion/Confluence. Le stack « Linear + Notion » domine les jeunes équipes techniques.
- **Commerciale** : Gmail/Outlook, HubSpot (Pipedrive en second, Attio/folk chez les très jeunes), Google Calendar + transcriptions de réunions.
- **Support** : Intercom (tête du classement Cledara par achats réels), Zendesk, Slack/Teams (canaux d'escalade).
- **Direction/ops** : Google Drive ou SharePoint, Notion, email + calendrier ; en PME, Google Workspace l'emporte (50 % des domaines, concentré sur les 0–9 salariés), Microsoft 365 en entreprise (58 %).

## 3. Ordre de construction recommandé

1. **Notion** : hub de docs des startups, OAuth sans revue, décisions et specs. Livrable en jours.
2. **Linear** : OAuth immédiat, webhooks, données structurées ; premier connecteur « vivant » (statuts, assignations, engagements).
3. **GitHub** : GitHub App sans revue ; discussions de PR = décisions techniques. Avec 1 et 2, l'équipe dev est couverte sans aucune procédure externe.
4. **Google Workspace (Gmail + Drive + Calendar)** : la source la plus riche en engagements et la plus répandue en PME. **Lancer le dossier CASA dès le jour 1** (4–8 semaines) pendant que 1–3 se construisent ; un seul audit couvre les trois scopes.
5. **HubSpot** : OAuth public sans revue, CRM dominant en PME, forte densité d'engagements. Ouvre l'équipe commerciale.

Deuxième vague : Microsoft 365 (Outlook, SharePoint, puis Teams après approbation des API protégées), Jira/Confluence (une app 3LO), Intercom/Zendesk, transcriptions (Fathom, Gong).

**À éviter au début** :
- **Slack** : conditions d'octobre 2025. Sans Marketplace, l'historique est inexploitable (15 messages/min) ; avec, interdiction de « copies persistantes, index ou stockages longue durée » pour les apps de recherche, et « zéro copie » pour les apps IA. Deux contournements à valider juridiquement : app interne créée par le client dans son propre workspace (hors « distribution commerciale »), ou import de l'export standard Slack (ZIP, canaux publics, tous plans).
- **Teams messages** : approbation Microsoft à délai inconnu ; faire Outlook/SharePoint d'abord.
- **Salesforce, Discord, Pipedrive/Attio/folk** : hors cible ou longue traîne, à couvrir plus tard via agrégateur.

## 4. Agrégateur ou connecteurs maison ?

| | Coût | Licence | Limites |
|---|---|---|---|
| Nango | 0,29 $/connexion/mois + compute ; plans 50–450 $ | Elastic License 2.0, auto-hébergeable (fonctions réduites) | Code-first : la logique de sync reste à écrire |
| Composio | gratuit jusqu'à 100 k appels ; Pro 29 $/mois | SDK MIT, runtime fermé | Orienté actions d'agent, pas ingestion en masse |
| Merge | 3 comptes gratuits, puis 650 $/mois pour 10, 65 $/compte | Propriétaire | Prohibitif pour des clients à 5 personnes |
| Paragon | 500–3 000 $/mois, sur devis | Propriétaire | Même problème |

**Recommandation : coder les cinq premiers soi-même.** Ce sont des syncs en lecture seule où la valeur est dans la normalisation vers la mémoire (qui a décidé quoi, quand), pas dans la plomberie OAuth. Nango auto-hébergé peut servir de couche OAuth/refresh si l'on veut gagner du temps, et sera utile pour la longue traîne (Pipedrive, Attio, folk, Freshdesk, monday).

**CASA reste obligatoire** quel que soit l'agrégateur : l'app OAuth Google est la vôtre. Seule exception : passer par un fournisseur qui prête son app déjà certifiée (Nylas, Truto l'affichent), au prix d'un intermédiaire dans le flux de données et d'un écran de consentement à son nom.

## 5. Non vérifié

- Pages `claude.ai/directory` et `help.openai.com` inaccessibles (403) : la liste « featured » Claude (Google Drive, Notion, Slack, Jira, Asana, Linear) et le détail des connecteurs ChatGPT viennent de sources secondaires.
- Qontext : la page d'accueil liste des clients IA (ChatGPT, n8n, Cursor, Decagon), pas ses 10 sources ; le résultat de recherche citant « GitHub, Drive, Gmail, Slack, Notion, Linear, Vercel, Monday » provient d'un dépôt GitHub sans rapport.
- Glean : « 275+ » marketing contre 105 sur la doc ; la section « populaire » est alphabétique, non classée.
- Comptage « /9 » : compilation manuelle, marge d'erreur d'un point sur Jira, Confluence, Salesforce, Zendesk.
- Légalité du contournement « app Slack interne créée par le client » et viabilité de l'API Granola.
- Parts de marché PME : chiffres de fournisseurs (Cledara, blogs), pas d'étude indépendante.

## Sources

- Glean : https://docs.glean.com/connectors/ ; https://www.glean.com/
- Sentra : https://www.sentra.app/integrations
- Dust : https://dust.tt/integrations ; https://docs.dust.tt/docs/user-documentation/getting-started/faq/general-questions/what-data-sources-can-be-connected-to-dust
- Notion AI : https://www.notion.com/help/notion-ai-connectors
- Slack ES : https://www.eesel.ai/blog/slack-ai-search-integrations ; https://insearch.ai/slack-enterprise-search
- Microsoft : https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/connectors-gallery-microsoft ; https://learn.microsoft.com/en-us/microsoftteams/export-teams-content
- ChatGPT : https://techcrunch.com/2025/06/04/chatgpt-introduces-meeting-recording-and-connectors-for-google-drive-box-and-more ; https://justinmckelvey.com/blog/chatgpt-connectors
- Claude : https://www.claudeai.directory/connectors ; https://www.igeeksblog.com/best-claude-connectors/
- memory.store : https://memory.store ; https://www.ycombinator.com/companies/memory-store
- Qontext : https://qontext.ai
- Zapier : https://zapier.com/apps ; Composio : https://composio.dev/toolkits ; Nango : https://www.nango.dev/api-integrations?category=Popular
- MCP : https://awesome-mcp.tools/blog/top-mcp-servers-2026 ; https://codersera.com/blog/best-mcp-servers-claude-code-cursor-2026/
- Slack API : https://slack.com/terms-of-service/api ; https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/ ; https://docs.slack.dev/slack-marketplace/slack-marketplace-app-guidelines-and-requirements/ ; https://www.computerworld.com/article/4005509/salesforce-changes-slack-api-terms-to-block-bulk-data-access-for-llms.html
- Google CASA : https://www.agenticfabriq.com/blog/google-oauth-verification-casa ; https://deepstrike.io/blog/google-casa-security-assessment-2025 ; https://developers.google.com/workspace/drive/api/guides/api-specific-auth ; https://truto.one/google/
- HubSpot : https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines ; https://developers.hubspot.com/docs/apps/developer-platform/list-apps/apply-for-certification/certification-requirements
- Atlassian : https://developer.atlassian.com/cloud/oauth/getting-started/managing-oauth-apps/ ; Intercom : https://developers.intercom.com/docs/publish-to-the-app-store/review-publish-your-app ; Zendesk : https://developer.zendesk.com/documentation/marketplace/
- Agrégateurs : https://workos.com/blog/pipes-vs-nango-composio-arcade-paragon-and-merge ; https://nango.dev/blog/composio-vs-nango/ ; https://github.com/nangohq/nango ; https://getknit.dev/blog/understanding-merge-dev-pricing-finding-the-right-unified-api-for-your-integration-needs/
- Parts de marché : https://data.cledara.com/compare/google-workspace-vs-microsoft-365 ; https://data.cledara.com/market-share/category/customer-success-and-support ; https://valueaddvc.com/blog/best-project-management-tools-for-startups-in-2026-asana-monday-clickup-linear-compared ; https://www.sybill.ai/blogs/salesforce-vs-hubspot-vs-pipedrive
