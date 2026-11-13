Verdict : utilisable en dépannage pour Gmail et Drive, pas pour Slack

# Pipedream Connect : lire Gmail, Drive et Slack sans faire certifier Leon ?

25 octobre 2026 · David (avec Claude) · à relire par Amos

Gmail et Drive sont les outils les plus durs à brancher : leurs droits de lecture sont « restreints » chez Google, et une appli qui les utilise en production doit passer un audit de sécurité annuel (CASA, voir [gmail.md](../marche-2026-10/gmail.md)). Pipedream Connect propose ses propres applis OAuth, déjà validées, et un proxy pour appeler les API à travers elles. La question : est-ce que Leon peut s'en servir pour lire les mails, les fichiers et les messages Slack de ses clients, et à quel prix ? Cette étude reprend la recherche documentaire et un essai réel sur le Gmail de David, avec le [script d'essai](essai-gmail.mjs) pour le refaire.

## La réponse courte

- **Gmail : oui, testé.** L'appli de Pipedream demande `gmail.modify`, qui permet de lire les mails. L'essai a lu des mails complets à travers le proxy, sans aucune démarche auprès de Google.
- **Drive : oui sur le papier, non testé.** L'appli de Pipedream demande `drive`, l'accès complet aux fichiers.
- **Slack : pas tranché, non testé.** La page de Pipedream ne liste que des droits d'écriture, mais Pipedream propose des actions qui lisent l'historique. David n'a pas de compte Slack. Même si la lecture marche, copier les messages dans la base de Leon reste contraire aux règles de Slack ([étude Slack](../slack-2026-10/README.md)).
- **Le coût est tenable si on espace la synchro.** Chaque requête au proxy coûte 1 crédit, et un lot de 100 mails n'est qu'une requête. Avec une synchro toutes les 3 h de 8 h à 18 h, une PME de 20 personnes tient dans l'abonnement de base (99 $/mois).
- **Les freins sont ailleurs** : le client donne son accord à « Pipedream » et non à Leon, les mails transitent par les États-Unis, les jetons restent chez Pipedream, et Pipedream (racheté par Workday) arrête une partie de ses produits.

**Recommandation** : Pipedream en dépannage pour Gmail et Drive aux premiers pilotes, si on accepte le transit par les États-Unis, pendant qu'on lance notre propre certification. Pas pour Slack.

## Ce que l'appli de Pipedream permet de lire

Pipedream publie, pour chaque outil, les droits que son appli OAuth demande quand un utilisateur se connecte. On peut aussi déclarer notre propre appli OAuth chez Pipedream, mais on retombe alors sur les obligations de Google et de Slack : l'intérêt est justement d'utiliser la leur.

| Outil | Droits demandés par l'appli de Pipedream | Ce que ça permet |
|---|---|---|
| Gmail | `gmail.labels`, `gmail.send`, `gmail.modify`, `gmail.compose`, `gmail.settings.basic` | `gmail.modify` est classé « restreint » par Google : « Read, compose, and send emails from your Gmail account ». Lire les mails est donc couvert. |
| Drive | `drive`, `email`, `profile`, `openid` | Lire, modifier et supprimer tous les fichiers du Drive. |
| Slack | `chat:write`, `chat:write.customize`, `chat:write.public`, `files:read` | La liste ne contient aucun droit de lecture de l'historique, mais Pipedream propose les actions « Get Channel History », « Find Message » et « Get Thread Replies ». La liste publiée est donc probablement incomplète. |

Trois conditions viennent avec l'appli de Pipedream :

- **Les jetons ne sont pas récupérables.** Toutes les lectures passent par le proxy. Si Leon quitte Pipedream, tous les utilisateurs doivent se reconnecter.
- **Le proxy** se trouve à `https://api.pipedream.com/v1/connect/{projet}/proxy/{adresse en base64url}`. Une requête dure 30 secondes au plus. La taille maximale n'est pas documentée.
- **L'écran d'accord affiche Pipedream.** Le client voit d'abord un écran « We use Pipedream to connect your account », personnalisable avec le nom et le logo de Leon, puis l'écran de Google qui demande l'accord pour Pipedream.

## L'essai du 25 octobre

Compte Pipedream gratuit de David, mode développement (gratuit, 10 comptes de test), Gmail personnel de David (pas un Google Workspace). Le script n'affiche jamais le contenu des mails : seulement des identifiants, des dates, des tailles et des nombres. Le compte connecté a été supprimé à la fin.

### Connexion et lecture

David a ouvert le lien de connexion, puis donné son accord dans la fenêtre de Google. Le script a ensuite lu 3 mails complets, en-têtes et corps, à raison d'une requête par mail : réponse 200, entre 0,26 et 0,48 seconde par mail.

### Lecture en lot (batch)

Gmail accepte jusqu'à 100 lectures dans une seule requête HTTP (`POST /batch/gmail/v1`, format `multipart/mixed`). La doc du proxy ne parle que de JSON, il fallait donc vérifier que ce format passait.

