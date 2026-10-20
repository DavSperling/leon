# Corrections du quatrième audit du 20/10 (PR #26)

Le quatrième audit a vérifié les trois tours précédents (`2026-10-20-corrections-audit*.md`). Presque tout tient. Ce
tour traite les points restants, sous la règle du README « Une instance, un modèle ». Le masquage des secrets est mis à
part : sa stratégie est à décider (voir la fin).

Même méthode : un lot = une branche `david/fix5-<lot>` = un worktree `.claude/worktrees/fix5-<lot>` = une base de test
`leon_test_glean5_<lot>`.

## Règles pour chaque point

1. **Le plus petit changement qui règle le cas concret.** Préférer supprimer du code.
2. **Un test qui échoue d'abord** avec le cas concret, puis la correction. Un test SQL porte sur l'appel réel.
3. **Ne pas créer de régression** : relancer tous les tests existants des fichiers touchés.
4. **Migrations** : 0019 à 0022 sont appliquées (démo) : on ne les modifie plus. Seul le lot « fond » écrit
   `0023-corrections-audit-4.sql`.
5. Vérifier avant de commiter : `npx -y pnpm@11.0.8 typecheck`, `lint`, `test:unit`, et
   `LEON_TEST_DATABASE=leon_test_glean5_<lot> npx -y pnpm@11.0.8 test:db`, lancés **dans son propre worktree**. Ne jamais
   lire ni afficher `.env.local`. Fichiers temporaires dans le scratchpad uniquement sous un nom préfixé `fix5-<lot>-`.
6. **Un commit par point**, message « Audit 4 n° N · <titre court> », avec la fin :
   ```
   Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01PABQFaRmpaACfWV6J5KiUj
   ```
   Fichiers ajoutés un par un, `git status` relu, jamais de push, jamais de `git stash`.
7. Un point faux ou plus gros que prévu : ne pas forcer, le dire dans le compte rendu.

## Lot « fond » : tic des vecteurs, recherche (`fix5-fond`)

- [x] **1. Lignes examinées** (`0022:100-108`, `embed-missing.ts:288`, `worker.ts:94-111`) : `passages_sans_vecteur` retire
  en silence les lignes de tête déjà vectorisées ou d'un propriétaire parti ; le tic ne compte que les lignes rendues et
  s'arrête trop tôt, puis retire les vieux vecteurs en plein rattrapage. Le tic doit raisonner sur les lignes examinées
  (ou sur `rempli` et la file non vide). Cas de test : retour à un ancien modèle avec des lignes `fait` en tête.
- [x] **2. Vieux vecteurs jamais retirés** (`0022:116-133`) : sous la règle « un modèle », retirer aussi les vecteurs
  d'autres modèles des passages qui ne sont plus dans la file (refusés, propriétaire parti). Corriger la phrase du README
  si elle reste inexacte.
- [x] **3. « -mot » et le titre** (`search.ts:384-401`) : une source dont le titre contient un mot nié est écartée.
- [x] **4. Code en trop** : supprimer l'enveloppe `embedMissing` (seuls les tests l'appellent) au profit de
  `embedMissingBatch`.

## Lot « sécurité » : serveur, discussion (`fix5-securite`)

- [x] **5. Corps sans limite sur `/api/auth/*`** (`src/server/api/auth-routes.ts:5`) : `bodyLimit` (64 Ko, 413) devant
  `auth.handler`. Test : un corps de 1 Mo est refusé en 413 sans être lu en entier.
- [x] **6. `LEON_IP_HEADER` obligatoire en production** (`env.ts`) : refuser le démarrage si `NODE_ENV=production` et que
  le réglage manque ; message clair.
- [x] **7. Renvois collés au mot** (`answer-prompt.ts:30`, `discussion-prompt.ts:26`) : les consignes demandent un renvoi
  séparé du mot par une espace (« signé [2] »). Le code reste tel quel.
- [x] **8. Longue question refusée** (`discussions/actions.ts:27,49-50`) : normaliser `\r\n` en `\n` avant la validation.

## Lot « connecteurs » (`fix5-connecteurs`)

- [x] **9. « Reconnecter » compare un identifiant stable** (`oauth-routes.ts:239-250`, `verify` des connecteurs à bouton) :
  `verify` rend un identifiant de compte stable (Outlook `me.id`, Linear `viewer.id` + `organization.id`, Jira `accountId`
  + `cloudId`, GitHub l'id, Notion le propriétaire et l'espace) ; il est gardé dans la config ouverte et comparé à la
  reconnexion ; le libellé ne sert plus qu'en repli pour les connexions qui n'ont pas encore cet identifiant (sans
  `otherSites` pour Jira).
- [x] **10. Une seule fonction de libellé** : `accountLabel` et `ACCOUNT_MAX` partagés (`oauth-routes.ts:173`,
  `connexions/actions.ts:64-65`).
- [x] **11. Bouton « Synchroniser » d'une connexion arrêtée** (`connection-controls.tsx:147-160`) : désactivé quand le
  créateur est parti.

## Lot « extension » (`fix5-extension`)

- [x] **12. Nouveau jeton, même organisation** (`extension/lib/outbox.ts:95-109`, `background.ts:33`) : à chaque `/me`
  réussi, noter l'organisation ; au changement de jeton, ne vider le tampon que si l'organisation du nouveau jeton diffère
  ou n'est pas connue.

## Masquage des secrets : recentré (décision de David, fait)

Les quatre audits montrent que les règles par motifs ne convergent pas : sur un corpus neuf de 106 textes, 12 secrets sur
56 passent et 18 textes ordinaires sur 50 sont abîmés. Proposition à valider par David : ne garantir que les formats de
clés reconnaissables (préfixes connus, blocs aléatoires longs), ne jamais toucher le texte ordinaire, et documenter que
les mots de passe écrits en langage courant peuvent passer.

## Après les lots

- [x] Fusionner, recréer `leon_test_glean`, toute la suite, migrer la démo, vérifier le tic, reposer les questions.
- [ ] Cinquième audit.
- [ ] Message à Amos : règle « une instance, un modèle » ; ses migrations à partir de 0030.
