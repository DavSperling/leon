# Fathom, Trello, Linear, Notion : alertes, branchement, données et tickets

Étude du 27/11/2026. Demande : que chaque outil prévienne Leon dès que quelque chose arrive, comme Microsoft. Il faut aussi tout préparer pour un branchement en un clic, dire ce que Leon fait de leurs données, et permettre d'écrire des tickets chez eux.

Méthode : un agent Sonnet par outil a lu le code de Leon et la documentation officielle de l'éditeur, avec une adresse pour chaque fait. Un cinquième a cartographié ce que Leon avait déjà. Cinq agents Opus ont ensuite construit une PR chacun (#278 à #282). Un relecteur Sonnet indépendant a relu les alertes ; ses constats, vérifiés dans le code, ont été corrigés. Rien n'a été essayé avec un vrai compte.

## En bref

| Outil | Branchement | Alertes | Ce que Leon garde de plus | Écrire chez eux |
|---|---|---|---|---|
| Linear | En un clic, déjà en place | Une adresse pour toute l'appli, réglée une fois dans la console Linear | L'état, l'assigné, la priorité, les labels, l'échéance | Créer un ticket |
| Notion | En un clic, déjà en place | Un abonnement réglé une fois dans la console Notion | Le statut, le responsable, l'échéance d'une ligne de base | Créer une page dans une base |
| Trello | Clé collée à la main ; **un clic ajouté** (OAuth 2.0 d'Atlassian) | Un webhook par tableau, posé seul par Leon | La liste, l'échéance, les étiquettes, les membres | Créer une carte |
| Fathom | Clé collée à la main (gardée) | Un webhook par personne, posé seul par Leon | Le résumé et les actions à mener, même avec la transcription | Rien à écrire chez Fathom : ses actions deviennent des tickets ailleurs |

Leon ne lit jamais le contenu d'une alerte. Elle lui dit seulement d'aller relire, dans la minute, comme pour Microsoft. La relève habituelle reste en filet si une alerte se perd.

Deux règles communes, ajoutées après une relecture indépendante :
- **Une relève par minute au plus et par connexion**, même pendant une rafale d'alertes (un import de 200 tickets, un tableau très actif). Sans cette règle, une connexion se relevait en boucle et pouvait épuiser les quotas de l'outil.
- **La ligne d'état est un passage à part.** L'état, l'assigné ou la liste changent souvent. Collée à la description, cette ligne aurait fait recopier toute la description dans la mémoire à chaque changement.

## Microsoft : ce qui prévient Leon aujourd'hui

Relu sur main le 27/11. Microsoft prévient Leon, sans contenu, puis Leon va chercher le nouveau lui-même, dans ces cas :
- **Outlook** : un mail reçu, un mail envoyé, un changement d'agenda.
- **Teams Chat** : un message dans n'importe quelle conversation de la personne, nouveau, modifié ou supprimé.
- **Teams, canaux** : un message dans chaque canal de la liste du jour.
- **Transcriptions** : celles des réunions que la personne organise.

Pas d'alerte :
- OneDrive et SharePoint restent relus à intervalles.
- Les réunions où la personne n'est qu'invitée sont relues une fois par jour : il faudrait un abonnement par réunion, pris avant qu'elle commence.
- Un canal créé aujourd'hui n'est suivi qu'à partir de la liste du lendemain.
- Teams ne marche qu'avec un compte Microsoft 365 professionnel, jamais essayé en vrai.

## Linear

**Aujourd'hui.** Branchement en un clic par notre appli. Le droit d'écrire est déjà demandé, donc les connexions existantes pourront créer des tickets sans se rebrancher. Leon garde le titre, la description et les commentaires d'un ticket. Il jette l'état, l'assigné, la priorité et les labels, ainsi que tout ticket sans description.

**Alertes (PR #278).** Une appli Linear déclare une seule adresse de webhook dans ses réglages. Linear crée ensuite un webhook pour chaque organisation qui autorise l'appli. Leon reconnaît l'organisation dans l'alerte et réveille les connexions de cette organisation. La signature se vérifie avec un secret propre à l'appli. Une alerte de plus d'une minute est ignorée sans être refusée : un refus répété peut faire désactiver le webhook par Linear, et la relève du quart d'heure rattrape l'alerte.

**Données (PR #278).** Une ligne en tête de chaque ticket : état, assigné, priorité, labels, cycle, échéance. Un ticket qui n'a qu'un titre est désormais gardé.

**À régler chez Linear**, appli « Leon », section Webhooks :
- adresse `https://leonmemory.com/api/linear/webhooks` ;
- ressources Issues, Issue comments, Project updates ;
- tout de suite après, recopier le secret de signature dans Railway sous `LEON_LINEAR_WEBHOOK_SECRET` et redéployer. Sans lui, Leon répond 503, et Linear peut désactiver un webhook qui échoue trop souvent.

**Risque connu.** Les tickets des équipes privées de Linear sont visibles de toute l'entreprise dans Leon. La PR #70 corrige cela et attend toujours depuis octobre. Les alertes ne créent pas la fuite, mais la rendent plus rapide.

## Notion

**Aujourd'hui.** Branchement en un clic par notre appli, publique, installable dans n'importe quel espace. Relevé dans la console le 27/11 : les capacités lire, mettre à jour et insérer du contenu, lire et insérer des commentaires, et lire les utilisateurs avec e-mail sont déjà cochées. Rien à changer pour écrire. Leon garde le texte et les commentaires des pages partagées avec lui. Il jette toutes les propriétés d'une ligne de base sauf le titre.

**Alertes (PR #279).** L'abonnement se crée dans l'onglet Webhooks de la connexion. Notion envoie d'abord un jeton de vérification à notre adresse. Leon l'écrit dans ses journaux (jamais chez Sentry) tant qu'il ne le connaît pas. Il faut le recopier dans Railway, puis dans Notion. Il sert ensuite de clé pour vérifier chaque alerte. Leon reconnaît l'espace de travail dans l'alerte. La livraison prend moins de 5 minutes, souvent moins d'une.

**Données (PR #279).** Une ligne en tête de chaque ligne de base : statut, sélections, responsables, dates, cases à cocher, nombres et textes courts. Une base de tâches Notion devient donc lisible dans Leon. Une ligne qui n'a qu'un titre et des propriétés est gardée.

**À régler chez Notion**, après la mise en ligne :
- onglet Webhooks › Créer un abonnement › `https://leonmemory.com/api/notion/webhooks` ;
- événements : page créée, contenu modifié, propriétés modifiées, page supprimée, commentaire créé ;
- lire le jeton dans les journaux de Railway (ligne `notion.webhook_verification`), le poser dans Railway sous `LEON_NOTION_WEBHOOK_TOKEN`, redéployer, et seulement ensuite cliquer « Verify » dans Notion. Notion n'envoie rien avant : aucune alerte n'est refusée entre les deux.

**Non vérifié.** La doc ne dit pas qu'un seul abonnement couvre tous les espaces qui installent la connexion. Il faut l'essayer avec deux espaces. Un espace qui n'a partagé aucune page avec Leon ne reçoit rien.

**Limites.** Une page supprimée dans Notion reste dans Leon : c'était déjà le cas, l'alerte ne fait que réveiller la relève. Les lignes de base déjà relevées ne prennent leur ligne de propriétés qu'à leur prochaine modification.

## Trello

**Aujourd'hui.** Trello se branche par une clé et un jeton collés à la main, en lecture seule. Leon garde le titre, la description et les commentaires d'une carte. Il jette l'échéance, les membres, les étiquettes et les checklists.

**Un clic (PR #281).** Atlassian a ouvert OAuth 2.0 à Trello : un client « confidentiel », un jeton d'une heure renouvelé, et des droits de lecture et d'écriture sur les tableaux. C'est la même mécanique que Linear et Notion. La clé collée reste en repli.

**Alertes (PR #281).** Pour chaque tableau ouvert, Leon pose lui-même un webhook avec la connexion de la personne. L'adresse contient un jeton secret propre à la connexion, et Trello signe chaque alerte avec le secret de notre appli. Quand la connexion est supprimée, Leon répond « disparu » (410) à la première alerte, et Trello retire alors le webhook. Il n'y a pas d'alerte pour une connexion par clé : la signature dépend d'un secret que Leon ne connaît pas.

**Données (PR #281).** Une ligne d'état pour chaque carte : liste, échéance, étiquettes, membres. Une carte qui n'a qu'un titre est désormais gardée. Les checklists restent de côté. Une étiquette ou un membre ajouté seul ne fait pas relire la carte tout de suite.

**À régler chez Trello**, avec un compte Trello de l'équipe :
- trello.com/apps/admin › onglet OAuth 2.0 › client « Confidential », rattaché à une appli et non à un Power-Up ;
- adresses de retour `https://leonmemory.com/api/v1/connexions/oauth/trello/retour` et `http://localhost:3000/api/v1/connexions/oauth/trello/retour` ;
- droits `read:board:trello`, `read:member:trello` et `write:board:trello` ;
- identifiant et secret dans Railway sous `LEON_OAUTH_TRELLO_ID` et `LEON_OAUTH_TRELLO_SECRET` (ce secret signe aussi les alertes) ;
- Cloudflare ne doit bloquer `/api/trello/webhooks/*` ni en HEAD ni en POST.

**Non vérifié.** Atlassian écrit que les jetons OAuth 2.0 d'un Power-Up sont limités à un espace de travail, pas ceux d'une appli. Il faut vérifier que notre client compte bien comme une appli. Restent aussi à essayer : l'adresse d'échange du jeton (la page en écrit deux), l'absence d'« audience », la création d'un webhook en JSON, et la signature d'une alerte qui contient des accents.

## Fathom

**Aujourd'hui.** Fathom se branche par une clé personnelle, disponible sur toutes ses offres. Leon garde la transcription, et le résumé seulement s'il n'y a pas de transcription. Il ne demande pas les actions à mener. Superhuman a racheté Fathom le 14/09/2026, et l'API reste documentée et active.

**Alertes (PR #280).** Fathom n'envoie qu'un événement : une réunion est prête. L'alerte ne dit pas à qui elle appartient. Leon crée donc un webhook par personne, à la première relève réussie, avec une adresse qui contient un jeton secret propre à la connexion. Leon n'en garde que l'empreinte. La signature de Fathom n'est pas vérifiée : le jeton de l'adresse fait foi, et une adresse divulguée ne permet que de déclencher une relève. Quand la personne débranche Fathom, Leon retire le webhook chez Fathom.

**Données (PR #280).** Leon garde toujours le résumé de Fathom et la liste des actions à mener (description, assigné, faite ou non, moment de la réunion), en plus de la transcription. C'est ce qui permet ensuite d'en faire des tickets. Une réunion récente encore sans résumé est relue pendant six heures au plus, jusqu'à ce qu'il arrive. Les réunions déjà relevées ne récupèrent ni leur résumé ni leurs actions. La page des connecteurs du site le dit désormais, en français et en anglais.

**Un clic, plus tard.** Fathom a un OAuth pour les applis partenaires. Il faut s'inscrire par un formulaire, puis Fathom relit l'appli. Une appli OAuth ne peut pas recevoir la transcription et le résumé d'un coup : il faut un appel par réunion, avec une limite de 30 par minute. La clé fait mieux aujourd'hui.

**Écrire.** Fathom n'accepte aucune écriture. Ses actions à mener deviennent des tickets Linear, Trello ou Notion.

**Constat à trancher.** Une réunion partagée avec la personne qui branche Fathom est visible de toute l'équipe dans Leon. Pour Teams, David a choisi « ses participants ». Il faudrait sans doute la même règle ici.

## Écrire des tickets : comment ça marche

Leon avait déjà un circuit d'« actions confirmées » pour GitHub. Il est étendu à trois actions (PR #282) :
- créer un ticket Linear : équipe, titre, description, et en option projet, priorité, assigné ;
- créer une carte Trello : tableau, liste, titre, description, et en option échéance ;
- créer une page dans une base Notion : base, titre, contenu en paragraphes.

Le déroulé :
1. La personne demande dans la discussion. Exemple : « Mets les actions de la réunion d'hier avec Acme en tickets Linear dans l'équipe Produit ».
2. Leon retrouve la réunion dans sa mémoire et prépare une carte par ticket, huit au plus par réponse. Il vérifie que l'équipe, le tableau, la liste ou la base existent. Un nom introuvable ou ambigu, et il ne propose rien.
3. La personne relit et clique « Confirmer ». Rien ne part sans ce clic, un second clic ne fait rien, et une carte expire au bout d'une heure.
4. Leon crée le ticket avec la connexion de la personne elle-même, jamais celle d'un collègue. La création n'est jamais rejouée : une réponse perdue ne double pas le ticket. Il rend le lien.

Les limites :
- une connexion Trello par clé collée est en lecture seule : le clic échoue, et la carte dit de rebrancher Trello par le bouton (#281) ;
- une clé Linear en lecture seule échoue de même ; le bouton Linear demande déjà l'écriture ;
- une connexion Notion interne doit avoir la capacité « Insert content » ; la connexion publique de Leon l'a déjà ;
- une échéance Trello est posée à midi UTC du jour donné.

Pour plus tard : l'agent « suite de réunion » est déjà au catalogue, mais pas en service. Il proposerait ces cartes tout seul après chaque réunion, au lieu d'attendre la demande.

## Ce que coûtent les alertes

Une alerte ne coûte rien à recevoir. Elle déclenche une relève, qui coûte ce qu'elle coûtait déjà, mais plus souvent :
- **Linear** : une relève coûte environ 7 300 points de complexité. À une relève par minute au plus, cela fait au pire 440 000 points par heure et par connexion, sous les 3 millions de l'heure que Linear accorde.
- **Notion** : une page modifiée coûte quelques requêtes (son contenu, ses commentaires), sous la limite de 3 requêtes par seconde.
- **Trello** : une relève relit les tableaux de la personne ; la limite est de 100 requêtes par 10 secondes et par jeton.
- **Fathom** : une alerte par réunion, rien de plus.

Les passages nouveaux sont ensuite indexés (vecteurs), comme avant. La relève de ces quatre outils n'appelle aucun modèle de langue : seule celle d'une boîte mail lance l'agent des brouillons.

## Ce qu'il reste à faire, dans l'ordre

1. Fusionner dans l'ordre #278, #279, #280, #281, puis #282, qui a besoin du bouton Trello de #281. Après la première, chaque PR demande une remise à jour sur main : des conflits simples, deux lignes ajoutées au même endroit (la liste des routes, le contrat des routes publiques). Les migrations 0099 à 0103 s'appliquent dans n'importe quel ordre.
2. Linear : dans la console, régler le webhook, puis poser tout de suite `LEON_LINEAR_WEBHOOK_SECRET` sur Railway et redéployer (section Linear).
3. Notion : créer l'abonnement, lire le jeton dans les journaux de Railway, le poser sur Railway, redéployer, puis cliquer « Verify » (section Notion).
4. Trello : se connecter à trello.com/apps/admin, créer le client OAuth 2.0, poser ses deux variables sur Railway (section Trello).
5. Fathom : rien à régler pour les alertes. L'OAuth attend une inscription et une revue par Fathom.
6. Essayer en vrai, outil par outil : brancher, changer un ticket, une page, une carte, finir une réunion, et regarder Leon se mettre à jour dans la minute. Puis faire créer un ticket, une carte et une page depuis une discussion.

## Suites possibles

- **Microsoft** : appliquer aux alertes d'Outlook et de Teams la même règle d'une relève par minute au plus. Un canal Teams très actif relance aujourd'hui une relève à chaque message.
- **Page de confidentialité** : dire que Leon écrit dans Linear, Trello, Notion et GitHub, toujours après un clic de la personne. Elle n'en parle pas aujourd'hui.
- **Fathom** : retirer aussi les alertes quand un compte ou un espace Leon entier est supprimé. Aujourd'hui, seul le débranchement d'une connexion les retire.
- **Connexions par clé collée** : une connexion Linear par clé n'est pas réveillée par les alertes, car Leon ne garde pas son organisation. Elle reste relue tous les quarts d'heure.
- **Notion** : une page supprimée reste dans Leon.
- **Agent « suite de réunion »** : proposer les tickets tout seul après chaque réunion.

## Sources

- Linear : https://linear.app/developers/webhooks, https://linear.app/developers/oauth-2-0-authentication, https://linear.app/developers/rate-limiting, https://github.com/linear/linear (schéma GraphQL).
- Notion : https://developers.notion.com/reference/webhooks, https://developers.notion.com/reference/webhooks-events-delivery, https://developers.notion.com/reference/capabilities, https://developers.notion.com/reference/post-page, https://developers.notion.com/guides/get-started/upgrade-guide-2025-09-03.
- Trello : https://developer.atlassian.com/cloud/trello/guides/rest-api/oauth-2-confidential-client-usage, https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/, https://developer.atlassian.com/cloud/trello/rest/api-group-cards/, https://developer.atlassian.com/cloud/trello/guides/rest-api/rate-limits/.
- Fathom : https://developers.fathom.ai/webhooks.md, https://developers.fathom.ai/oauth.md, https://developers.fathom.ai/faq.md, https://developers.fathom.ai/api-overview.md, https://blog.superhuman.com/superhuman-acquires-fathom/.
