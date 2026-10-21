# L'offre

19/10/2026 · Méthode : la grille Offres du pack (résumé du cadre publié de *$100M Offers*). Sources : `panel/results.md` (100 acheteurs simulés), `competitors.md`, `numbers.json`, `board.md`. Ancien pitch : `pitch-v1.md` ; nouveau : `pitch.md`.

## 1. Les obstacles, dans les mots des acheteurs

**Avant d'acheter**
1. « Je ne confie pas tous nos mails, Drive et réunions à une société de deux personnes que je ne connais pas. » (la majorité des 67 refus pour confiance)
2. « Notre Drive est mal rangé : un stagiaire tomberait sur la paie ou les marges d'un client, avec la source citée. » (P007, P009, P031, P038, P071, P076, P089…)
3. « Je ne signe rien sans mon DPO, mon avocat, et sans informer le CSE. » (P004, P019, P037, P047, P054…)
4. « Garder tout ce qui se dit en réunion, mes salariés vont le vivre comme de la surveillance. » (P006, P013, P048, P078)
5. « Ces outils inventent des réponses avec assurance, j'en ai déjà vu. » (P024, P028, P041, P045, P072, P091)
6. « Tout le monde promet de citer la source ou de dire je ne sais pas. » (P024, P051, P091)
7. « Je ne crois pas aux 15 minutes sans équipe informatique. » (P010, P017, P022, P043, P046)
8. « 25 € par tête sur toute la boîte, sans chiffre de retour. » (P002, P017, P033, P088)
9. « Je paie déjà Claude Team ou ChatGPT Business, je ne paie pas deux fois. » (P001, P025, P034, P075)
10. « Pas de référence d'une société comme la mienne. » (P003, P005, P057, P063, P068)
11. « Et si vous fermez, ou si vous êtes piratés ou rachetés ? » (P005, P056, P062, P063, P094)
12. « Personne autour de moi ne l'utilise. » (P003, P057, P090)

**Pendant**
13. « Il faut ingérer tout l'historique avant la première bonne réponse. » (grille Produit)
14. « Brancher Jira, Drive et GitHub avec les bons droits prendra des jours. » (P069)
15. « Personne ne sait quelles questions poser. » (déduit des refus « habitude »)
16. « Peut-on récupérer l'historique d'un salarié déjà parti ? » (P013, P026, P071, P099)

**Après**
17. « Dans deux mois, plus personne ne s'en servira. » (P015, P023, P033, P049, P058, P060, P066)
18. « On paiera des sièges vides. » (P049, P088, P089, P098)
19. « Une seule mauvaise réponse devant un client, et c'est fini. » (P016, P032, P041)
20. « Je veux pouvoir tout récupérer et tout supprimer. » (P003, P082)

## 2. Les solutions, notées

Valeur pour l'acheteur et coût de livraison sur 5 (5 = très précieux / très cher). Coûts tirés de `numbers.json` ou estimés et signalés.

