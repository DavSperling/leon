# Corrections de l'audit du 20/10 (PR #26)

L'audit du 20/10 a relevé 25 points sur la branche du deuxième jet. Ce plan les corrige par lots indépendants : un lot = une
branche `david/fix-<lot>` = un worktree `.claude/worktrees/fix-<lot>` = une base de test `leon_test_glean_<lot>`.
Les lots sont ensuite fusionnés sur `david/deuxieme-jet-glean`, puis un nouvel audit est lancé.

## Règles pour chaque point

1. **Le plus petit changement qui règle le cas concret.** Pas de couche, d'option ou de réglage que le problème ne demande pas.
   Préférer supprimer du code.
2. **Un test qui échoue d'abord** (avec le cas concret de l'audit), puis la correction, puis le test passe.
3. Style du code autour : commentaires en français, même densité, mêmes noms.
4. **Migrations** : une seule nouvelle migration pour tout le jet de corrections, `0019-corrections-audit.sql` (0013 à 0018 sont réservées au plan du deuxième jet), écrite par
   le lot « fond » uniquement. Les autres lots n'écrivent pas de migration.
5. Vérifier avant de commiter : `npx -y pnpm@11.0.8 typecheck`, `npx -y pnpm@11.0.8 lint`, `npx -y pnpm@11.0.8 test:unit`,
   et `LEON_TEST_DATABASE=leon_test_glean_<lot> npx -y pnpm@11.0.8 test:db` (la base du lot, jamais `leon_test` ni
   `leon_test_glean`). Ne jamais lire ni afficher `.env.local`.
6. **Un commit par point**, message « Audit n° N · <titre court> », avec la fin :
   ```
   Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01PABQFaRmpaACfWV6J5KiUj
   ```
   Ajouter les fichiers un par un (`git add <fichier>`), relire `git status`. Ne jamais pousser. Pas de `git stash`.
7. Si un point s'avère faux ou plus gros que prévu, ne pas forcer : le noter dans le compte rendu, avec la raison.

## Lot « fond » : tâches de fond, base, jetons (`fix-fond`)

- [x] **1. Membre parti** : `passages_sans_vecteur`, `runs_en_attente` (0011) et `connector_syncs_due` (0008) ignorent les
  lignes dont le propriétaire (`sources.owner_user_id`, `connections.created_by`) n'est plus membre de l'organisation
  (`member."userId"`, `member."organizationId"`). Nouvelle migration 0019 (`create or replace function`).
- [x] **5. Runs perdus** : la reprise prend aussi les runs `running` ou `failed` inchangés depuis plus de 30 minutes
  (`runs_en_attente` et la condition de prise de `requeueStaleRuns`).
- [x] **7. Index des vecteurs** : index `passage_vectors (tenant_id, model)` ; supprimer les vecteurs des autres modèles
  quand le modèle courant n'a plus de passage manquant (dans le tic `embedMissing`, une requête).
- [x] **8. Tic des vecteurs** : ne plus relire toute la table chaque minute. Le plus petit : index partiel ou colonne
  « à vectoriser » ; choisir la solution la plus simple qui évite le parcours complet, et le justifier en commentaire.