| Lecture | Temps | Taille de la réponse | Lectures réussies |
|---|---|---|---|
| 20 mails, en-têtes seulement | 0,8 s | | 20 sur 20 |
| 50 mails, en-têtes seulement | 0,5 à 1 s | | 39 à 48 sur 50 |
| 50 mails complets | 2,1 à 2,5 s | 1,5 Mo | 37 à 50 sur 50 |
| 100 mails complets | 1,7 à 3,6 s | 2,2 Mo | 64 à 75 sur 100 |

- **Le format passe** avec un simple en-tête `Content-Type: multipart/mixed; boundary=…`. Le préfixe `x-pd-proxy-` n'est pas nécessaire.
- **Les lectures manquantes sont des refus de Gmail** (code 429 dans la réponse), pas du proxy. Google compte chaque lecture d'un lot comme une requête et prévient que les lots de plus de 50 « are likely to trigger rate limiting ».
- **Bon usage : des lots de 20**, en remettant les lectures refusées dans le lot suivant.

### Crédits consommés

Le tableau de bord de Connect (connect.pipedream.com, menu Logs) affiche les requêtes et les crédits. Il faut choisir l'environnement « Development » en haut de l'écran, sinon la page reste vide.

- **29 crédits pour 29 requêtes au proxy** : 1 crédit par requête, quelle que soit sa taille. Le lot de 100 mails complets (2,2 Mo) a coûté 1 crédit.
- La liste des comptes et la création des liens de connexion ne coûtent rien.

Le tarif officiel est « 1 credit per 30 seconds of compute » par requête au proxy : un lot qui dure moins de 30 secondes coûte donc 1 crédit, ce que l'essai confirme.

## Le coût

### Tarifs de Connect

- **Free** : développement seulement, pas de production.
- **Startup** : 99 $/mois en annuel ou 150 $ en mensuel. Inclut 100 utilisateurs, puis 2 $ par utilisateur et par mois, et 10 000 crédits par mois, puis 0,012 $ le crédit (moins cher en gros volume).
- **Business** : sur devis, avec engagement de service.

Les crédits inclus sont partagés entre tous les clients de Leon : ils ne sont pas comptés par client.

### Ce que coûte une synchro Gmail

À chaque passage, Leon paie 1 crédit par boîte pour demander ce qui a changé (`history.list`), plus 1 crédit par lot de 20 nouveaux mails. Hypothèses : 20 boîtes, 30 jours par mois, et du nouveau à chaque passage entre 8 h et 19 h, rien la nuit (une estimation haute en journée).

| Rythme | Crédits par boîte et par jour | Crédits par mois (20 boîtes) | Prix par mois |
|---|---|---|---|
| Toutes les 15 min, jour et nuit (le rythme actuel de Leon) | ~140 | ~84 000 | ~990 $ |
| Toutes les heures, jour et nuit | ~35 | ~21 000 | ~230 $ |
| Toutes les heures, de 8 h à 18 h | ~22 | ~13 200 | ~140 $ |
| **Toutes les 3 h, de 8 h à 18 h** (8 h, 11 h, 14 h, 17 h) | **~8** | **~4 800** | **99 $** |

- **Ce qui coûte, c'est de demander ce qui a changé, pas de lire.** Ne pas synchroniser la nuit et espacer les passages divise la facture par dix.
- **L'historique se paie une fois.** Un an de mails à 40 par jour, c'est environ 14 600 mails par boîte, soit à peu près 760 crédits en lots de 20. Pour 20 boîtes : environ 15 000 crédits, soit au plus 180 $ une seule fois.
- **À plusieurs clients**, avec le rythme de 3 h, les 10 000 crédits inclus couvrent environ 40 boîtes au total. Au-delà, une boîte coûte à peu près 3 $/mois en crédits, plus 2 $/mois au-delà de 100 utilisateurs, soit environ 5 $ par boîte. À comparer aux 10 $ par connexion annoncés par Truto ([gmail.md](../marche-2026-10/gmail.md)).
- **Ce qu'on perd** : un mail arrivé à 11 h 05 n'est dans Leon qu'à 14 h, et un mail arrivé à 18 h 30 n'y est que le lendemain à 8 h. Le bouton « Synchroniser maintenant » reste là pour les cas urgents.

Les 40 mails par jour et par personne sont une hypothèse, pas une mesure. Une boîte commerciale qui en reçoit 200 consommerait plus de lots.

## Ce qui freine

