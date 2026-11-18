# Le banc d'essai des résumés

Rejoue tout ce que Leon résume sur des jeux de fausses données, avec n'importe quel modèle d'OpenRouter, et note les
sorties. Il construit les **vrais** prompts de Leon (les fonctions de `src/server`) et applique à la réponse le même
traitement que le serveur (filtre des renvois, liste blanche du résumé et de l'état d'un fil, lecture du JSON de
l'agenda). Seule la discussion est simulée : vrai prompt, vraie numérotation, vrai rendu, mais une recherche par mots
dans un corpus JSON au lieu de Postgres et des vecteurs.

Tout se lance depuis la racine du worktree. La clé OpenRouter est lue dans `OPENROUTER_API_KEY` ou dans le
`.env.local` du clone principal ; elle n'est jamais écrite dans le dépôt.

| Commande | Ce qu'elle fait | Coût |
|---|---|---|
| `npx tsx docs/etudes/resumes-2026-11/banc/valider.ts [étape…]` | vérifie les jeux et construit chaque prompt | gratuit |
| `npx tsx …/banc/lancer.ts --etapes point --modeles a,b --estimer` | estime le coût d'un passage | gratuit |
| `npx tsx …/banc/lancer.ts --etapes point,resume --modeles a,b [--cas x,y] [--reps 2] [--budget 1]` | appelle les modèles, garde chaque sortie dans `resultats/sorties/` | payant, plafonné par `--budget` |
| `npx tsx …/banc/noter.ts --verificateur openai/gpt-6.1-terra [--budget 1]` | un modèle vérificateur pointe les faits attendus et les pièges dans chaque sortie | payant |
| `npx tsx …/banc/tableau.ts` | notes sur 100, coût, temps : `resultats/tableau.md` et `resultats/notes.csv` | gratuit |
| `SERIE=point-court npx tsx …/banc/comparer-point.ts --a actuel --b court2` | deux consignes du point face à face : longueur, essentiel gardé, duels à l'aveugle (`point-court.md`) | payant (les duels) |

Une sortie ou une vérification déjà faite n'est jamais refaite : relancer ne repaie que ce qui manque.

Variantes : ajouter `@nom` au modèle (`anthropic/claude-haiku-5.5@sans-reflexion`).
- `sans-reflexion` : la réflexion du modèle coupée (elle est facturée au prix de la sortie) ;
- `effort-bas` : l'effort low au lieu de medium (point, discussion) ;
- `langue` : le code détecte la langue des messages de l'utilisateur et la dit au modèle en tête du message.

Fichiers :
- `types.ts` : le contrat des jeux (`../jeux/consignes.md` dit comment les fabriquer) ;
- `jeux.ts` : chargement, prompts réels, traitement de la réponse, mesures sans modèle ;
- `discussion.ts` : l'agent de discussion et ses outils sur un corpus ;
- `openrouter.ts` : l'appel, avec le coût débité (`usage.cost`) ;
- `env-factice.ts` : deux modules de Leon lisent l'environnement à l'import ; le banc n'ouvre aucune base.

La note d'une sortie (sur 100) : la part pondérée des faits attendus qu'elle dit (1, 0,5 ou 0 par fait, poids 1 à 3),
moins 15 points par piège pris ou fait contredit ; pour le point du matin, 15 % de la note vont à la première puce
(le fait le plus important) ; moins 5 points pour un renvoi inventé ou une sortie trop longue, 10 pour la mauvaise
langue ou une discussion coupée par la limite d'outils. Les cas « rien à dire » et « pas assez » valent 100 ou 0.
L'agenda est noté par F1 (rappel et précision des rendez-vous, à la minute).
