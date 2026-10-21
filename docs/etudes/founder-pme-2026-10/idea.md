# Leon (nom de travail)

> Idée validée par David le 19/10/2026, avant le passage du pack founder-skill. Elle reprend la description produit du 18/10 et l'étude sur les agents Glean (`docs/etudes/glean-agents-2026-10/`).

- **Ce que c'est :** la mémoire de l'entreprise. Leon garde en brut tout ce qui se dit et se décide dans les outils de l'équipe, et répond à n'importe quelle question en citant la source exacte (le mail, la minute de réunion, le message, le ticket), avec les droits d'accès de chacun. S'il ne sait pas, il le dit.
- **Pour qui :** les sociétés de 10 à 200 personnes, en France puis en Europe, qui mélangent plusieurs outils : Google Workspace, plus Slack, Notion, Jira ou Linear, Zoom, GitHub et un CRM (HubSpot, Pipedrive). Le produit sert chaque équipe : sales, support, dev, RH, marketing, direction. L'acheteur est le dirigeant. Personne ne les sert bien aujourd'hui :
  - la plupart sont sous le seuil de Glean (contrat minimum d'environ 60 k$ par an, soit 100 à 250 utilisateurs) ; au-dessus, Glean coûte environ 30 à 48 $ par utilisateur et par mois ;
  - Gemini ne va pas chercher dans leurs autres outils ;
  - ChatGPT et Claude interrogent ces outils au moment de la question, sans rien garder, et ils sont paresseux : ils font une ou deux recherches et répondent avec les premiers résultats.
- **Ce que ça vend, à quel prix :** un abonnement par utilisateur et par mois, entre 20 et 35 € HT ; le prix exact n'est pas encore fixé. Le produit :
  1. des connecteurs en un clic, installés en 15 minutes sans équipe IT ;
  2. tout stocké en brut et indexé par mots exacts et par sens, avec un étiquetage léger (date, participants, client, projet ; marqueurs décision, engagement, plainte) ;
  3. les permissions de l'outil d'origine, la possibilité d'exclure des dossiers, des boîtes ou des canaux, et les droits les plus restrictifs sur tout ce qui est dérivé ;
  4. une option que le dirigeant active ou non : la capture des conversations de l'équipe avec ChatGPT et Claude. Ces conversations restent privées à leur auteur ; seules les décisions qu'il valide sont partagées ;
  5. des « recettes » prêtes à l'emploi par équipe, plutôt qu'un éditeur d'agents : fiche client avant un rendez-vous, « ce bug est-il connu ? », onboarding projet, livret d'accueil interrogeable, rapport de la semaine pour le dirigeant ;
  6. un accès depuis l'application Leon, ou depuis ChatGPT, Claude et Cursor par MCP.
- **Où et comment :** un SaaS en ligne hébergé en Europe. Pour les clients prudents : une instance dédiée, ou une installation sur leur propre cloud (AWS, GCP). Vente en direct par les deux fondateurs, via leur réseau, LinkedIn et le bouche-à-oreille.
- **Budget et contraintes :** deux cofondateurs (David, Amos). Le budget de lancement n'est pas fixé : les fondateurs mettront ce qu'il faut. Ils ne se rémunèrent qu'une fois l'activité bien rentable. Coûts fixes actuels d'environ 500 $ par mois ; coût de service estimé à 2,5 $ par siège et par mois si la lecture passe par le LLM du client, 4 à 11 $ avec le chat de Leon ; un premier jet de code existe. Déjà décidé : hébergement en UE, et les droits les plus restrictifs sur tout ce qui est dérivé.
