# Étude : faire tourner Leon entièrement sur le cloud du client

19 octobre 2026 · Amos (avec Claude) · à relire par David

La [description produit](https://github.com/DavSperling/leon/pull/22) promet aux clients les plus prudents le logiciel installé sur leur propre cloud, avec le modèle d'IA chez eux. Ce n'est pas à construire maintenant : le prochain jet est hébergé chez nous. Les faits renvoient aux sources numérotées en fin de page ; ce qui est marqué *(déduction)* est notre raisonnement.

## 1. La question et la réponse courte

**La question** : que faut-il pour que tout Leon (appli, base, index, vecteurs, file de tâches, historique du chat, modèle d'IA) tourne dans le compte AWS, GCP ou Azure d'un client, pour qu'il soit sûr que ses données restent chez lui ?

1. **Faisable sur AWS et GCP, pas encore sur Azure.** Sonnet et Haiku 5.5 s'appellent en Europe via Bedrock et Vertex, pour 10 % de plus ; sur Azure, Claude n'a pas de zone européenne.
2. **Le code change peu si on tient dix règles dès le prochain jet** (partie 5). Le reste est un paquet d'installation par cloud : 6 à 9 semaines pour le premier *(déduction)*.
3. **Le vrai coût est l'exploitation.** Si on met à jour dans son compte, comme Glean et Credal, « on ne voit rien » devient « on ne lit pas, et tout est journalisé chez vous ». S'il le fait lui-même, il lui faut une équipe informatique.
4. **Plancher : 250 à 450 $ par mois de cloud pour 30 personnes**, plus le modèle *(déduction)*, soit presque le prix de l'abonnement.
5. **Recommandation** : pour les 10-50 prudents, une instance dédiée chez nous, chiffrée avec leur clé. L'installation chez le client plus tard, pour les réglementés ou les plus de 100 personnes, AWS d'abord.

## 2. Ce que « Leon entièrement chez le client » contient

| Pièce | Aujourd'hui | Chez le client (AWS / GCP / Azure) |
|---|---|---|
| Appli : interface Next.js, API et MCP en Hono | un processus Node | un conteneur : ECS Fargate / Cloud Run / Container Apps |
| Travail de fond : synchro des connecteurs, pipeline | pg-boss | la même image, en rôle « travail » |
| Données brutes, mots exacts, vecteurs, file, chat, comptes | Postgres 17, sécurité par ligne | RDS / Cloud SQL / Azure Database for PostgreSQL, avec pgvector |
| Secrets : Better Auth, `LEON_CONNECTORS_KEY`, OAuth | `.env.local` | Secrets Manager / Secret Manager / Key Vault |
| Clés de chiffrement | celles de l'hébergeur | KMS / Cloud KMS / Key Vault, au nom du client |
| Modèle de langue | API Anthropic | Bedrock / Vertex / (Foundry) |
| Modèle de vecteurs | aucun pour l'instant | celui du cloud, ou un modèle ouvert dans le conteneur |
| Réseau, domaine, certificat | — | répartiteur de charge, `leon.client.fr`, certificat du cloud |

Restent hors de son cloud : les SaaS qu'on lit, l'extension et l'agent local, qui pointeront vers son adresse. Et « le modèle chez eux » veut dire appelé depuis leur compte, payé sur leur facture, traité dans les régions européennes du cloud ; pas sur leurs machines.

## 3. Comment font les autres

| | Hébergé par l'éditeur | Chez le client | Qui exploite chez le client | Modèle d'IA |
|---|---|---|---|---|
| **Glean** | mono-client, sur GCP [1] | GCP ou AWS ; Azure non cité [1] | Glean. Le client crée un projet et donne le rôle Propriétaire ; Glean construit tout et garde un compte de maintenance, qu'on ne coupe pas sans perdre les garanties. Région figée [2] | clé Glean, ou clé du client : Vertex sur GCP, Bedrock sur AWS [3] |
| **Credal** | multi-clients, ou instance isolée [4] | compte AWS ou Kubernetes du client, ou sur site isolé [4] | Credal ; sur site, le client [4] | clé du client : Bedrock, Vertex, Azure OpenAI [4] |
| **Onyx** | offre en ligne | Docker, Kubernetes, Helm, Terraform [5] | le client | au choix |
| **Dust** | « en UE ou aux US » [6] | rien trouvé [6] | — | — |

Onyx est sous MIT, sauf l'édition Entreprise (connexion unique, droits par rôle, journal des requêtes) [5]. Les clés de chiffrement du client n'apparaissent dans aucune des pages lues de Glean et Credal.

*Déduction* : personne ne livre un installateur qu'un client sans informatique fait tourner seul. Ceux qui vendent aux grands comptes gardent l'exploitation.

## 4. Ce que ça implique, point par point

### 4.1 Le paquet d'installation

- **Problème** : trois clouds, trois jeux de services.
- **Options** : Kubernetes partout (un seul paquet, mais un cluster à faire vivre, démesuré pour 30 personnes) ; ou les services gérés de chaque cloud, décrits en code d'infrastructure (Terraform ou OpenTofu), un module par cloud.
- **Recommandation** : un module par cloud : réseau, base avec pgvector, conteneur, stockage, secrets, clé KMS, répartiteur de charge, certificat. Le client ne fait que l'enregistrement DNS. pgvector existe sur RDS [28], Cloud SQL [29] et Azure [30].

### 4.2 Qui exploite

| Option | Promesse « on ne voit rien » | Pour une PME de 30 |
|---|---|---|
| Nous, dans son compte, rôle limité (Glean, Credal) | affaiblie : on ne lit pas la base, mais on pousse le code qui la lit | possible |
| Lui-même ou son infogérant | tenue | irréaliste sans infogérant |
| Instance dédiée chez nous, chiffrée avec sa clé | pas au sens strict, mais il est seul dans sa base et coupe tout en retirant sa clé | simple |

**Recommandation** : l'instance dédiée comme étape intermédiaire. Chez le client, un rôle qui peut déployer et migrer, mais ni lire la base ni lire les secrets *(déduction, à vérifier par cloud)*, chaque action étant journalisée chez lui. Jamais le rôle Propriétaire [2].

### 4.3 Mises à jour, migrations, versions qui divergent

- **Problème** : chez nous, une version pour tous ; chez dix clients, dix versions.
- **Recommandation** *(déduction)* : une image signée par version, publiée chaque mois ; migrations appliquées au démarrage, en deux temps (on ajoute, on retire une version plus tard) pour qu'une version tourne sur le schéma de la suivante ; seules les deux dernières versions sont suivies ; un correctif de sécurité s'installe sous 7 jours ; un test de mise à niveau depuis l'avant-dernière version, sur une base remplie.

### 4.4 Le dépannage sans voir les données

Les journaux sont déjà sans contenu : `src/server/log.ts` ne garde que le nom de l'erreur et ses champs de diagnostic. **Recommandation** : un export de diagnostic lancé par l'admin du client, qu'il relit avant de l'envoyer : version, migrations, noms des réglages (pas leurs valeurs), état de la file, dernière synchro et code d'erreur par connecteur, lignes et taille par table, appels au modèle (nombre, durée, erreurs). En dernier recours, un écran partagé.

### 4.5 Le modèle d'IA par cloud

| | Claude 5.5 en Europe | Surcoût | Ce qui manque à notre pipeline |
|---|---|---|---|
| **Bedrock** | profil `eu.` : appelé depuis Paris, la requête tourne dans l'une de six régions de l'UE ; pas d'option « une seule région » [7][8] | +10 % [9] | Sonnet 5.5 et Haiku 5.5 : ni sorties structurées (structured outputs), ni traitement par lots (batch) ; pour Sonnet 5.5, pas de choix d'outil forcé [7][8] |
| **Vertex** | point d'accès « eu », sur plusieurs régions ; une seule région : jusqu'à Sonnet 4.6 seulement [10] | +10 % [9][10] | pas de traitement par lots [10] |
| **Foundry** | non : zone de données US seulement [11], Europe « bientôt » [12] | — | pas de traitement par lots [11] |

Ce que ça change :
- le pipeline demande des sorties structurées (`output_config.format`, dans `src/server/llm/anthropic-llm.ts`) : sur Bedrock, il faut un repli (JSON validé par Zod, puis nouvel essai) ;
- sans lots, l'import de 6 mois d'historique passe d'environ 91 à 180 $ ([étude de coûts](../couts-2026-10/README.md)) *(déduction)* ;
- les quotas se demandent compte par compte [7] ; des comptes neufs démarrent à zéro [16, source tierce] ; sur Foundry, la capacité se demande par formulaire [13]. À lancer une à deux semaines avant l'installation ;
- « Claude Platform on AWS », exploité par Anthropic, ne garantit pas l'Europe : inférence « us » ou « mondiale » seulement [14][15].

### 4.6 Le modèle qui fabrique les vecteurs

Les vecteurs de deux modèles ne se comparent pas : changer de modèle oblige à tout réindexer.

- **AWS** : Titan Text Embeddings V2, disponible à Paris [18] ; optimisé pour l'anglais, le français est « en préversion » [17].
- **GCP** : `gemini-embedding-001` et `text-multilingual-embedding-002` figurent dans le tableau européen de Google [19] (régions exactes non relevées).
- **Azure** : `text-embedding-3` ou Cohere Embed v4 ; régions européennes non vérifiées.
- **Partout** : un modèle ouvert dans notre conteneur, comme bge-m3 (MIT, 100+ langues) [20]. Mêmes vecteurs sur tous les clouds et chez nous, mais calcul sur processeur, plus lent *(déduction, à mesurer)*.

**Recommandation** : modèle choisi par réglage, nom du modèle stocké avec chaque vecteur, réindexation prête. Comparer bge-m3 et les modèles des clouds sur notre jeu d'essai en français.

### 4.7 Le bouton OAuth des connecteurs

- **Problème** : 17 des 39 outils ont un bouton « Se connecter avec… ». Chaque appli OAuth enregistre ses adresses de retour chez l'éditeur ; la nôtre est `<BETTER_AUTH_URL>/api/v1/connexions/oauth/<appli>/retour`, et Atlassian n'en accepte qu'une par appli ([guide des applis OAuth](https://github.com/DavSperling/leon/pull/20), [21]). Une instance chez le client a sa propre adresse : nos applis n'y marchent pas.
- **Options** :
  1. **Le client crée ses applis.** Aucun secret partagé, mais jusqu'à 17 consoles, et HubSpot exige un super administrateur. Avantage : une appli Google « interne » à son organisation échappe à la vérification de Google [22] (à confirmer pour Gmail et l'audit CASA).
  2. **Relais par notre domaine.** L'échange du code exige le secret de l'appli : soit on voit passer son jeton, soit on donne notre secret à chaque client *(déduction)*. Les deux cassent la promesse.
  3. **Clés collées**, quand l'outil en propose : le formulaire existe déjà.
- **Recommandation** : 1 et 3, jamais de relais. Applis du client pour les 3 à 5 outils qu'il utilise vraiment, clés pour le reste.

### 4.8 Le chiffrement avec les clés du client

Les trois bases acceptent une clé du client (CMEK) : RDS [23], Cloud SQL [24], Azure, où le choix se fait à la création du serveur [25]. Retirer la clé rend la base illisible [25] : c'est son bouton d'arrêt. `LEON_CONNECTORS_KEY` doit venir du coffre de secrets, chiffrée par la clé du client *(déduction)*. **Recommandation** : clé du client par défaut, chez lui comme dans l'instance dédiée chez nous (clé d'un autre compte à vérifier par cloud). C'est ce qui rassure le plus pour le moins d'effort.

