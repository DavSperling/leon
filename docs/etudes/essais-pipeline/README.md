# Essais du pipeline : quel modèle pour l'extraction ?

15 octobre 2026 · David (avec Claude) · à relire par Amos

Le jeu d'essai (`essai/`, une PME fictive de six personnes) passé dans le vrai Leon avec différents modèles, pour choisir le meilleur rapport qualité/prix. Chaque ligne de [`historique.md`](historique.md) est un passage noté par `pnpm essai noter`. Le détail (faits en trop, faux faits, appariements du juge) est dans `passages/`.

## La réponse courte

**Claude Haiku 5.5 pour l'extraction.** Sur le jeu complet, il retrouve presque autant de faits que Sonnet 5.5 (91 % contre 93 %), en écrit moins en trop (précision 68 % contre 62 %), fait moins de faux faits (14 contre 19), et coûte 7 fois moins cher (0,22 $ contre 1,48 $ pour 659 tours), à la même vitesse.

## Méthode

- Seul le modèle d'**extraction** change (95 % du coût avec Sonnet). Tri et rangement restent sur Haiku 5.5 en direct.
- Claude en direct (API Anthropic, cache des consignes, effort par étape). OpenAI et Mistral via OpenRouter, avec le même effort de raisonnement (`medium` pour l'extraction). Coût : estimé sur le tarif officiel pour Anthropic, **facturé** par OpenRouter pour les autres.
- Le juge qui apparie les faits produits aux faits attendus est toujours Haiku 5.5 (~0,01 $ par passage, non compté).
- Étape 1 : huit modèles sur le jeu mini (10 conversations, 104 tours). Étape 2 : les trois meilleurs sur le jeu complet (60 conversations, 659 tours), en parallèle sur trois bases séparées.
- **Bruit de mesure** : deux passages identiques de Sonnet sur le mini donnent 65 et 67 % de précision, 3 et 6 faux faits. Un écart plus petit ne veut rien dire.

Lecture des notes : **rappel** = part des faits attendus retrouvés ; **précision** = part des faits écrits qui étaient attendus (le reste est « en trop » : détail, doublon, ou fait que les réponses attendues n'avaient pas prévu) ; **faux faits** = hypothèses, brouillons ou questions générales retenus à tort.

## Jeu complet (659 tours)

| Extraction | Rappel | Précision | Faux faits | Doublons (redits recréés) | Fiche juste | Remplacements | Conflits | Sensibles sur-signalés | Fuites sensibles | Coût | Durée |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sonnet 5.5 (direct) | 93 % | 62 % | 19 | 25 (5) | 47 % | 2/7 | 0/6 | 4 | 0 | 1,48 $ | 11 min |
| **Haiku 5.5 (direct)** | 91 % | **68 %** | **14** | 27 (3) | **54 %** | 2/7 | 1/6 | 10 | 0 | **0,22 $** | 10 min |
| GPT-6 Luna (OpenRouter) | 92 % | 51 % | 18 | 56 (8) | 46 % | 1/7 | 2/6 | 11 | 0 | 0,28 $ | 41 min |

Coût par étape (mesuré) : avec Sonnet, extraction 1,35 $, rangement 0,11 $, tri 0,03 $ ; avec Haiku, extraction 0,09 $, rangement 0,09 $, tri 0,03 $.

**Coût par personne et par mois (estimé)** : le passage du 14/10 sur les sessions réelles de David (usage intensif) donnait ~7,70 $ par mois avec Sonnet. À volume égal : ~1,10 $ avec Haiku, ~1,50 $ avec GPT-6 Luna. L'étude de coûts visait 3,46 $.

## Jeu mini (104 tours)

| Extraction | Rappel | Précision | Faux faits | Coût |
|---|---|---|---|---|
| Sonnet 5.5 (direct, ×2) | 97 % | 65-67 % | 3-6 | 0,23 $ |
| Haiku 5.5 (direct) | 87 % | 71 % | 3 | 0,03 $ |
| GPT-6 Sol | 97 % | 46 % | 4 | 0,29 $ |
| GPT-6 Luna | 97 % | 59 % | 5 | 0,04 $ |
| GPT-5.6 Luna | 90 % | 46 % | 4 | 0,07 $ |
| Mistral Large 4 | 100 % | 44 % | 4 | 0,24 $ (18 min) |
| Mistral Medium 3.5 | 94 % | 46 % | 4 | 0,84 $ |
| Mistral Small (2603) | non mesuré : saturé chez Mistral (HTTP 429), rien facturé | | | |

Deux passages ratés pour une raison technique ont été retirés de l'historique : le premier GPT-6 Sol (clé OpenRouter de gestion, HTTP 401, rien facturé hors tri) et Mistral Small (429).

## Ce qu'on en retient

1. **Haiku 5.5 suffit pour l'extraction.** Le rappel du mini (87 %) était pessimiste ; sur le jeu complet, l'écart avec Sonnet tombe à 2 points. La crainte du 14/10 (Haiku inventait une citation sur trois) ne se retrouve pas : 99 % des faits appariés citent le bon tour, et les citations sont vérifiées par `verifyQuote`.
2. **GPT-6 Luna**, prometteur sur le mini, ne tient pas sur le jeu complet : deux fois plus de doublons, précision 51 %, quatre fois plus lent.
3. **Mistral** n'est pas compétitif ici : Large retrouve tout mais encombre la mémoire et raisonne longtemps ; Medium est le plus cher de tous.
4. **Faiblesses communes à tous les modèles, à traiter dans le pipeline et non par le choix du modèle** : remplacements (au mieux 2 sur 7) et conflits (au mieux 2 sur 6) rarement détectés, une fiche sur deux mal choisie, une cinquantaine de fiches dispersées, quelques redits recréés au lieu d'être rejetés.
5. **Point à surveiller avec Haiku** : il signale plus de faits comme sensibles alors qu'ils ne le sont pas (10 contre 4). Aucune fuite, mais ces faits restent privés à leur auteur au lieu d'aller à l'équipe.

## Coût de l'étude

Environ 4,00 $ mesurés (étape 1 : ~2,00 $, dont 0,84 $ pour Mistral Medium ; étape 2 : ~1,98 $ ; juge : ~0,04 $).
