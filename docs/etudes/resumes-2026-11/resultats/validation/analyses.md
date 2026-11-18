# Analyses sans modèle (générées par banc/analyses.ts)

## Sorties dans la mauvaise langue

Comptées seulement sur les sorties en prose d'au moins 15 mots, hors « rien à retenir ».

| étape | modèle | cas anglais mal écrits | cas français mal écrits |
|---|---|---|---|
| point | anthropic/claude-haiku-5.5 | 0/4 | 0/4 |
| point | anthropic/claude-sonnet-5.5 | 0/4 | 0/4 |
| point | deepseek/deepseek-v4.1-flash | 0/4 | 0/4 |
| point | deepseek/deepseek-v4.1-flash-1017 | 0/4 | 0/4 |
| point | moonshotai/kimi-k3.1-pro | 0/4 | 0/4 |
| point | openai/gpt-6.2-sol | 0/4 | 0/4 |
| point | z-ai/glm-5.3-flash | 0/4 | 0/4 |
| resume | anthropic/claude-haiku-5.5 | 1/4 | 0/3 |
| resume | anthropic/claude-sonnet-5.5 | 0/4 | 0/3 |
| resume | deepseek/deepseek-v4.1-flash | 0/4 | 0/3 |
| resume | deepseek/deepseek-v4.1-flash-1017 | 0/3 | 0/3 |
| resume | z-ai/glm-5.3-flash | 0/4 | 0/3 |
| fil | anthropic/claude-haiku-5.5 | 0/3 | 0/3 |
| fil | anthropic/claude-sonnet-5.5 | 0/3 | 0/3 |
| fil | deepseek/deepseek-v4.1-flash | 0/3 | 0/3 |
| fil | deepseek/deepseek-v4.1-flash-1017 | 0/3 | 0/3 |
| fil | xiaomi/mimo-v2.6-flash | 0/3 | 0/3 |
| fil | z-ai/glm-5.3-flash | 0/3 | 0/3 |
| reponse | anthropic/claude-haiku-5.5 | 2/5 | 0/5 |
| reponse | anthropic/claude-sonnet-5.5 | 4/4 | 0/5 |
| reponse | deepseek/deepseek-v4.1-flash | 0/4 | 0/4 |
| reponse | deepseek/deepseek-v4.1-flash-1017 | 0/5 | 0/4 |
| reponse | z-ai/glm-5.3-flash | 4/4 | 0/5 |
| discussion | anthropic/claude-haiku-5.5 | 0/4 | 0/4 |
| discussion | anthropic/claude-sonnet-5.5 | 1/4 | 0/4 |
| discussion | deepseek/deepseek-v4.1-flash | 1/4 | 0/2 |
| discussion | deepseek/deepseek-v4.1-flash-1017 | 0/4 | 0/3 |
| discussion | moonshotai/kimi-k3.1-pro | 0/4 | 0/4 |
| discussion | openai/gpt-6.2-sol | 0/4 | 0/4 |
| discussion | z-ai/glm-5.3-flash | 0/4 | 0/4 |

## Résumé de session : décisions perdues à la borne du serveur

Une décision « valable » cite une source qui peut la prouver (PR, commit, message tapé par la personne). Série v1 : le serveur gardait le paragraphe, puis les lignes dans l'ordre du modèle, jusqu'à 1 200 caractères ; les décisions, écrites en dernier, tombaient les premières. Depuis v2 : 1 500 caractères, décisions gardées d'abord. La dernière colonne compte les résumés plus longs que les 1 200 caractères demandés par le prompt.

| modèle | décisions valables écrites | gardées | perdues à la borne | résumés de plus de 1 200 caractères (brut) |
|---|---|---|---|---|
| anthropic/claude-haiku-5.5 | 23 | 23 | 0 | 1/9 |
| anthropic/claude-sonnet-5.5 | 17 | 17 | 0 | 0/9 |
| deepseek/deepseek-v4.1-flash | 25 | 25 | 0 | 4/9 |
| deepseek/deepseek-v4.1-flash-1017 | 25 | 25 | 0 | 1/8 |
| z-ai/glm-5.3-flash | 18 | 18 | 0 | 3/9 |

### Si le serveur gardait les décisions d'abord

Même réponse du modèle, même filtre du serveur, seules les lignes [décision] remontées sous le paragraphe. Longueur brute : médiane des réponses avant le filtre.

| modèle | décisions gardées (aujourd'hui → d'abord) | [prochaine-étape] gardées (aujourd'hui → d'abord) | longueur brute médiane |
|---|---|---|---|
| anthropic/claude-haiku-5.5 | 23 → 23 | 11 → 11 | 1056 |
| anthropic/claude-sonnet-5.5 | 17 → 17 | 17 → 17 | 1100 |
| deepseek/deepseek-v4.1-flash | 25 → 25 | 11 → 11 | 1188 |
| deepseek/deepseek-v4.1-flash-1017 | 25 → 25 | 11 → 11 | 1177 |
| z-ai/glm-5.3-flash | 18 → 18 | 16 → 16 | 1127 |

## Part de la réflexion dans les jetons de sortie