### 4.9 Sauvegardes, reprise, région, RGPD

- **Sauvegardes** : celles de la base gérée, plus une copie quotidienne dans une seconde région européenne, et une restauration testée à l'installation puis chaque trimestre *(déduction)*.
- **Région** : tout à Paris, sauf Claude, qui tourne dans l'une des six régions du profil `eu.` [7]. Se décider une fois pour toutes : chez Glean, changer de région impose de tout reconstruire [2].
- **RGPD** *(déduction, à valider avec un juriste)* : le client reste responsable du traitement. Si nous exploitons dans son compte, nous sommes sous-traitant ; s'il exploite seul, nous ne sommes qu'éditeur.

### 4.10 La facture et le prix

Le client paie son cloud et le modèle sur sa facture AWS [7]. Nous vendons une licence par siège, des frais d'installation et le support, plutôt qu'un abonnement qui inclut le modèle.

Plancher sur AWS Paris pour 30 personnes *(déduction ; prix relevés le 19/10)* :

| Poste | $ par mois |
|---|---|
| 2 conteneurs Fargate de 1 processeur et 2 Go (appli et travail) [26] | 86 |
| Répartiteur de charge [27] | 25 |
| Postgres RDS, 2 processeurs, 8 Go, 100 Go ([annexe 4 des coûts](../couts-2026-10/annexes/04-stockage-infra.md)) | 119, ou 311 avec secours dans une seconde zone |
| Secrets, clé KMS, journaux, stockage, DNS | 10 à 20 |
| **Infrastructure** | **240 à 440** |
| Claude via Bedrock UE : 1 à 7,70 $ par personne ([étude de coûts](../couts-2026-10/README.md)), plus 10 %, à refaire après le pivot | 30 à 250 |

