# Analyses sans modèle (générées par banc/analyses.ts)

## Sorties dans la mauvaise langue

Comptées seulement sur les sorties en prose d'au moins 15 mots, hors « rien à retenir ».

| étape | modèle | cas anglais mal écrits | cas français mal écrits |
|---|---|---|---|
| point | anthropic/claude-haiku-5.5 | 1/6 | 0/4 |
| point | anthropic/claude-haiku-5.5@ouvert-dabord | 0/5 | 0/4 |
| point | cohere/command-a-plus | 1/2 | 0/1 |
| point | deepseek/deepseek-v4.1-flash | 0/5 | 0/4 |
| point | deepseek/deepseek-v4.1-flash-1017 | 0/5 | 0/4 |
| point | deepseek/deepseek-v4.1-flash-1017@ouvert-dabord | 0/5 | 0/4 |
| point | inclusionai/ling-3.1-flash | 0/2 | 0/0 |
| point | minimax/minimax-m3.1-flash | 0/5 | 0/4 |
| point | nvidia/nemotron-3.5-super-vl | 0/5 | 0/2 |
| point | openai/gpt-6-luna | 0/5 | 0/4 |
| point | qwen/qwen3.7-flash | 0/5 | 0/4 |
| point | qwen/qwen3.7-plus | 0/5 | 0/4 |
| point | tencent/hy4-flash | 0/1 | 0/2 |
| point | xiaomi/mimo-v2.6-flash | 1/6 | 0/4 |
| point | xiaomi/mimo-v2.6-pro | 0/5 | 0/3 |
| point | z-ai/glm-5.3 | 0/5 | 0/4 |
| point | z-ai/glm-5.3-flash | 0/5 | 0/4 |
| point | z-ai/glm-5.3-flash@ouvert-dabord | 0/5 | 0/4 |
| point | z-ai/glm-5.3-flashx | 0/5 | 0/4 |
| resume | anthropic/claude-haiku-5.5 | 0/6 | 0/3 |
| resume | cohere/command-a-plus | 0/3 | 0/2 |
| resume | deepseek/deepseek-v4.1-flash | 0/6 | 0/3 |
| resume | deepseek/deepseek-v4.1-flash-1017 | 0/6 | 0/3 |
| resume | inclusionai/ling-3.1-flash | 0/3 | 0/2 |
| resume | minimax/minimax-m3.1-flash | 0/1 | 0/4 |
| resume | nvidia/nemotron-3.5-super-vl | 0/5 | 0/2 |
| resume | openai/gpt-6-luna | 0/4 | 0/3 |
| resume | qwen/qwen3.7-flash | 0/6 | 0/3 |
| resume | qwen/qwen3.7-plus | 0/6 | 0/3 |
| resume | tencent/hy4-flash | 0/2 | 0/0 |
| resume | xiaomi/mimo-v2.6-flash | 0/6 | 0/3 |
| resume | xiaomi/mimo-v2.6-pro | 0/6 | 0/3 |
| resume | z-ai/glm-5.3 | 0/6 | 0/3 |
| resume | z-ai/glm-5.3-flash | 0/6 | 0/3 |
| resume | z-ai/glm-5.3-flashx | 0/6 | 0/3 |
| fil | anthropic/claude-haiku-5.5 | 0/4 | 0/2 |
| fil | cohere/command-a-plus | 2/3 | 0/1 |
| fil | deepseek/deepseek-v4.1-flash | 0/3 | 0/2 |
| fil | deepseek/deepseek-v4.1-flash-1017 | 0/4 | 0/2 |
| fil | inclusionai/ling-3.1-flash | 0/4 | 0/2 |
| fil | minimax/minimax-m3.1-flash | 0/4 | 0/1 |
| fil | nvidia/nemotron-3.5-super-vl | 0/4 | 0/2 |
| fil | openai/gpt-6-luna | 0/4 | 0/2 |
| fil | qwen/qwen3.7-flash | 0/4 | 0/2 |
| fil | qwen/qwen3.7-plus | 0/4 | 0/1 |
| fil | tencent/hy4-flash | 0/1 | 0/0 |
| fil | xiaomi/mimo-v2.6-flash | 0/4 | 0/2 |
| fil | xiaomi/mimo-v2.6-pro | 0/4 | 0/1 |
| fil | z-ai/glm-5.3 | 0/4 | 0/2 |
| fil | z-ai/glm-5.3-flash | 0/4 | 0/2 |
| fil | z-ai/glm-5.3-flashx | 0/4 | 0/1 |

