# Corrections du second audit du 20/10 (PR #26)

Le second audit a vérifié les 25 corrections du premier tour (`2026-10-20-corrections-audit.md`). Un point ne tient pas,
trois tiennent à moitié, et 16 points nouveaux sont apparus. Même méthode : un lot = une branche `david/fix2-<lot>` = un
worktree `.claude/worktrees/fix2-<lot>` = une base de test `leon_test_glean2_<lot>`.

## Règles pour chaque point

1. **Le plus petit changement qui règle le cas concret.** Préférer supprimer du code.
2. **Un test qui échoue d'abord** avec le cas concret, puis la correction. **Un test de plan SQL teste l'appel réel**
   (la fonction elle-même, par `auto_explain` ou `explain` de l'appel), jamais une requête recopiée à la main.
3. Style du code autour : commentaires en français, même densité, mêmes noms.
4. **Migrations** : `0019` est déjà appliquée (démo) : on ne la modifie plus. Le lot « fond » écrit
   `0020-corrections-audit-2.sql`. Le lot « sécurité », s'il a besoin d'une table, écrit `0021-limites-de-debit.sql`.
   Aucun autre lot n'écrit de migration.
5. Vérifier avant de commiter : `npx -y pnpm@11.0.8 typecheck`, `lint`, `test:unit`, et
   `LEON_TEST_DATABASE=leon_test_glean2_<lot> npx -y pnpm@11.0.8 test:db`. Ne jamais lire ni afficher `.env.local`.
6. **Un commit par point**, message « Audit 2 n° N · <titre court> », avec la fin :
   ```
   Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01PABQFaRmpaACfWV6J5KiUj
   ```
   Fichiers ajoutés un par un, `git status` relu, jamais de push, jamais de `git stash`.
7. Un point faux ou plus gros que prévu : ne pas forcer, le dire dans le compte rendu.

## Lot « fond » : vecteurs et tâches de fond (`fix2-fond`)

- [x] **1. Refaire le tic des vecteurs (ancien n° 8, raté).** La fonction `passages_sans_vecteur` (SQL, `security definer`)
  est planifiée sans connaître le modèle : l'index de `passages.embedded_model` n'est jamais utilisé, la table est relue
  chaque minute. De plus la migration 0019 a noté le dernier modèle écrit (bge-m3 sur la démo, modèle courant voyage-4)
  et chaque vectorisation réécrit le passage (colonne indexée : pas de mise à jour HOT, GIN `tsv` réécrit). Correction
  attendue (choisir la plus simple qui règle les trois, la justifier en commentaire) : par exemple une table
  `passages_a_vectoriser (passage_id, tenant_id)` remplie à la création d'un passage, vidée à l'écriture du vecteur du
  modèle courant, entièrement remplie au changement de modèle ; retirer `embedded_model` et son index. Le test vérifie le
  plan de l'appel réel de la fonction.
- [x] **7 bis. Vecteurs des anciens modèles** : ceux des passages déjà vectorisés dans le modèle courant ne sont jamais
  retirés (4 989 sur la démo). Les retirer par le tic, par lots.
- [x] **8. Deux modèles actifs effacent les vecteurs l'un de l'autre** (`embed-missing.ts:173-178`) : ne retirer les
  vecteurs d'autres modèles que dans le tic du serveur (pas dans `embedPassages` appelé par un script), et documenter.
- [x] **9 a. Lot refusé par le fournisseur** (`embed-missing.ts:126-143`) : sur un échec qui n'est pas un délai, réessayer
  texte par texte, puis sortir de la liste « à vectoriser » ceux qui sont encore refusés (le plein texte les trouve).
- [x] **9 b. Le tic revectorise ce que l'indexation traite** : ne prendre que les passages créés il y a plus de 2 minutes.
- [x] **(SQL du lot connecteurs) Outlook privé, source détachée** : dans `retirer_sources_connexion`, retirer la condition
  `s.connection_id = c.id` (la clé organisation, propriétaire, outil, external_id suffit). Dans 0020.

## Lot « sécurité » : limites de débit et IA (`fix2-securite`)

- [x] **3. Connexion et inscription sans limite de débit** (`src/app/(auth)/actions.ts:62,77` : `auth.api.*` ne passe
  pas par la limite de Better Auth, appliquée seulement par son routeur). Limite par adresse IP et par e-mail, qui tient
  avec deux instances (donc en base, ou par le stockage « database » de Better Auth s'il convient).
- [x] **4. Réponse en tête sans limite** (`session-routes.ts:101-116`) : au plus 3 réponses en tête en cours par
  utilisateur (même mécanisme que la discussion), 429 au-delà, l'encadré se masque.
- [x] **12 a. Page bloquée 3 minutes** (`discussion-thread.tsx:279-315`) : la page arrête d'attendre dès que le serveur
  n'a plus de réponse en cours pour cette discussion.
- [x] **12 b. Question refusée affichée** (`discussion-thread.tsx:244-275`) : après 429, 401, 403, 204 ou « indisponible »
  avec `questionGardee: false`, la question est retirée de la liste et remise dans la saisie.
- [x] **15 a. Aperçu** (`src/app/(app)/actions.ts:24-32`) : un id qui n'est pas un uuid rend « introuvable » sans
  requête.
- [x] **15 b. Jetons d'une ancienne adhésion** (`api-tokens.ts:54-67`) : `listApiTokens` ne les montre plus comme actifs.
- [x] **15 c. Numéros des résultats de départ** (`discussions.ts:182-217, 296-309`) : la question affiche les mêmes numéros
  que ceux donnés à l'agent.

## Lot « connecteurs » (`fix2-connecteurs`)

- [x] **2. Un admin qui « Reconnecte » met son propre compte** : « Reconnecter » et « Remplacer la clé » réservés au
  créateur ; les admins gardent pause et suppression. Interface en conséquence.
- [x] **13 a. Le renouvellement écrase un « Reconnecter »** (`oauth.ts` `ensureFreshTokens`, `sync.ts:126-129`) :
  l'écriture du renouvellement ne passe que si le secret n'a pas changé depuis sa lecture.
- [x] **13 b. « Synchroniser maintenant » efface l'erreur** (`connections.ts:259-268`) : ne plus toucher au statut.
- [x] **16. Test manquant** : un test de relève qui vérifie qu'une page avec `removed` retire la source.
- [x] **14. Exclusion ignorée avec un filtre** (`search.ts:528-535`, `activity.ts:38-70`) : « de:marie -budget » applique
  l'exclusion.

## Lot « capture » : masquage, import, extension (`fix2-capture`)

- [x] **5 a. Faux positifs du masquage** (`mask-secrets.ts`) : `Secretary: Marie-Claire Dupont`, `les tokens: lexèmes`,
  `tokenizer: sentencepiece`, `Le pwd: /home/…`, `Basic internationalization`, `ASIAPACIFICHEADQUARTERS`,
  `const token = getToken(request);`, `apiKey: process.env.ANTHROPIC_API_KEY`, `password: z.string().min(8)`,
  `PWD=/Users/…`, `the-sk-learn-classification-model`, `jdbc:postgresql://db.acme.fr:5432/prod?user=paul@acme.fr`,
  `git+https://github.com:443/org/repo@main` restent intacts.
- [x] **5 b. Formats manqués** : `mot de passe : Hunter2Secret!`, `mdp: Hunter2Secret!`, `redis://:hunter2secret@cache:6379`,
  `"Authorization": "Token abc…"`, `authorization: bearer abc…`, `sb_secret_…`, `ya29.…`, `curl -u admin:pw`,
  `mysql -phunter2`, `redis-cli -a pw` sont masqués. Les cas du premier tour restent masqués.
- [x] **6. Sessions reprises d'un import à l'autre** (`import-claude-code.ts`, `find-sessions.ts`) : fichiers traités du
  plus ancien au plus récent ; si la session d'origine a été purgée, le dire en commentaire (limite connue).
- [x] **11. Tampon de l'extension au-delà du quota** (`extension/lib/outbox.ts`, `wxt.config.ts`) : borne en octets (ou
  `unlimitedStorage`), et une capture qui ne tient pas le dit dans la popup au lieu d'être perdue en silence.

## Hors lots

- [ ] **10. Numéros de migration** : les migrations 0013 à 0018 du plan d'Amos passeraient après 0019/0020 sur les bases
  existantes et avant sur une base neuve. À régler avec Amos (proposition : numéroter les siennes à partir de 0022).
- [x] Fusionner les quatre lots, toute la suite (typecheck, lint, unit, db sur `leon_test_glean` recréée, build), migrer la
  démo, vérifier le plan du tic sur la démo, reposer les questions de démo.
- [ ] Troisième audit.