- [x] **19. Rattrapage lent** : dans un tic, enchaîner les lots de 500 tant qu'il en reste et que moins de ~45 s sont passées.
- [x] **12. Vieux jeton** : `verifyApiToken` refuse un jeton créé avant l'adhésion en cours (`apiTokens.createdAt >=
  members.createdAt`).

## Lot « connecteurs » (`fix-connecteurs`)

- [x] **3. Connexions des autres** : pause, suppression, nouvelle clé, reconnexion OAuth et exclusions refusées si
  l'utilisateur n'est ni le créateur ni administrateur ou propriétaire de l'organisation (contrôle applicatif, pas de
  migration). L'interface n'affiche pas ces boutons aux autres.
- [x] **4. Relève en double** : `claimConnection` rend l'heure de réservation ; `saveSyncProgress` la rafraîchit ;
  `saveSyncProgress` et `finishSync` n'écrivent que si la réservation est toujours la leur, sinon la relève s'arrête.
- [x] **13. Outlook devenu privé** : un événement déjà relevé qui devient privé ou confidentiel retire sa source (et ses
  tours, passages, vecteurs) au lieu d'être ignoré.
- [x] **17. Une relève à la fois** : `localConcurrency: 4` sur la file des relèves.
- [x] **(petit) « Synchroniser maintenant » perdu** pendant une relève : `finishSync` garde une échéance demandée après
  le début de la relève.
- [x] **(petit) Notion N²** : le premier remplissage garde sa position dans la recherche au lieu de tout relire.

## Lot « ia » : réponse en tête et discussion (`fix-ia`)

- [x] **6. Page rechargée** : quand le lecteur part, la route de discussion continue de lire la réponse sans l'écrire,
  pour qu'elle soit gardée ; corriger le commentaire d'`agent.ts`.
- [x] **14. Mauvaise question** : `startReply` rend l'id de la question ; `saveReply` vérifie que le dernier message est
  bien cette question, sinon « déjà répondue ».
- [x] **15. Signe de vie** : un commentaire SSE `: ping` toutes les 15 s dans `streamEvents`.
- [x] **16. Coût par utilisateur** : au plus 2 réponses de discussion en cours par utilisateur (dans le process) ; au-delà,
  la route répond 429 avec un message simple, affiché par la page.
- [x] **(petit) « Question gardée »** : l'évènement « indisponible » dit si la question a été gardée ; la page ne
  l'affirme que si c'est vrai.

## Lot « capture » : masquage, import, extension (`fix-capture`)

- [x] **2. Secrets** : `maskSecrets` masque `lin_api_…`, `ntn_…`, `secret_…` (Notion, 43 caractères), `glpat-…`, `xapp-…`,
  `whsec_…`, `hf_…`, `npm_…`, `ASIA…` (AWS temporaire), les URL `hooks.slack.com/services/…`, `Authorization: Token …`,
  les `\"password\":\"…\"` du JSON échappé, et le mot de passe d'une URL coupé au dernier `@` avant l'hôte.
- [x] **11. Sessions reprises** : l'import Claude Code n'envoie pas deux fois un tour déjà vu (même `uuid`) dans la même
  exécution.
- [x] **18. Gros messages** : l'extension coupe le texte d'un message à la borne du schéma au lieu de rejeter l'échange.

## Lot « recherche » : recherche, page Sources, code mort (`fix-recherche`)

- [x] **9. « -mot »** : dans la première passe, une exclusion écarte toutes les formes du mot (comme la passe élargie).
- [x] **(petit) Requête faite seulement d'exclusions** (« -test ») : page vide (ou les sources récentes s'il y a des
  filtres), sans lire tout le corpus.
- [x] **(petit) Liens http** : une seule fonction de lien sûr, partagée par la recherche et la page Sources (une seule
  règle : http et https).
- [x] **10. Page Sources** : 50 sources par page (les plus récentes d'abord) et comptes limités aux sources de la page,
  avec une pagination simple.
- [x] **20. Code mort** : supprimer `ui/command.tsx`, `ui/tabs.tsx`, `ui/breadcrumb.tsx`, la dépendance `cmdk`,
  `memory/acl.ts` et son test, `listReadLog` et `clientLabel` (avec leurs tests) s'ils ne servent qu'aux tests ; passer
  `shadcn` en `devDependencies` (vérifier que `pnpm build` passe) ; retirer `briefing` de l'aide de la CLI jusqu'à T13.

## Après les lots

- [x] Fusionner les cinq branches sur `david/deuxieme-jet-glean` ; résoudre les conflits.
- [x] Toute la suite : typecheck, lint, tests unitaires, `LEON_TEST_DATABASE=leon_test_glean pnpm test:db`, `pnpm build`.
- [ ] Migrer la base de démo `leon_glean`, relancer le serveur, reposer les questions de démo.
- [ ] Nouvel audit complet.
