# Le prix

19/10/2026 · Sources : `pricing-curve.md` (100 acheteurs simulés), `competitors.md`, `numbers.json` (outil du CFO, montants en € HT ; l'outil affiche le signe $).

## 1. Le prix : 25 € HT par utilisateur actif et par mois

**Ce qu'ont dit les acheteurs** (simulés, pour choisir quoi tester, pas comme preuve) :

| point | prix | sens |
|---|---:|---|
| PMC | 5 € | en dessous, trop bon marché pour être sérieux |
| IPP | 15 € | autant de « bonne affaire » que de « cher » |
| PME | 30 € | au-dessus, trop de gens n'achètent plus |

La fourchette acceptable va de 5 à 30 €. Les réponses médianes donnent « cher » à 25 € et « trop cher » à 40 €. **25 € est dans la fourchette, mais au seuil où ça devient cher.** 35 € en sort : le haut de la fourchette envisagée par les fondateurs (20 à 35 €) est trop haut pour cette cible.

**Face aux concurrents** (`competitors.md`) : la médiane du marché est de 20 $ (Claude Team, ChatGPT Business, Notion Business, Slite, GoSearch). Dropbox Dash est à 15 $, Gemini Enterprise à 21 $, Copilot à 18-21 $. À 25 €, Leon est un peu au-dessus de la médiane. C'est tenable seulement si la différence se voit : réponses citées sur tout l'historique, droits, audit.

**La marge** (outil du CFO, plan à 250 sièges-mois) :

| prix | contribution par siège | marge au plan | seuil de rentabilité | résultat d'exploitation année 1 |
|---:|---:|---:|---:|---:|
| 19 € | 13,55 € (71 %) | 57 % | 51 sièges | 8 928 € |
| **25 €** | **19,55 € (78 %)** | **67 %** | **36 sièges** | **16 548 €** |
| 29 € | 23,55 € (81 %) | 72 % | 30 sièges | 21 628 € |

Les fondateurs ne se paient pas avant que l'activité soit bien rentable : avec des coûts fixes d'environ 690 € par mois, le seuil reste très bas à n'importe lequel de ces prix. Le prix n'est donc pas ce qui décide de la survie. **Ce qui décide, c'est le nombre de sièges**, et le panel dit que les sièges viennent par pilotes d'une équipe.

**Le changement qui compte : facturer les utilisateurs actifs, pas l'effectif.** C'est la demande de prix la plus répétée du panel (P002, P017, P033, P049, P088, P089, P098). Elle répond à « je paie pour toute la boîte et la moitié ne s'en servira pas ». Elle rend aussi le pilote d'une équipe naturel.

## 2. L'échelle

| offre | prix | pour qui | pourquoi monter d'un cran |
|---|---|---|---|
| **Pilote** | gratuit 30 jours, 1 équipe, jusqu'à 10 personnes | toute société qui veut voir avant de payer | c'est la condition n°1 du panel |
| **Équipe** | 25 € HT par utilisateur actif et par mois, sans engagement | les sociétés après le pilote | plus d'équipes et toutes les recettes, facture qui suit l'usage réel |
| **Dédiée** | sur devis, à partir de 35 € par utilisateur actif (à tester) | 80-200 personnes, DPO, secteurs sensibles | instance dédiée en UE ou installation sur leur cloud, journal d'accès, DPA sur mesure |

Le prix « Dédiée » est une hypothèse à tester avec de vrais prospects : le panel n'a pas répondu sur cette offre.

## 3. L'offre d'ouverture

**Les 20 premières sociétés : 19 € HT par utilisateur actif, garanti 12 mois**, pour les contrats signés avant le **31 mars 2027**. Ensuite, le prix normal de 25 € s'applique. Pas de faux prix barré : 25 € est le vrai prix public dès le lancement.

## 4. À tester avec de vrais acheteurs

- **Deux prix : 19 € et 29 € par utilisateur actif**, sur deux pages d'atterrissage identiques, avec une réservation de pilote qui demande une carte (rien n'est débité pendant 30 jours).
- **Siège actif contre forfait par société**, à demander pendant les 12 entretiens. Plusieurs acheteurs ont demandé un forfait (P017, P059).

## 5. Les objections de prix, mot pour mot (panel simulé, pas des clients)

1. « Je paie déjà Claude Team pour toute la boîte, branché sur Drive et Slack. Ajouter 25 € par tête, c'est 500 à 1 000 € de plus par mois pour une mémoire que mon outil actuel finira sans doute par avoir. Je ne paie pas deux fois pour le même usage. » (P001)
2. « 25 € par personne sur 120 salariés, ça fait plus de 3 000 € par mois pour un outil dont la moitié des gens ne se serviront jamais. » (P088)
3. « Pour que ça m'enlève mon heure de Slack, il faut que toute l'équipe l'utilise, donc 25 sièges à 25 €, soit plus de 7 000 € par an, pour un outil dont je n'ai aucun chiffre de retour. » (P017)
