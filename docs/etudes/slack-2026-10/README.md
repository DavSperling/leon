Verdict : non indexable

# Slack : a-t-on le droit de stocker et d'indexer les messages d'un espace ?

19 octobre 2026 · Amos (avec Claude) · à relire par David

Étude courte de la tâche T01 du [plan du deuxième jet](../../plans/2026-10-19-deuxieme-jet.md). Elle tranche la décision 14 de la [spec](../../specs/2026-10-19-deuxieme-jet.md) : Slack n'entre dans ce jet que si ses conditions permettent de stocker et d'indexer les messages. Ce n'est pas un avis juridique : c'est une lecture des textes publics de Slack, relus en entier le 19 octobre 2026. Slack n'a pas été contacté.

## La réponse courte

**Aucune voie permise ne convient à Leon.** T25 ne démarre pas, Slack est repoussé au jet suivant (comme le prévoit la spec), sans mode « en direct » dans ce jet.

1. **Leon est un produit payant, donc une « distribution commerciale » au sens de Slack.** Les conditions de l'API l'écrivent sans ambiguïté : toute appli qui se branche sur l'API de Slack et pour laquelle des utilisateurs peuvent payer (paiement direct, offre gratuite avec options payantes, ou appli gratuite reliée à un produit payant) ne peut être distribuée que par la place de marché de Slack ou par un accord de partenaire. Une appli non listée n'est donc pas une voie.
2. **La voie « le client crée l'appli dans son propre espace à partir d'un manifeste fourni par Leon » est fermée.** Les conditions disent que la règle s'applique « que vous publiiez une appli toute faite ou que vous fournissiez aux clients une appli sur mesure ou un modèle d'appli » reliés à votre produit. Slack a répété la même chose dans son annonce de mai 2025 (en substance : fournir au client des instructions pour une appli modèle personnalisée qui se connecte à votre produit). La seule sortie prévue est une appli « créée pour un seul tiers », ce qui n'est pas un produit vendu à plusieurs PME.
3. **La place de marché est la seule porte, mais elle ne mène pas à ce qu'on veut faire.** Les règles de la place de marché n'interdisent pas, en soi, de stocker des messages avec le consentement de l'organisation. Mais Slack y refuse « probablement » l'accès large à l'historique des messages sans cas d'usage comme la recherche en temps réel, juge « inadaptées » les applis qui exportent ou sauvegardent des messages, et sa propre explication de 2025 vise précisément « les téléchargements en masse de conversations pour les indexer et les interroger ». Il faut aussi 10 installations sur des espaces actifs avant même l'examen, et Leon n'a ni espace Slack ni client Slack.
4. **La voie que Slack propose pour l'IA est la recherche en direct** (Real-time Search API) : on interroge Slack au moment de la question, sans rien copier ni stocker. Elle est réservée aux applis de la place de marché et aux applis internes. C'est exactement le mode « en direct » que la décision 14 exclut de ce jet.
5. **Ce qui reste permis ne concerne pas notre produit** : une organisation qui lit son propre Slack avec une appli qu'elle a faite pour elle seule (appli interne).

## Voie par voie

| Voie | Permise pour un produit payant ? | Stocker et indexer les messages | Lecture de l'historique (nouvelle installation) |
|---|---|---|---|
| **A. Appli non listée** (publiée hors place de marché) | **Non** : la place de marché est « le seul canal approprié » pour la distribution commerciale | Sans objet, la distribution elle-même n'est pas permise | 1 requête par minute, 15 messages au plus par requête |
| **B. Appli créée par le client à partir d'un modèle de Leon** | **Non** : les conditions la visent nommément (« appli sur mesure ou modèle d'appli »), et la politique des développeurs interdit de contourner la place de marché avec « une appli non listée ou personnalisée » parallèle | Sans objet | Ambigu : Slack exempte les applis « internes créées par le client », mais range les modèles d'appli dans la distribution commerciale ; compter sur l'exemption serait un pari contre les conditions |
| **C. Appli interne** (faite et utilisée par une seule organisation pour elle-même) | Oui, mais ce n'est pas la distribution à des clients : la section « Distribution au-delà de votre organisation » ne la concerne pas | Permis dans l'organisation | Limites élevées : 50 requêtes par minute et plus, jusqu'à 999 ou 1 000 messages par requête |
| **D. Appli de la place de marché** | Oui, après examen | Pas interdit en soi avec consentement, mais accès à l'historique « probablement » refusé, voir plus bas ; recherche en direct : copie interdite | Mêmes limites élevées que C |