## Résumé de session : décisions perdues à la borne du serveur

Une décision « valable » cite une source qui peut la prouver (PR, commit, message tapé par la personne). Série v1 : le serveur gardait le paragraphe, puis les lignes dans l'ordre du modèle, jusqu'à 1 200 caractères ; les décisions, écrites en dernier, tombaient les premières. Depuis v2 : 1 500 caractères, décisions gardées d'abord. La dernière colonne compte les résumés plus longs que les 1 200 caractères demandés par le prompt.

| modèle | décisions valables écrites | gardées | perdues à la borne | résumés de plus de 1 200 caractères (brut) |
|---|---|---|---|---|
| anthropic/claude-haiku-5.5 | 16 | 16 | 0 | 2/9 |
| cohere/command-a-plus | 3 | 3 | 0 | 0/10 |
| deepseek/deepseek-v4.1-flash | 28 | 28 | 0 | 4/9 |
| deepseek/deepseek-v4.1-flash-1017 | 26 | 26 | 0 | 3/9 |
| inclusionai/ling-3.1-flash | 6 | 6 | 0 | 0/9 |
| minimax/minimax-m3.1-flash | 12 | 12 | 0 | 7/10 |
| nvidia/nemotron-3.5-super-vl | 7 | 7 | 0 | 0/9 |
| openai/gpt-6-luna | 9 | 9 | 0 | 0/9 |
| qwen/qwen3.7-flash | 13 | 13 | 0 | 0/9 |
| qwen/qwen3.7-plus | 5 | 5 | 0 | 0/9 |
| tencent/hy4 | 0 | 0 | 0 | 0/10 |
| tencent/hy4-flash | 3 | 3 | 0 | 0/9 |
| xiaomi/mimo-v2.6-flash | 24 | 24 | 0 | 1/9 |
| xiaomi/mimo-v2.6-pro | 25 | 25 | 0 | 3/9 |
| z-ai/glm-5.3 | 10 | 10 | 0 | 4/9 |
| z-ai/glm-5.3-flash | 16 | 16 | 0 | 6/9 |
| z-ai/glm-5.3-flashx | 20 | 20 | 0 | 3/9 |

### Si le serveur gardait les décisions d'abord

Même réponse du modèle, même filtre du serveur, seules les lignes [décision] remontées sous le paragraphe. Longueur brute : médiane des réponses avant le filtre.

| modèle | décisions gardées (aujourd'hui → d'abord) | [prochaine-étape] gardées (aujourd'hui → d'abord) | longueur brute médiane |
|---|---|---|---|
| anthropic/claude-haiku-5.5 | 16 → 16 | 15 → 15 | 1023 |
| cohere/command-a-plus | 3 → 3 | 4 → 4 | 586 |
| deepseek/deepseek-v4.1-flash | 28 → 28 | 12 → 12 | 1185 |
| deepseek/deepseek-v4.1-flash-1017 | 26 → 26 | 11 → 11 | 1150 |
| inclusionai/ling-3.1-flash | 6 → 6 | 7 → 7 | 689 |
| minimax/minimax-m3.1-flash | 12 → 12 | 2 → 2 | 1558 |
| nvidia/nemotron-3.5-super-vl | 7 → 7 | 9 → 9 | 861 |
| openai/gpt-6-luna | 9 → 9 | 8 → 8 | 759 |
| qwen/qwen3.7-flash | 13 → 13 | 9 → 9 | 898 |
| qwen/qwen3.7-plus | 5 → 5 | 10 → 10 | 822 |
| tencent/hy4 | 0 → 0 | 0 → 0 | 0 |
| tencent/hy4-flash | 3 → 3 | 3 → 3 | 0 |
| xiaomi/mimo-v2.6-flash | 24 → 24 | 13 → 13 | 1054 |
| xiaomi/mimo-v2.6-pro | 25 → 25 | 14 → 14 | 1142 |
| z-ai/glm-5.3 | 10 → 10 | 15 → 15 | 1167 |
| z-ai/glm-5.3-flash | 16 → 16 | 18 → 18 | 1305 |
| z-ai/glm-5.3-flashx | 20 → 20 | 18 → 18 | 1176 |

## Part de la réflexion dans les jetons de sortie

