# Annexe 2 : la recherche du 02/11

2 novembre 2026 · Amos (avec Claude) · annexe de l'[étude mémoire des sessions](../README.md), qui nourrit le [plan](../../../plans/2026-11-02-memoire-sessions.md)

> Huit recherches menées en parallèle par des agents, en lecture seule : le terrain (Reddit et Hacker News, projets open source), les crochets de chaque outil, le code de Leon et les branches de David. Les données locales des outils n'ont été relevées qu'en structure (noms, tailles, clés), jamais en contenu. Rien n'a été essayé en vrai dans Codex, Cursor ou Antigravity : ce sont les essais T15, T26 et T31 du plan. Reddit bloque l'accès direct : les fils ont été lus dans l'archive publique Arctic Shift.

## 1. Les crochets des quatre outils

| | Claude Code | Codex | Cursor | Antigravity |
|---|---|---|---|---|
| Version locale (02/11) | 2.1.316 | CLI 0.159.0 ; sessions locales écrites par Codex Desktop 0.158 | 2.4.27 (ancienne) | 2.0.6 |
| Fichier des crochets | `~/.claude/settings.json` | `~/.codex/hooks.json` (ou `$CODEX_HOME`) | `~/.cursor/hooks.json` | `~/.gemini/config/hooks.json` |
| Capter | `SessionEnd`, délai relevable jusqu'à 60 s | `SessionEnd`, 3 s au plus : se détacher ; `Stop` async | `stop` (fiable dans l'éditeur, partiel dans la CLI selon les versions) ; `sessionEnd` peu fiable | `Stop` avec `fullyIdle` ; pas de fin de session |
| Fichier de session | `transcript_path`, JSONL ; `gitBranch` et `pr-link` y figurent | `~/.codex/sessions/AAAA/MM/JJ/rollout-*.jsonl` ; `session_meta.git` dans un dépôt ; évènements structurés des commandes et des fichiers | `~/.cursor/projects/<slug>/agent-transcripts/<id>/<id>.jsonl` (absent en 2.4.27) | `brain/<id>/.system_generated/logs/transcript.jsonl` (aucun en local) |
| Injecter | `SessionStart` : sortie standard ou `additionalContext` | `SessionStart` et `UserPromptSubmit`, rôle developer, au premier message | `sessionStart` : `additional_context`, sans attente du crochet, et instable selon les versions | `SessionStart` (absent du binaire 2.0.6) ou `PreInvocation` : `injectSteps`, où `systemMessage` est un objet |
| Plafond | 10 000 caractères par champ | environ 10 000 octets (`additionalContextLimit`) | non documenté | non documenté pour `injectSteps` ; règles : 24 000 octets par fichier |
| Approbation | dossier approuvé | empreinte par crochet (`/hooks`) | aucune documentée | aucune documentée |
| Piège | aperçu de 2 000 caractères au-delà du plafond | sortie JSON exacte, champs inconnus refusés | charge aussi les crochets de Claude Code | sur agy 1.4, une entrée mal formée faisait ignorer tout le fichier (relevé par la communauté) |
| Repli sans crochet | — | `~/.codex/AGENTS.md` (non retenu : global) | `.cursor/rules/*.mdc`, exclu de git | `.agents/rules/*.md` |

Notes :
- **Codex** lit aussi des crochets dans `config.toml`. Leurs clés de confiance dépendent de la position du groupe : il faut ajouter en fin de liste. La sortie d'un `SessionStart` arrive au premier tour, juste avant l'appel au modèle. Codex sait recopier les crochets de Claude Code vers les siens, mais leur commande ne lui convient pas. Un rollout peut porter un `history_base` hérité d'un autre fichier.
- **Cursor** : `stop` part à chaque tour. Une sortie `followup_message` serait envoyée seule comme message suivant et ferait boucler. Les bases internes (`state.vscdb`, 22 Mo, format versionné) ne sont pas une voie : seulement des transcripts.
- **Antigravity** : les conversations `.pb` sont illisibles. Leur entropie est maximale : elles sont chiffrées, ou compressées sans en-tête connu. Seuls les artefacts `brain/<id>/*.md` (task, implementation_plan, walkthrough) sont lisibles.

