# Leon : ce qu'on veut faire (18/10/2026)

## En une phrase

Leon est la mémoire de l'entreprise : il garde en brut tout ce qui se dit et se décide dans les outils de l'équipe, et répond à n'importe quelle question en citant la source exacte, avec les droits d'accès de chacun.

## Pour qui

Les entreprises de 10 à 50 personnes que personne ne sert aujourd'hui : trop petites pour Glean (environ 75 $ par utilisateur, 50 utilisateurs minimum), et mal servies par leur suite, parce que leur information est éparpillée entre plusieurs outils. Une PME sous Google Workspace qui travaille aussi dans Slack, Notion, Jira, Zoom et un CRM : Gemini ne va pas chercher dans ces outils, et ChatGPT ou Claude les interrogent au moment de la question sans rien garder.

L'acheteur est le dirigeant.

## Ce que fait le produit

- **Des connecteurs** vers les outils de l'équipe : Google Workspace (Gmail, Drive, Meet), Slack, Notion, Jira ou Linear, Zoom, GitHub, le CRM (HubSpot, Pipedrive), et les conversations de l'équipe avec ChatGPT et Claude.
- **Tout est stocké en brut**, sans résumé : chaque mail, message, document, ticket, transcription de réunion, conversation IA. C'est la source de vérité.
- **Tout est indexé** par mots exacts et par sens (vecteurs), avec une couche légère d'étiquetage pour chaque élément : date, participants, entités (client, projet, personne) et marqueurs (décision, engagement, plainte). C'est ce qui permet de répondre à « qu'est-ce qui s'est dit pendant mon call de la semaine dernière avec ce client ? », « où en est cette décision ? » ou « combien de clients se sont plaints de ça ce trimestre ? ».
- **Les permissions** : chacun ne voit que ce qu'il voit déjà dans l'outil d'origine. Tout ce qui est dérivé porte les droits les plus restrictifs de ses sources. On peut exclure des dossiers, des boîtes et des canaux avant toute indexation.
- **Les conversations IA restent privées** à leur auteur ; seules les décisions qu'il valide sont partagées à l'équipe.
- **La réponse cite sa source exacte** (le mail, la minute de la réunion, le message, le ticket), ou dit « je ne sais pas ».
- **On interroge Leon** depuis son application, ou depuis ChatGPT, Claude ou Cursor par MCP.

## Hébergement

- En ligne, hébergé en Europe.
- Pour les clients les plus prudents : une instance dédiée par client, ou le logiciel installé sur leur propre cloud (AWS, GCP), avec le modèle d'IA qui tourne chez eux.

## Prix envisagé

Un abonnement par utilisateur, autour de 25 € HT par mois.
