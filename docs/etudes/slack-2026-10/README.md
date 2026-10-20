Verdict : non indexable

# Slack : a-t-on le droit de stocker et d'indexer les messages d'un espace ?

19 octobre 2026 · Amos (avec Claude) · à relire par David

Étude courte de la tâche T01 du [plan du deuxième jet](../../plans/2026-10-19-deuxieme-jet.md). Elle tranche la décision 14 de la [spec](../../specs/2026-10-19-deuxieme-jet.md) : Slack n'entre dans ce jet que si ses conditions permettent de stocker et d'indexer les messages. Ce n'est pas un avis juridique : c'est une lecture des textes publics de Slack, relus en entier le 19 octobre 2026. Slack n'a pas été contacté. Le verdict « non indexable » a un sens précis, donné juste en dessous : ce n'est pas une interdiction écrite mot pour mot.

## La réponse courte

**« Non indexable » veut dire : aucune voie praticable pour Leon aujourd'hui.** Cela ne veut pas dire « Slack l'interdit mot pour mot » : aucune phrase des textes n'interdit en toutes circonstances de stocker des messages avec le consentement de l'organisation, et la place de marché n'est pas fermée par écrit. Le verdict repose sur trois éléments :

- **(a)** la distribution commerciale d'une appli reliée à l'API de Slack n'est possible que par la place de marché ou par un accord écrit avec Slack ou Salesforce (points 1 et 2) ;
- **(b)** la place de marché exige 10 installations actives avant même l'examen, et l'approbation d'un accès à l'historique pour copier et indexer les messages est improbable d'après ses propres lignes directrices (point 3) ;
- **(c)** la doctrine de Slack, répétée en 2025, vise précisément ce que ferait un moteur comme Leon (les « téléchargements en masse pour indexer et interroger »), et la presse a rapporté que Glean, le produit dont la spec s'inspire, ne pouvait plus mettre les données Slack dans son index (voir « Ce que disent les textes »).

T25 ne démarre donc pas, Slack est repoussé au jet suivant (comme le prévoit la spec), sans mode « en direct » dans ce jet.

1. **Leon est un produit payant, donc une « distribution commerciale » au sens de Slack.** Les conditions de l'API l'écrivent sans ambiguïté : toute appli qui se branche sur l'API de Slack et pour laquelle des utilisateurs peuvent payer (paiement direct, offre gratuite avec options payantes, ou appli gratuite reliée à un produit payant) ne peut être distribuée que par la place de marché de Slack ou par un accord écrit avec Slack ou sa maison mère Salesforce (« a separate agreement with Slack or our parent company, Salesforce », dont l'accord de partenaire). Une appli non listée n'est donc pas une voie.
2. **La voie « le client crée l'appli dans son propre espace à partir d'un manifeste fourni par Leon » est fermée.** Les conditions disent que la règle s'applique « que vous publiiez une appli toute faite ou que vous fournissiez aux clients une appli sur mesure ou un modèle d'appli » reliés à votre produit. Slack a répété la même chose dans son annonce de mai 2025 (en substance : fournir au client des instructions pour une appli modèle personnalisée qui se connecte à votre produit). La seule sortie prévue est une appli « créée pour un seul tiers », ce qui n'est pas un produit vendu à plusieurs PME.
3. **La place de marché est la seule porte, mais elle ne mène pas à ce qu'on veut faire.** Les règles de la place de marché n'interdisent pas, en soi, de stocker des messages avec le consentement de l'organisation. Mais Slack y refuse « probablement » l'accès large à l'historique des messages sans cas d'usage comme la recherche en temps réel, juge « inadaptées » les applis qui exportent ou sauvegardent des messages, et sa propre explication de 2025 vise précisément « les téléchargements en masse de conversations pour les indexer et les interroger ». Il faut aussi 10 installations sur des espaces actifs avant même l'examen, et Leon n'a ni espace Slack ni client Slack. Un jeton en lecture seule sur des canaux publics n'est pas refusé en toutes lettres : il déclenche l'examen renforcé, et c'est à Slack d'en décider.
4. **La voie que Slack propose pour l'IA est la recherche en direct** (Real-time Search API) : on interroge Slack au moment de la question, sans rien copier ni stocker. Elle est réservée aux applis de la place de marché et aux applis internes ; la documentation du serveur MCP de Slack dit la même chose pour la voie MCP : « Only apps published in the Slack Marketplace and internal apps can use MCP at this time ». C'est exactement le mode « en direct » que la décision 14 exclut de ce jet.
5. **Ce qui reste permis ne concerne pas notre produit** : une organisation qui lit son propre Slack avec une appli qu'elle a faite pour elle seule (appli interne).

