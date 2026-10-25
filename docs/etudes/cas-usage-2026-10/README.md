# Cas d'usage de Leon : onze situations concrètes

25 octobre 2026 · David (avec Claude) · à relire par Amos

Le site n'est pas modifié. Cette étude propose des cas d'usage, et David choisit ceux à garder avant toute réécriture de `/cas-usage`. Les noms de personnes et de sociétés sont fictifs.

## En bref

- **Les cas du site se ressemblent parce qu'ils racontent deux histoires avec une seule mécanique.** Les deux histoires sont la promesse faite au client et le départ d'un collègue. La mécanique est toujours la même : on tape une question, Leon répond en citant. Six équipes se partagent trois démos.
- **Glean et Macro ne montrent pas des équipes, ils montrent des moments** : le standup, le vendredi à 16 h, l'incident, le premier jour sur un projet, la réponse à un client après un correctif.
- **Onze cas, chacun avec une personne, un moment et une question.** Six marchent déjà avec le code de `main`, cinq marchent en partie. Neuf concernent des équipes produit ou dev.
- **Décision de David (25/10)** : on garde les six équipes du site et on ajoute à côté les situations qui marchent déjà (§ 5).

## 1. Pourquoi les cas du site se ressemblent

Lu dans `src/components/site/content.ts` (équipes, démos) et `src/components/site/pages/cas-usage.tsx` (page ajoutée par la PR #46).

1. **Six équipes, trois démos.** La démo « promesse à ACME » sert à Direction et à Ventes, la démo « bug d'export » à Support et à Produit et tech, la démo « départ de Thomas » à Chefs de projet et à Arrivées (`DEMOS[0]`, `[1]` et `[2]`, réutilisées dans `TEAMS`). Quand on passe d'une équipe à l'autre, on revoit le même écran.
2. **Deux histoires reviennent partout.**
   - La promesse au client : c'est le titre de l'accueil, la page Direction (« qu'a-t-on promis à ce client »), Ventes (« qu'a demandé ce prospect ») et Chefs de projet (« qu'est-ce que le client a validé »).
   - Le départ d'un collègue : on le retrouve dans Direction (« le chef de projet qui vient de partir »), dans Chefs de projet (« que suivait Thomas »), dans le gain « les départs ne coûtent plus la mémoire » et dans la phrase d'accroche `depart`.
   - Direction et Chefs de projet racontent donc la même chose. La question `type:réunion depuis:7j` est d'ailleurs posée par les deux, et la page doit dédoublonner sa liste (`ALL_QUESTIONS` dans `cas-usage.tsx`).
3. **Une seule mécanique.** Chaque cas suit le même schéma : une question tapée, une réponse citée. Le site ne montre comme cas d'usage ni le point du matin, ni l'assistant de code qui interroge Leon par MCP, ni la capture des conversations d'IA. Ce sont pourtant les trois choses que Glean n'a pas (§ 2).
4. **Les « gains » décrivent des fonctions, pas ce que la personne gagne.** Les cartes parlent de citations, de filtres, de guillemets, de relève toutes les 15 minutes ou du lien vers l'original. On en compte dix-huit, et « la réponse citée » revient sous trois formes.
5. **Les questions n'ont pas de situation.** Prenez « où en est la négociation avec ACME ? » : on ne sait ni qui la pose, ni à quel moment, ni ce qu'il fera de la réponse. Les équipes ont été choisies pour couvrir l'organigramme, pas parce que ce sont celles qui souffrent le plus.

## 2. Ce que montrent Glean et Macro

### Glean

- **Huit agents pour les équipes dev** (février 2026) : revue de PR, traitement des commentaires de revue, résolution d'un ticket Jira, passage de la spec à la PR, accueil sur un projet (but, documents clés, tickets, parties du code, experts), documentation de mise en production (à partir des specs, des tickets et des changements fusionnés), auto-évaluation, standup généré à partir du travail de la veille. [Glean, 8 AI agents for software engineering teams](https://www.glean.com/blog/engineering-agents-feb-drop-2026)
- **Cas par secteur** : une PR rédigée pour le ticket PAY-1423, avec plan de test ; une note de changement technique (« ce qui change, qui est touché, prochaines étapes par équipe ») ; dans le conseil, la réutilisation d'anciennes propositions et le contrôle des avenants par rapport au contrat ; un point hebdomadaire sur la chaîne logistique. [Glean, use cases](https://www.glean.com/use-cases)
- **Un agent construit par un client** : chez Abnormal, le « Product Feedback Pulse » lit Jira et Gong pour un produit et une période, regroupe les retours par thème et envoie un résumé aux PM. [Abnormal, Product Feedback Pulse](https://abnormal.ai/transform/product-development/product-feedback-pulse)
- **La recherche d'experts** : « quand le document n'existe pas », Glean indique les collègues qui savent, d'après son graphe des personnes et de leur activité. [Glean docs, Knowledge Graph](https://docs.glean.com/security/knowledge-graph)
- **Ce que ses clients aiment** : la recherche unifiée qui respecte les droits, et l'accueil des nouveaux. Les agents ne sont presque jamais cités dans les avis (étude du 19/10, `~/Downloads/agents-glean-analyse.pdf`). En revanche, Glean n'ingère pas les conversations ChatGPT ou Claude ([annexe Glean](../concurrents-2026-10/annexes/01-glean.md), § 2).

### Macro

- **Mémoire** : elle est refaite chaque nuit à partir des mails, messages, tâches, documents et appels. Les appels vont à l'équipe par défaut. La documentation ne donne qu'un exemple de question : « what's the latest status of project alamo? ». [Macro docs, Unified memory](https://docs.macro.com/product/unified-memory)
- **Recettes proposées** [Macro docs, Recipes](https://docs.macro.com/AI/recipes) :
  - un point quotidien sur la boîte de réception (à répondre, pour information, en attente des autres), en semaine à 8 h ;
  - un récapitulatif d'équipe le vendredi à 16 h dans #general : tâches finies et commencées, décisions prises en appel, ce qui a glissé ;
  - un appel transformé en tâches ;
  - le résumé d'un fil pour quelqu'un qui arrive en cours de route ;
  - depuis Claude Code : trouver la tâche d'un bug, lire la discussion liée, passer la tâche en revue et poster le résumé du correctif, puis rédiger la réponse au client qui explique ce correctif.
- **Page d'accueil** : une relance rédigée à partir de la transcription d'une démo, des étapes du CRM mises à jour à partir des mails, des agents de code dans les canaux. [macro.com](https://macro.com)

### Ce qu'on en retient

- **Des moments plutôt que des équipes.** Les deux montrent un moment précis (lundi à 8 h, vendredi à 16 h, après l'appel, avant la revue), avec un livrable : un point, une liste, un brouillon.
- **Les cas qui tiennent croisent plusieurs outils** (famille A de l'étude du 19/10). Ceux de Macro qui écrivent dans les outils (créer des tâches, changer une étape du CRM) supposent de posséder les données. Leon lit ; il n'écrit pas.
- **Aucun des deux ne montre « retrouver ce qu'on a fait avec son assistant d'IA ».** C'est le cas le plus propre à Leon (cas 3).

## 3. Les onze cas

| # | Qui | Le moment | Aujourd'hui |
|---|---|---|---|
| 1 | Développeuse | Lundi 9 h, elle rouvre le dépôt | Fait |
| 2 | Développeur et son assistant de code | Avant de réécrire un module | Fait, si l'assistant pense à demander |
| 3 | PM | Refaire une analyse trouvée avec ChatGPT il y a un mois | Fait |
| 4 | Développeuse d'astreinte | 22 h, une erreur Sentry sur un module inconnu | Fait |
| 5 | Chargé de support | Troisième relance d'un client sur un bug | Fait |
| 6 | PM | La veille de la revue de roadmap | En partie |
| 7 | Tech lead | Après une revue de conception | En partie |
| 8 | Développeur qui arrive | Deuxième semaine, affecté à un module | En partie |
| 9 | CTO | Vendredi 16 h, avant le comité de direction | En partie |
| 10 | CTO | Un prospect envoie 120 questions de sécurité | En partie |
| 11 | Responsable succès client | 30 jours avant un renouvellement | Fait |

« Fait » veut dire que le code de `main` le permet. Ça ne veut pas dire que c'est essayé chez un client : au 25/10, seuls les connecteurs Gmail et Drive sont marqués essayés avec un vrai compte (`triedForReal` dans les `catalog.ts`).

### Cas 1 : Reprendre lundi là où on s'était arrêté

- **Qui** : une développeuse back-end, dans un éditeur SaaS de 25 personnes. Elle code avec Claude Code.
- **La situation** : lundi à 9 h, elle rouvre le dépôt `facturation`. Vendredi, elle a laissé une migration à moitié faite dans une session Claude Code. Depuis, un collègue a commenté sa PR et une issue liée a été rouverte.
- **Ce que fait Leon** : dès que la session s'ouvre, le point du matin du projet est dans Claude Code. Il dit ce qu'elle a fait dans ses dernières sessions, ce qui a bougé sur le dépôt depuis (PR, revues, issues), quels messages la mentionnent et ce qui reste ouvert, avec les liens.
- **Ce que Leon lit** : ses sessions Claude Code (privées), les PR, revues et issues du dépôt GitHub, et les passages qui la mentionnent.
- **Ce qu'elle gagne** : elle et son assistant repartent du bon endroit. Elle n'a pas à rouvrir trois onglets ni à réexpliquer le contexte à Claude.
- **Aujourd'hui** : **fait**, par le crochet SessionStart et l'outil MCP `briefing` (`src/server/mcp/tools/briefing-tool.ts`), sur les 14 derniers jours (`src/server/briefing/gather.ts`). Une limite : le point se fait par dépôt GitHub. Les tickets Linear ou Jira du projet n'y entrent pas.
- **Inspiré de** : Glean, agent « Engineering standup » ; Macro, recette « Daily inbox brief ».

### Cas 2 : L'assistant de code vérifie ce que l'équipe a déjà tranché

- **Qui** : un développeur full-stack, dans une startup de 12 personnes.
- **La situation** : il demande à Claude Code de déplacer la génération des factures PDF du serveur vers le navigateur. L'équipe l'a déjà essayé en mars. La PR a été fermée sans fusion, la revue explique pourquoi (les polices et les accents sortaient faux sur certaines imprimantes), et une page Notion consigne la décision.
- **La question**, posée par l'assistant par MCP avant d'écrire du code : « a-t-on déjà essayé de générer les factures PDF côté navigateur ? »
- **Ce que Leon lit** : les PR fermées et les commentaires de revue sur GitHub, les tickets Linear ou Jira, les pages Notion ou Confluence, les réunions enregistrées. Il ne lit pas les sessions d'IA des collègues, qui leur restent privées.
- **Ce qu'il gagne** : l'assistant ne refait pas un chemin que l'équipe a déjà payé. Il propose en sachant pourquoi l'idée a été refusée, ou il explique ce qui a changé depuis.
- **Aujourd'hui** : **fait, si l'assistant pense à demander.** Les outils MCP `search` et `fetch` marchent par jeton personnel depuis Claude Code et Claude Desktop.
  - Le seul ajout utile tient en quelques lignes : une consigne fournie par Leon (un extrait de CLAUDE.md ou un skill) qui fait chercher dans Leon avant tout choix d'architecture.
  - Depuis claude.ai ou ChatGPT, le MCP ne marche pas encore : il n'a pas d'OAuth.
- **Inspiré de** : Glean, agent « Spec to implementation PR » (le contexte avant d'écrire) ; Macro, recette MCP « fix-and-report ».

### Cas 3 : Retrouver ce qu'on avait trouvé avec ChatGPT

- **Qui** : un PM, dans une PME de 40 personnes.
- **La situation** : en septembre, il a passé 40 minutes avec ChatGPT à mettre au point la requête SQL de rétention par cohorte, pièges compris : clients migrés, comptes de test. Aujourd'hui, la direction veut la même courbe pour octobre. La conversation existe encore, quelque part, sous un titre automatique.
- **La question** : « la requête de rétention par cohorte qui exclut les comptes de test »
- **Ce que Leon lit** : ses conversations ChatGPT et claude.ai, captées par l'extension, et ses sessions Claude Code. Personne d'autre ne les voit.
- **Ce qu'il gagne** : il retrouve en une recherche la version finale, pas le premier essai qui était faux, avec le raisonnement autour et le ticket qui avait demandé la courbe.
- **Aujourd'hui** : **fait.** L'extension demande le consentement et a un interrupteur par site. C'est le dirigeant qui décide d'activer la capture. À contester honnêtement : ChatGPT et Claude cherchent déjà dans leur propre historique. L'apport de Leon est de chercher dans les deux à la fois, à côté des autres outils, et de garder la conversation si le compte change.
- **Inspiré de** : rien chez Glean ni chez Macro. C'est le cas le plus propre à Leon.

### Cas 4 : Astreinte, cette erreur est déjà arrivée

- **Qui** : une développeuse d'astreinte, dans un SaaS de 30 personnes sans équipe d'exploitation.
- **La situation** : à 22 h, Sentry signale un interblocage (`deadlock detected`) sur l'import des relevés bancaires. Elle n'a jamais touché à ce module.
- **La question** : « cette erreur d'import est-elle déjà arrivée, et qu'avait-on fait ? »
- **Ce que Leon lit** : les anciennes issues Sentry, la PR du correctif sur GitHub, le ticket d'incident dans Linear ou Jira, le post-mortem dans Notion ou Confluence.
- **Ce qu'elle gagne** : elle applique le contournement de mars au lieu de réveiller l'auteur du module. Le lendemain, la discussion rédige le brouillon du post-mortem à partir des mêmes sources.
- **Aujourd'hui** : **fait**, par la recherche et la discussion. Le connecteur Sentry est codé mais pas encore essayé avec un vrai compte. Une limite : le fil Slack de l'incident reste privé à ceux qui ont branché leur Slack.
- **Inspiré de** : Glean, agents « Postmortem depuis Slack » et « Resolve Jira ticket ».

### Cas 5 : Le support répond au client sans déranger un développeur

- **Qui** : un chargé de support, dans une PME de 60 personnes.
- **La situation** : un client relance pour la troisième fois. Son export comptable coupe les accents. Le chargé de support ne sait pas si c'est corrigé, depuis quand, ni si d'autres clients l'ont signalé.
- **La question** : « l'export comptable qui coupe les accents : corrigé ? fusionné quand ? qui d'autre l'a signalé ? »
- **Ce que Leon lit** : les conversations Intercom, Zendesk ou Crisp, le ticket Linear ou Jira, la PR fusionnée sur GitHub et sa date.
- **Ce qu'il gagne** : il répond le jour même avec la date du correctif, et il prévient aussi les deux autres clients qui l'avaient signalé. Personne n'a interrompu un développeur.
- **Aujourd'hui** : **fait**, par la recherche et la discussion. Une limite : Leon ne lit pas les mises en production. « Livré » veut dire « PR fusionnée », pas « en ligne chez le client ».
- **Inspiré de** : Glean, agent « Rich Ticket Timeline » ; Macro, recette MCP « Draft a customer reply ». C'est le seul cas déjà présent sur le site, mais ici avec une situation.

### Cas 6 : Le PM arrive en revue de roadmap avec la voix des clients

- **Qui** : un PM, dans un SaaS B2B de 80 personnes.
- **La situation** : la revue trimestrielle a lieu jeudi. Trois commerciaux affirment que « tous les clients demandent l'intégration Pennylane ». Le PM veut savoir combien de clients, lesquels, et avec quels mots.
- **La question** : « qui a demandé une intégration Pennylane depuis juin, et en quels termes ? »
- **Ce que Leon lit** : les conversations de support ; les appels enregistrés (Gong, Fathom, Granola, Leexi) ; les notes HubSpot ou Pipedrive ; Productboard ; les tickets Linear.
- **Ce qu'il gagne** : une liste de clients, chacun avec sa phrase exacte et le lien, au lieu d'une impression. Il voit aussi que la moitié des demandes viennent de prospects perdus.
- **Aujourd'hui** : **en partie.** La discussion le fait sur un petit volume, mais elle s'arrête à 8 étapes (`DISCUSSION_MAX_STEPS`) et ne compte pas de façon fiable au-delà de quelques dizaines de mentions. Il reste à construire une synthèse large : toutes les mentions d'un sujet sur une période, regroupées par client et par thème.
- **Inspiré de** : le « Product Feedback Pulse » d'Abnormal, construit sur Glean ; Glean, agent « Deal loss insights ».

### Cas 7 : La spec dit-elle ce qu'on a décidé en réunion ?

- **Qui** : un tech lead, dans une équipe produit de 6 personnes.
- **La situation** : mardi, en revue de conception enregistrée avec Granola, l'équipe a décidé de ne pas gérer le mode hors ligne en V1. Pourtant, la spec dans Notion et deux tickets Linear parlent encore de synchronisation hors ligne. Un développeur commence lundi.
- **La question** : « qu'a-t-on décidé sur le mode hors ligne, et la spec et les tickets sont-ils à jour ? »
- **Ce que Leon lit** : la transcription Granola, Fathom ou tl;dv ; la spec dans Notion ou Confluence ; les tickets Linear ou Jira.
- **Ce qu'il gagne** : la phrase de la réunion et le paragraphe de la spec, côte à côte, avec leurs sources. L'écart est repéré avant que le développeur ne construise l'ancienne version.
- **Aujourd'hui** : **en partie.** La discussion met les sources côte à côte si on lui pose la question. Elle ne signale pas d'elle-même une contradiction : Leon ne garde plus de faits datés depuis la migration `0010`, il ne sait donc pas qu'une décision a changé.
- **Inspiré de** : Glean, la note de changement technique (« ce qui change, qui est touché, prochaines étapes par équipe »).

### Cas 8 : Arriver sur un module, avec le dossier de reprise et les bonnes personnes à qui demander

- **Qui** : un développeur qui vient d'arriver dans une PME de 45 personnes. Il est affecté au module de facturation dès sa deuxième semaine.
- **La situation** : le module a trois ans. Il a eu deux auteurs principaux, dont un est parti, et les pages Notion sont périmées.
- **La question**, en discussion : « explique-moi le module facturation : les décisions qui comptent, ce qui casse souvent, les tickets ouverts, et qui le connaît aujourd'hui »
- **Ce que Leon lit** : les PR et revues GitHub, les tickets Linear ou Jira, les issues Sentry, les pages Notion ou Confluence, les réunions. Il ne lit pas le code du dépôt, seulement ce qui l'entoure.
- **Ce qu'il gagne** : un dossier sourcé en une matinée. Il sait aussi à qui poser ses questions : ceux qui ont relu les PR récentes, pas l'auteur parti.
- **Aujourd'hui** : **en partie.** La discussion assemble le dossier. Pour savoir qui connaît le module, Leon s'appuie sur les auteurs (`de:`) ; il n'a pas de fiche d'expertise. Un classement des personnes par sujet ne vaut d'être construit que si les pilotes le réclament.
- **Inspiré de** : Glean, agent « Engineering project onboarding » (but, documents clés, tickets, code, experts) et sa détection d'experts. Ce cas remplace la page « Arrivées » du site, dont les questions restent générales (« comment déploie-t-on ? »).

### Cas 9 : Le point de la semaine sans réunion de statut

- **Qui** : le CTO d'une PME de 50 personnes, avec 9 développeurs.
- **La situation** : vendredi à 16 h, il doit dire au comité de direction ce qui a été livré, ce qui a glissé et pourquoi. Aujourd'hui, il relance chaque lead sur Slack pour l'obtenir.
- **La question** : « qu'est-ce qui a été fusionné cette semaine, quels tickets ont glissé, quels incidents ? »
- **Ce que Leon lit** : les PR fusionnées sur GitHub, les tickets Linear ou Jira (terminés, en retard), les issues Sentry, les réunions.
- **Ce qu'il gagne** : un point sourcé en une question, sans que les leads aient à remplir un rapport.
- **Aujourd'hui** : **en partie.** La discussion le fait à la demande avec l'outil `activite` (« quoi de neuf », par personne ou par outil). Deux choses restent à construire : l'envoi programmé (le vendredi à 16 h, par mail ou sur Slack), et un point d'équipe, car le point du matin actuel est personnel et par dépôt. Comme Leon n'a pas de sous-équipes, on filtre par personne.
- **Inspiré de** : Glean, « Weekly work report » (jugé « utile, sous-estimé » le 19/10) ; Macro, recette « Weekly team recap ».

### Cas 10 : Le questionnaire de sécurité d'un gros prospect

- **Qui** : le CTO d'un éditeur de 30 personnes qui vend à des ETI.
- **La situation** : un prospect envoie 120 questions (chiffrement, sauvegardes, sous-traitants, RGPD). L'équipe a déjà rempli un questionnaire semblable il y a six mois. Personne ne sait où il est, et une partie des réponses a changé depuis.
- **La question**, posée question par question : « que répond-on sur le chiffrement au repos, et est-ce toujours vrai ? »
- **Ce que Leon lit** : la politique de sécurité dans Notion ou Confluence ; les anciens questionnaires dans le Drive de celui qui demande ; les PR GitHub qui ont changé la configuration ; les notes du CRM.
- **Ce qu'il gagne** : chaque réponse déjà donnée, avec sa source, et la liste des points où le produit a changé depuis. Une question sans source est signalée, au lieu d'une réponse inventée.
- **Aujourd'hui** : **en partie.** Une question à la fois, oui. Remplir tout le questionnaire d'un coup reste à construire. Une limite : Drive ne lit ni Excel, ni Word, ni PDF (`src/server/connectors/drive/connector.ts`), alors que c'est souvent sous cette forme qu'arrivent les questionnaires.
- **Inspiré de** : Glean, cas « conseil » (réutiliser les anciennes propositions, vérifier les avenants par rapport au contrat).

### Cas 11 : Avant un renouvellement, tout ce qui a coincé chez ce client

- **Qui** : un responsable du succès client, dans un SaaS de 70 personnes.
- **La situation** : le contrat de Nordia se renouvelle dans 30 jours et l'utilisation baisse. Il a repris le compte en juin.
- **La question** : « qu'est-ce qui s'est mal passé chez Nordia depuis un an, et qu'est-ce qui est réglé ? »
- **Ce que Leon lit** : les conversations de support ; les bugs Linear ou Jira liés au client ; les appels Fathom ou Gong ; les notes HubSpot ; ses propres mails.
- **Ce qu'il gagne** : il arrive au rendez-vous avec la liste des problèmes du client, ce qui est corrigé (avec la date) et ce qui ne l'est pas, au lieu de les découvrir pendant l'appel.
- **Aujourd'hui** : **fait**, par la discussion. Une limite : les mails de son prédécesseur restent privés, même après son départ. La qualité dépend aussi du nom du client, qui doit être écrit de la même façon dans tous les outils.
- **Inspiré de** : Glean, « Customer 360 » (le cas jugé le plus fort le 19/10). Ce cas garde ce qui est utile dans les pages Direction et Ventes du site (l'historique d'un compte), sans l'histoire de la promesse.

## 4. Écartés, et pourquoi

| Cas vu chez Glean ou Macro | Pourquoi on ne le garde pas |
|---|---|
| Transformer un appel en tâches (Macro) | Leon lit, il n'écrit pas dans les outils. Granola, Fathom et Linear le font déjà. |
| Revue de PR, explication d'une erreur de CI (Glean) | GitHub Copilot et CodeRabbit le font chez eux (famille B de l'étude du 19/10). |
| Notes de version à partir des PR (Glean) | C'est surtout de la rédaction. La partie qui croise les outils (« qui attendait ce correctif ») est dans le cas 5. |
| Auto-évaluation annuelle (Glean) | Même mécanique que les cas 1 et 9, une fois par an. La discussion la fait sur quelques semaines. |
| Point quotidien sur la boîte de réception (Macro) | Une seule source, et Gmail et Outlook le proposent. Rien n'est croisé. |
| Promesse au client, départ d'un collègue (site actuel) | Déjà partout sur le site. Le cas 11 en garde la partie utile. |

## 5. Ce qui va sur le site

La première recommandation était de remplacer les six équipes par quatre situations. **David a choisi le 25/10 de ne rien enlever et d'ajouter ce qui manque.** C'est fait dans la même PR :

1. **Les cas 1, 2, 3, 4 et 11 sont ajoutés** sous le titre « En situation » (`SITUATIONS` dans `src/components/site/content.ts`).
   - Sur `/cas-usage`, ils apparaissent tous, sous la grille des équipes.
   - Sur chaque page équipe, on ne montre que ceux de l'équipe : quatre pour Produit et tech, un pour Ventes.
   - Chaque situation dit qui, quand, la question posée, ce que Leon fait, ce que ça change et les outils lus.
2. **Le cas 5 n'est pas ajouté** : la page Support raconte déjà cette histoire.
3. **Les cas « en partie » (6 à 10) ne vont pas sur le site** tant qu'ils ne marchent pas. C'est la règle de marque en tête de `content.ts` : aucune promesse que le code ne tient pas.
4. **Aucun nom d'assistant concurrent sur le site** (même règle) : le cas 3 y parle de « son assistant d'IA », pas de ChatGPT.

Ce qu'il faudrait construire en premier, si un pilote le confirme :

1. La consigne MCP du cas 2 : quelques lignes, et elle rend le cas fiable.
2. La synthèse large du cas 6, qui sert aussi les cas 9 et 10.
3. L'envoi programmé du cas 9.

Le reste attend qu'un pilote le demande. Pas d'éditeur d'agents : l'étude du 19/10 l'écartait déjà.

## Limites

- Les cas sont imaginés à partir de ce que Glean et Macro publient et de ce que fait le code. Aucun n'a été vérifié auprès d'un client. Les douze entretiens dirigeants prévus servent à ça.
- Les pages Glean et Macro ont été lues le 25/10/2026 avec un outil qui les résume. Les citations sont courtes et à revérifier avant de les reprendre ailleurs.
- « Fait » est jugé sur le code de `main` au commit `66de224`. Ni l'appli ni les tests n'ont été lancés pour cette étude.
