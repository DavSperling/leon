# Corrections du cinquième audit du 20/10 (PR #26)

Le cinquième audit converge : droits et base et IA sans point ; il reste 9 points courts. Deux lots :
`david/fix6-connecteurs` et `david/fix6-capture`, worktrees `.claude/worktrees/fix6-<lot>`, bases de test
`leon_test_glean6_<lot>`. Aucune migration. Règles d'exploitation et de masquage : README (« Une instance, un modèle »,
« Secrets dans les conversations captées »).

## Règles

1. Le plus petit changement qui règle le cas concret. 2. Un test qui échoue d'abord, avec le cas de l'audit. 3. Aucune
régression : tous les tests des fichiers touchés. 4. Vérifier dans son worktree : typecheck, lint, test:unit,
`LEON_TEST_DATABASE=leon_test_glean6_<lot> npx -y pnpm@11.0.8 test:db` (et `ext:build` pour l'extension). Ne jamais lire
`.env.local`. Fichiers temporaires du scratchpad préfixés `fix6-<lot>-`. 5. Un commit par point, « Audit 5 n° N · … »,
avec la fin d'attribution habituelle ; fichiers ajoutés un par un ; jamais de push ni de stash.

## Lot « connecteurs » : reconnexion et recherche (`fix6-connecteurs`)

- [x] **1. ClickUp et Airtable : l'identifiant de reconnexion porte l'espace** (`clickup/connector.ts:147-157`,
  `airtable/connector.ts:101-113`) : `accountKey` = utilisateur + espaces (ClickUp) ou utilisateur + bases (Airtable),
  triés ; test : même utilisateur, autre espace → `autre_compte`.
- [x] **2. Ancienne connexion sans `accountKey` dont le libellé a changé** (`oauth-routes.ts:245-285`) : la connexion
  reçoit son identifiant sans dépendre d'une reconnexion réussie (par exemple à la prochaine relève réussie, une seule fois),
  pour que le cas « renommé » ne bloque plus ; sinon écrire la limite. Choisir la solution la plus simple et sûre.
- [x] **3. « -mot » sur le titre dans les requêtes faites de filtres** (`search.ts:558-565`, `activity.ts:39-56`) :
  `recentSources` reçoit la condition sur le titre ; test : `outil:claudeai -stratégie` n'a plus la source « Stratégie… ».

## Lot « capture » : masquage et extension (`fix6-capture`)

- [x] **4. Préfixes manquants** (`mask-secrets.ts` `WHOLE_SECRETS`) : Airtable `pat<14>.<64 hex>`, Atlassian `ATATT3…`,
  HubSpot `pat-<région>-<uuid>`, ClickUp `pk_<chiffres>_<32>`, Sentry `sntryu_`/`sntrys_`, Shopify `shpat_`/`shpss_`,
  DigitalOcean `dop_v1_`, Docker `dckr_pat_`, Supabase `sbp_`, Figma `figd_`, PyPI `pypi-AgEIcHlwaS5vcmc`, webhook
  `discord.com/api/webhooks/<id>/<jeton>`, `sig=` d'une URL SAS Azure, Groq `gsk_`, Vault `hvs.`, GitLab `glrt-`. Formats
  vérifiés contre la doc de chaque éditeur ; longueurs strictes pour éviter les faux positifs.
- [x] **5 a. « basic » + long mot** (`AUTH_SCHEME`) : `Basic` comme `Token`, seulement après `authorization`.
- [x] **5 b. Hôte sans point** (`maskUrlPassword`) : `localhost:5432/…`, `docker://localhost:5000/…@sha256` intacts ;
  `postgres://app:1234/abcd@hôte` reste masqué.
- [x] **5 c. Valeurs `.env` qui ne sont pas des secrets** (`NOT_A_VALUE`, chaîne de connexion) : chemins (`/`, `~/`, `./`),
  `{…}`, `…`, `...` laissés intacts ; corriger le test qui masquait `GOOGLE_APPLICATION_CREDENTIALS=<chemin>`.
- [x] **6. Extension, panne passagère au changement de jeton** (`background.ts:50-53`, `outbox.ts:122-128`) : si `/me`
  échoue autrement que par un refus du jeton, ne pas trancher ; garder le tampon et réessayer à l'alarme suivante.

## Après

- [x] Fusionner, recréer `leon_test_glean`, toute la suite, build et ext:build, démo.
- [ ] Audit ciblé sur les seuls fichiers touchés par ce tour.