## Voie par voie

| Voie | Permise pour un produit payant ? | Stocker et indexer les messages | Lecture de l'historique (nouvelle installation) |
|---|---|---|---|
| **A. Appli non listée** (publiée hors place de marché) | **Non** : la place de marché est « le seul canal approprié » pour la distribution commerciale | Sans objet, la distribution elle-même n'est pas permise | 1 requête par minute, 15 messages au plus par requête |
| **B. Appli créée par le client à partir d'un modèle de Leon** | **Non** : les conditions de l'API la visent nommément, section « Commercial Distribution » (« custom Application or Application template »). La clause de la politique des développeurs sur les applis parallèles n'est qu'un renfort, pas le fondement (voir plus bas) | Sans objet | Ambigu : Slack exempte les applis « internes créées par le client » des nouvelles limites (annonce de mai 2025), mais range les modèles d'appli dans la distribution commerciale ; compter sur l'exemption serait un pari contre les conditions |
| **C. Appli interne** (faite et utilisée par une seule organisation pour elle-même) | Oui, mais ce n'est pas la distribution à des clients : selon l'annonce du 13 octobre 2025 (source 6), la section « Distribution au-delà de votre organisation » vise les applis tierces, pas les applis internes personnalisées ; cette phrase d'exemption ne se trouve pas dans le texte des conditions lui-même | Permis dans l'organisation | Limites élevées : 50 requêtes par minute et plus, jusqu'à 999 ou 1 000 messages par requête |
| **D. Appli de la place de marché** | Oui, après examen | Pas interdit en soi avec consentement, mais accès à l'historique « probablement » refusé, voir plus bas ; recherche en direct : copie interdite | Mêmes limites élevées que C |

Une appli faite sur mesure pour un seul client précis échappe aux restrictions de distribution commerciale (exception du « seul tiers »). Ce n'est pas une voie pour Leon, qui doit servir plusieurs organisations avec la même appli, et rien dans les textes publics ne dit comment Slack apprécie ces cas. Si un client pilote demandait ce montage, il faudrait une confirmation écrite de Slack avant d'écrire une ligne.

## Voies écartées

Trois autres voies existent ou existeraient. Aucune n'est praticable pour Leon aujourd'hui ; les voici avec la raison, pour que la décision ne les oublie pas.

- **E. Accord écrit avec Slack ou Salesforce.** Ouvert en théorie : les conditions de l'API parlent de « a separate agreement with Slack or our parent company, Salesforce » (dont un accord de partenaire) et, pour l'export en masse, de « an additional agreement ». Hors de portée sans clients Slack : les textes publics ne disent ni comment l'obtenir, ni à quelles conditions, en dehors de la place de marché, et Leon n'a aucun client Slack à faire valoir. Slack n'a pas été contacté. Si un client pilote Slack se présentait, ce serait la première chose à lui demander par écrit.
- **F. API Discovery.** Les conditions de l'API la citent en exemple d'accord qui permet l'export en masse, malgré l'interdiction : « (B) bulk export Slack message and file data except where expressly allowed by an additional agreement, such as by Applications using the Discovery API for approved security and compliance use cases ». La page d'aide de Slack sur les règles d'usage de la plateforme (source 16) ferme la voie : l'API Discovery « may only be used for security and compliance purposes, ex. eDiscovery, archiving, and data loss prevention (DLP) ». Un moteur de recherche n'est ni de la sécurité ni de la conformité : fermée à Leon.
- **G. Import manuel d'un export de l'espace.** Slack permet à un propriétaire ou à un administrateur d'exporter l'espace en JSON (page d'aide « Export your workspace data », source 20) : messages et liens de fichiers des canaux publics sur tous les forfaits ; canaux privés et messages privés après approbation sur Business+ et Enterprise ; exports récurrents (hebdomadaires ou mensuels) sur Business+. Charger ce fichier dans Leon ne passe pas par les API de Slack, donc sort du champ des conditions de l'API telles qu'elles sont écrites (les autres textes de Slack pour ses clients n'ont pas été lus ici). Écartée de T25 : ce n'est pas un connecteur, c'est un instantané pris à la main, sans synchronisation. Si l'équipe le souhaite, à renvoyer à la fonction « fichiers » du plan, après avoir vérifié que le format de l'export s'y prête.