Une appli faite sur mesure pour un seul client précis échappe aux restrictions de distribution commerciale (exception du « seul tiers »). Ce n'est pas une voie pour Leon, qui doit servir plusieurs organisations avec la même appli, et rien dans les textes publics ne dit comment Slack apprécie ces cas. Si un client pilote demandait ce montage, il faudrait une confirmation écrite de Slack avant d'écrire une ligne.

## Ce que disent les textes (extraits à vérifier)

Citations en anglais, telles que publiées, avec leur sens en français.

**Conditions de l'API (en vigueur depuis le 10 octobre 2025)**

- Distribution commerciale : « You may not Commercially Distribute an Application that integrates with the Slack APIs unless you are authorized to do so under a separate agreement with Slack » : sans accord distinct, pas de distribution commerciale. « For most Applications, obtaining a separate agreement [...] simply means submitting to our Marketplace and agreeing to the Marketplace Agreement. » La règle vaut « regardless of whether you publish an off-the-shelf Application or you provide customers with a custom Application or Application template ». Exception : « created for use only by a single third party ».
- Données des tiers : l'éditeur d'une appli offerte hors de son organisation doit obtenir « explicit authorization » de l'organisation qui l'installe, et limiter l'usage, le traitement et la conservation des données « to the minimum necessary » au fonctionnement de l'appli. Il ne peut pas : « (A) use API Data to train a large language model; (B) bulk export Slack message and file data except where expressly allowed by an additional agreement [...]; or (C) use data collected from one organization to directly benefit a different organization or any third party. »
- Recherche en temps réel : « you may not create persistent copies, archives, indexes, or long-term data stores of other organizations' API Data ». Précision de lecture : cette phrase est écrite pour la Data Access API et la Real-Time Search API seulement. Pour les autres méthodes (historique, Events API), aucune phrase n'écrit « interdit d'indexer » ; l'obstacle vient de la distribution commerciale (réservée à la place de marché), de l'export en masse interdit, de la conservation limitée au « minimum nécessaire » et de la doctrine de Slack décrite plus bas.

**Politique des développeurs (en vigueur depuis le 10 décembre 2024)**

- Interdit : « Collecting, storing, and/or using Data without obtaining proper consent » (avec consentement, ce n'est donc pas interdit en soi) ; « Using Data to train an LLM under any circumstances » ; « Renting, selling or sharing Data with third parties under any circumstances » ; « Circumventing Slack's intended limitations [...] listing an Application in the Slack Marketplace and also offering mutual customers a parallel unlisted or custom Application ».
- Obligations : données stockées et servies « using strong encryption » ; suppression de toutes les données sous 14 jours ouvrés quand un utilisateur supprime l'appli ou que l'éditeur l'abandonne.
- Point d'attention pour une reprise un jour : envoyer des messages Slack à un fournisseur de modèle ou de vecteurs est un partage avec un tiers. Même sur la place de marché, il faudrait que Slack accepte ces sous-traitants (à demander, rien n'est tranché dans les textes).

**Annonce du 29 mai 2025 (mise à jour le 3 juin 2025)** : « bulk downloads of customers' conversational data for indexing and querying pose risks of exposing sensitive information and undermining Slack access controls ». La recherche en temps réel est présentée comme l'alternative : « real-time querying of Slack data without storing it ». Slack dit aussi que les applis non listées « are for development and testing—not large-scale or commercial distribution ».

**Lignes directrices de la place de marché** :

- Applis jugées inadaptées : celles qui « export or backup message data », et celles qui demandent des permissions larges sur les données de l'espace sans cas d'usage qui l'exige.
- Historique : « We are unlikely to approve broad access to workspace message/file data (e.g. user token *:history scopes) without a clear use case that requires them, such as Real-time Search or MCP server functionality ». Les permissions de lecture de l'historique, de recherche et de fichiers déclenchent un examen renforcé.
- Pour les applis avec l'interface d'agent : « DON'T store any Slack data you obtain. Store metadata instead and pull in data in real time ».
- IA : ne jamais entraîner de modèle avec les données ; déclarer le modèle utilisé, la durée de conservation des données chez le modèle, leur lieu de traitement.
- Droits : l'appli ne doit montrer à personne un message que cette personne ne verrait pas dans Slack ; sur l'offre gratuite de Slack, l'historique est limité à 90 jours et l'appli ne doit pas permettre d'aller au-delà.

## Limites de débit

**Voie retenue : aucune.** Voici quand même les limites de la voie la plus proche de Leon (appli commerciale non approuvée, voie A ou B) et celles des autres cas, pour savoir ce que coûterait une reprise.

