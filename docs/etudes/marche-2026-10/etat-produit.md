# Leon est-il prêt pour un pilote ? État du code au 21/10/2026

Lecture de `main` au commit `c67045c` (après #27), par trois agents en lecture seule. Ni les tests ni l'appli n'ont été lancés (`node_modules` absent du worktree). Les PR ouvertes #28 et #29 ne sont pas comptées.

**Verdict : Leon tourne en démo, pas encore pour une vraie équipe.** Le moteur est sérieux. Ce qui manque, c'est l'enveloppe autour.

## Ce qui marche (code complet)

- **Recherche hybride** : plein texte, vecteurs et titres, fusionnés par RRF, avec les filtres `de:`, `outil:`, `type:`, `depuis:` et `avant:` (`src/server/search/search.ts`).
- **Réponse en tête** générée par Haiku, avec citations, et **discussion agentique** sur Sonnet (8 appels d'outils au plus : `chercher`, `lire`, `activite`).
- **MCP** (`search`, `fetch`, `remember`) par jeton personnel, utilisable depuis Claude Code et Claude Desktop.
- **Isolation entre organisations** par la sécurité par ligne de Postgres, avec des tests dédiés. Les clés OAuth sont chiffrées au repos (AES-256-GCM).
- **39 connecteurs codés**, relus toutes les 15 minutes par pg-boss.
- **Extension de capture** ChatGPT et claude.ai, avec un écran de consentement.
- Environ 3 300 cas de test, tous sur des réponses d'exemple.

## Ce qui manque, par ordre d'importance

| # | Manque | Preuve | Gravité |
|---|---|---|---|
| 1 | **Impossible d'inviter un collègue** : chaque inscrit crée sa propre organisation, et aucun e-mail n'est envoyé | `src/server/auth/auth.ts:39` ; T26 non fait | Bloquant |
| 2 | **Droits binaires** : une source est visible de toute l'équipe ou de son seul auteur. Un Notion ou un GitHub branché expose ses pages et dépôts privés à tout le monde | `src/server/connectors/ingest-items.ts:68` ; lot D (T15-T19) non fait | Bloquant, et invisible en démo |
| 3 | **Pas de mise en ligne** : ni Dockerfile, ni sauvegardes, ni CI, ni suivi des erreurs | T27 non fait ; pas de `.github/` | Bloquant |
| 4 | **Aucun connecteur essayé avec un vrai compte** : 39 sur 39 portent `triedForReal: false` | `src/server/connectors/*/catalog.ts` | Bloquant (à tester, pas à coder) |
| 5 | **Google Workspace absent** : ni Gmail, ni Drive, ni Agenda | T22-T23 non faits ; voir [gmail.md](gmail.md) | Fort |
| 6 | **Pas de fichiers** : ni PDF, ni docx, ni pièces jointes | T20 non fait | Fort |
| 7 | **Plus de mémoire dans le temps** : la migration `0010` a supprimé les faits datés. Les anciennes versions d'un document restent cherchables, et un document supprimé à la source reste indexé (sauf Outlook) | `0010-suppression-tri.sql` ; `normalize.ts:328-336` ; T18 non fait | Fort : c'est ce qui distingue Leon de ChatGPT |
| 8 | **Cadre juridique de la capture** : ni politique de confidentialité, ni DPA, ni suppression ou export des données, ni vue admin de qui capte quoi | suppression d'organisation désactivée (`auth.ts:38`) | Fort avant un client |
| 9 | **Petits bloquants** : pas de mot de passe oublié ; MCP inutilisable depuis claude.ai et ChatGPT (pas d'OAuth) ; seuil des vecteurs faux sur main (corrigé par #29) ; capture Claude Code manuelle (corrigé par #28) | | Moyen |

Slack n'est pas codé, et c'est voulu : voir `docs/etudes/slack-2026-10/`. Il faudra passer par la recherche en direct de Slack (RTS ou MCP), sans copie.

## Proposition : le minimum pour un premier pilote

Ce qu'il faut pour un pilote, et rien de plus :

1. **Le lien d'invitation** et une page Membres (retirer quelqu'un, changer son rôle).
2. **Le choix « équipe » ou « personnel » par connexion**, réservé à l'admin. Ce n'est pas encore la reprise des droits de l'outil d'origine.
3. **Une instance en ligne** avec des sauvegardes quotidiennes testées.
4. **Des essais réels** des 5 ou 6 outils du client pilote.
5. **Fusionner #28 et #29**, puis recalculer les vecteurs.

Le reste attendra que le pilote le réclame :
- Gmail, avec l'option de démarrage du [gmail.md](gmail.md) ;
- les fichiers ;
- la mémoire dans le temps ;
- OAuth pour le MCP ;
- la facturation : un premier pilote se facture à la main.

## À vérifier par Amos

- Existe-t-il une instance en ligne hors du dépôt ? Les agents n'ont vu que le code.
- Sur la priorité 7 : la mémoire dans le temps doit-elle revenir avant le pilote ? Sans elle, Leon reste une recherche de plus.
- L'ordre des cinq points ci-dessus.