## Ce que disent les textes (extraits à vérifier)

Citations en anglais, telles que publiées, avec leur sens en français.

**Conditions de l'API (en vigueur depuis le 10 octobre 2025)**

- Distribution commerciale : « You may not Commercially Distribute an Application that integrates with the Slack APIs unless you are authorized to do so under a separate agreement with Slack » (la page dit aussi « or our parent company, Salesforce ») : sans accord distinct, pas de distribution commerciale. « For most Applications, obtaining a separate agreement [...] simply means submitting to our Marketplace and agreeing to the Marketplace Agreement. » La règle vaut « regardless of whether you publish an off-the-shelf Application or you provide customers with a custom Application or Application template ». Exception : « created for use only by a single third party ».
- Données des tiers : l'éditeur d'une appli offerte hors de son organisation doit obtenir « explicit authorization » de l'organisation qui l'installe, et limiter l'usage, le traitement et la conservation des données « to the minimum necessary » au fonctionnement de l'appli. Il ne peut pas : « (A) use API Data to train a large language model; (B) bulk export Slack message and file data except where expressly allowed by an additional agreement, such as by Applications using the Discovery API for approved security and compliance use cases; or (C) use data collected from one organization to directly benefit a different organization or any third party. »
- Recherche en temps réel : « you may not create persistent copies, archives, indexes, or long-term data stores of other organizations' API Data ». Précision de lecture : cette phrase est écrite pour la Data Access API et la Real-Time Search API seulement (la première était en « limited release for interested partners » le 30 janvier 2025, source 21 ; l'annonce d'octobre 2025, source 6, la dit en disponibilité générale). Pour les autres méthodes (historique, Events API), aucune phrase n'écrit « interdit d'indexer » ; l'obstacle vient de la distribution commerciale (réservée à la place de marché), de l'export en masse interdit, de la conservation limitée au « minimum nécessaire » et de la doctrine de Slack décrite plus bas.
- Applis internes : la phrase d'exemption n'a pas été retrouvée dans le texte des conditions lui-même (aucune phrase n'y contient le mot « internal »). Elle vient de l'annonce du 13 octobre 2025 (source 6) : la section « Distribution Beyond Your Organization » s'applique aux applis distribuées hors de l'organisation, « (i.e., third-party apps, not custom internal ones) ». Cela renforce la prudence déjà exprimée sur la voie B : compter sur l'exemption serait un pari.

**Politique des développeurs (en vigueur depuis le 10 décembre 2024)**

- Interdit : « Collecting, storing, and/or using Data without obtaining proper consent » (avec consentement, ce n'est donc pas interdit en soi) ; « Using Data to train an LLM under any circumstances » ; « Renting, selling or sharing Data with third parties under any circumstances ».
- Applis parallèles, clause citée en entier : « Circumventing Slack's intended limitations (including pricing, features and access structures). For clarity, this prohibition extends to listing an Application in the Slack Marketplace and also offering mutual customers a parallel unlisted or custom Application (distributed beyond your organization) that violates our Slack Marketplace app guidelines. » **Renfort, pas fondement.** La clause vise un développeur qui est listé sur la place de marché et qui propose en plus à ses clients une appli parallèle, non listée ou personnalisée, contraire aux lignes directrices de la place de marché. Elle n'interdit pas, à elle seule, une appli jamais listée comme celle de la voie B. Elle ne ferait que renforcer B si Leon était un jour listé tout en gardant un second dispositif ; la raison de la fermeture de A et de B est la section « Commercial Distribution » des conditions de l'API.
- Obligations : données stockées et servies « using strong encryption » ; suppression de toutes les données sous 14 jours ouvrés quand un utilisateur supprime l'appli ou que l'éditeur l'abandonne.
- Point d'attention pour une reprise un jour : envoyer des messages Slack à un fournisseur de modèle ou de vecteurs est un partage avec un tiers. Même sur la place de marché, il faudrait que Slack accepte ces sous-traitants (à demander, rien n'est tranché dans les textes).

**Annonce du 29 mai 2025 (mise à jour le 3 juin 2025)** : « bulk downloads of customers' conversational data for indexing and querying pose risks of exposing sensitive information and undermining Slack access controls ». La recherche en temps réel est présentée comme l'alternative : « real-time querying of Slack data without storing it ». Slack dit aussi que les applis non listées « are for development and testing—not large-scale or commercial distribution ».

**Lignes directrices de la place de marché** :

- Applis jugées inadaptées : celles qui « export or backup message data », celles qui demandent des permissions larges sur les données de l'espace sans cas d'usage qui l'exige, et celles qui « provide only an MCP server without meaningful in-Slack functionality ».
- Historique : « We are unlikely to approve broad access to workspace message/file data (e.g. user token *:history scopes) without a clear use case that requires them, such as Real-time Search or MCP server functionality ». Les permissions de lecture de l'historique (`*:history`), de recherche et de fichiers déclenchent un examen renforcé. Ce texte ne refuse pas en toutes lettres un jeton de lecture seule sur des canaux publics : il le soumet à cet examen renforcé et à la justification d'un cas d'usage.
- Pour les applis avec l'interface d'agent de Slack (section « Agent or Assistant UI », que Leon n'utiliserait pas) : « DON'T store any Slack data you obtain. Store metadata instead and pull in data in real time if needed, i.e. zero-copy. » C'est donc une règle écrite pour cette interface, qui montre surtout la doctrine de Slack.
- IA : ne jamais entraîner de modèle avec les données ; déclarer le modèle utilisé, la durée de conservation des données chez le modèle, leur lieu de traitement.
- Droits : l'appli ne doit montrer à personne un message que cette personne ne verrait pas dans Slack ; sur l'offre gratuite de Slack, l'historique est limité à 90 jours et l'appli ne doit pas permettre d'aller au-delà.

**Corroboration de presse (source secondaire, pas un texte de Slack)** : le compte rendu de Reuters du 11 juin 2025, repris par Yahoo Finance (source 22), rapporte ce que dit The Information : Slack a bloqué l'indexation et la conservation à long terme des données de son API par des applis comme Glean, et Glean a écrit à ses clients que ces changements les empêcheraient « [d']ajouter des données Slack à son index de recherche ou à son graphe de connaissances » (« prevent customers from adding Slack data to their Glean search index or knowledge graph »). C'est la corroboration la plus proche de la spec (« Leon façon Glean »), mais elle ne prouve pas ce que les textes permettent : elle montre comment un acteur du même genre que Leon a lu ces textes.

## Limites de débit

**Voie retenue : aucune.** Voici quand même les limites de la voie la plus proche de Leon (appli commerciale non approuvée, voie A ou B) et celles des autres cas, pour savoir ce que coûterait une reprise.

| Cas | Méthode | Limite |
|---|---|---|
| Appli commerciale hors place de marché, **nouvelle installation** | `conversations.history` et `conversations.replies` | 1 requête par minute, 15 messages au plus par requête (et par défaut) |
| Place de marché, appli interne | mêmes méthodes | Niveau 3 : 50 requêtes par minute et plus ; au plus 999 messages par requête (la page de la méthode dit 999, l'annonce dit 1 000) ; Slack conseille 200 au plus |
| Toutes | Events API (messages reçus au fil de l'eau) | 30 000 évènements par espace, par appli et par heure |
| Place de marché ou interne | Recherche en temps réel (`assistant.search.context`) | « Limites spéciales » : au moins 10 requêtes par minute pour la plupart des équipes, jusqu'à 400 et plus pour les grandes ; 10 requêtes par minute et par utilisateur |

Les limites s'évaluent par méthode et par espace, par fenêtre d'une minute. Ce que donne la ligne non approuvée : reprendre l'historique d'un espace de 10 000 messages prend plus de 11 heures de lecture ininterrompue (667 requêtes), un espace de 500 000 messages plus de 23 jours (33 334 requêtes), sans compter les fils de discussion, lus par l'autre méthode.

À noter : l'ancienne page de l'annonce (api.slack.com, source 15) est toujours en ligne, mais périmée. Son site dit lui-même que la documentation a déménagé vers docs.slack.dev, et pourtant cette page reste servie, avec la date du 3 mars 2026 pour les installations existantes. Elle contredit la page actuelle (docs.slack.dev, relue le 19 octobre 2026), qui dit : « The new rate limits will not be applied to existing installations of unlisted, distributed applications published outside the Marketplace ». C'est un piège pour qui tomberait sur l'ancienne page. Sans conséquence pour Leon, dont toutes les installations seraient nouvelles.

## Ce que deviendrait un passage par la place de marché

Gratuit : la mention vient de la section « Frequently asked questions » de l'annonce du 29 mai 2025 (source 3), en réponse à « Why are you making these changes? » : « Slack does not charge for Marketplace inclusion ». Le Marketplace Agreement lui-même (source 18, dernière modification le 11 juillet 2016) ne parle ni de frais ni d'indexation ; il oblige à respecter les conditions de l'API (« as updated from time-to-time ») et la politique des développeurs (« as updated by Slack from time-to-time »). Mais :

1. **10 installations sur des espaces actifs** (« An active workspace is a workspace that has been used in the past 28 days », hors espaces de test) avant l'examen, et à garder pendant tout l'examen. Les applis sous le seuil sont « blocked from submitting to the Marketplace » (guide d'examen, source 17). Cette exigence est de 10 depuis juillet 2026 ; elle était descendue à 5 de l'été 2025 à l'été 2026. Leon n'a aucun espace Slack. Slack ne dit pas comment atteindre ce seuil sans distribuer l'appli hors place de marché ; ses applis non listées sont « pour le développement et les essais ».
2. **Un délai** : l'examen fonctionnel dure « up to 10 weeks » pour une nouvelle soumission (« the functional review takes up to 10 weeks for new submissions », guide d'examen, source 17). C'est un élément de coût en temps, à ajouter à celui des 10 installations.
3. **Examen de sécurité et de chaque permission demandée**, renforcé pour la lecture de l'historique, la recherche et les fichiers. Chaque permission doit être justifiée par une fonction que Slack peut tester.
4. **Dossier** : politique de confidentialité et page d'assistance publiques, déclarations sur l'IA (modèle, conservation, lieu de traitement), chiffrement des données, suppression sous 14 jours ouvrés.
5. **Le genre d'appli IA mis en avant est la recherche en direct, sans copie.** Les lignes directrices citent aussi des fonctions de serveur MCP comme cas d'usage valable, mais pas un serveur MCP seul sans fonction utile dans Slack ; et la règle « DON'T store » est écrite pour l'interface d'agent de Slack, que Leon n'utiliserait pas. Une appli en recherche en direct serait un autre produit que le moteur de recherche de Leon (index plein texte et vecteurs propres). Pour la lecture de l'historique, la place de marché donnerait les limites élevées (50 par minute et plus), mais son approbation pour copier et indexer les messages est improbable d'après ses propres lignes directrices.

Si le mode en direct est rouvert un jour (jet suivant), l'ordre serait : 10 clients avec un espace Slack, dépôt à la place de marché sur la recherche en temps réel seule, aucune copie des messages, et question à Slack sur les sous-traitants du modèle.

## Ce que ça change pour le plan

- **T25 ne code rien.** Le `catalog.ts` de Slack porte le message : « Repoussé : Slack n'ouvre pas de voie praticable pour garder ses messages », avec renvoi à cette étude. Ce n'est pas « les conditions de Slack ne permettent pas de garder ses messages » : aucun texte de Slack ne l'interdit mot pour mot, c'est l'absence de voie praticable qui ferme, et un avertissement plus fort que les preuves serait faux (le plan T25 dit déjà la bonne formule). Le catalogue de T15 garde `slack` avec un `connector.ts` qui exporte `null` (décision 14 du plan) ; rien ne se branche dessus dans ce jet.
- La conclusion et ses sources vont dans la PR (spec, tâche Slack) : ce fichier en est la source.
- À relire avant toute reprise : les conditions de l'API ont déjà changé en mai et en octobre 2025, et les règles de la place de marché changent (seuil d'installations en juillet 2026).

## Réserves

- Lecture des seuls textes publics, sans avis juridique ni contact avec Slack. Les phrases citées sont celles des pages au jour de lecture ; les extraits en anglais sont le texte qui fait foi.
- « Non indexable » est un verdict pratique : aucune voie praticable pour Leon aujourd'hui, pas une interdiction écrite mot pour mot. Il repose sur trois éléments (distribution commerciale réservée à la place de marché ou à un accord écrit, seuil de 10 installations et approbation improbable, doctrine de Slack), pas sur une phrase unique.
- Le verdict porte sur Leon tel que prévu : produit payant, hébergé, multi-organisations, avec index propre. Une autre architecture (recherche en direct, ou copie sur l'infrastructure du client) donnerait une autre réponse.
- La page des lignes directrices de la place de marché n'affiche pas de date ; la page de la recherche en temps réel ne dit plus « bêta limitée » (l'annonce d'octobre 2025 parlait de « limited release »), sans que la page dise si l'accès est ouvert à toute appli de la place de marché.
- La page de presse (source 22) est une source secondaire : elle rapporte un article de The Information et un courriel de Glean à ses clients, que cette étude n'a pas pu lire.

## Sources

Toutes lues le **19 octobre 2026** (la page elle-même ou, pour les pages en anglais, sa version publique à cette date).

1. Slack API Terms of Service, en vigueur le 10 octobre 2025 : <https://slack.com/terms-of-service/api>
2. Slack App Developer Policy, en vigueur le 10 décembre 2024 : <https://docs.slack.dev/developer-policy/>
3. Annonce « Rate limit changes for non-Marketplace apps », 29 mai 2025, mise à jour pour les applis internes : <https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/>
4. Annonce « Clarifying rate limit changes for non-Marketplace apps », 3 juin 2025 : <https://docs.slack.dev/changelog/2025/06/03/rate-limits-clarity/>
5. Annonce « API Terms of Service updates », 29 mai 2025 : <https://docs.slack.dev/changelog/2025/05/29/tos-updates/>
6. Annonce « Slack API Terms of Service updates », 13 octobre 2025 : <https://docs.slack.dev/changelog/2025/10/13/api-terms-update/>
7. Annonce « Announcing the Slack MCP server and Real-time Search API », 17 février 2026 : <https://docs.slack.dev/changelog/2026/02/17/slack-mcp/>
8. Annonce « Installation requirement for Slack Marketplace apps », 8 juillet 2025 : <https://docs.slack.dev/changelog/2025/07/08/slack-marketplace/>
9. Annonce « Updated installation requirement for Slack Marketplace apps », 1er septembre 2026 : <https://docs.slack.dev/changelog/2026/09/01/slack-marketplace-install-requirement/>
10. Lignes directrices et exigences de la place de marché : <https://docs.slack.dev/slack-marketplace/slack-marketplace-app-guidelines-and-requirements/>
11. Limites de débit de l'API Web : <https://docs.slack.dev/apis/web-api/rate-limits/>
12. Méthode `conversations.history` : <https://docs.slack.dev/reference/methods/conversations.history/>
13. Guide de la Real-time Search API : <https://docs.slack.dev/apis/web-api/real-time-search-api/>
14. Méthode `assistant.search.context` : <https://docs.slack.dev/reference/methods/assistant.search.context/>
15. Ancienne page de l'annonce du 29 mai 2025 (toujours en ligne, mais périmée : elle donne la date du 3 mars 2026 pour les installations existantes, ce que contredit la page de la source 3) : <https://api.slack.com/changelog/2025-05-rate-limit-changes-for-non-marketplace-apps>
16. Slack platform usage guidelines (aide de Slack ; elle ferme la voie Discovery : « may only be used for security and compliance purposes ») : <https://slack.com/help/articles/15011454176915-Slack-platform-usage-guidelines>
17. Guide d'examen de la place de marché (10 espaces actifs, définition de l'espace actif sur 28 jours, examen fonctionnel jusqu'à 10 semaines) : <https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide/>
18. Slack Marketplace Agreement, dernière modification le 11 juillet 2016 : <https://docs.slack.dev/slack-marketplace/marketplace-terms-conditions/slack-marketplace-agreement>
19. Slack MCP server overview (« Only apps published in the Slack Marketplace and internal apps can use MCP at this time ») : <https://docs.slack.dev/ai/slack-mcp-server/>
20. Aide de Slack « Export your workspace data » (export natif de l'espace, voie G) : <https://slack.com/help/articles/201658943-Export-your-workspace-data>
21. Annonce « The Data Access API is here! », 30 janvier 2025 (« limited release for interested partners ») : <https://docs.slack.dev/changelog/2025/01/30/data-access-api>
22. Source secondaire, de presse : Reuters, « Salesforce blocks AI rivals from using Slack data, The Information reports », 11 juin 2025, reprise par Yahoo Finance : <https://finance.yahoo.com/news/salesforce-blocks-ai-rivals-using-014746612.html>