| Cas | Méthode | Limite |
|---|---|---|
| Appli commerciale hors place de marché, **nouvelle installation** | `conversations.history` et `conversations.replies` | 1 requête par minute, 15 messages au plus par requête (et par défaut) |
| Place de marché, appli interne | mêmes méthodes | Niveau 3 : 50 requêtes par minute et plus ; au plus 999 messages par requête (la page de la méthode dit 999, l'annonce dit 1 000) ; Slack conseille 200 au plus |
| Toutes | Events API (messages reçus au fil de l'eau) | 30 000 évènements par espace, par appli et par heure |
| Place de marché ou interne | Recherche en temps réel (`assistant.search.context`) | « Limites spéciales » : au moins 10 requêtes par minute pour la plupart des équipes, jusqu'à 400 et plus pour les grandes ; 10 requêtes par minute et par utilisateur |

Les limites s'évaluent par méthode et par espace, par fenêtre d'une minute. Ce que donne la ligne non approuvée : reprendre l'historique d'un espace de 10 000 messages prend plus de 11 heures de lecture ininterrompue (667 requêtes), un espace de 500 000 messages plus de 23 jours (33 334 requêtes), sans compter les fils de discussion, lus par l'autre méthode.

À noter : l'ancienne page de l'annonce (api.slack.com, retirée au profit de docs.slack.dev) disait que ces limites s'appliqueraient aussi aux installations existantes le 3 mars 2026. La page actuelle (docs.slack.dev, relue le 19 octobre 2026) dit l'inverse : « The new rate limits will not be applied to existing installations ». Sans conséquence pour Leon, dont toutes les installations seraient nouvelles.

## Ce que deviendrait un passage par la place de marché

Gratuit (« Slack does not charge for Marketplace inclusion »), mais :

1. **10 installations sur des espaces actifs** (utilisés dans les 28 derniers jours, hors espaces de test) avant l'examen, et à garder pendant tout l'examen. Cette exigence est de 10 depuis juillet 2026 ; elle était descendue à 5 de l'été 2025 à l'été 2026. Leon n'a aucun espace Slack. Slack ne dit pas comment atteindre ce seuil sans distribuer l'appli hors place de marché ; ses applis non listées sont « pour le développement et les essais ».
2. **Examen de sécurité et de chaque permission demandée**, renforcé pour la lecture de l'historique, la recherche et les fichiers. Chaque permission doit être justifiée par une fonction que Slack peut tester.
3. **Dossier** : politique de confidentialité et page d'assistance publiques, déclarations sur l'IA (modèle, conservation, lieu de traitement), chiffrement des données, suppression sous 14 jours ouvrés.
4. **Un seul genre d'appli IA y est bien vu : la recherche en direct, sans copie.** Ce serait un autre produit que le moteur de recherche de Leon (index plein texte et vecteurs propres). Pour la lecture de l'historique, la place de marché donnerait les limites élevées (50 par minute et plus), mais son approbation pour copier et indexer les messages est improbable d'après ses propres lignes directrices.

Si le mode en direct est rouvert un jour (jet suivant), l'ordre serait : 10 clients avec un espace Slack, dépôt à la place de marché sur la recherche en temps réel seule, aucune copie des messages, et question à Slack sur les sous-traitants du modèle.

## Ce que ça change pour le plan

- **T25 ne code rien.** Le `catalog.ts` de Slack porte le message prévu par le plan : « Repoussé : les conditions de Slack ne permettent pas de garder ses messages », avec renvoi à cette étude. Le catalogue de T15 garde `slack` avec un `connector.ts` qui exporte `null` (décision 14 du plan) ; rien ne se branche dessus dans ce jet.
- La conclusion et ses sources vont dans la PR (spec, tâche Slack) : ce fichier en est la source.
- À relire avant toute reprise : les conditions de l'API ont déjà changé en mai et en octobre 2025, et les règles de la place de marché changent (seuil d'installations en juillet 2026).

## Réserves

- Lecture des seuls textes publics, sans avis juridique ni contact avec Slack. Les phrases citées sont celles des pages au jour de lecture ; les extraits en anglais sont le texte qui fait foi.
- Le verdict porte sur Leon tel que prévu : produit payant, hébergé, multi-organisations, avec index propre. Une autre architecture (recherche en direct, ou copie sur l'infrastructure du client) donnerait une autre réponse.
- La page des lignes directrices de la place de marché n'affiche pas de date ; la page de la recherche en temps réel ne dit plus « bêta limitée » (l'annonce d'octobre 2025 parlait de « limited release »), sans que la page dise si l'accès est ouvert à toute appli de la place de marché.

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
15. Ancienne page de l'annonce du 29 mai 2025 (date du 3 mars 2026 pour les installations existantes) : <https://api.slack.com/changelog/2025-05-rate-limit-changes-for-non-marketplace-apps>
16. Slack platform usage guidelines (aide de Slack, aucune règle utile à cette question) : <https://slack.com/help/articles/15011454176915-Slack-platform-usage-guidelines>
