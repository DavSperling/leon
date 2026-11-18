# Le point du matin, en court (18/11 au soir)

David trouvait son point du jour « très mal résumé : beaucoup trop de détails, beaucoup trop d'informations
inutiles ». L'étude des résumés n'avait pas travaillé ce point : elle notait les faits dits, et un point trop long ne
perdait que 5 points au-delà de 250 mots. La consigne permettait 250 mots et 4 puces par partie, et Sonnet remplissait
la place : 236 mots en médiane, des puces de 40 mots qui recopiaient des chiffres, des étapes et des arguments que la
source donne déjà.

## Ce qu'on a essayé

Sonnet 5.5, les 20 cas du point (`jeux/` et `jeux-validation/`), deux passages par cas, trois consignes :

- **actuel** : la consigne de main (250 mots, 4 puces par partie) ;
- **court** : 120 mots, 5 puces en tout, une phrase de 25 mots par puce, et ni chiffres, ni montants, ni pourquoi ;
- **court2** : 150 mots, 5 puces en tout, une phrase de 30 mots par puce. Chaque puce garde ce qui la rend importante
  (qui attend quoi, l'échéance, l'enjeu, le chiffre ou la décision qui change ce qu'il faut faire) et laisse le reste
  dans la source, à un clic.

Chaque point est vérifié par deux modèles (GPT-6.1 Terra et Gemini 4 Hydrogen, moyenne, sans contre-vérification).
Puis, pour chaque cas et chaque passage, les deux mêmes modèles comparent à l'aveugle l'ancienne et la nouvelle
version : laquelle la personne préférerait recevoir le matin (`banc/comparer-point.ts`).

| consigne | mots (médiane) | puces | essentiel gardé (faits de poids 3) | important gardé (poids 2-3) | fautes par point | 1re puce juste | duels gagnés contre « actuel » |
|---|---|---|---|---|---|---|---|
| actuel | 236 | 6 | 95 % | 95 % | 0,26 | 82 % | – |
| court | 97 | 4,5 | 82 % | 74 % | 0,07 | 79 % | 27 sur 76 |
| **court2** | **124** | **5** | **90 %** | **86 %** | **0,17** | **74 %** | **42 sur 76** |

Le détail est dans `resultats/point-court/comparaison-actuel-contre-court.md` et `…-court2.md`.

## Ce qu'on en retient

- **« court » coupe trop.** En interdisant chiffres et pourquoi, il perd justement ce qui rend une ligne importante :
  la remise de 10 % accordée au revendeur, « sinon on est éliminé de l'appel d'offres », « la liste envoyée lundi est
  incomplète ». Les deux juges lui préfèrent l'ancien point.
- **« court2 » est retenu.** Il fait moitié moins long, garde 90 % de l'essentiel (95 % avant) et se trompe un peu
  moins. Les juges se partagent : GPT-6.1 Terra préfère l'ancien point 22 fois sur 38, Gemini 4 Hydrogen préfère le
  nouveau 26 fois sur 38. Or les faits attendus des cas ont été écrits pour l'ancien point, détails compris : une
  égalité avec moitié moins de mots est un bon signe pour le court.
- **Ce qui reste à surveiller.**
  - La première puce est juste un peu moins souvent (74 % contre 82 %, à la limite du bruit sur 36 points). Les
    écarts sont discutables : « Maya attend le chiffre » en tête au lieu de « on perd des événements ».
  - Trois faits indispensables sont parfois dits à moitié (la cause d'une perte de données, les deux candidats
    sortis).

## Ce qui change dans Leon

- La consigne (`src/server/briefing/briefing-prompt.ts`) : 150 mots, 5 puces en tout, « What you did » sur une puce au
  plus, et la règle de ce qu'une puce garde ou laisse à la source.
- Un bouton « Refaire » sur chaque point de l'Accueil. Il refait le point tout de suite, dans la limite des 4 points
  refaits par jour et par personne.

## Coût

Environ 3,74 $ en tout : 2,10 $ pour 120 points écrits par Sonnet, 0,77 $ de vérification, 0,73 $ pour 152 duels
(montants débités, `usage.cost` d'OpenRouter).

## Relancer

```bash
SERIE=point-court JEUX=jeux npx tsx docs/etudes/resumes-2026-11/banc/lancer.ts --etapes point --modeles anthropic/claude-sonnet-5.5@NOM --reps 2
SERIE=point-court JEUX=jeux-validation npx tsx docs/etudes/resumes-2026-11/banc/lancer.ts --etapes point --modeles anthropic/claude-sonnet-5.5@NOM --reps 2
SERIE=point-court JEUX=jeux npx tsx docs/etudes/resumes-2026-11/banc/noter.ts --verificateur openai/gpt-6.1-terra --etapes point
SERIE=point-court npx tsx docs/etudes/resumes-2026-11/banc/comparer-point.ts --a actuel --b NOM
```

`@NOM` n'est qu'une étiquette : le banc prend la consigne telle qu'elle est dans `src/` au moment du lancement.
Changez donc la consigne avant de lancer, et ne la touchez plus pendant que les points s'écrivent. Lancez le
vérificateur avec les deux modèles, sur les deux jeux.
