# Étude « founder » : Leon passé au pack du fondateur (17 et 18 octobre 2026)

Onze étapes du pack open source [founder-skill](https://github.com/Jakeschincariol/founder-skill) (MIT), appliquées à l'idée de mémoire hybride (brut + étiquetage léger + conversations IA) issue de la recherche du 17/10. Chaque étape lit ce que les précédentes ont écrit. Les sous-agents ont joué le conseil, le scout, 100 acheteurs simulés puis 20 en re-test, le marketing, la marque, les opérations et le lancement ; les quatre outils Python du pack (économie unitaire, panel, Van Westendorp, compilation) ont produit les chiffres et le verdict.

**Lire dans cet ordre :** `summary.md` (une demi-page), `one-pager.md`, puis `business-plan.md` (tout compilé, 1 700 lignes).

| étape | fichier | ce qu'on y trouve |
|---|---|---|
| L'idée | `idea.md` | l'idée v1 telle que présentée au conseil (conservée telle quelle) |
| Conseil | `board.md`, `board/` | 2 FUND IF, 1 PASS, 3,7/10, dix conditions C1-C10, trois mémos |
| Concurrents | `competitors.md`, `competitors.csv` | 31 acteurs, prix, plaintes sourcées, le trou, la menace |
| Panel | `panel/results.md`, `customer.json`, `pitch-v1.md` | 100 acheteurs simulés : 19 % ; power users IA 95 %, les autres 0 % |
| Prix | `pricing.md`, `pricing-curve.md` | 25 € confirmé, Solo gratuit, 19 € pour 20 équipes |
| Offre | `offer.md`, `pitch.md`, `panel-v2/results.md` | recentrage équipes dev, test des 20 questions, re-test : 25 %, 4/9 techniques |
| CFO | `cfo.md`, `numbers.json`, `cfo-sources.md` | contribution 81 %, seuil 337 sièges, année 1 −43 597 €, trésorerie 51 307 € |
| Marketing | `marketing.md` | positionnement, 3 canaux à 0 € de pub, CAC cible 1 350 €, calendrier J−14/J+16 |
| Marque | `brand.md` | « Leon » non tenable en marque ; liste courte Acquis / Pourquoi / Parce ; voix, couleurs, polices |
| Opérations | `ops.md` | cycle quotidien, fournisseurs vérifiés, 7 routines, conformité (AIPD, CSE, Bedrock UE), 10 risques |
| Lancement | `launch.md` | test de 4 semaines avec ligne de succès, compte à rebours au 12/01/2027, jour J, 30 jours |
| Plan | `business-plan.md`, `summary.md`, `one-pager.md` | verdict calculé : **Pas encore** |

Limites, dites une fois : les acheteurs sont simulés (le taux d'achat est une borne haute, les objections sont le vrai résultat) ; les chiffres sont des projections sur des prix publics vérifiés et des hypothèses marquées [E] ; la rémunération des fondateurs (5 000 €/mois) est une hypothèse à corriger ; rien ici n'est un conseil financier, juridique ou fiscal.

Pour rejouer un outil : cloner le pack, puis par exemple `python3 skills/founder-plan/compile.py --dir docs/etudes/founder-2026-10 --check`.