| étape | modèle | jetons de sortie (moyenne) | dont réflexion |
|---|---|---|---|
| point | anthropic/claude-haiku-5.5 | 2607 | 84 % |
| point | anthropic/claude-haiku-5.5@ouvert-dabord | 2420 | 84 % |
| point | cohere/command-a-plus | 7329 | 0 % |
| point | deepseek/deepseek-v4.1-flash | 2309 | 85 % |
| point | deepseek/deepseek-v4.1-flash-1017 | 2197 | 84 % |
| point | deepseek/deepseek-v4.1-flash-1017@ouvert-dabord | 1432 | 77 % |
| point | inclusionai/ling-3.1-flash | 6942 | 99 % |
| point | minimax/minimax-m3.1-flash | 1619 | 79 % |
| point | nvidia/nemotron-3.5-super-vl | 5805 | 97 % |
| point | openai/gpt-6-luna | 1267 | 88 % |
| point | qwen/qwen3.7-flash | 3394 | 92 % |
| point | qwen/qwen3.7-plus | 3970 | 95 % |
| point | tencent/hy4 | 7490 | 100 % |
| point | tencent/hy4-flash | 7602 | 99 % |
| point | xiaomi/mimo-v2.6-flash | 1670 | 80 % |
| point | xiaomi/mimo-v2.6-pro | 3498 | 90 % |
| point | z-ai/glm-5.3 | 451 | 19 % |
| point | z-ai/glm-5.3-flash | 682 | 51 % |
| point | z-ai/glm-5.3-flash@ouvert-dabord | 506 | 34 % |
| point | z-ai/glm-5.3-flashx | 396 | 14 % |
| resume | anthropic/claude-haiku-5.5 | 1292 | 69 % |
| resume | cohere/command-a-plus | 3148 | 0 % |
| resume | deepseek/deepseek-v4.1-flash | 1029 | 67 % |
| resume | deepseek/deepseek-v4.1-flash-1017 | 775 | 60 % |
| resume | inclusionai/ling-3.1-flash | 3426 | 95 % |
| resume | minimax/minimax-m3.1-flash | 458 | 15 % |
| resume | nvidia/nemotron-3.5-super-vl | 3406 | 95 % |
| resume | openai/gpt-6-luna | 250 | 30 % |
| resume | qwen/qwen3.7-flash | 3392 | 94 % |
| resume | qwen/qwen3.7-plus | 2743 | 93 % |
| resume | tencent/hy4 | 4000 | 100 % |
| resume | tencent/hy4-flash | 3518 | 98 % |
| resume | xiaomi/mimo-v2.6-flash | 343 | 16 % |
| resume | xiaomi/mimo-v2.6-pro | 791 | 60 % |
| resume | z-ai/glm-5.3 | 317 | 3 % |
| resume | z-ai/glm-5.3-flash | 352 | 4 % |
| resume | z-ai/glm-5.3-flashx | 345 | 8 % |
| fil | anthropic/claude-haiku-5.5 | 2470 | 72 % |
| fil | cohere/command-a-plus | 4685 | 0 % |
| fil | deepseek/deepseek-v4.1-flash | 1464 | 63 % |
| fil | deepseek/deepseek-v4.1-flash-1017 | 1256 | 54 % |
| fil | inclusionai/ling-3.1-flash | 5179 | 89 % |
| fil | minimax/minimax-m3.1-flash | 870 | 25 % |
| fil | nvidia/nemotron-3.5-super-vl | 3487 | 89 % |
| fil | openai/gpt-6-luna | 293 | 12 % |
| fil | qwen/qwen3.7-flash | 4035 | 90 % |
| fil | qwen/qwen3.7-plus | 3498 | 90 % |
| fil | tencent/hy4 | 6000 | 100 % |
| fil | tencent/hy4-flash | 5936 | 99 % |
| fil | xiaomi/mimo-v2.6-flash | 936 | 46 % |
| fil | xiaomi/mimo-v2.6-pro | 1719 | 66 % |
| fil | z-ai/glm-5.3 | 540 | 0 % |
| fil | z-ai/glm-5.3-flash | 694 | 18 % |
| fil | z-ai/glm-5.3-flashx | 500 | 3 % |

## Temps de réponse (secondes)

