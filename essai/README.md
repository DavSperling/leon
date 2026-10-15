# Jeu d'essai du pipeline

Une PME fictive, l'Atelier Numérique Lebrun, et six personnes qui parlent à leurs assistants pendant trois semaines (21/09 → 10/10/2026). On fait passer ces conversations dans le vrai Leon, comme chez un client, puis on note ce que Leon a retenu. Toujours la même donnée : un écart entre deux passages vient du code, pas des conversations.

Pourquoi et comment : [spec](../docs/specs/2026-10-15-jeu-essai.md). Historique des passages : [`docs/etudes/essais-pipeline/`](../docs/etudes/essais-pipeline/).

Tout est inventé. Les deux « secrets » de `entreprise.json` sont faux et servent à vérifier qu'aucun secret ne finit dans un fait.

## Contenu

| Fichier | Rôle |
|---|---|
| `entreprise.json` | l'organisation, les six personnages, les faux secrets |
| `bible.md` | le monde, la chronologie, les pièges (§ 5), la liste des conversations et de leurs faits (§ 6) |
| `conversations/<personnage>/<date>-<sujet>.json` | une conversation, au format exact de `POST /api/v1/ingest` |
| `attendu/<personnage>/<date>-<sujet>.json` | ce que Leon doit retenir (F…), ne pas retenir (N…), les remplacements, les conflits, les redits (`doublonDe`) |
| `mini.json` | dix conversations (104 tours) pour un essai rapide |

Volumes : 60 conversations, 659 tours, 215 faits attendus (dont 24 redits), 70 « à ne pas retenir ».

## Lancer un passage

**Chaque passage coûte de l'argent** (~1,30 $ le complet, ~0,25 $ le mini, estimés). La commande annonce le coût et demande confirmation.

```bash
pnpm db:migrate                       # une fois, pour la table llm_usage
pnpm dev --port 3002                  # à redémarrer après chaque changement de code
pnpm essai verifier                   # contrôle le jeu, sans aucun appel
LEON_URL=http://localhost:3002 pnpm essai charger --label "référence"     # ou --mini
LEON_URL=http://localhost:3002 pnpm essai noter
```

- **Commiter avant de charger.** `charger` refuse s'il y a des modifications non commitées sous `src/` ou `essai/`, ou si le serveur n'a pas démarré sur `HEAD` : le worker du pipeline ne recharge pas le code à chaud.
- **`charger` efface la mémoire du passage précédent** (l'organisation d'essai est supprimée et recréée). Noter avant de recharger.
- `charger` et `noter` se lancent dans le même worktree : `.env.local` (clé Anthropic, `DATABASE_URL_ADMIN`) et `essai/.dernier-passage.json` sont propres à chaque worktree.
- `noter` ajoute une ligne à `docs/etudes/essais-pipeline/historique.md` et le détail dans `passages/` : à commiter.

## Comparer des modèles

Le modèle de chaque étape se choisit au démarrage du serveur, par variable d'environnement : `LEON_LLM_TRIAGE`, `LEON_LLM_EXTRACTION`, `LEON_LLM_RANGEMENT`, au format `anthropic:<modèle>` ou `openrouter:<fournisseur>/<modèle>` (identifiants sur [openrouter.ai/models](https://openrouter.ai/models)). Une étape sans variable garde son modèle Anthropic habituel ; le juge reste toujours sur Claude Haiku, pour que les notes restent comparables.

```bash
LEON_LLM_EXTRACTION=openrouter:mistralai/mistral-large-4-0 pnpm dev --port 3002
LEON_URL=http://localhost:3002 pnpm essai charger --mini --label "extraction mistral-large-4-0"
LEON_URL=http://localhost:3002 pnpm essai noter
```

- OpenRouter demande `OPENROUTER_API_KEY` dans `.env.local` ; le serveur ne lance pas le pipeline s'il manque la clé d'un fournisseur configuré.
- **Une configuration = un redémarrage du serveur.** `charger` affiche les modèles annoncés par le serveur avant de demander confirmation : les relire.
- **Toujours mettre le modèle dans `--label`.** Changer de modèle ne change pas le commit (la vérification du commit ne couvre que le code) : sans le libellé, deux passages ne se distinguent dans l'historique que par la colonne Modèles.
- Le coût enregistré pour un appel OpenRouter est celui qu'OpenRouter facture (`usage.cost`, plus le coût amont avec une clé propre) ; celui d'un appel Anthropic direct est estimé avec les tarifs de l'étude de coûts. `noter` signale les appels au coût inconnu (`coutsManquants` dans le détail du passage).
- Le coût annoncé par `charger` est mesuré sur les modèles du dernier passage complet. Si un modèle diffère, `charger` affiche les prix OpenRouter des modèles configurés et refuse le jeu complet : lancer d'abord un `--mini` pour mesurer, ou passer `--oui-complet`.
- Effort de raisonnement : les modèles OpenRouter qui le règlent reçoivent celui de l'étape (low, medium, medium) ; il apparaît dans les modèles affichés (« (effort medium) »). Les variantes `:batch` et les modèles `-pro` sont refusés.
- `noter` garde dans le détail du passage (`passages/*.json`) les modèles annoncés (`modeles`) et ceux réellement servis, lus dans `llm_usage` (`modelesVus`).

## Se connecter comme un personnage

Après `charger`, l'interface accepte les six comptes, avec le mot de passe de développement `essai-leon-2026` :

| Compte | Rôle | Outils |
|---|---|---|
| `claire@essai.leon.local` | dirigeante (propriétaire de l'organisation) | claude.ai |
| `karim@essai.leon.local` | commercial | ChatGPT |
| `hugo@essai.leon.local` | dev back et données | Claude Code |
| `ines@essai.leon.local` | dev interface et mobile | Claude Code, ChatGPT |
| `sophie@essai.leon.local` | admin et finances | ChatGPT |
| `nadia@essai.leon.local` | cheffe de projet | claude.ai, Claude Code |

## Le jeu mini

Trois groupes fermés (aucune conversation ne dépend d'une conversation hors du mini, ce que `pnpm essai verifier` contrôle) qui couvrent tous les pièges :

| Groupe | Conversations | Pièges |
|---|---|---|
| Le salon | `claire/2026-09-22-strategie-salon`, `sophie/2026-09-24-mutuelle`, `karim/2026-10-07-salon-decale`, `claire/2026-10-08-comite-direction`, `sophie/2026-10-08-budget-2027`, `nadia/2026-10-09-relances-clients` | remplacement (date du salon), conflit (hausse de la mutuelle), redits entre personnes, faux amis |
| Le géocodage | `hugo/2026-09-23-geocodage-mapeo`, `sophie/2026-10-05-cartographie`, `hugo/2026-10-06-bascule-terracarte` | sessions de code bruitées, débat d'agents, faux secret (clé d'API), remplacement de fournisseur, redit |
| L'arrêt maladie | `sophie/2026-09-28-arret-maladie` | faits sensibles |

## Modifier le jeu

Changer une conversation change la mesure : les passages d'avant ne sont plus comparables. Le noter dans le libellé du passage suivant, mettre la bible à jour, puis `pnpm essai verifier`.