- **L'accord donné à « Pipedream ».** Le client accepte que Pipedream lise, écrive et envoie ses mails (`gmail.modify`) et lise, modifie et supprime tous ses fichiers (`drive`), alors que Leon ne fait que lire. C'est un frein commercial, et l'admin d'un Google Workspace peut bloquer les applis tierces.
- **Les données transitent par les États-Unis.** Pipedream est hébergé chez AWS en `us-east-1`, sans région européenne. Son contrat de traitement des données (DPA) inclut les clauses contractuelles types ; le Data Privacy Framework n'est pas mentionné. Il dit ne pas stocker ni journaliser le contenu des requêtes et des réponses qui passent par Connect. Rapport SOC 2 Type 2 sur demande. Ça affaiblit l'argument « hébergé en Europe ».
- **La dépendance.** Workday a annoncé le rachat de Pipedream le 19 novembre 2025. Le tableau de bord affiche « Workflows and String are shutting down on March 31, 2027 ». D'après des sources tierces, Connect n'est pas concerné ; je n'ai pas trouvé d'annonce de Pipedream à ce sujet. Une recherche du 25 octobre au matin, non revérifiée ici, a relevé dans les conditions d'utilisation : aucun engagement de service hors offre Business, et une responsabilité plafonnée à 100 $.
- **Une question ouverte chez Google.** Google écrit : « If you store restricted scope data on servers (or transmit), then you must go through a security assessment. » Pipedream l'a fait pour son appli. Rien ne dit si Leon, qui stockerait ces données dans sa base, est couvert par l'audit de Pipedream. Si Google retire l'appli de Pipedream, Gmail et Drive tombent pour tous les clients en même temps.

## Côté code

- Leon n'a **aucun connecteur Gmail, Drive ni Slack** : il faut écrire la synchro dans tous les cas. Pipedream ne fournit que l'accès.
- Tous les connecteurs passent par `createConnectorHttp` ([src/server/connectors/http.ts](../../../src/server/connectors/http.ts)), qui accepte une fonction `fetchImpl` remplaçable. On peut y brancher le proxy : réécrire l'adresse vers le proxy et ajouter le jeton de Pipedream.
- **Le rythme est le même pour tous les connecteurs** : `NEXT_SYNC.later`, 15 minutes, dans [src/server/connectors/connections.ts](../../../src/server/connectors/connections.ts). L'horaire réduit ne doit s'appliquer qu'aux connecteurs qui passent par Pipedream. Notion, Linear et les autres utilisent une clé et ne coûtent rien par requête : les ralentir rendrait Leon moins à jour sans rien économiser.
- La connexion se fait en trois temps. Le serveur crée un jeton Connect pour l'utilisateur (`external_user_id` = l'identifiant Leon). L'utilisateur ouvre le lien. Leon retrouve ensuite le compte connecté et garde son `account_id` dans la configuration de la connexion.
- Pour Gmail : `history.list` depuis le dernier `historyId`, puis lecture des nouveaux mails par lots de 20 (`format=full`), en relançant les 429 au lot suivant.

## Ce qui reste à vérifier

- **Slack** : quels droits l'appli de Pipedream obtient vraiment, et si Slack la limite à 15 messages par requête. Il faut un espace Slack de test (un espace gratuit suffit), puis lancer `essai-gmail.mjs link slack_v2` et `essai-gmail.mjs slack`.
- **Drive** : lecture et export de gros fichiers à travers le proxy, limité à 30 secondes par requête.
- **Google** : demander par écrit à Pipedream si un client de Connect peut stocker les données lues avec son appli vérifiée.
- **La déconnexion** : supprimer un compte dans Connect retire-t-il aussi l'accès chez Google ? Non vérifié. Après l'essai, David doit regarder sur myaccount.google.com/permissions.
- **La production** : l'essai a été compté en mode développement. La facturation en production devrait être la même, mais ce n'est pas vérifié.
- **Les volumes** : mesurer le nombre réel de mails par jour chez un client pilote.

## À trancher

1. Les mails des clients peuvent-ils transiter par un sous-traitant américain ? Si non, Pipedream tombe, comme les autres tiers de [gmail.md](../marche-2026-10/gmail.md).
2. Pour les premiers pilotes Gmail : Pipedream, ou l'appli interne créée par l'admin du client (gratuite, sans tiers, mais 15 à 30 minutes de son temps) ?
3. Une synchro toutes les 3 h en journée est-elle acceptable pour le produit ?

## Sources

- Pipedream, pages des applis : [Gmail](https://pipedream.com/apps/gmail), [Google Drive](https://pipedream.com/apps/google-drive), [Slack](https://pipedream.com/apps/slack-v2)
- Pipedream, [clients OAuth de Connect](https://pipedream.com/docs/connect/managed-auth/oauth-clients) et [proxy de Connect](https://pipedream.com/docs/connect/api-proxy)
- Pipedream, [tarifs](https://pipedream.com/pricing) et [confidentialité et sécurité](https://pipedream.com/docs/privacy-and-security)
- Google, [requêtes en lot de l'API Gmail](https://developers.google.com/workspace/gmail/api/guides/batch) et [droits de l'API Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes)
- SiliconANGLE, [Workday rachète Pipedream](https://siliconangle.com/2025/11/19/workday-acquire-pipedream-extend-ai-agent-integrations-across-enterprise-apps/) (19 novembre 2025)
- Webhook Relay, [arrêt de Pipedream Workflows](https://webhookrelay.com/blog/pipedream-workflows-shutdown-migration/) (source tierce)
- Essai du 25 octobre 2026 : [essai-gmail.mjs](essai-gmail.mjs), journaux de connect.pipedream.com