Soit 270 à 690 $ par mois, sans passerelle NAT, à comparer aux 750 € de l'abonnement à 25 € par siège. La licence doit coûter moins que l'abonnement, mais chaque installation nous coûte plus en support : d'où des frais d'installation obligatoires *(déduction)*.

### 4.11 La taille de client visée

Une PME de 10 à 50 personnes sans informatique ne sait pas ouvrir un compte cloud, demander des quotas, créer des applis OAuth et gérer un DNS. Glean, qui le fait, vend à partir d'environ 50 à 100 sièges ([annexe Glean](../concurrents-2026-10/annexes/01-glean.md)). **Recommandation** : l'installation chez le client à partir d'environ 100 personnes, ou pour les secteurs réglementés (santé, avocats, experts-comptables) qui ont un infogérant. Pour les autres : l'instance dédiée.

## 5. Les règles à respecter dès le prochain jet

Elles ne coûtent presque rien maintenant et évitent une réécriture plus tard.

1. **Tout dans Postgres** : données brutes, mots exacts (`tsvector`, `pg_trgm`), vecteurs (pgvector), file (pg-boss), sessions, chat. Extensions limitées à `vector` (présente sur les trois clouds [28][29][30]), `pg_trgm`, `btree_gist` et `ltree` (extensions standard de Postgres, vérifiées sur Cloud SQL [29]). pgvector est sous licence PostgreSQL, permissive [31] ; pg-boss sous MIT [32]. On garde `tenant_id` et la sécurité par ligne même avec un seul client.
2. **Aucun service tiers obligatoire** : ni Pinecone, ni Elastic, ni Redis, ni Inngest, ni fonction propre à Vercel. Les tâches planifiées passent par pg-boss ; le suivi d'erreurs externe est optionnel.
3. **Une seule image de conteneur** (Next.js en mode `standalone`), lancée en trois rôles : `web`, `travail`, `migrer`. La même chez nous et chez le client.
4. **Le fournisseur du modèle se choisit par réglage**, étape par étape, comme dans la PR #16 de David (`LEON_LLM_<ÉTAPE>`) ; il faudra ajouter `bedrock` et `vertex`. On n'utilise que ce qui existe partout (messages, outils, cache des consignes), avec un repli sans sorties structurées, et sans dépendre des lots, de l'API de fichiers ni des outils exécutés chez Anthropic.
5. **Le modèle de vecteurs se choisit par réglage**, son nom est stocké avec chaque vecteur, la réindexation existe.
6. **Aucune adresse en dur** : tout dérive de `BETTER_AUTH_URL`, adresses de retour OAuth comprises. L'extension et l'agent local demandent l'adresse de l'instance.
7. **Configuration par variables d'environnement uniquement**, vérifiées au démarrage (`src/server/env.ts`) et listées dans `.env.example`. Les secrets arrivent par le coffre du cloud.
8. **Journaux sans contenu** : identifiants, codes et durées, jamais de texte. Un test le vérifie.
9. **Migrations rejouables** : SQL en avant seulement, idempotentes, jamais modifiées une fois publiées, compatibles avec la version précédente de l'appli.
10. **Rien n'appelle chez nous pour fonctionner** : ni vérification de licence en ligne, ni télémétrie obligatoire.

