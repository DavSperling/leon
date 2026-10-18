# Conseil d'administration : synthèse du président (17/10/2026)

Trois membres, trois lentilles (Offres, Monopole, Produit), mémos dans `board/`. Les lentilles sont des résumés de cadres publiés ; personne ne parle au nom de leurs auteurs.

## Le vote

**2 FUND IF, 1 PASS. Note moyenne : 3,7 / 10.**

| Lentille | Note | Vote |
|---|---|---|
| Offres | 4 | FUND IF |
| Monopole | 3 | PASS |
| Produit | 4 | FUND IF |

## Les risques soulevés par plus d'un membre

1. **Le bundle à 20 $ (les trois).** Claude Team, ChatGPT Business, Copilot, Gemini, Notion incluent déjà la recherche multi-sources avec citations. Leon demande 25 € *en plus*. Dashworks, sur ce créneau, a fermé. Tant que Leon n'est pas dix fois meilleur sur une question précise, c'est une fonction que l'acheteur possède déjà.
2. **Aucune preuve, aucun client (les trois).** Zéro équipe en usage, zéro personne qui a dit « je paie pour ça », zéro salarié qui a accepté l'agent local. La probabilité perçue est nulle. Le prix de 25 € est une opinion.
3. **Le marché n'est pas choisi (Offres, Monopole).** « 5 à 100 personnes, tout type » est un recensement, pas un marché. Les deux lentilles nomment le même candidat : les équipes de développement de 5 à 30 personnes qui vivent dans Claude Code ou Cursor.
4. **L'effort d'installation (Offres, Produit).** Cinq ou six consentements OAuth, une extension, un agent local sur chaque poste, une configuration MCP, l'information des salariés et le CSE. Les cinq premières minutes n'existent pas ; la mémoire est vide le jour 1. Chiffres manquants : minutes jusqu'à la première réponse utile, part d'employés qui finissent l'installation.
5. **La capture des conversations IA est une hypothèse, pas encore un secret (Monopole, Produit).** Elle est fragile (les interfaces de ChatGPT et Claude changent, précédent Slack), copiable par Anthropic ou OpenAI en une version, et juridiquement sensible (suivi d'activité). Personne ne l'a demandée.
6. **La frontière privé/partagé (Produit, Monopole).** Un classifieur se trompera dans les deux sens ; une fuite suffit à tuer la confiance. Pas de relecture par l'auteur ni de taux d'erreur annoncés.

## Désaccords à conserver

- **Monopole** vote PASS parce qu'aucun avantage ne tient six mois face à un copieur, et qu'aucun petit marché n'est nommé. **Offres** et **Produit** jugent que la douleur et le parti pris « brut d'abord » valent un financement conditionnel.
- **Offres** veut *empiler* l'offre (rétro-chargement, pack CSE, registre des engagements, garantie) et tester à 50 €. **Produit** veut *couper* jusqu'à une seule chose (capture IA → décisions → MCP) et retirer le chat web, HubSpot, Linear, Notion et les comptages. Les deux ne sont pas incompatibles si l'empilement se fait autour de la chose unique, mais la tension est réelle.
- **Produit** considère que lire par MCP déplace l'hallucination dans le LLM du client et laisse l'écran principal à quelqu'un d'autre ; **Monopole** et le dossier y voient le coût de service le plus bas. À arbitrer avec des mesures.

## Les conditions, fusionnées (liste à cocher pour la suite du pack)

- [ ] **C1. Un seul marché initial, nommé et chiffré** : combien d'équipes en France de 5 à 30 personnes utilisent Claude Code ou Cursor au quotidien ? (→ `/founder-competitors`, `/founder-consumer`)
- [ ] **C2. Une seule chose avant toute vente** : capture des conversations IA, remontée des décisions avec leur raison, lecture par MCP. Chat web, HubSpot, Linear, Notion, comptages : plus tard, sur demande de clients payants. (→ `/founder-offer`)
- [ ] **C3. Preuve d'usage** : cinq équipes hors du réseau des fondateurs, huit semaines, avec par équipe : questions par semaine, part de réponses correctes avec citation exacte, taux d'installation de l'agent local, un cas « la réponse n'existait nulle part ailleurs ». (→ `/founder-launch`)
- [ ] **C4. Première réponse citée en moins de dix minutes** sur un poste non technique, sans aide, chrono en main. Rétro-chargement de l'historique pour que la mémoire ne soit pas vide le jour 1. (→ `/founder-ops`, `/founder-launch`)
- [ ] **C5. Dix fois mieux, mesuré** : sur « pourquoi a-t-on choisi X ? » et « comment avait-on réglé cette erreur ? », Leon répond là où Claude Team et Notion Business ne répondent pas, sur un jeu de questions fixé. Mesurer aussi le taux de citations inventées côté LLM client. (→ test à l'aveugle)
- [ ] **C6. Signal visible de capture et relecture par l'auteur** avant toute remontée à l'équipe, tant que le taux d'erreur du classifieur n'est pas mesuré. (→ `/founder-ops`)
- [ ] **C7. Volonté de payer réelle** : lettres d'intention ou prépaiements signés entre 15 et 28 €, et le test « à 50 €, est-on encore le choix évident ? ». (→ `/founder-consumer`, `/founder-pricing`)
- [ ] **C8. Réécrire l'offre autour du résultat** (nom, rétro-chargement, pack conformité CSE, garantie écrite du type « cinq questions d'un nouvel arrivant sans réponse, remboursé »). (→ `/founder-offer`)
- [ ] **C9. Coût d'acquisition et attrition** : montrer le remboursement du CAC sous 12 mois avec 3 à 5 % d'attrition mensuelle. (→ `/founder-cfo`, `/founder-marketing`)
- [ ] **C10. Réponse juridique écrite** sur le régime de la capture (suivi d'activité, CSE) avant le premier client de plus de 50 personnes. (→ `/founder-ops`)

## La version la plus forte que le conseil voit

Ce n'est pas celle qui a été présentée. Le conseil ne voit pas « la mémoire de l'équipe, toutes sources, tout type d'équipe » : c'est le produit que l'acheteur reçoit déjà dans son abonnement à 20 $, et celui sur lequel Dashworks est mort. La version la plus forte est étroite : **pour les équipes de développement de 5 à 30 personnes qui travaillent dans Claude Code ou Cursor, Leon capte ce que les agents et les développeurs ont décidé et pourquoi, le remonte à l'équipe sans exposer les conversations, et le sert dans l'outil IA que l'équipe utilise déjà.** Une question de démo : « pourquoi on a choisi Postgres pour le billing ? », avec la citation de la session où le choix a été fait. Le brut des emails, de Notion et du CRM reste le socle technique et s'ajoute ensuite, connecteur par connecteur, quand des clients payants le demandent. Le membre Monopole précise que même cette version ne le ferait voter FUND qu'avec un marché chiffré, dix équipes payantes hors réseau, et la mesure du « dix fois mieux ».