| étape | modèle | jetons de sortie (moyenne) | dont réflexion |
|---|---|---|---|
| point | anthropic/claude-haiku-5.5 | 2411 | 79 % |
| point | anthropic/claude-sonnet-5.5 | 595 | 0 % |
| point | deepseek/deepseek-v4.1-flash | 3012 | 89 % |
| point | deepseek/deepseek-v4.1-flash-1017 | 1772 | 77 % |
| point | moonshotai/kimi-k3.1-pro | 883 | 61 % |
| point | openai/gpt-6.2-sol | 323 | 19 % |
| point | z-ai/glm-5.3-flash | 533 | 24 % |
| resume | anthropic/claude-haiku-5.5 | 1509 | 72 % |
| resume | anthropic/claude-sonnet-5.5 | 419 | 0 % |
| resume | deepseek/deepseek-v4.1-flash | 1312 | 76 % |
| resume | deepseek/deepseek-v4.1-flash-1017 | 710 | 61 % |
| resume | z-ai/glm-5.3-flash | 302 | 3 % |
| fil | anthropic/claude-haiku-5.5 | 2300 | 67 % |
| fil | anthropic/claude-sonnet-5.5 | 735 | 0 % |
| fil | deepseek/deepseek-v4.1-flash | 1888 | 69 % |
| fil | deepseek/deepseek-v4.1-flash-1017 | 1414 | 54 % |
| fil | xiaomi/mimo-v2.6-flash | 1506 | 63 % |
| fil | z-ai/glm-5.3-flash | 777 | 8 % |
| agenda | anthropic/claude-haiku-5.5 | 2857 | 84 % |
| agenda | anthropic/claude-sonnet-5.5 | 728 | 0 % |
| agenda | deepseek/deepseek-v4.1-flash | 3206 | 92 % |
| agenda | deepseek/deepseek-v4.1-flash-1017 | 3103 | 91 % |
| agenda | openai/gpt-6-luna | 698 | 52 % |
| agenda | z-ai/glm-5.3-flash | 721 | 52 % |
| reponse | anthropic/claude-haiku-5.5 | 612 | 66 % |
| reponse | anthropic/claude-sonnet-5.5 | 250 | 0 % |
| reponse | deepseek/deepseek-v4.1-flash | 347 | 60 % |
| reponse | deepseek/deepseek-v4.1-flash-1017 | 332 | 57 % |
| reponse | z-ai/glm-5.3-flash | 182 | 10 % |
| discussion | anthropic/claude-haiku-5.5 | 1106 | 49 % |
| discussion | anthropic/claude-sonnet-5.5 | 770 | 10 % |
| discussion | deepseek/deepseek-v4.1-flash | 833 | 41 % |
| discussion | deepseek/deepseek-v4.1-flash-1017 | 754 | 35 % |
| discussion | moonshotai/kimi-k3.1-pro | 712 | 39 % |
| discussion | openai/gpt-6.2-sol | 373 | 0 % |
| discussion | z-ai/glm-5.3-flash | 357 | 15 % |

## Temps de réponse (secondes)

| étape | modèle | médiane | 9e décile |
|---|---|---|---|
| point | anthropic/claude-haiku-5.5 | 13.5 | 18.2 |
| point | anthropic/claude-sonnet-5.5 | 5.0 | 5.8 |
| point | deepseek/deepseek-v4.1-flash | 18.7 | 40.9 |
| point | deepseek/deepseek-v4.1-flash-1017 | 12.6 | 20.0 |
| point | moonshotai/kimi-k3.1-pro | 8.4 | 18.0 |
| point | openai/gpt-6.2-sol | 3.9 | 4.7 |
| point | z-ai/glm-5.3-flash | 5.0 | 19.8 |
| resume | anthropic/claude-haiku-5.5 | 7.9 | 14.1 |
| resume | anthropic/claude-sonnet-5.5 | 4.0 | 5.1 |
| resume | deepseek/deepseek-v4.1-flash | 7.7 | 16.1 |
| resume | deepseek/deepseek-v4.1-flash-1017 | 5.8 | 8.1 |
| resume | z-ai/glm-5.3-flash | 3.3 | 5.1 |
| fil | anthropic/claude-haiku-5.5 | 11.2 | 15.3 |
| fil | anthropic/claude-sonnet-5.5 | 5.3 | 5.7 |
| fil | deepseek/deepseek-v4.1-flash | 8.9 | 16.6 |
| fil | deepseek/deepseek-v4.1-flash-1017 | 8.5 | 11.5 |
| fil | xiaomi/mimo-v2.6-flash | 11.5 | 66.6 |
| fil | z-ai/glm-5.3-flash | 8.8 | 13.6 |
| agenda | anthropic/claude-haiku-5.5 | 15.7 | 19.3 |
| agenda | anthropic/claude-sonnet-5.5 | 3.3 | 7.0 |
| agenda | deepseek/deepseek-v4.1-flash | 14.4 | 25.5 |
| agenda | deepseek/deepseek-v4.1-flash-1017 | 14.1 | 35.3 |
| agenda | openai/gpt-6-luna | 10.1 | 12.2 |
| agenda | z-ai/glm-5.3-flash | 3.9 | 5.8 |
| reponse | anthropic/claude-haiku-5.5 | 4.1 | 6.1 |
| reponse | anthropic/claude-sonnet-5.5 | 2.5 | 2.9 |
| reponse | deepseek/deepseek-v4.1-flash | 2.7 | 4.1 |
| reponse | deepseek/deepseek-v4.1-flash-1017 | 2.8 | 3.5 |
| reponse | z-ai/glm-5.3-flash | 2.2 | 3.1 |
| discussion | anthropic/claude-haiku-5.5 | 9.5 | 14.2 |
| discussion | anthropic/claude-sonnet-5.5 | 5.8 | 16.0 |
| discussion | deepseek/deepseek-v4.1-flash | 7.3 | 16.8 |
| discussion | deepseek/deepseek-v4.1-flash-1017 | 9.0 | 15.4 |
| discussion | moonshotai/kimi-k3.1-pro | 8.8 | 33.9 |
| discussion | openai/gpt-6.2-sol | 6.8 | 9.9 |
| discussion | z-ai/glm-5.3-flash | 6.0 | 12.0 |