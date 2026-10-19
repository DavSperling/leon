# Le CFO : la note

19/10/2026 · Tous les chiffres viennent de `numbers.json` et de l'outil du pack (le tableau détaillé suit cette note). Montants en euros HT ; l'outil affiche le signe $. Sources et estimations : `cfo-sources.md`. Ce n'est pas un conseil financier, fiscal ou juridique : un expert-comptable doit vérifier la structure, les charges et la TVA avant que de l'argent ne bouge.

**Hypothèse de l'année 1** : tous les sièges payent le prix de lancement de 19 € (les 20 premières sociétés, garanti 12 mois), les pilotes gratuits coûtent environ 150 € par mois, et les fondateurs ne se paient pas (leur décision : pas de rémunération avant que l'activité soit bien rentable). La montée en charge (0 siège le mois 1, 250 le mois 12) est **une estimation** : environ 20 à 25 sociétés de 10 sièges en un an, en vente directe. Le panel la rend plausible sans la prouver : 45 % des acheteurs du nouveau test lancent le pilote gratuit, mais personne ne sait combien paieront ensuite.

- **La marge** : chaque siège-mois laisse **13,55 €** (71 %) après son coût de service. Au plan de 250 sièges, la marge est de **54 %**. Le seuil de rentabilité est de **62 sièges** payants, soit environ 6 sociétés de 10 personnes.
- **L'année 1** : résultat d'exploitation de **7 128 €** sur 24 130 € de chiffre d'affaires. Après les 8 300 € de dépenses de départ : **−1 172 €**. Les dépenses de départ ne sont pas remboursées dans l'année.
- **La trésorerie** : il faut **10 671 €** avant que ça s'autofinance (le point bas est au mois 5).
- **La ligne à surveiller : le coût de service par siège.** Avec le chat Leon au coût haut (11 € par siège au lieu de 5 €), la contribution tombe à 7,55 € et l'année 1 devient négative (**−492 €**). Le volume compte aussi : à moitié des sièges prévus, l'année 1 est à **−1 476 €**.

**Trois façons d'améliorer la marge** (calculées avec l'outil) :
1. **Faire lire la mémoire par le LLM du client (MCP) plutôt que par le chat Leon** : coût de service à 2,5 € au lieu de 5 €. Contribution 16,05 € (84 %), année 1 à **10 304 €** (+3 176 €), et +2 004 € après les dépenses de départ.
2. **Repasser au prix normal de 25 € dès que possible** : année 1 à **14 748 €** (+7 620 €), dépenses de départ remboursées au mois 11. La garantie de 19 € pendant 12 mois pour les 20 premières sociétés coûte donc environ 7 600 € la première année.
3. **Reporter l'audit de sécurité tiers (4 000 €) après les premiers pilotes payants** : trésorerie nécessaire à **6 671 €** au lieu de 10 671 €, dépenses de départ remboursées au mois 11. Le résultat d'exploitation ne change pas. Mais les prudents sur la sécurité refusent sans audit : à reporter seulement si la première cible n'est pas eux.

**Les conditions d'argent du conseil** (`board.md`) :
- [ ] *Un coût d'acquisition estimé et un canal reproductible* : **non rempli.** En vente directe par les fondateurs, le coût en argent est presque nul, mais le coût en temps n'est pas chiffré. Le maximum qu'on peut payer pour un client se calcule avec la contribution, voir l'étape marketing.
- [x] *L'unité gagne de l'argent avant les coûts fixes* : oui, 13,55 € par siège-mois.
- [ ] *L'année 1 rembourse le départ* : non, à −1 172 € au plan de base ; oui avec l'une des trois améliorations ci-dessus.

---

# Unit economics: Leon : mémoire d'entreprise pour sociétés de 10 à 200 personnes (montants en euros HT ; l'outil affiche le signe $). Année 1 au prix de lancement de 19 € (20 premières sociétés, garanti 12 mois).

Every number below comes from the input file. Nothing is looked up or guessed.

## One siège-mois

| line | per siège-mois |
| --- | ---: |
| Price | $19.00 |
| Coût de service IA et hébergement par siège (estimation : 2,5 $ si lecture par le LLM du client, 4 à 11 $ avec le chat Leon ; milieu retenu) | -$5.00 |
| Frais de paiement Stripe (1,5 % + part des 0,25 € par facture, estimation) | -$0.45 |
| **Contribution** (what each siège-mois leaves to pay the fixed costs) | **$13.55** (71%) |

## The margin that matters

Fixed costs: $840 a month (Outils et hébergement de base actuels (environ 500 $) $460, Comptable en ligne (estimation) $150, Assurance RC pro et cyber (estimation) $80, Rémunération des fondateurs (aucune tant que l'activité n'est pas bien rentable, décision des fondateurs) $0, Pilotes gratuits : environ 3 par mois × 10 sièges × 5 € de service IA (estimation) $150).

- **Break-even: 62 siège-moiss a day.** Below that you lose money every month.
- **Profit margin at your plan** (250 a day): **54%** of every sale, after every cost.

## Year 1, month by month

| month | siège-moiss a day | revenue | profit | cumulative (after $8,300 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | $0 | -$840 | -$9,140 |
| 2 | 10 | $190 | -$704 | -$9,844 |
| 3 | 25 | $475 | -$501 | -$10,346 |
| 4 | 40 | $760 | -$298 | -$10,644 |
| 5 | 60 | $1,140 | -$27 | -$10,671 |
| 6 | 80 | $1,520 | $244 | -$10,427 |
| 7 | 105 | $1,995 | $583 | -$9,844 |
| 8 | 130 | $2,470 | $922 | -$8,922 |
| 9 | 160 | $3,040 | $1,328 | -$7,594 |
| 10 | 190 | $3,610 | $1,734 | -$5,860 |
| 11 | 220 | $4,180 | $2,141 | -$3,719 |
| 12 | 250 | $4,750 | $2,548 | -$1,172 |

- **Year 1 operating profit: $7,128** on $24,130 of revenue.
- After the $8,300 startup spend: -$1,172.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$10,671**.

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 54% | 62 | $7,128 |
| Price -10% | 48% | 73 | $4,716 |
| Volume -20% | 49% | 62 | $3,687 |
| Unit costs +15% | 49% | 66 | $6,090 |

## Red flags

- The startup spend is not earned back within year 1.
