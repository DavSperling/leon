# Annexe 7 : la mesure de l'ancrage (T38)

19 novembre 2026 · Amos (avec Claude) · annexe de l'[étude mémoire des sessions](../README.md), lot 11 du [plan](../../../plans/2026-11-02-memoire-sessions.md) (T38)

> Mesure faite le 19/11, sur la mémoire réelle d'Amos en production (`leonmemory.com`, compte de l'espace Leon) : 393 sessions de Claude Code sur ce dépôt, rangées en 58 fils. Ces sessions ont été importées le jour même, sans résumé (l'usage `resume` n'était accepté que depuis ce jour-là), et 199 des 202 sessions qui ont des faits sont marquées externes.
>
> Le script est [`essais/mesure-ancrage.mjs`](../essais/mesure-ancrage.mjs), et les dix tâches sont dans [`essais/mesure-ancrage-taches.json`](../essais/mesure-ancrage-taches.json).

## Verdict

**Sur ces dix tâches, la mémoire ne change presque pas la justesse, et un peu le coût. Mais aucun agent ne l'a lue.**

- **Justesse.**
  - Sans mémoire : 8 réponses justes sur 10, et 2 réponses appuyées sur un fait faux ou dépassé.
  - Avec le bloc de démarrage : 9 sur 10, et aucune réponse appuyée sur un fait dépassé.
  - Avec le bloc et le rappel : 9 sur 10, et aucune non plus.

  Le seul écart net : sans mémoire, l'agent s'est deux fois appuyé sur un fait faux ou dépassé. Avec la mémoire, il ne l'a fait aucune fois.
- **Coût.**
  - Avec le seul bloc, environ 10 % de tokens et 9 % de temps en moins que sans mémoire, au total des dix tâches.
  - Avec le bloc et le rappel, on revient au niveau sans mémoire.
  - Le bloc lui-même coûte peu : sur la tâche témoin, il ajoute 1 à 2 centimes à l'essai, et l'écart disparaît dans le bruit à la mesure.
- **Aucune lecture.** Le bloc dit à l'agent de « lire le fil de ta tâche ». Aucun des 20 passages qui l'ont reçu ne l'a fait : le serveur n'a noté aucune lecture pendant la mesure (`read_log`). La mémoire n'a donc joué que par ce que le bloc et le rappel montrent d'eux-mêmes, c'est-à-dire les clés des fils.

Avec un seul passage par tâche et par cas, et dix tâches, aucun de ces écarts n'est solide statistiquement. Ils donnent une direction, pas une preuve.

## Ce que la mesure établit

| Point du plan (T38) | Résultat |
|---|---|
| 10 tâches réelles, dans trois cas | Fait : six tâches à coder, quatre questions, dont une tâche témoin (t06) où la mémoire ne devait rien apporter. |
| Notées sans savoir le cas : juste, faux, ou ancré sur un résumé périmé | Fait, mais par Claude et non par Amos, à sa demande (voir la méthode). |
| Tokens et durée, avec et sans la mémoire | Fait (tableaux ci-dessous). |
| Le modèle, l'outil et l'effort, identiques par tâche (amendé le 18/11) | Claude Code 2.1.326, `claude-opus-5-5`, effort `medium`, pour les 30 passages. |
| Qui ouvre un fil ou le dossier, par quel outil | Personne : aucune lecture. |
| Les compteurs du serveur (versions écrites, conflits, restaurations, états masqués) | Rien à compter : la mesure n'écrit rien dans la mémoire. |
| La part de sessions externes | 199 sur 202 sessions avec des faits, sur ce dépôt. |
| Le seuil de proximité des fils, le seuil du rappel | Non réglés : la mesure n'en donne aucun cas utile (voir « Ce qui reste »). |
| Garder 5 tâches pour T62 | t01, t03, t06, t08 et t09. |
| Le budget retenu, la recommandation pour T36 (niveau 3, D28) | Voir la conclusion. |

## La méthode

