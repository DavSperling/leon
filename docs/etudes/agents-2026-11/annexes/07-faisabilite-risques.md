# Annexe 7 : faisabilité, risques, coûts et règles (version provisoire)

Relevé du 19 novembre 2026 par un agent Claude. Version intermédiaire, enregistrée avant complément. Légende : **[OFF]** officiel ; **[TIERS]** presse, analyse, cabinet ; **[DED]** déduit.

## Notes brutes déjà acquises

### Google
- `gmail.send` est « sensible », pas « restreint » ; `gmail.compose`, `gmail.readonly`, `gmail.modify`, `gmail.metadata`, `gmail.insert`, `gmail.settings.*`, `mail.google.com` sont « restreints » [TIERS] (https://developer.nylas.com/docs/provider-guides/google/google-verification-security-assessment-guide/, https://www.unipile.com/gmail-api-scopes-guide/). Pas de scope « brouillon seul » en niveau sensible [TIERS] (https://zenn.dev/alma65/articles/gmail-draft-only-scope?locale=en).
- Scopes restreints + données stockées ou transmises sur serveur : évaluation de sécurité exigée, à refaire tous les 12 mois [OFF] (https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).
- Google ne facture pas ; l'évaluateur fixe son prix. TAC Security : 675 à 5 400 $ (liste, nov. 2026) ; autres sources 540 à 4 500 $ ; chiffres de 15 000 à 75 000 $ peu étayés [TIERS] (https://deepstrike.io/blog/google-casa-security-assessment-2025, https://bright-softwares.com/blog/en/google-workspace/the-50000-gmail-add-on-myth-what-google-s-casa-certification-really-costs).
- Application « Internal » (un seul Workspace) : pas de vérification [OFF] (https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification, https://support.google.com/cloud/answer/13463817?hl=en). Mode test : 100 utilisateurs de test max [OFF] (https://developers.google.com/identity/protocols/oauth2/production-readiness/overview). Appli non vérifiée : plafond de 100 nouveaux utilisateurs [OFF] (https://support.google.com/cloud/answer/7454865?hl=en). Un admin Workspace peut marquer une appli « Trusted » [OFF] (même page overview).

### Slack
- 29 mai 2025 : nouvelles conditions d'API et limites. Applis commerciales hors Marketplace : `conversations.history` et `conversations.replies` à 1 requête/minute, 15 objets max. Applis internes et Marketplace non touchées. Installations existantes : 3 mars 2026 [OFF] (https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/).
- Section « Data usage » : pas d'entraînement de LLM sur les données d'API, pas d'export en masse [TIERS] (https://www.computerworld.com/article/4005509/salesforce-changes-slack-api-terms-to-block-bulk-data-access-for-llms.html).

### Sécurité
- « Triplet fatal » (Willison, juin 2025) : données privées + contenu non fiable + canal sortant [OFF auteur] (https://simonwillison.net/tags/lethal-trifecta/).
- EchoLeak, CVE-2025-32711, CVSS 9.3, juin 2025, Aim Security, zéro clic, exfiltration par URL d'image [TIERS] (https://www.hackthebox.com/blog/cve-2025-32711-echoleak-copilot-vulnerability).
- ShadowLeak (Radware, sept. 2025), AgentFlayer (Zenity, 6 août 2025) [TIERS] (https://www.securityweek.com/chatgpt-deep-research-targeted-in-server-side-data-theft-attack/, https://www.prnewswire.com/news-releases/zenity-labs-exposes-widespread-agentflayer-vulnerabilities-allowing-silent-hijacking-of-major-enterprise-ai-agents-circumventing-human-oversight-302523580.html).
- MCP : tool poisoning (Invariant Labs, avril 2025), GitHub MCP (mai 2025), postmark-mcp (sept. 2025), mcp-remote CVE-2025-6514 CVSS 9.6 [TIERS] (https://checkmarx.com/learn/mcp-security-risks-real-world-incidents-and-security-controls/).
- Navigateurs : Comet (Brave, août 2025), Atlas ; OpenAI, déc. 2025 : l'injection « unlikely to ever be fully solved » [TIERS] (https://www.technology.org/2025/12/23/ai-browsers-permanent-security-weakness-prompt-injection/).
- 2026 : Superhuman AI, Notion AI, Claude Cowork, IBM Bob (janv. 2026) ; CVE-2026-21520 Copilot/SharePoint et Agentforce (avril 2026) ; Reprompt CVE-2026-24307 [TIERS] (https://breached.company/the-lethal-trifecta-strikes-four-major-ai-agent-vulnerabilities-in-five-days/, https://www.darkreading.com/cloud-security/microsoft-salesforce-patch-ai-agent-data-leak-flaws).
- CaMeL : 77 % des tâches AgentDojo contre 84 % sans défense, ~2,8× jetons [OFF papier] (https://arxiv.org/abs/2503.18813). Six schémas de conception (arXiv 2506.08837).

### Fiabilité
- Anthropic « Building effective agents » : simplicité, étapes explicites, soin des outils [OFF] (https://www.anthropic.com/research/building-effective-agents). OpenAI : humain pour seuils d'échec et actions à haut risque [OFF] (https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf).
- CRMArena-Pro : ~58 % en un tour, ~35 % en plusieurs tours [OFF papier] (https://arxiv.org/abs/2505.18878). TheAgentCompany : 30,3 % [OFF papier] (https://arxiv.org/html/2412.14161v2). METR : ~12 h à 50 %, ~1,5 h à 80 % [TIERS] (https://metavert.io/metr-benchmarking).

### Prix (nov. 2026, $ par million de jetons, entrée/sortie)
- Anthropic [OFF, doc embarquée datée 3 nov. 2026, https://platform.claude.com/docs/en/about-claude/pricing] : Haiku 5.5 0,10/0,50 ; Sonnet 5.5 2/10 ; Opus 5.5 4/20 ; Fable 5.2 8/40. Lots -50 %. Cache : écriture 1,25×, lecture 0,025× à 0,1×.
- OpenAI, Google, Mistral, OpenRouter : sources tierces contradictoires, à compléter.

### Droit
- Omnibus numérique : règlement (UE) 2026/1744, JO 24 juil. 2026 ; annexe III reportée au 2 déc. 2027 ; article 50 applicable au 2 août 2026 [TIERS] (https://www.quantic-avocats.com/2026/07/22/ai-act-digital-omnibus-report-obligations-haut-risque/, https://www.aiacto.eu/en/blog/digital-omnibus-ai-act-report-2027).
- TJ Nanterre, 14 fév. 2025, RG 24/01457 : suspension d'un pilote d'IA faute de consultation du CSE [TIERS] (https://cms.law/fr/fra/legal-updates/quand-le-cse-stoppe-le-deploiement-de-l-ia).
