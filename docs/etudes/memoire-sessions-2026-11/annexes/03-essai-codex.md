# Annexe 3 : l'essai réel de Codex (T15)

6 novembre 2026 · David (avec Claude) · annexe de l'[étude mémoire des sessions](../README.md), porte du lot 4 du [plan](../../../plans/2026-11-02-memoire-sessions.md)

> Essai fait avec la CLI Codex 0.167.0 (le plan visait la 0.159), compte ChatGPT, modèle `gpt-6-luna`, sur macOS, dans un dépôt d'essai vide (`git init` sans commit). Un crochet témoin (`sh`) branché sur SessionStart, Stop (async) et SessionEnd note son entrée et son heure, et rend au démarrage un texte accentué encadré de deux mots témoins. Les crochets ont été approuvés à la main par `/hooks`. L'app Codex Desktop et l'extension de l'éditeur ne sont pas installées : elles ne sont pas essayées.

## Verdict

**La porte est franchie : Codex donne la sortie de SessionStart au modèle, au premier message, en entier jusqu'à environ 2 500 jetons.** Le lot 4 continue.

## Ce que l'essai établit

| Point du plan | Résultat |
|---|---|
| La sortie de SessionStart arrive au modèle | Oui, au premier message, rôle `developer`. Le modèle recopie les deux mots témoins. Vrai pour la sortie texte brute **et** pour la forme JSON de C5 (`hookSpecificOutput.additionalContext`, sans autre champ). |
| Sa taille réelle | 7 965 octets (texte brut) et 8 034 octets (JSON) arrivent entiers. À 15 804 octets (3 951 jetons), Codex tronque. |
| La troncature | Au-delà d'environ 2 500 jetons, le modèle reçoit un aperçu (`Warning: truncated output (original token count: …)`, le début et la fin) et **le texte entier est écrit sur le disque**, dans `$TMPDIR/hook_outputs/<session>/<id>.txt`. Le seuil se règle par `additionalContextLimit`, en jetons. |
| Démarrage de `pnpm -s --dir <clone> leon` dans `$SHELL -lc` | 0,85 à 0,95 s (`leon --help`, clone principal, trois mesures ; le shell seul : 0,03 s). Marge sous 3 s : environ 2 s, avant tout appel réseau. |
| Un enfant détaché survit au SessionEnd | Oui : lancé en arrière-plan par le crochet de fin, il écrit 6 s plus tard. |
| Stop async dans le terminal | Oui : il reçoit `last_assistant_message`, `turn_id`, `stop_hook_active`, et finit après la réponse. |
| Stop async en `codex exec` | **Non** : il n'a pas tourné, sur deux sessions `codex exec`. |
| SessionEnd | Oui en `codex exec` (`reason: "other"`). **Non** à `/quit` dans le terminal : la 0.167 laisse la session vivre dans son démon (`Disconnected from this task. Any running work continues.`) et ne lance pas SessionEnd. |
| `transcript_path` reçu | `~/.codex/sessions/AAAA/MM/JJ/rollout-<date>-<session>.jsonl`, avec `session_id`, `cwd`, `model`, `permission_mode` et `source` (`startup`). |
| Un fichier modifié après l'approbation | Le crochet tourne toujours, avec le nouveau contenu : l'empreinte porte sur la définition du crochet (commande, options), pas sur le script appelé. Changer la commande ou une option du crochet redemande l'approbation. |
| Le contexte injecté dans le rollout | Oui : un `response_item` de type `message`, rôle `developer`, sans marque propre au crochet, juste avant le message de l'utilisateur. Le rollout porte aussi un message de rôle `user` qui n'est pas tapé (`<environment_context>…`). |

Autres relevés pour le lot 5 (T18) :
- `session_meta` porte `originator` (`codex-tui` ou `codex_exec`), `cli_version`, `cwd`, `git` (vide dans un dépôt sans commit), `history_mode` (`paginated`), `source`, `thread_source`, et des identifiants du compte OpenAI (`creator_user_id`, `creator_account_id`) : les fixtures devront les remplacer.
- Aucun `history_base` dans ces sessions neuves : un rollout repris (`codex resume`) reste à relever pour la fixture `rollout-history-base.jsonl`.
- `codex exec` attend l'entrée standard quand elle n'est pas un terminal (`Reading additional input from stdin...`) : on le lance avec `</dev/null`.

## La recette ajustée

1. **Sortie** : la forme JSON de C5, inchangée.
2. **`additionalContextLimit: 8000`** sur le crochet de démarrage. Le bloc fait au plus 8 000 octets, soit au plus 8 000 jetons quel que soit le texte : Codex ne le tronque jamais, donc n'en écrit jamais de copie sur le disque (D31). À vérifier au premier essai du crochet installé (T17), puisque l'option change l'empreinte.
3. **Approbation** : l'installateur dit qu'il faut approuver le crochet par `/hooks` au prochain lancement de Codex, sinon il ne tourne pas. Les mises à jour de Leon ne redemandent pas l'approbation tant que la commande du crochet (`~/.leon/bin/leon crochet codex demarrage`) et ses options ne changent pas.
4. **Pour le lot 5** : la capture ne peut compter ni sur SessionEnd (absent à `/quit`), ni sur Stop en `codex exec`. Il faut capter à chaque Stop dans le terminal, rattraper au démarrage suivant et après 15 min sans tour (D32), et décider pour `codex exec` (SessionEnd y tourne, lui).