**Les trois cas.** Chaque tâche tourne trois fois, avec Claude Code en mode non interactif (`claude -p`) :
- **A, sans mémoire** : ni bloc, ni rappel, et les commandes de Leon refusées ;
- **B, avec le bloc** : le crochet de démarrage que pose l'installation (`leon briefing`) ;
- **C, avec le bloc et le rappel** : les crochets de démarrage et de message (`leon reminder`).

Une sonde à bas coût a vérifié avant la mesure que chaque cas reçoit bien ce qu'il doit, et rien d'autre.

**L'isolement.**
- Chaque passage tourne dans un clone jetable du dépôt, au commit `4253a0d`, avec l'adresse GitHub du dépôt (la clé du projet de Leon) et le push coupé.
- Les réglages de l'utilisateur ne sont pas lus (`--setting-sources project,local`), ni ses serveurs MCP (`--strict-mcp-config`). Le crochet de fin n'est jamais posé : aucun passage n'est capté, et la mémoire reste la même pour les trente.
- L'agent n'a qu'une liste fermée d'outils : lecture et écriture des fichiers du clone, contrôle des types, tests unitaires, lint, lecture de git, et, en B et C, les commandes de lecture de Leon.
- Il travaille dans le bac à sable de Claude Code : réseau coupé sauf pour ces commandes, écriture limitée au clone. `leon note`, le web et la lecture des secrets du poste sont refusés.

**Les tâches.** Dix points ouverts réels du dépôt, validés par Amos :
- **six à coder** : `leon note` sur l'entrée standard, l'alerte quand Leon refuse les envois, le rappel qui ignore les messages automatiques, l'import qui lit la configuration MCP, les textes d'accord sur l'administrateur, et le témoin ;
- **quatre questions** : la #208, qui lit les coulisses, vérifier une migration sans Railway, et la suite du lot 15.

Chaque tâche porte une description de la bonne réponse, écrite avant la mesure.

**Les vérifications objectives.** Pour chaque tâche à coder et chaque cas, le contrôle des types et les fichiers de test touchés par le patch ont été lancés sous `sandbox-exec`, sans réseau. Les 18 patchs passent les deux.

**La notation.** Amos a demandé que Claude note, parce qu'il n'avait pas écrit le code à juger. La notation se fait à l'aveugle :
- les trois réponses d'une tâche sont mélangées et nommées X, Y et Z, et la correspondance reste hors de portée des correcteurs ;
- deux correcteurs indépendants (Opus) notent chaque réponse. Ils vérifient chaque affirmation dans le dépôt au commit mesuré, et donnent un verdict (juste, faux, ancré sur un fait périmé) et une note de 0 à 4 ;
- un arbitre tranche là où ils divergent sur le verdict, ou de deux points sur la note. C'est arrivé une fois, pour t03.

## Les résultats

**Par tâche** (verdict et note sur 4, après arbitrage) :

| Tâche | A, sans mémoire | B, bloc | C, bloc et rappel |
|---|---|---|---|
| t01 `leon note` sur l'entrée standard | juste 3,5 | juste 3,5 | juste 3,5 |
| t02 alerte quand Leon refuse les envois | juste 4 | juste 3 | juste 3 |
| t03 le rappel ignore les messages automatiques | **ancré 3** | juste 3 | juste 4 |
| t04 l'import lit la configuration MCP | juste 3 | juste 4 | juste 4 |
| t05 les textes d'accord sur l'administrateur | juste 4 | juste 2 | juste 3 |
| t06 témoin, adresse SSH à port inhabituel | juste 4 | juste 4 | juste 4 |
| t07 la #208 | juste 4 | juste 4 | juste 4 |
| t08 qui lit les coulisses et les notes | juste 4 | juste 3 | juste 3 |
| t09 vérifier une migration sans Railway | **ancré 1** | **faux 2** | **faux 2** |
| t10 la suite du lot 15 | juste 3 | juste 3 | juste 4 |

**Par cas** :

| Cas | Justes | Faux | Ancrés sur un fait périmé | Note moyenne | Durée totale | Tokens totaux | Coût (tarif API) |
|---|---|---|---|---|---|---|---|
| A, sans mémoire | 8/10 | 0 | 2 | 3,35 | 1 000 s | 10,7 M | 7,60 $ |
| B, bloc | 9/10 | 1 | 0 | 3,15 | 912 s | 9,6 M | 6,88 $ |
| C, bloc et rappel | 9/10 | 1 | 0 | 3,45 | 957 s | 11,2 M | 7,48 $ |

