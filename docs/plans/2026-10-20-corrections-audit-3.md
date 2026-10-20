# Corrections du troisième audit du 20/10 (PR #26)

Le troisième audit a vérifié les deux tours de corrections (`2026-10-20-corrections-audit.md`, `…-audit-2.md`). Ce tour
traite les régressions du second tour et les points restants, **sous une règle d'exploitation désormais écrite** :

> **Une seule instance de Leon par base, un seul modèle de vecteurs à la fois.** En production, une mise à jour arrête
> l'ancienne version avant de démarrer la nouvelle. En local, chaque worktree qui lance un serveur a sa base. Changer de
> modèle de vecteurs : arrêter le serveur, changer le réglage, relancer.

Les points qui n'existent qu'avec deux instances ou deux modèles actifs à la fois (deux tics en parallèle, compteurs en
mémoire, attente « réponse en cours » vue depuis une autre instance, deux modèles qui se défont) ne sont pas corrigés : la
règle les exclut. Le lot « fond » l'écrit dans le README.

Même méthode : un lot = une branche `david/fix4-<lot>` = un worktree `.claude/worktrees/fix4-<lot>` = une base de test
`leon_test_glean4_<lot>`.

## Règles pour chaque point

1. **Le plus petit changement qui règle le cas concret.** Préférer supprimer du code.
2. **Un test qui échoue d'abord** avec le cas concret, puis la correction. Un test SQL de plan ou de verrou porte sur
   l'appel réel et sur l'ordre réel des opérations (par exemple une vraie suppression de source, pas une simulation).
3. **Ne pas créer de régression** : relancer tous les tests existants du fichier touché ; pour le masquage, tous les cas
   des tours précédents restent masqués ou intacts comme avant.
4. **Migrations** : 0019, 0020 et 0021 sont appliquées (démo) : on ne les modifie plus. Seul le lot « fond » écrit
   `0022-corrections-audit-3.sql`.
5. Vérifier avant de commiter : `npx -y pnpm@11.0.8 typecheck`, `lint`, `test:unit`, et
   `LEON_TEST_DATABASE=leon_test_glean4_<lot> npx -y pnpm@11.0.8 test:db`. Ne jamais lire ni afficher `.env.local`.
6. **Un commit par point**, message « Audit 3 n° N · <titre court> », avec la fin :
   ```
   Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01PABQFaRmpaACfWV6J5KiUj
   ```
   Fichiers ajoutés un par un, `git status` relu, jamais de push, jamais de `git stash`.
7. Un point faux ou plus gros que prévu : ne pas forcer, le dire dans le compte rendu.

## Lot « fond » : vecteurs, file, règle d'exploitation (`fix4-fond`)

- [x] **1. Remplissage de la file en deux temps** (`0020:70-83`) : la bascule (truncate + modèle noté) est une transaction
  courte ; le remplissage se fait ensuite sans verrou exclusif sur la file, par lots, en sautant les passages verrouillés
  (`for key share … skip locked` ou équivalent). Test : une vraie `delete from sources` pendant le remplissage ne
  s'interbloque pas et n'attend pas la fin du remplissage.
- [x] **2. Membres partis dans la file** (`0020:76-97`) : le remplissage ne prend que les passages dont le propriétaire est
  membre ; `passages_sans_vecteur` sort de la file les lignes d'un propriétaire parti.
- [x] **3. Boucle de 45 s** (`worker.ts:94-99`) : continuer tant que le lot lu était plein (lignes lues, pas vecteurs
  écrits) et qu'au moins un vecteur a été écrit ; arrêter le tic quand tout un lot est refusé.
- [x] **4. Retrait des vieux vecteurs** (`0020:116-124`) : seulement quand le tic n'a plus rien trouvé à vectoriser.
- [x] **5. Tic unique** : la file pg-boss du tic des vecteurs n'a qu'un job actif à la fois (`policy: 'singleton'` ou
  équivalent), pour que les tics ne s'empilent pas sur une instance.
- [x] **6. Règle d'exploitation** : une section courte du README « Une instance, un modèle » (le texte ci-dessus), et
  corriger les commentaires du code qui parlent encore de plusieurs instances comme d'un cas géré.

## Lot « ia » : discussion, réponse en tête, limite par adresse IP (`fix4-ia`)

- [x] **7. Coupure réseau** (`read-reply.ts:62-90`, `discussion-thread.tsx:269-274`) : un flux coupé après 200 passe en
  attente (relecture de la discussion) au lieu de retirer la question.
- [x] **8. Lecteur parti de la réponse en tête** (`session-routes.ts:84-88`, `answer.ts`) : le départ du lecteur
  interrompt tout de suite la recherche et l'appel au modèle, et rend la place.
