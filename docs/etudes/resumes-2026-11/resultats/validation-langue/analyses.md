# Analyses sans modèle (générées par banc/analyses.ts)

## Sorties dans la mauvaise langue

Comptées seulement sur les sorties en prose d'au moins 15 mots, hors « rien à retenir ».

| étape | modèle | cas anglais mal écrits | cas français mal écrits |
|---|---|---|---|
| reponse | anthropic/claude-haiku-5.5 | 0/5 | 0/5 |
| reponse | anthropic/claude-sonnet-5.5 | 0/5 | 0/4 |
| reponse | deepseek/deepseek-v4.1-flash | 0/5 | 0/4 |
| reponse | deepseek/deepseek-v4.1-flash-1017 | 0/4 | 0/4 |
| reponse | z-ai/glm-5.3-flash | 0/5 | 0/4 |
| discussion | anthropic/claude-haiku-5.5 | 0/4 | 0/4 |
| discussion | anthropic/claude-sonnet-5.5 | 0/4 | 0/4 |
| discussion | deepseek/deepseek-v4.1-flash | 0/4 | 0/3 |
| discussion | deepseek/deepseek-v4.1-flash-1017 | 0/4 | 0/3 |
| discussion | z-ai/glm-5.3-flash | 0/4 | 0/4 |

## Résumé de session : décisions perdues à la borne du serveur

Une décision « valable » cite une source qui peut la prouver (PR, commit, message tapé par la personne). Série v1 : le serveur gardait le paragraphe, puis les lignes dans l'ordre du modèle, jusqu'à 1 200 caractères ; les décisions, écrites en dernier, tombaient les premières. Depuis v2 : 1 500 caractères, décisions gardées d'abord. La dernière colonne compte les résumés plus longs que les 1 200 caractères demandés par le prompt.

| modèle | décisions valables écrites | gardées | perdues à la borne | résumés de plus de 1 200 caractères (brut) |
|---|---|---|---|---|

### Si le serveur gardait les décisions d'abord

Même réponse du modèle, même filtre du serveur, seules les lignes [décision] remontées sous le paragraphe. Longueur brute : médiane des réponses avant le filtre.

| modèle | décisions gardées (aujourd'hui → d'abord) | [prochaine-étape] gardées (aujourd'hui → d'abord) | longueur brute médiane |
|---|---|---|---|

## Part de la réflexion dans les jetons de sortie

| étape | modèle | jetons de sortie (moyenne) | dont réflexion |
|---|---|---|---|
| reponse | anthropic/claude-haiku-5.5 | 693 | 67 % |
| reponse | anthropic/claude-sonnet-5.5 | 254 | 0 % |
| reponse | deepseek/deepseek-v4.1-flash | 462 | 69 % |
| reponse | deepseek/deepseek-v4.1-flash-1017 | 312 | 58 % |
| reponse | z-ai/glm-5.3-flash | 171 | 7 % |
| discussion | anthropic/claude-haiku-5.5 | 1174 | 51 % |
| discussion | anthropic/claude-sonnet-5.5 | 678 | 7 % |
| discussion | deepseek/deepseek-v4.1-flash | 964 | 40 % |
| discussion | deepseek/deepseek-v4.1-flash-1017 | 709 | 37 % |
| discussion | z-ai/glm-5.3-flash | 346 | 14 % |

## Temps de réponse (secondes)

| étape | modèle | médiane | 9e décile |
|---|---|---|---|
| reponse | anthropic/claude-haiku-5.5 | 4.8 | 5.8 |
| reponse | anthropic/claude-sonnet-5.5 | 2.6 | 3.4 |
| reponse | deepseek/deepseek-v4.1-flash | 3.6 | 4.9 |
| reponse | deepseek/deepseek-v4.1-flash-1017 | 2.7 | 3.7 |
| reponse | z-ai/glm-5.3-flash | 1.6 | 2.6 |
| discussion | anthropic/claude-haiku-5.5 | 10.1 | 18.3 |
| discussion | anthropic/claude-sonnet-5.5 | 6.1 | 13.0 |
| discussion | deepseek/deepseek-v4.1-flash | 7.5 | 39.1 |
| discussion | deepseek/deepseek-v4.1-flash-1017 | 5.0 | 7.1 |
| discussion | z-ai/glm-5.3-flash | 3.8 | 21.2 |