Les tokens comptent surtout le contexte relu depuis le cache. Les tâches à coder pèsent 85 % du total. Sur les quatre questions, les trois cas prennent entre 20 et 45 secondes par passage.

## Les constats

1. **Sans mémoire, l'agent s'appuie plus souvent sur un fait faux.**
   - En t03, il a affirmé que Cursor n'a « pas de signature connue » des messages injectés. C'est faux au commit mesuré (`INJECTED_STARTS`, `cursor.ts`), et il a laissé Cursor sans filtre.
   - En t09, il a donné `0069` comme dernière migration, alors que c'est `0074`. Une prod bloquée en 0069 serait alors jugée à jour.

   Aucune réponse avec la mémoire n'a fait ce genre d'erreur. C'est le seul effet net de la mesure, et il porte sur deux cas.
2. **Le moyen de suivre un déploiement n'est connu que de la mémoire, et personne ne l'a lu (t09).** Les déploiements GitHub et leurs statuts n'apparaissent que dans les sessions passées. Aucun des trois cas ne les cite, et B et C affirment même qu'aucun moyen direct n'existe. Une lecture du fil aurait donné la réponse : c'est la perte la plus claire du fait que personne ne lit.
3. **La consigne de lecture n'est pas suivie.** Le bloc liste 8 fils et dit de lire celui de la tâche. Sur 20 passages, aucun ne l'a fait, et aucune réponse ne cite le bloc ni ne dit avoir lu un fil. Dans ces sessions, la branche était neuve (`mesure/…`) et aucun fil ne lui correspondait : la consigne ne désignait aucun fil évident. C'est un cas fréquent, celui d'une nouvelle tâche.
4. **Le rappel n'apporte rien de mesurable ici,** et il coûte des tours (C fait autant de tokens que A). Le 19/11, il s'est aussi déclenché sur des messages automatiques, comme les événements d'Auto-fix, en citant des fils sans rapport : c'est justement la tâche t03.
5. **La tâche témoin (t06) donne le même verdict dans les trois cas.** Son coût varie d'un passage à l'autre plus que du fait du bloc. À l'essai, le bloc ajoutait 1 à 2 centimes. À la mesure, A a coûté 0,48 $, B 0,28 $ et C 0,25 $.
6. **Les patchs sont tous valides.** Les écarts de note viennent de la complétude. Par exemple, en t05, le cas B n'a mis à jour qu'une partie des textes, et le cas A les a tous mis à jour.

## Les limites

- **Un seul passage par tâche et par cas.** Le hasard du modèle suffit à expliquer des écarts d'un point de note ou de 30 % de durée.
- **Une IA a noté des IA**, même à l'aveugle, avec deux correcteurs et un arbitre qui vérifient dans le dépôt. Les justifications sont gardées avec les notes (`~/leon-mesure/notes.json`, hors du dépôt).
- **Une mémoire jeune et pauvre.** Les sessions ont été importées le jour même, sans résumé, et presque toutes sont marquées externes : l'état des fils ne garde alors que leurs clés. Une mémoire de quelques semaines, avec `resume`, donnera plus.
- **Le mode non interactif et une branche neuve,** donc aucun fil de la branche à lire. Une session interactive sur une branche qui a déjà son fil se comporterait sans doute autrement.
- **Ce qui manque à l'agent mesuré.**
  - La liste fermée des commandes a refusé quelques suites de commandes (`python3`, `perl`, `for …`), dans les trois cas ; l'agent a trouvé un autre moyen.
  - La règle qui protège les secrets a aussi empêché de relire les grosses sorties d'outils, que Claude Code range sous `~/.claude/projects` (t05, B et C).
  - L'agent n'avait pas le MCP de Leon.
- **Une partie des réponses est aussi dans le dépôt.** Les messages de commit et le plan décrivent t07 et t10 : la mémoire y joue surtout sur le temps.

