# Tarification (18/10/2026)

Trois sources : le panel de 100 acheteurs simulés (`pricing-curve.md`), les prix publics des concurrents (`competitors.md`) et les chiffres du CFO (`numbers.json`, outil `unit_economics.py`). Les réponses de prix du panel servent à choisir ce qu'on teste, pas à fixer le prix.

## 1. Ce que les acheteurs ont dit

Courbe de Van Westendorp sur 100 réponses complètes (€ HT par siège et par mois) :

| point | prix | lecture |
|---|---:|---|
| Trop bon marché (PMC) | 5 € | en dessous, « trop bon marché pour être sérieux » |
| Point d'indifférence (IPP) | 15 € | autant le trouvent bon marché que cher |
| Trop cher (PME) | 40 € | au-dessus, trop de refus |

Médianes : trop bon marché 5 €, bonne affaire 12 €, cher 35 €, trop cher 60 €. **25 € est dans la fourchette acceptable (5 à 40 €), mais au-dessus du point d'indifférence (15 €).**

Deux lectures à garder :
- **Les 19 acheteurs** répondent presque tous 5 / 12 / 40 / 60-80. Pour eux, 25 € n'est pas un obstacle.
- **Les 81 refus** ne sont pas des refus de prix : 60 invoquent la confiance, 3 seulement le prix. Baisser le prix ne convertit pas un acheteur qui refuse de brancher son Gmail sur une société de deux personnes.

Un signal secondaire : plusieurs CTO de petites équipes (P087, P026, P052) demandent un **forfait équipe** plutôt que du par-siège, et plusieurs (P007, P010) un **prix dégressif à partir de 10 sièges**.

## 2. Ce que les concurrents facturent (siège et mois, annuel)

| | prix | ce que ça inclut |
|---|---:|---|
| Granola | 14 $ | notes de réunion + couche de contexte |
| Dropbox Dash | 15 $ | recherche multi-sources, < 100 utilisateurs |
| Claude Team, ChatGPT Business, Copilot Business, Gemini Business, Notion Business | 20-21 $ | l'assistant **et** la recherche multi-sources, déjà payés |
| Dust Pro (Paris) | 24 € | agents sur données internes, 3 connecteurs maximum |
| Glean | 30-48 $ | 50 sièges minimum, contrat médian ~99 k$/an |

Médiane du marché : **20 $**. Leon à 25 € HT se place au-dessus de la médiane et au niveau de Dust, **en plus** de l'abonnement IA que l'équipe paie déjà. C'est ce que les acheteurs « déjà équipés » (0 % d'achat) refusent.

## 3. Ce que l'entreprise a besoin d'encaisser

Sorties de `unit_economics.py` (hypothèses dans `cfo-sources.md`, dont une rémunération minimale des fondateurs de 5 000 €/mois) :

| prix | contribution par siège | marge au plan (500 sièges) | seuil de rentabilité |
|---:|---:|---:|---:|
| 15 € | 9,0 € (60 %) | **−31 %** | 759 sièges |
| 20 € | 14,0 € (70 %) | 2 % | 488 sièges |
| **25 €** | **19,0 € (76 %)** | **21 %** | **360 sièges** |

À 15 €, le point d'indifférence du panel, l'entreprise perd de l'argent à 500 sièges. À 20 €, elle est à l'équilibre. **25 € est le prix minimum qui laisse une marge avec deux fondateurs payés.**

## 4. Décision

### Le prix : 25 € HT par siège et par mois, inchangé

- Dans la fourchette acceptable du panel, en dessous du seuil « cher » (35 €) des acheteurs.
- Le seul prix des trois qui donne une marge (21 % au plan, seuil à 360 sièges).
- Les refus viennent de la confiance et de l'effort, pas du prix : c'est l'offre (`offer.md`) qui doit les traiter, pas une baisse.

### L'échelle

| palier | prix | pour qui | raison de monter |
|---|---:|---|---|
| **Solo** | 0 € | une personne, Claude Code ou Cursor + GitHub, lecture par MCP, mémoire privée | c'est le « power user IA » (95 % d'achat au panel) qui fait entrer Leon dans l'équipe ; coût de service ~2,5 €/mois, c'est le coût d'acquisition |
| **Équipe** | 25 €/siège, 3 sièges minimum | l'équipe de développement de 3 à 30 personnes | les décisions partagées entre membres, Linear, Notion, le registre des décisions, le DPA |
| **Entreprise** | sur devis à partir de 50 sièges | équipes de 50 à 100 avec DPO et CSE | SSO, DPA négocié, dossier CSE, connecteurs Gmail et HubSpot, dégressif |

Le forfait équipe demandé par plusieurs CTO est couvert par le minimum de 3 sièges (75 €/mois) : lisible, et compatible avec le par-siège.

### L'offre d'ouverture

**« Équipe fondatrice » : 19 € HT par siège, garanti 12 mois, pour les 20 premières équipes, jusqu'au 31 janvier 2027.** La limite est réelle : deux fondateurs ne peuvent pas accompagner plus de 20 équipes en pilote. À 19 €, la contribution reste de 13 € par siège (70 %). Après la date, 25 €, sans autre remise. Pas de « prix barré » : 25 € n'aura jamais été facturé avant.

### À tester avec de vrais acheteurs

Deux prix dans la fourchette, sur deux pages d'atterrissage identiques, avec une réservation de pilote payante (pas un clic) :
- **A : 19 €/siège** (le prix d'ouverture) ;
- **B : 29 €/siège** (au-dessus du prix de liste, pour mesurer si la valeur tient jusqu'au seuil « cher » du panel).

Mesure : le nombre de pilotes réservés avec une carte bancaire, par variante, sur 4 semaines. Si B convertit autant que A, le prix de liste monte à 29 €.

## 5. Les objections de prix du panel, mot pour mot

1. « 25 € par tête, soit autant que ChatGPT et deux fois Notion, pour gagner ces dix minutes quelques fois par mois, je ne sais pas le justifier à mon associé. » (P021, dirigeant d'agence)
2. « Rajouter 25 € par tête, soit près de 1 000 € par mois pour mes 40 personnes, pour une quatrième brique qui promet à peu près la même chose, je ne le défends pas en comité de direction. » (P019, directrice commerciale)
3. « 750 € par mois pour 30 sièges, c'est plus que ce que je paie à Notion, et personne ne me montre le gain mesurable en face. » (P026, dirigeant d'agence)

Le marketing doit répondre avec un gain mesuré, pas un prix plus bas : « combien d'heures par semaine, chez une équipe de votre taille ».
