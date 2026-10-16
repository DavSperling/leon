# Leon

Mémoire unifiée pour les entreprises (nom de travail). Leon se branche sur les outils de l'entreprise (mails, docs, CRM…) et sur les conversations avec les LLMs (Claude, ChatGPT, Gemini, Cursor, Copilot). Il trie et organise cette donnée en une mémoire partagée, avec des droits d'accès, et injecte le bon contexte au début de chaque session LLM, sans attendre que le modèle pense à appeler un outil.

## Dans ce repo

- `docs/reunions/` : comptes-rendus de réunion
- `docs/etudes/` : études et décisions
- `docs/specs/` : spec et design du premier jet
- `docs/plans/` : plan d'implémentation du premier jet
- `docs/guides/` : guides pas à pas (checklist de vérification manuelle)
- `docs/licences-tiers.md` : licences et projets dont Leon s'inspire

## Démarrer en local

Prérequis : Docker (ou Colima) pour Postgres 17, Node 26 (`engines` : 24 au minimum), pnpm 11.

```bash
docker compose up -d                  # Postgres 17 sur 127.0.0.1:54329, bases leon et leon_test
cp .env.example .env.local            # puis renseigner BETTER_AUTH_SECRET (openssl rand -base64 32) et ANTHROPIC_API_KEY
pnpm install
pnpm db:migrate                       # applique src/server/db/migrations/*.sql sur la base leon
pnpm dev                              # http://localhost:3000 ; le worker du pipeline démarre avec l'app si la clé est là
pnpm leon import-claude-code --dry-run
pnpm ext:build                        # extension non empaquetée dans extension/.output/chrome-mv3
```

La checklist de vérification manuelle du premier jet est dans [`docs/guides/premier-jet-verification.md`](docs/guides/premier-jet-verification.md).

## Tester

```bash
pnpm test                             # unitaires + intégration ; leon_test est migrée automatiquement
```

Les tests d'intégration (`*.db.test.ts`) se connectent à Postgres : il faut que `docker compose up -d` tourne. Dans un agent Claude Code sandboxé, lancer `pnpm test` hors sandbox.

## Tâches

Le gestionnaire de tâches est sur `/taches` : liste ou tableau, filtres et vues enregistrées, page d'une tâche avec description, sous-tâches et activité, raccourcis clavier (`?` pour l'aide), thème clair ou sombre. Les tâches sont partagées par toute l'organisation. Le premier accès crée un projet, des statuts et des étiquettes par défaut, modifiables dans `/taches/reglages`.

Les agents (Claude Code, Cursor…) les lisent et les écrivent par le serveur MCP de Leon, sous les droits de l'utilisateur du jeton :

| Outil | Rôle |
|---|---|
| `task_list` | lister les tâches (projet, statut, `assigne: "moi"`, étiquette, texte) |
| `task_get` | lire une tâche (`LEO-12`) avec ses commentaires, les statuts et les étiquettes disponibles |
| `task_create` | créer une tâche |
| `task_update` | modifier une tâche (statut, priorité, assigné, étiquettes, échéance…) |
| `task_comment` | commenter une tâche |
| `task_start` | à appeler avant de coder : assigne la tâche à l'utilisateur, la passe en cours et renvoie le nom de la branche à créer |

Tout se désigne par son nom (statut, étiquette, e-mail d'un membre, clé de projet), jamais par un identifiant interne. Aucun outil ne supprime une tâche. Chaque modification faite par un agent est inscrite dans l'activité de la tâche avec le nom de son client ; les lectures (`task_list`, `task_get`) n'y laissent rien.

## Briefing au démarrage de Claude Code

Pour qu'une nouvelle session Claude Code connaisse le briefing Leon sans appeler d'outil, ajouter ce hook dans `~/.claude/settings.json` :

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "pnpm -s --dir <chemin du dépôt leon> leon briefing",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

`LEON_URL` et `LEON_TOKEN` sont lus dans le `.env.local` du dépôt (voir `.env.example`). Le jeton se crée dans Réglages.

## Travailler à deux

Les règles (branches, worktrees, PR, synchronisation avec `main`) sont dans [`CLAUDE.md`](CLAUDE.md). À lire avant le premier commit.