Sources : [crochets de Claude Code](https://code.claude.com/docs/en/hooks) ; [crochets de Codex](https://learn.chatgpt.com/docs/hooks) et le code `codex-rs/hooks` (étiquette `rust-v0.159.0`) ; [crochets de Cursor](https://cursor.com/docs/agent/hooks), [reprise des crochets de Claude Code](https://cursor.com/docs/reference/third-party-hooks), forum Cursor sur [sessionStart](https://forum.cursor.com/t/sessionstart-hook-additional-context-is-never-injected-into-agents-initial-system-context/158452) et [sessionEnd](https://forum.cursor.com/t/sessionend-hook-fires-only-on-window-close-after-shell-exec-teardown-plugin-hook-commands-can-never-execute/165492) ; [crochets d'Antigravity](https://antigravity.google/docs/hooks?tab=cli), [règles](https://www.antigravity.google/docs/rules/), [limites relevées par la communauté](https://github.com/alexherrero/crickets/wiki/Antigravity-Limitations), [un lecteur du transcript](https://raw.githubusercontent.com/MoonCaves/rawclaw/main/internal/source/antigravity/antigravity.go).

## 2. Ce que constatent les praticiens

1. **Le contexte passif bat l'outil qu'il faut penser à appeler.** Chez Vercel, un index `AGENTS.md` de 8 Ko obtient 100 %, contre 53 % pour une compétence que l'agent n'appelle pas dans 56 % des cas ([Vercel](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)).
2. **Trop de contexte nuit.** Une étude de l'ETH mesure 20 % de coût en plus sans gain général ([arXiv 2602.11988](https://arxiv.org/abs/2602.11988)). Chez Augment, les fichiers de 100 à 150 lignes gagnent, et les vues d'ensemble d'architecture coûtent 25 % de complétude ([Augment](https://www.augmentcode.com/blog/how-to-write-good-agents-dot-md-files)).
3. **Recherche simple, notes datées, élagage.** Les graphes de code et les graphes extraits par un modèle n'apportent pas de gain mesurable.
4. **Les échecs qui reviennent :**
   - l'agent s'ancre sur un résumé injecté plutôt que sur le code ;
   - les passations deviennent périmées (« rien n'a changé » alors qu'une PR est fusionnée) ;
   - une remarque ponctuelle devient une règle permanente ;
   - la mémoire peut être empoisonnée durablement ;
   - côté confidentialité, l'installateur de claude-mem a envoyé des historiques sans accord ([claude-mem #5176](https://github.com/thedotmack/claude-mem/issues/5176)).

## 3. Les projets open source

| Projet | Capte | Résume | Stocke | Injecte | On prend | On laisse |
|---|---|---|---|---|---|---|
| claude-mem | crochets, un adaptateur par outil | un modèle à chaque appel d'outil, puis au Stop | SQLite FTS5, Chroma en option | `SessionStart`, 10 000 caractères | les adaptateurs ; la réponse « rien à retenir » | le modèle par appel d'outil ; les `CLAUDE.md` écrits dans le dépôt |
| [mem0](https://github.com/mem0ai/mem0/blob/main/integrations/agent-plugin-core/README.md) | crochets, envoi détaché | extraction par un modèle | service | premier prompt, recherche sémantique | noyau commun et tests de conformité ; envoi détaché | la recherche sémantique comme passation |
| [ai-memory](https://github.com/akitaonrails/ai-memory) | crochets, file idempotente | fiche par règles, modèle en option | FTS5, graphe, vecteurs | instantané borné au démarrage | la fiche par règles ; la clôture par inactivité | — |
| [pr-session](https://github.com/daviskeene/pr-session) | — | — | — | — | les liens exacts session vers PR (`pr-link`, SHA, trailers) | — |
| Graphiti et Zep, cognee | MCP, plugins | graphe extrait par un modèle | Neo4j, vecteurs | — | — | le graphe par modèle ; une base à part |
| Cline Memory Bank, Letta | l'agent écrit | — | fichiers Markdown | — | — | une mémoire qui dépend de l'agent |
| [CASS](https://github.com/Dicklesworthstone/coding_agent_session_search) | lecteurs de plus de 20 formats | — | — | — | la référence des formats | — |

## 4. Ce qu'on en tire

- **Livrer par le crochet de démarrage de chaque outil**, sous le plus petit plafond connu : environ 10 000 octets pour Codex, non documenté pour Cursor et pour `injectSteps`. D'où un bloc de 8 000 octets.
- **Capter par le fichier de session que chaque crochet désigne**, jamais par une base interne. Envoi détaché, rattrapage au démarrage, clôture par inactivité quand l'outil n'a pas de fin de session.
- **Une fiche par règles d'abord, le résumé par-dessus.** Le résumé est un indice daté et sourcé, vérifié contre GitHub, jamais une règle.
- **Le graphe, ce sont des clés exactes** (`pr-link`, branche, SHA), qui servent à choisir et à vérifier. Le RAG sert à la demande, et au premier prompt si on l'allume.
- **Les transcripts sont des données non fiables**, envoyées avec un accord explicite.
