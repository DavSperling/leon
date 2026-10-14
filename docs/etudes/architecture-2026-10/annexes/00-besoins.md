# Leon : cahier des besoins (12 octobre 2026)

Validé avec David. Sert de base à la recherche technique : la technique découle des besoins, pas l'inverse.

## Le produit
Une mémoire unifiée d'entreprise. Leon va chercher lui-même la donnée (conversations LLM des employés, outils métier, plus tard mails et réunions), la trie, l'organise en fiches avec des droits d'accès, et la rend lisible par n'importe quel LLM via MCP et par les humains dans une interface. Le LLM n'a jamais à penser à écrire dans la mémoire : c'est Leon qui écrit. En lecture, un appel MCP classique convient.

## Qui
Équipes de 5 à 100 personnes, de tout type (dev, commerciaux, support, direction), tout secteur. Public mixte : l'interface doit être **dev-friendly** (arborescence, Markdown brut visible, CLI, API, raccourcis clavier) **et** lisible par un non-dev, au même niveau.

## Ce que Leon capte, dans l'ordre
1. **Conversations LLM**, les deux dès le début :
   - outils de code : Claude Code (`~/.claude/projects/*.jsonl`), Codex (`~/.codex/sessions/`), Cursor (SQLite `state.vscdb`) ; fichiers sur le disque, lus par un **agent local** installé sur chaque poste ;
   - chat web : claude.ai, chatgpt.com, Gemini ; lus par une **extension navigateur**.
   Mesure réelle sur un Mac : 180 sessions Claude Code, 318 Mo ; ~9 % de contenu utile (messages + réponses), 91 % de bruit d'outils (fichiers lus, commandes, résultats).
2. **Outils métier**, dans l'ordre (recherche du 12/10) : Notion, Linear (puis Jira), GitHub, Google Workspace (Gmail + Drive + Agenda, audit CASA à lancer dès le jour 1), HubSpot. Slack et Teams exclus au début (conditions d'API). Connecteurs codés par nous, pas d'agrégateur.
3. Plus tard : mails et réunions (Zoom, Meet, Teams).

## Ce que Leon en fait
- Il trie et organise seul, sans que le LLM de l'utilisateur y participe.
- **Socle de types de fiches fixe** (clients, projets, personnes, décisions, règles, fournisseurs…), **adapté à chaque entreprise par l'agent d'organisation** (pas par un formulaire de configuration). L'agent doit ranger de manière claire.
- Chaque fait garde sa **source** et sa **date**. Les contradictions sont **signalées**, pas tranchées en silence. Rien n'est effacé : un fait périmé est marqué remplacé.
- Résolution d'entités (la « Marie Dupont » du mail est-elle celle du CRM ?) : risque n°1 pour la confiance.

## Qui voit quoi
- Les **faits extraits** d'une conversation LLM sont partagés à l'équipe ; la **conversation brute** reste privée à son auteur.
- Les droits viennent des sources (un document que seul Paul peut lire donne des faits que seul Paul voit).
- Un fait faux ou mal placé coûte la confiance du client en 30 secondes.

## Comment on lit
1. Depuis son LLM (Claude, ChatGPT, Cursor, Claude Code, Gemini) via **MCP**, avec les droits de l'utilisateur authentifié.
2. Un **briefing injecté automatiquement** au démarrage des sessions, là où l'hôte le permet (hooks Claude Code, Cursor).
3. L'**interface Leon** pour consulter, vérifier, corriger, régler les droits, voir ce que les assistants ont lu.
4. Un **petit chatbot de recherche** dans Leon : il va chercher un élément précis, il n'aide pas à réfléchir.

## Où
SaaS hébergé par Leon en **Europe**, multi-clients, un espace isolé par entreprise.

## Contraintes
- Deux fondateurs, chacun avec ses agents IA de code. **Utiliser les stacks que les gens utilisent aujourd'hui** (octobre 2026), pour être à jour, efficaces, et bien servis par les outils IA de code. Pas de technologie exotique.
- Le coût IA **n'est pas une contrainte de conception** tant que les tarifs ne sont pas fixés : on conçoit pour la qualité du tri, on mesure le coût ensuite.
- Suivre les changements de format d'Anthropic, d'OpenAI et des éditeurs fait partie du travail normal : ce n'est pas une contrainte de conception.

## Non tranché, hors architecture
Nom, prix, pilote gratuit ou payant, deadline, design visuel de l'interface.

## Concurrents observés (étude du 12/10)
Glean (enterprise, 275 connecteurs, mémoire personnelle, pas de capture LLM), Qontext (Berlin, fichiers Markdown + MCP `ls/cat/grep`, pas de Gmail, pas de capture LLM), Sentra (SF, graphe de faits bi-temporel, ingestion proactive, pas de capture LLM), memory.store (SF, Briefs, `checkin` MCP, écriture par le LLM). Aucun ne capte les conversations LLM des employés.
