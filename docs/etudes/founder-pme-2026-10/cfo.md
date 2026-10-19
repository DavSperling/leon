# Le CFO : la note

19/10/2026 · Mis à jour après l'étape opérations (prix publics de l'expert-comptable, de la signature électronique et de l'immatriculation). Tous les chiffres viennent de `numbers.json` et de l'outil du pack (le tableau détaillé suit cette note). Montants en euros HT ; l'outil affiche le signe $. Sources et estimations : `cfo-sources.md`. Ce n'est pas un conseil financier, fiscal ou juridique : un expert-comptable doit vérifier la structure, les charges et la TVA avant que de l'argent ne bouge.

**Hypothèse de l'année 1** : tous les sièges payent le prix de lancement de 19 € (les 20 premières sociétés, garanti 12 mois), les pilotes gratuits coûtent environ 150 € par mois, et les fondateurs ne se paient pas (leur décision : pas de rémunération avant que l'activité soit bien rentable). La montée en charge (0 siège le mois 1, 250 le mois 12) est **une estimation** : environ 20 à 25 sociétés de 10 sièges en un an, en vente directe. Le panel la rend plausible sans la prouver : 45 % des acheteurs du nouveau test lancent le pilote gratuit, mais personne ne sait combien paieront ensuite.

- **La marge** : chaque siège-mois laisse **13,55 €** (71 %) après son coût de service. Au plan de 250 sièges, la marge est de **54 %**. Le seuil de rentabilité est de **60 sièges** payants, soit environ 6 sociétés de 10 personnes.
- **L'année 1** : résultat d'exploitation de **7 464 €** sur 24 130 € de chiffre d'affaires. Après les 8 052 € de dépenses de départ : **−588 €**. Les dépenses de départ ne sont pas remboursées dans l'année.
- **La trésorerie** : il faut **10 284 €** avant que ça s'autofinance (le point bas est au mois 5).
- **La ligne à surveiller : le coût de service par siège.** Avec le chat Leon au coût haut (11 € par siège au lieu de 5 €), la contribution tombe à 7,55 € et l'année 1 devient négative (**−156 €**). Le volume compte aussi : à moitié des sièges prévus, l'année 1 est à **−1 140 €**.

**Trois façons d'améliorer la marge** (calculées avec l'outil) :
1. **Faire lire la mémoire par le LLM du client (MCP) plutôt que par le chat Leon** : coût de service à 2,5 € au lieu de 5 €. Contribution 16,05 € (84 %), année 1 à **10 640 €** (+3 176 €), et +2 588 € après les dépenses de départ.
2. **Repasser au prix normal de 25 € dès que possible** : année 1 à **15 084 €** (+7 620 €), dépenses de départ remboursées au mois 11. La garantie de 19 € pendant 12 mois pour les 20 premières sociétés coûte donc environ 7 600 € la première année.
3. **Reporter l'audit de sécurité tiers (4 000 €) après les premiers pilotes payants** : trésorerie nécessaire à **6 284 €** au lieu de 10 284 €, dépenses de départ remboursées au mois 11. Le résultat d'exploitation ne change pas. Mais les prudents sur la sécurité refusent sans audit : à reporter seulement si la première cible n'est pas eux.

**Les conditions d'argent du conseil** (`board.md`) :
- [ ] *Un coût d'acquisition estimé et un canal reproductible* : **non rempli.** En vente directe par les fondateurs, le coût en argent est presque nul, mais le coût en temps n'est pas chiffré. Le maximum qu'on peut payer pour un client se calcule avec la contribution, voir l'étape marketing.
- [x] *L'unité gagne de l'argent avant les coûts fixes* : oui, 13,55 € par siège-mois.
- [ ] *L'année 1 rembourse le départ* : non, à −588 € au plan de base ; oui avec l'une des trois améliorations ci-dessus.

---

# Unit economics: Leon : mémoire d'entreprise pour sociétés de 10 à 200 personnes (montants en euros HT ; l'outil affiche le signe $). Année 1 au prix de lancement de 19 € (20 premières sociétés, garanti 12 mois).

Every number below comes from the input file. Nothing is looked up or guessed.

## One siège-mois

| line | per siège-mois |
| --- | ---: |
| Price | $19.00 |
| Coût de service IA et hébergement par siège (estimation : 2,5 $ si lecture par le LLM du client, 4 à 11 $ avec le chat Leon ; milieu retenu) | -$5.00 |
| Frais de paiement Stripe (vérifié par ops le 19/10 sur stripe.com/fr/pricing : carte UE standard 1,5 % + 0,25 € par facture, plus Stripe Billing 0,7 % pour l'abonnement ; à 19 € et 10 sièges par facture ≈ 0,44 €, montant inchangé) | -$0.45 |
| **Contribution** (what each siège-mois leaves to pay the fixed costs) | **$13.55** (71%) |

## The margin that matters

Fixed costs: $812 a month (Outils et hébergement de base actuels (environ 500 $) $460, Expert-comptable en ligne (mis à jour par ops le 19/10 : 150 → 99 €, prix public Dougs « Sérénité » pour une SAS, bilan, liasse, TVA et dépôt des comptes inclus) $99, Assurance RC pro et cyber (estimation, à faire chiffrer : les prix publics « à partir de » ne couvrent pas le cyber pour un SaaS qui stocke des données clients) $80, Signature électronique des DPA et contrats (ajout ops le 19/10 : Yousign Plus, 23 € HT par mois en engagement annuel, prix relevé sur une source secondaire, à confirmer) $23, Rémunération des fondateurs (aucune tant que l'activité n'est pas bien rentable, décision des fondateurs) $0, Pilotes gratuits : environ 3 par mois × 10 sièges × 5 € de service IA (estimation) $150).

- **Break-even: 60 siège-moiss a day.** Below that you lose money every month.
- **Profit margin at your plan** (250 a day): **54%** of every sale, after every cost.

## Year 1, month by month

| month | siège-moiss a day | revenue | profit | cumulative (after $8,052 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | $0 | -$812 | -$8,864 |
| 2 | 10 | $190 | -$676 | -$9,540 |
| 3 | 25 | $475 | -$473 | -$10,014 |
| 4 | 40 | $760 | -$270 | -$10,284 |
| 5 | 60 | $1,140 | $1 | -$10,283 |
| 6 | 80 | $1,520 | $272 | -$10,011 |
| 7 | 105 | $1,995 | $611 | -$9,400 |
| 8 | 130 | $2,470 | $950 | -$8,450 |
| 9 | 160 | $3,040 | $1,356 | -$7,094 |
| 10 | 190 | $3,610 | $1,762 | -$5,332 |
| 11 | 220 | $4,180 | $2,169 | -$3,163 |
| 12 | 250 | $4,750 | $2,576 | -$588 |

- **Year 1 operating profit: $7,464** on $24,130 of revenue.
- After the $8,052 startup spend: -$588.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$10,284**.

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 54% | 60 | $7,464 |
| Price -10% | 49% | 70 | $5,052 |
| Volume -20% | 50% | 60 | $4,023 |
| Unit costs +15% | 50% | 64 | $6,426 |

## Red flags

- The startup spend is not earned back within year 1.
