# Le CFO (18/10/2026, révisé après `ops.md` : Stripe 0,56 €, CASA retirée, capacité 800 sièges)

## La note du CFO

Chiffres de `unit_economics.py` sur `numbers.json` (offre v2, équipes dev, prix 25 € HT). Sources et hypothèses dans `cfo-sources.md`. Revenus hors taxes ; la TVA française (20 %) s'ajoute aux factures. Un expert-comptable doit valider la structure, les charges sociales des fondateurs et la fiscalité avant tout mouvement d'argent ; ceci n'est pas un conseil financier.

**La marge.** Un siège-mois à 25 € laisse **20,13 € de contribution (81 %)** après ses coûts directs (4,87 €, dont 1,50 € de temps fondateur en support et 1,20 € de recherche et rerank). Au plan de 500 sièges, la **marge nette est de 26 %** après les 6 770 € de coûts fixes mensuels. Le **seuil de rentabilité est à 337 sièges** (17 équipes de 20).

**La ligne à surveiller : la rampe.** Avec 0 siège les deux premiers mois puis +30 % par mois, l'année 1 fait **46 750 € de chiffre d'affaires et perd 43 597 €**. Le seuil n'est franchi qu'au mois 11. Si le volume est 20 % sous le plan, la marge tombe à 13 % ; à la moitié du plan (250 sièges), elle est de **−28 %** et la perte de l'année 1 monte à 62 916 €. Le prix pèse moins : −10 % sur le prix (soit l'offre fondatrice à 19 €, si elle devenait la norme) ramène la marge à 18 % et le seuil à 385 sièges. À 19 € sur tous les sièges, la marge au plan n'est que de 3 %.

**Cash.** Le besoin de trésorerie avant que l'entreprise se paie elle-même est de **51 307 €** (le creux cumulé du mois 10, lancement compris, après retrait de la ligne CASA inutile à l'offre v2). Dont 5 000 €/mois de rémunération minimale des fondateurs, hypothèse à corriger par eux : sans rémunération, les coûts fixes tombent à 1 770 €, le seuil à 90 sièges et le besoin de trésorerie à environ 12 000 €.

**Trois façons d'améliorer la marge, mesurées avec l'outil :**
1. **Tenir le prix de liste à 25 € et borner l'offre à 19 € aux 20 premières équipes** : chaque siège à 19 € au lieu de 25 coûte 6 € de contribution ; sur 20 équipes de 10, c'est 1 200 €/mois pendant 12 mois. Acceptable comme coût d'acquisition, pas comme prix.
2. **Raccourcir la rampe de deux mois** (pilotes payants dès le mois 1 plutôt que gratuits) : le seuil est franchi au mois 9 et le creux de trésorerie baisse d'environ 13 000 €. C'est le levier le plus fort.
3. **Réduire le temps de support par siège** (1,50 € → 0,75 €, avec le test des 20 questions automatisé) : la contribution passe à 20,88 €, le seuil à 325 sièges. Faible. Le coût unitaire n'est pas le problème ; le volume l'est.

**Les conditions du conseil qui touchent à l'argent.**
- C9, remboursement du CAC sous 12 mois avec 3 à 5 % d'attrition : à 20,13 € de contribution par siège et 10 sièges par équipe, une équipe rapporte ~200 €/mois. Un CAC de 1 200 € (hypothèse `board.md`, scénario optimiste) se rembourse en 6 mois ; un CAC de 3 000 € en 15 mois, **hors cible**. Le CAC réel manque toujours : c'est `marketing.md` et `launch.md` qui le mesurent.
- C7, volonté de payer : non testée avec de vrais acheteurs. Le panel donne une fourchette, pas une preuve.

**Ce que dit le CFO en une phrase** : l'unité est saine (81 % de contribution), le prix est le bon, et tout se joue sur la vitesse à laquelle 340 sièges arrivent, donc sur l'acquisition, pas sur les coûts.

---

# Unit economics: Leon pour les équipes de développement : abonnement par siège (unité = un siège Équipe pendant un mois). Montants en euros HT, 1 $ = 0,92 € (hypothèse, voir cfo-sources.md). Offre v2 du 18/10/2026.

Every number below comes from the input file. Nothing is looked up or guessed.

## One siège-mois

| line | per siège-mois |
| --- | ---: |
| Price | $25.00 |
| Embeddings du flux (voyage-4) | -$0.04 |
| Étiquetage léger Haiku 5.5 (contexte, entités, marqueurs décision) | -$0.28 |
| Reprise de l'historique GitHub, Linear, Notion et sessions, amortie sur 12 mois | -$0.40 |
| Stockage Postgres et pgvector (Supabase) | -$0.09 |
| Recherche et rerank (440 requêtes/mois) | -$1.20 |
| Génération via MCP : payée par l'abonnement LLM du client | -$0.00 |
| Sièges Solo gratuits (1 pour 4 sièges payants, ~2,4 € chacun) | -$0.60 |
| Frais de paiement Stripe (1,5 % + 0,25 € par transaction, plus Billing 0,7 % pour les abonnements, réparti) | -$0.56 |
| Support, onboarding et test des 20 questions (temps fondateur) | -$1.50 |
| Garantie « 15 sur 20 » : 10 % des équipes non facturées le premier mois, réparti | -$0.20 |
| **Contribution** (what each siège-mois leaves to pay the fixed costs) | **$20.13** (81%) |

## The margin that matters

Fixed costs: $6,770 a month (Rémunération minimale des deux fondateurs (hypothèse à corriger) $5,000, Hébergement, base, files, LLM de développement $650, Outils (GitHub, domaine, email, compta, monitoring) $150, Expert-comptable $150, Assurance RC pro et cyber $120, Marketing (LinkedIn, contenu, événements) $500, Sécurité (pentest annuel amorti, outils de sécurité) $200).

- **Break-even: 337 siège-moiss a day.** Below that you lose money every month.
- **Profit margin at your plan** (500 a day): **26%** of every sale, after every cost.
- Capacity: 800 a day.

## Year 1, month by month

| month | siège-moiss a day | revenue | profit | cumulative (after $5,750 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | $0 | -$6,770 | -$12,520 |
| 2 | 10 | $250 | -$6,569 | -$19,089 |
| 3 | 25 | $625 | -$6,267 | -$25,355 |
| 4 | 45 | $1,125 | -$5,864 | -$31,220 |
| 5 | 70 | $1,750 | -$5,361 | -$36,580 |
| 6 | 100 | $2,500 | -$4,757 | -$41,338 |
| 7 | 140 | $3,500 | -$3,952 | -$45,289 |
| 8 | 185 | $4,625 | -$3,046 | -$48,335 |
| 9 | 235 | $5,875 | -$2,039 | -$50,375 |
| 10 | 290 | $7,250 | -$932 | -$51,307 |
| 11 | 350 | $8,750 | $276 | -$51,032 |
| 12 | 420 | $10,500 | $1,685 | -$49,347 |

- **Year 1 operating profit: -$43,597** on $46,750 of revenue.
- After the $5,750 startup spend: -$49,347.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$51,307**.

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 26% | 337 | -$43,597 |
| Price -10% | 18% | 385 | -$48,272 |
| Volume -20% | 13% | 337 | -$51,126 |
| Unit costs +15% | 23% | 349 | -$44,963 |

## Red flags

- Year 1 loses money on operations (-$43,597).
- The startup spend is not earned back within year 1.