## La conclusion

- **Le budget retenu : celui d'aujourd'hui.** Le bloc coûte quelques centimes par session au plus, et ne gêne rien. La mesure ne donne aucune raison de le réduire ni de l'agrandir.
- **Le niveau 3 (D28) : pas encore de pousser plus de texte d'office.** La recommandation pour T36, à trancher par Amos : l'agent ne lit pas ce qu'on lui montre déjà. Avant tout passage obligé, il faut réécrire la consigne de lecture pour dire à quoi sert la mémoire (« reprendre là où l'outil précédent s'est arrêté, sans refaire ce qui a échoué ») plutôt que comment s'en servir. C'était aussi la conclusion de l'article d'Anthropic du 6/11. Il faut ensuite mesurer la part de sessions qui lisent. Si elle reste nulle, le niveau 3 se justifie, par exemple en mettant d'office l'état du fil de la branche dans le bloc.
- **Les sessions externes** effacent presque tout le récit de la mémoire : 199 sessions sur 202. L'import ne lit pas la configuration MCP : c'est la tâche t04, dont les trois patchs de la mesure sont justes et peuvent servir de départ. Et les anciennes sessions datent d'avant la règle des sous-agents. Les corriger rendrait l'état des fils bien plus riche.

## La consigne réécrite ne suffit pas (19/11, après #213)

Décision d'Amos du 19/11 : la consigne dit désormais à quoi sert la mémoire avant de dire comment la lire (#213, D28 amendée). Le cas B a été refait sur les dix tâches, une fois #213 déployée, au même réglage et au même commit.
- Une sonde a d'abord vérifié que la nouvelle consigne arrive bien à l'agent : elle la recopie mot pour mot.
- **Aucune lecture, comme avant** : `read_log` est vide sur la fenêtre de la mesure (21 h 21 à 21 h 28 UTC). Aucune réponse ne cite un fil, et aucune commande de Leon n'a été tentée.
- La durée et les tokens sont du même ordre que le cas B de la première mesure (820 s et 9,4 M, contre 912 s et 9,6 M).

**Conclusion.** En mode non interactif, sur une branche neuve et avec une consigne de tâche précise, l'agent ne va pas lire sa mémoire, qu'on lui dise comment ou pourquoi. D'après D28 amendée, le niveau 3 se conçoit donc : un lot à part, en option éteinte par défaut, avec son propre accord. Une limite reste : une session interactive sur une branche qui a déjà son fil n'est pas mesurée ici.

Les sorties de ce passage sont sous `~/leon-mesure-consigne`, hors du dépôt.

## Ce qui reste

- **Refaire t01, t03, t06, t08 et t09 après le rêve (T62)**, au même réglage et au même commit :
  ```bash
  node essais/mesure-ancrage.mjs lancer --taches t01,t03,t06,t08,t09 --commit 4253a0d4fa4023e9ebd8d43a3c24bbf80c4d02cb
  ```
  puis `verifier`, puis `dossier` pour la notation. Le même commit compte pour deux raisons. Seule la mémoire change entre les deux mesures. Et ce commit précède cette annexe et le fichier des tâches, qui portent les bonnes réponses : un clone de `main` les mettrait sous les yeux de l'agent.
- **Régler les deux seuils** sur de vrais cas :
  - le seuil de proximité des fils, qui demande des résumés, donc des sessions captées avec `resume` ;
  - le seuil du rappel, avec ses faux positifs sur les messages automatiques.
- **L'essai de bout en bout (T37)** dans Claude Code, Codex, Cursor et Antigravity, avec Amos.

## Remise en état

Les clones de la mesure (`~/leon-mesure/clones`) et la copie de référence du dépôt sont supprimés. Restent sur le poste d'Amos, hors du dépôt, sous `~/leon-mesure` :
- les sorties de chaque passage : réponse, patch, tokens, vérifications ;
- la correspondance X, Y, Z ;
- les notes et leurs justifications.

Ils servent de référence pour T62. Aucun passage n'a été capté par Leon, et aucune note n'a été écrite dans la mémoire.
