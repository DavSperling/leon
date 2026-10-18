# Panel v3 (18/10/2026) : la « mémoire d'entreprise » pour PME sous Google Workspace aux outils mélangés

Demandé par David après l'étude : tester l'axe « Glean simplifié pour les PME que personne ne sert », avec son profil client (PME de 10 à 50 sous Workspace qui vivent aussi dans Slack, Notion, Jira, Zoom, un CRM ; acheteur dirigeant ou ops) et une offre complète (`pitch-v3.md` : Gmail, Drive, Meet, Slack, Notion, Jira, Zoom, CRM, réunions et conversations IA, mémoire persistante, 25 €, ChatGPT Business et Glean nommés en comparaison). 20 cartes, graine 7, profil dans `customer-v3.json`. Acheteurs simulés : direction et objections, pas un taux.

## Résultat : 5 achats sur 20 (25 %)

Même taux que l'offre dev v2 (25 %), au-dessus du panel v1 (19 %).

| comportement | cartes | achats |
|---|:-:|:-:|
| Noyé dans les outils | 3 | **3** |
| A testé ChatGPT Business ou Claude Team | 3 | 1 |
| Compte les euros | 2 | 1 |
| Pas encore équipé en IA | 6 | **0** |
| Prudent sécurité et RGPD | 3 | 0 |
| Demande à son réseau | 2 | 0 |
| Sceptique des démos IA | 1 | 0 |

## Ce que ça dit

1. **L'acheteur existe et ce n'est pas « le non-équipé ».** Les 3 « noyés dans les outils » achètent tous ; ceux qui ont essayé ChatGPT Business et l'ont trouvé « sans mémoire d'un mois sur l'autre » aussi (P004). L'argument de David (« Google ne va pas chercher dans Zoom, Jira, Notion, Slack ») porte, et la persistance face à ChatGPT est comprise.
2. **Les 6 « pas encore équipés en IA » refusent tous**, pour confiance : ne pas être équipé n'est pas une douleur. La douleur est l'éparpillement.
3. **Les refus sont tous (14/15) des refus de confiance, et une objection nouvelle domine : le sur-partage de Drive.** *« Notre Drive est plein de fichiers partagés trop largement, et Leon rendrait la paie ou les marges cherchables »* (P006, P009, P017, P018, P019). Reproduire les droits d'origine ne suffit pas : il faut **exclure des dossiers, boîtes et canaux avant indexation**, et **un audit des droits** qui montre ce que chaque personne pourra retrouver. C'est exactement le problème qui a valu à Copilot ses incidents SharePoint.
4. **La référence d'un pair** est ce qui ferait basculer 7 refus sur 15 : le cycle de vente PME passe par le bouche-à-oreille, donc par les 5 premiers clients.
5. **Les réunions et les conversations IA effraient les prudents** (P001, P003) : « pouvoir démarrer sans les réunions ni les conversations IA, sur Drive et Gmail seulement ».
6. Le « responsable des opérations » ne signe pas (0/4) : l'acheteur est le dirigeant.

## Comparaison des trois offres

| | v1 « mémoire de l'équipe » | v2 « décisions de l'équipe dev » | v3 « mémoire d'entreprise, outils mélangés » |
|---|:-:|:-:|:-:|
| Taux (simulé) | 19 % (100 cartes) | 25 % (20) | 25 % (20) |
| Qui achète | power users IA | CTO power users, et pour la première fois des prudents | dirigeants « noyés dans les outils », déçus de ChatGPT Business |
| Objection n°1 | confiance | qui voit quoi par projet | sur-partage Drive, exclusions |
| Coût de construction | élevé | faible (agent + 3 connecteurs) | élevé (8 connecteurs, droits par source, Gmail donc CASA, réunions) |

## Ce que ça change dans le plan

- Les deux axes tiennent en simulation ; aucun ne domine. Le test réel doit les opposer : page A (v3, dirigeants de PME) contre page B (v2, CTO), même budget, même mesure.
- Si l'axe v3 est retenu, ajouter à l'offre avant toute vente : exclusions avant indexation, audit des droits à l'installation, démarrage possible sur Gmail et Drive seuls, réunions et IA en option.
- Coût : Gmail réintroduit la validation CASA (≤ 1 656 €, 4 à 8 semaines) ; les réunions ajoutent 0 à 2 € par siège ; la largeur de connecteurs dépend des PR #18 à #20.