## 6. L'effort pour une première installation

*Déduction*, règles de la partie 5 tenues : **6 à 9 semaines pour une personne**, soit un à deux jets.

| Travail | Semaines |
|---|---|
| Code d'infrastructure : réseau, base, conteneur, secrets, KMS, certificat | 2 |
| Adaptateurs Bedrock et vecteurs, repli des sorties structurées | 1 |
| Mises à jour : images signées, migrations, test de mise à niveau | 1 |
| Export de diagnostic, sauvegarde et restauration | 1 |
| Guide OAuth chez le client, demande de quotas | 0,5 à 1 |
| Installation pilote et corrections | 1 à 2 |

Chaque cloud en plus : 3 à 4 semaines, et chaque version testée sur chacun.

**Commencer par AWS** : Paris a tout (conteneurs, RDS, Titan, départ du profil européen de Claude) [7][18] ; l'[architecture](../architecture-2026-10/README.md) prévoit déjà Claude via Bedrock UE pour notre hébergement, donc le même adaptateur sert deux fois ; AWS Activate est le seul programme de crédits qui couvre Claude ([étude de coûts](../couts-2026-10/README.md)) ; Glean et Credal le proposent. Le point à lever d'abord : les sorties structurées absentes de Bedrock pour Sonnet et Haiku 5.5 [7][8][33]. GCP est le meilleur second choix, puisque Vertex les a [10], voire le premier si le premier client demandeur vit sous Google Workspace *(déduction)*. Azure attend une zone européenne pour Claude.