| étape | modèle | médiane | 9e décile |
|---|---|---|---|
| point | anthropic/claude-haiku-5.5 | 13.2 | 18.0 |
| point | anthropic/claude-haiku-5.5@ouvert-dabord | 11.6 | 20.0 |
| point | cohere/command-a-plus | 34.2 | 46.2 |
| point | deepseek/deepseek-v4.1-flash | 13.0 | 45.4 |
| point | deepseek/deepseek-v4.1-flash-1017 | 10.3 | 32.5 |
| point | deepseek/deepseek-v4.1-flash-1017@ouvert-dabord | 8.0 | 16.4 |
| point | inclusionai/ling-3.1-flash | 81.0 | 83.7 |
| point | minimax/minimax-m3.1-flash | 8.8 | 14.2 |
| point | nvidia/nemotron-3.5-super-vl | 13.3 | 25.6 |
| point | openai/gpt-6-luna | 17.5 | 23.0 |
| point | qwen/qwen3.7-flash | 38.0 | 50.1 |
| point | qwen/qwen3.7-plus | 62.1 | 102.6 |
| point | tencent/hy4 | 81.6 | 91.5 |
| point | tencent/hy4-flash | 57.1 | 67.1 |
| point | xiaomi/mimo-v2.6-flash | 39.3 | 52.5 |
| point | xiaomi/mimo-v2.6-pro | 66.9 | 183.4 |
| point | z-ai/glm-5.3 | 5.0 | 6.7 |
| point | z-ai/glm-5.3-flash | 4.8 | 11.9 |
| point | z-ai/glm-5.3-flash@ouvert-dabord | 4.9 | 12.6 |
| point | z-ai/glm-5.3-flashx | 3.8 | 5.7 |
| resume | anthropic/claude-haiku-5.5 | 7.1 | 9.0 |
| resume | cohere/command-a-plus | 16.1 | 20.5 |
| resume | deepseek/deepseek-v4.1-flash | 6.7 | 13.0 |
| resume | deepseek/deepseek-v4.1-flash-1017 | 4.1 | 11.0 |
| resume | inclusionai/ling-3.1-flash | 39.0 | 40.3 |
| resume | minimax/minimax-m3.1-flash | 3.3 | 7.3 |
| resume | nvidia/nemotron-3.5-super-vl | 7.5 | 10.4 |
| resume | openai/gpt-6-luna | 4.2 | 5.7 |
| resume | qwen/qwen3.7-flash | 33.1 | 40.4 |
| resume | qwen/qwen3.7-plus | 49.7 | 59.0 |
| resume | tencent/hy4 | 43.3 | 49.0 |
| resume | tencent/hy4-flash | 27.4 | 41.7 |
| resume | xiaomi/mimo-v2.6-flash | 4.3 | 34.8 |
| resume | xiaomi/mimo-v2.6-pro | 15.1 | 32.4 |
| resume | z-ai/glm-5.3 | 3.5 | 7.0 |
| resume | z-ai/glm-5.3-flash | 3.2 | 5.7 |
| resume | z-ai/glm-5.3-flashx | 3.4 | 5.1 |
| fil | anthropic/claude-haiku-5.5 | 10.9 | 13.5 |
| fil | cohere/command-a-plus | 25.2 | 32.9 |
| fil | deepseek/deepseek-v4.1-flash | 8.8 | 10.5 |
| fil | deepseek/deepseek-v4.1-flash-1017 | 8.4 | 13.0 |
| fil | inclusionai/ling-3.1-flash | 57.8 | 60.2 |
| fil | minimax/minimax-m3.1-flash | 3.3 | 7.6 |
| fil | nvidia/nemotron-3.5-super-vl | 7.7 | 8.7 |
| fil | openai/gpt-6-luna | 3.7 | 4.5 |
| fil | qwen/qwen3.7-flash | 38.2 | 42.0 |
| fil | qwen/qwen3.7-plus | 56.0 | 71.2 |
| fil | tencent/hy4 | 64.6 | 67.9 |
| fil | tencent/hy4-flash | 37.6 | 58.4 |
| fil | xiaomi/mimo-v2.6-flash | 22.1 | 36.2 |
| fil | xiaomi/mimo-v2.6-pro | 19.3 | 93.8 |
| fil | z-ai/glm-5.3 | 7.1 | 12.2 |
| fil | z-ai/glm-5.3-flash | 4.5 | 7.0 |
| fil | z-ai/glm-5.3-flashx | 4.1 | 4.4 |