| # | solution | répond à | valeur | coût | gardée |
|---|---|---|---:|---:|---|
| A | **Pilote gratuit 30 jours, une équipe, 10 personnes max** | 1, 5, 8, 9, 12 | 5 | 2 (≈ 50 € de service IA par pilote : 10 sièges × 5 €, plus le temps des fondateurs) | oui |
| B | **Audit des partages avant branchement** : liste des documents sensibles visibles par trop de monde, exclusion par défaut de la paie et de la finance | 2, 3 | 5 | 2 (l'API Drive donne les partages ; à construire) | oui |
| C | **Test des 10 questions** : l'équipe écrit 10 questions dont elle connaît la réponse ; score visible réponse par réponse | 5, 6, 19 | 5 | 1 | oui |
| D | **Dossier confiance** : DPA signable, sous-traitants et modèle d'IA nommés, hébergement UE, note d'information CSE, journal des questions, export et suppression sous 30 jours | 1, 3, 4, 11, 20 | 5 | 2 (2 500 € une fois, contrats relus) | oui |
| E | **Installation avec vous en une heure, en visio**, recettes de l'équipe réglées | 7, 14, 15 | 4 | 3 (une heure de fondateur par client) | oui, tant qu'il y a moins de 50 clients |
| F | **Facturation à l'utilisateur actif** | 8, 17, 18 | 5 | 1 (perte de revenu sur les inactifs) | oui |
| G | Capture des conversations IA désactivée par défaut | 4 | 3 | 1 | oui |
| H | Instance dédiée ou cloud du client | 1, 11 | 4 pour les 80-200 | 4 | oui, dans l'offre « Dédiée » seulement |
| I | Garantie « remboursé si » sur un mois payé | 17 | 3 | 1 | non : le pilote gratuit et le test des 10 questions couvrent déjà le risque |
| J | Certification ISO 27001 | 11 | 4 | 5 (des dizaines de milliers d'euros) | non pour l'instant ; audit léger par un tiers à la place (4 000 €, dans `numbers.json`) |
| K | Récupération de l'historique d'un compte parti | 16 | 5 pour le déclencheur « départ » | 3 (délégation admin Google Workspace ; faisable tant que le compte n'est pas supprimé) | à vérifier techniquement avant de le promettre ; absent du pitch sauf comme exemple de question |

## 3. L'offre empilée : « Le pilote 30 jours »

- **Le cœur** : retrouvez en une question ce qui a été dit et décidé chez vous, avec la source exacte, sans voir ce que vous n'avez pas le droit de voir.
- **Bonus 1, l'audit des partages** (B) : répond à « le stagiaire verrait la paie ».
- **Bonus 2, le dossier confiance** (D, G) : répond au DPO, au CSE et à la peur d'une jeune société.
- **Bonus 3, l'installation avec vous en une heure** (E) : répond à « je n'ai pas d'équipe informatique ».
- **La garantie** : le pilote est gratuit, et le test des 10 questions montre le score avant de payer quoi que ce soit (A, C). Ce qu'elle coûte, selon `numbers.json` : environ 50 € de service IA par pilote de 10 sièges, plus une heure d'installation. Même si aucun pilote ne convertissait, 20 pilotes coûteraient environ 1 000 €.
- **L'urgence, réelle** : les 20 premières sociétés paient 19 € par utilisateur actif, garantis 12 mois, pour un contrat signé avant le 31 mars 2027. C'est limité parce que les fondateurs ne peuvent pas installer plus de 20 clients à la main au premier trimestre.
- **Le nom** : « Le pilote 30 jours ».

## 4. L'équation de valeur, avant et après (note de 1 à 10)

| élément | avant (pitch v1) | après | ce qui la fait bouger |
|---|---:|---:|---|
| Résultat rêvé | 7 | 7 | inchangé : « retrouver ce qui a été dit et décidé » |
| Probabilité perçue d'y arriver | 3 | 6 | test des 10 questions, audit, dossier confiance |
| Délai avant le résultat | 5 | 7 | installation en une heure avec les fondateurs, une seule équipe |
| Effort et sacrifice | 3 | 6 | pas de paiement avant le résultat, paie exclue, une équipe d'abord, utilisateurs actifs seulement |

Ces notes sont mon estimation en appliquant la grille, pas une mesure. Le nouveau test du panel ci-dessous les vérifie.

## 5. Le nouveau test

Les mêmes 20 acheteurs (P001 à P020 du premier panel, mêmes fiches) ont vu le nouveau pitch (`panel-v2/`).

| | pitch v1 | « Le pilote 30 jours » |
|---|---:|---:|
| achètent | 5 sur 20 (25 %) | **9 sur 20 (45 %)** |
| refus pour confiance | 12 | 9 |
| refus pour prix | 3 | 2 |

- **4 acheteurs passent de non à oui, aucun de oui à non** : P005 et P013 (noyés dans les outils), P009 (pas encore équipé en IA), P014 (sceptique des démos IA). Le test des 10 questions et l'audit des partages sont les raisons qu'ils citent.
- **Les prudents sur la sécurité et le RGPD ne bougent pas** (P004, P008, P019, P020 : 0 sur 4). Ils veulent une certification ISO 27001 ou SOC 2, une installation sur leur cloud et des références : un dossier ne suffit pas.
- **Ceux qui ont déjà ChatGPT Business ou Claude Team ne bougent pas** (P001, P002 : 0 sur 2). Ils veulent que Leon remplace leur abonnement ou s'y branche, pas qu'il s'ajoute.
- **Attention, « oui » veut dire ici « je lance le pilote gratuit »**, pas « je paie ». Plusieurs ne paieront qu'avec au moins 8 bonnes réponses sur 10 (P007, P015, P017, P018). Le taux de passage du pilote au paiement est inconnu, et c'est le chiffre à mesurer avec de vrais clients.
- Le doute « on va payer et plus personne ne s'en servira » reste présent chez les acheteurs (P011, P017, P018), même quand ils disent oui.