- [x] **9. Renvois `[n]` dans le code** (`references.ts`, `message-segments.ts`, `answer-text.ts`) : `argv[0]`, `items[1]`
  ne sont ni retirés ni pris pour des renvois (pas de renvoi collé à un mot, `]` ou `)`).
- [x] **10. « Réessayer » après un refus** (`discussion-thread.tsx:412-425`) : ne relance pas une ancienne question.
- [x] **11. Limite par adresse IP** (`rate-limit.ts`, `auth.ts`) : l'adresse vient de l'en-tête posé par le proxy de
  confiance (réglage documenté pour Caddy) ; un `X-Forwarded-For` choisi par le client ne donne pas un compteur neuf ;
  une adresse inconnue compte sur une clé commune à plafond haut.
- [x] **12. Vérifier en vrai** que l'action `isReplying` et la route de discussion voient le même ensemble « réponses en
  cours » dans l'appli compilée (`pnpm build` puis `pnpm start` sur une base de test, une discussion avec le faux modèle).
  Si ce n'est pas le cas, corriger.

## Lot « connecteurs » : reconnexion, état, recherche (`fix4-connecteurs`)

- [x] **13. « Reconnecter » sur un autre compte ou site** (`oauth-routes.ts:248-254`, `jira/oauth.ts:75`) : refusé si le
  compte rendu par `verify` diffère de celui enregistré ; Jira exige le site gardé, sans repli sur `sites[0]`.
- [x] **14. Créateur parti affiché « Actif »** (`connections.ts`) : la vue dit « Arrêtée : <nom> n'est plus membre » et
  « Synchroniser maintenant » refuse.
- [x] **15. Relève qui échoue après un « Reconnecter »** (`sync.ts:153-156`, `connections.ts:409-428`) : `finishSync`
  garde le statut posé par une reconnexion faite pendant la relève.
- [x] **16. Appli OAuth retirée du serveur** (`oauth.ts:194-195`) : erreur ordinaire « L'appli X n'est plus configurée sur
  ce serveur », nouvel essai plus tard, au lieu de « autorisation expirée » définitive.
- [x] **17. « -mot » côté vecteurs et titres** (`search.ts:312-394, 547`) : le vecteur de la requête est calculé sans les
  mots niés ; les volets vecteurs et titre appliquent l'exclusion.

## Lot « capture » : masquage, extension, import, dates (`fix4-capture`)

- [x] **18. Régression : valeurs à point en clair** (`mask-secrets.ts:71,96`) : `PASSWORD=Summer.Time2026!`,
  `DB_PASSWORD=correct.horse.battery.staple`, `password: Hunter2.Secret`, `SENDGRID_API_KEY=SG.abcd….wxyz…` masqués.
  N'épargner que du code évident (un appel avec `(`, `process.env.`, `import.meta.env.`, `os.environ`).
- [x] **19. Formats manqués** : `Mot de passe du compte admin : Tr0ub4dor&3xyz`, `Le mot de passe est « Tr0ub4dor&3xyz »`,
  `DB_PASS=Hunter2Secret!`, `docker login -u paul -p Hunter2Secret`, `sshpass -p 'Hunter2Secret'`, jeton de bot Telegram.
- [x] **20. Faux positifs restants** : `const accessToken = session?.access_token;`,
  `const secretKeyRef = useRef<HTMLInputElement>(null);`, `?token={reset_token}`, `"password": "${DB_PASSWORD}"` intacts.
- [x] **21. Extension, refus 400/413** (`outbox.ts:65-99`) : compté comme perte et dit dans la popup.
- [x] **22. Extension, changement de jeton** (`options/main.ts:77-83`, `background.ts:38-42`) : le tampon en attente est
  vidé (compté comme perte) quand le jeton change, pour ne pas partir vers une autre organisation.
- [x] **23. Compteur de pertes** (`outbox.ts:46,59-63`) : le service worker tient un total qui ne fait que croître ; la popup
  garde ce qu'elle a déjà montré et affiche la différence.
- [x] **24. Ordre des sessions** (`find-sessions.ts:30-41`) : trier sur l'horodatage du premier tour, pas sur `mtime`.
- [x] **25. Dates** (`src/lib/format.ts:38`, `src/cli/leon.ts:42`) : « hier » = la veille en jour civil à Paris ;
  `--since AAAA-MM-JJ` = minuit heure locale.

## Après les lots

- [x] Fusionner, recréer `leon_test_glean`, toute la suite (typecheck, lint, unit, db, build, ext:build), migrer la démo,
  vérifier le tic sur l'appel réel, reposer les questions de démo.
- [ ] Quatrième audit, avec la règle « une instance, un modèle » dans les consignes.
- [ ] Message à Amos : la règle d'exploitation, et ses migrations numérotées à partir de 0023.
