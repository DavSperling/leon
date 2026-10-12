# Leon : règles de travail

On est deux (Amos, David), chacun avec ses agents. Ces règles évitent qu'on s'écrase le travail. Elles valent pour les humains comme pour les agents.

## Le principe

- **`main` est la seule source de vérité.** On n'y pousse jamais directement : tout passe par une PR.
- **Le clone principal (ex. `~/leon`) est un miroir de `origin/main`.** On n'y modifie rien et on n'y commite rien. Pour le mettre à jour : `git pull --ff-only`. Si ça échoue, il a divergé : on s'arrête et on regarde pourquoi avant de toucher à quoi que ce soit.
- **Une tâche = une branche = un worktree.** On ne travaille jamais dans le clone principal.

## Démarrer une tâche

```bash
cd ~/leon
git fetch origin --prune
git pull --ff-only
gh pr list                     # vérifier que l'autre ne travaille pas déjà sur le même sujet
git worktree add --no-track -b <prenom>/<sujet> .claude/worktrees/<sujet> origin/main
cd .claude/worktrees/<sujet>
```

- Nom de branche : `<prenom>/<sujet-court>`, en minuscules, avec des tirets. Ex. : `amos/etude-couts`, `david/choix-stack`.
- Les worktrees vivent dans `.claude/worktrees/`, ignoré par Git.

## Avant de pousser

```bash
git fetch origin
git rebase origin/main                     # se remettre sur la dernière version de main
git push -u origin <prenom>/<sujet>        # premier push
git push --force-with-lease                # après un rebase, sur SA branche uniquement
```

- On ne pousse jamais sans avoir récupéré la dernière version de `main`.
- `--force-with-lease`, jamais `--force`, et jamais sur `main`.

## Les PR

- Un seul sujet par PR, la plus petite possible.
- La description dit ce qui change, pourquoi, et ce que l'autre doit vérifier.
- C'est l'autre qui relit et approuve. On fusionne en « squash », puis la branche est supprimée.

## Après la fusion

```bash
cd ~/leon
git pull --ff-only
git worktree remove .claude/worktrees/<sujet>
git branch -D <prenom>/<sujet>
```

- `-D` et non `-d` : après une fusion en squash, Git ne reconnaît pas la branche comme fusionnée et refuse `-d`. Ne supprimer la branche qu'une fois la PR fusionnée sur GitHub (`gh pr list --state merged`).

## Pièges connus

- **Noms de fichiers en ASCII uniquement** : pas d'accents, pas d'espaces, en minuscules avec des tirets (`2026-10-11-reunion.md`). Les accents envoyés depuis l'interface web de GitHub sont encodés d'une façon que macOS voit comme un fichier différent.
- **Pas de `git stash` nu** : la pile est partagée entre tous les worktrees et toutes les sessions d'agents. Préférer un commit temporaire « WIP » sur sa branche.
- **Jamais de secrets dans le repo** : clés d'API, jetons, `.env`. Le `.gitignore` couvre `.env*`, sauf `.env.example`.
- **Ne pas `git add -A` à l'aveugle** : ajouter les fichiers explicitement et relire `git status` avant de commiter.

## Où ranger quoi

- `docs/reunions/` : comptes-rendus de réunion, nommés `AAAA-MM-JJ-sujet.md`.
- `docs/etudes/` : études et décisions (coûts, stack, architecture), un dossier par étude.