## 7. Questions ouvertes

1. Vend-on un jour l'installation chez le client, ou seulement l'instance dédiée ?
2. À partir de quelle taille, ou pour quels secteurs ?
3. Qui exploite : nous dans son compte, avec un rôle limité, ou son infogérant ? Accepte-t-on « on ne lit pas, et tout est journalisé chez vous » à la place de « on ne voit rien » ?
4. Quel prix : licence par siège et frais d'installation ? Combien ?
5. AWS d'abord, ou le cloud du premier client qui le demande ?
6. Le prochain jet hébergé passe-t-il par Bedrock UE (même code que chez le client) ou par l'API Anthropic directe ? Si Bedrock, quel repli pour les sorties structurées ?
7. Quel modèle de vecteurs : celui du cloud, ou bge-m3 pour avoir les mêmes partout ? À trancher sur le jeu d'essai.
8. OAuth chez le client : applis du client et clés, sans relais ? Une appli Google interne évite-t-elle l'audit CASA ?
9. Combien de versions de retard accepte-t-on, et que fait-on d'un client qui ne met pas à jour ?
10. Inscrit-on les dix règles de la partie 5 dans le cahier du prochain jet ?

## Limites

Les fiches de Bedrock changent souvent : l'absence de sorties structurées est vraie au 19 octobre, à revérifier avant de coder. Non relevés : Opus 5.5 sur Bedrock, les régions européennes des modèles de vecteurs de Google et d'Azure, Cohere sur Bedrock, `pg_trgm`, `btree_gist` et `ltree` sur RDS et Azure, le prix d'une passerelle NAT, les quotas par défaut. Rien n'a été essayé en réel.

## Sources

Relevées le 19 octobre 2026.

1. Glean, modèles de déploiement : https://docs.glean.com/get-started/prepare/about-deployment
2. Glean, installation sur GCP : https://docs.glean.com/get-started/prepare/self-hosted-deployment/gcp/deploy-gcp
3. Glean, clés de modèle : https://docs.glean.com/administration/llm-key-feature-availability
4. Credal, sécurité : https://www.credal.ai/security
5. Onyx, dépôt : https://github.com/onyx-dot-app/onyx
6. Dust, sécurité : https://dust.tt/home/security
7. Bedrock, fiche de Claude Sonnet 5.5 : https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html
8. Bedrock, fiche de Claude Haiku 5.5 : https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html
9. Anthropic, prix : https://platform.claude.com/docs/en/about-claude/pricing
10. Anthropic, Claude sur Google Cloud : https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai
11. Anthropic, Claude dans Microsoft Foundry : https://platform.claude.com/docs/en/build-with-claude/claude-in-microsoft-foundry
12. Anthropic, conformité régionale : https://claude.com/regional-compliance
13. InfoQ, Claude dans Foundry et l'Europe, 5 juillet 2026 : https://infoq.com/news/2026/07/claude-foundry-ga-europe/
14. Anthropic, résidence des données : https://platform.claude.com/docs/en/manage-claude/data-residency
15. Anthropic, Claude Platform on AWS : https://platform.claude.com/docs/en/build-with-claude/claude-platform-on-aws
16. AWS re:Post, compte neuf à quotas nuls (source tierce) : https://www.repost.aws/questions/QUlIcRc5qET8eAtzSAXxmtwg/provisioning-bug-new-account-all-bedrock-quotas-stuck-at-0-tpm-0-rpm-in-eu-north-1
17. Bedrock, Titan Text Embeddings : https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html
18. Bedrock, disponibilité par région : https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html
19. Google, résidence des données de Vertex : https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency
20. bge-m3 : https://huggingface.co/BAAI/bge-m3
21. Atlassian, une seule adresse de retour par appli (forum des développeurs) : https://community.developer.atlassian.com/t/multiple-callback-urls-for-a-single-outh-2-0-3lo-app/32413
22. Google, vérification des applis OAuth (appli interne) : https://support.google.com/cloud/answer/13463817
23. AWS, clés KMS de RDS : https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.Keys.html
24. Google, clés du client pour Cloud SQL : https://docs.cloud.google.com/sql/docs/postgres/cmek
25. Microsoft, chiffrement de PostgreSQL avec une clé du client : https://learn.microsoft.com/azure/postgresql/security/security-data-encryption
26. AWS, prix de Fargate à Paris (0,0486 $ par processeur-heure, 0,0053 $ par Go-heure ; liste du 11/09/2026) : https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/eu-west-3/index.json
27. AWS, prix des répartiteurs de charge à Paris (0,02646 $ de l'heure, plus 0,0084 $ par unité de capacité) : https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/eu-west-3/index.json
28. AWS, pgvector 0.8.0 sur RDS : https://aws.amazon.com/about-aws/whats-new/2024/11/amazon-rds-for-postgresql-pgvector-080/
29. Google, extensions de Cloud SQL : https://docs.cloud.google.com/sql/docs/postgres/extensions
30. Microsoft, pgvector sur Azure : https://learn.microsoft.com/azure/postgresql/extensions/how-to-use-pgvector
31. pgvector, licence : https://github.com/pgvector/pgvector/blob/master/LICENSE
32. pg-boss, licence : https://github.com/timgit/pg-boss/blob/master/LICENSE
33. Bedrock, sorties structurées : https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html

Dans le dépôt : [architecture](../architecture-2026-10/README.md), [étude de coûts](../couts-2026-10/README.md), [annexe Glean](../concurrents-2026-10/annexes/01-glean.md). En PR, pas encore fusionnés : [description produit (#22)](https://github.com/DavSperling/leon/pull/22), [étude des agents Glean (#23)](https://github.com/DavSperling/leon/pull/23), [guide des applis OAuth (#20)](https://github.com/DavSperling/leon/pull/20), [modèle choisi par étape (#16)](https://github.com/DavSperling/leon/pull/16).
