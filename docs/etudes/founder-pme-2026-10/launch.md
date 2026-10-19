# Le lancement

19/10/2026 · Étape `founder-launch` du pack. Sources : `idea.md`, `board.md`, `panel/results.md`, `panel-v2/results.md`, `offer.md`, `pricing.md`, `numbers.json`, `cfo.md`, `marketing.md`, `ops.md`. Le fichier `brand.md` n'existe pas encore : le nom n'est pas choisi (« Leon » est un nom de travail, pas tenable). Ce document dit **« le nom retenu »** et fait du choix du nom une tâche datée.

**À lire avant tout :**
- Les acheteurs du panel sont **simulés**. Les chiffres réels du test ci-dessous priment sur eux.
- La répartition des tâches entre David (D) et Amos (A) est **une proposition**, à inverser ou ajuster. Elle suit une logique simple : D porte le produit et Google, A porte la société, le juridique et la vente ; les deux vendent.
- Ce n'est pas un conseil juridique. Les règles de Google, de Slack et du droit français citées ici sont à reconfirmer au moment de les appliquer.

## En bref

| | |
|---|---|
| **Le test** | Du 9 novembre au 4 décembre 2026, sur au moins 20 rendez-vous de dirigeants « noyés dans les outils » : une **réservation de pilote avec moyen de paiement enregistré** (carte ou mandat SEPA, rien n'est débité) et une **lettre d'engagement signée**. |
| **La ligne de succès** | **≥ 5 réservations avec moyen de paiement ET ≥ 3 lettres d'engagement signées, sur 20 rendez-vous.** Écrite avant de commencer. |
| **Le 12 janvier 2027** | **Tenable, mais pas garanti.** La vérification Google des accès Gmail et Drive (avec l'évaluation de sécurité CASA) est sur le chemin critique, et Google ne promet aucun délai (« plusieurs semaines »). Décision ferme le **vendredi 18 décembre**. Date de repli : **mardi 2 février 2027**. |
| **Le chemin critique** | Choisir le nom (30/10) → domaine, site et politique de confidentialité en ligne, application déployée en production (6/11) → dépôt de la vérification Google (13/11 au plus tard) → évaluation CASA et corrections → accord Google (18/12) → pilotes Gmail et Drive à partir du 12/01. En parallèle, sans marge : la SAS immatriculée avant le premier DPA (soft launch du 8/12). |

---

## 1. Le test, avant de dépenser

### Pourquoi ce test

Leon est un abonnement B2B. Le test le moins cher et le plus vrai, c'est une offre de fondateur payée ou engagée d'avance. Mais le panel lui-même a demandé un **pilote gratuit** (c'est la condition n°1 de `offer.md`), et l'offre « Le pilote 30 jours » est gratuite. Demander de payer d'avance contredirait l'offre qu'on veut tester.

Le test garde donc le pilote gratuit, mais remplace le « oui » du panel par **deux engagements réels, qui coûtent quelque chose à l'acheteur** :

1. **La réservation de pilote avec moyen de paiement.** Le dirigeant réserve une date d'installation et enregistre une carte ou un mandat SEPA (Stripe, en mode enregistrement, sans débit). Rien n'est prélevé pendant les 30 jours du pilote. S'il continue après le pilote, la facturation démarre à 19 € HT par utilisateur actif. Le SEPA est proposé parce que `ops.md` le recommande pour des factures B2B (0,35 € par prélèvement) et parce que beaucoup de PME ne paient pas leurs logiciels par carte.
2. **La lettre d'engagement.** Une page, signée en ligne : « Si notre équipe obtient au moins 8 bonnes réponses sur 10 au test des 10 questions, nous passons au payant à 19 € HT par utilisateur actif, pour au moins 5 utilisateurs et 3 mois. » Elle nomme l'équipe pilote, la date d'installation et la présence de l'administrateur Google Workspace. C'est une lettre d'intention conditionnelle, pas un contrat ferme : l'avocat dira comment la rédiger.

Le seuil de 8 sur 10 vient du panel : plusieurs acheteurs ne paieraient qu'à ce score (P007, P015, P017, P018).

### Le déroulé

| | |
|---|---|
| **Quand** | du lundi 9 novembre au vendredi 4 décembre 2026 (4 semaines) |
| **Qui on voit** | des dirigeants de sociétés de services et d'éditeurs SaaS de 10 à 80 personnes, « noyés dans les outils », tirés de la liste des 80 de `marketing.md` (on la commence maintenant au lieu de fin décembre). Pas de prudents sécurité, pas de clients déjà équipés de ChatGPT Business ou Claude Team : le marketing ne les vise pas. |
| **Ce qu'on montre** | une visio de 30 minutes : le pitch de `pitch.md`, puis une démo **sur nos propres outils** (notre Workspace : Google permet sans vérification une application interne à l'organisation), le dossier confiance, l'audit des partages sur nos propres données |
| **Ce qu'on demande** | à la fin, la réservation, puis la lettre. Rien d'autre. |
| **Ce que ça coûte** | du temps (environ 20 h à deux), Stripe sans abonnement, la signature électronique (23 € par mois, déjà dans `numbers.json`) |

**Prérequis** : la SAS immatriculée pour ouvrir Stripe à son nom. Si le Kbis n'est pas là le 9 novembre, on prend d'abord les lettres signées et on enregistre les moyens de paiement dès que Stripe est ouvert.

### La ligne de succès, écrite avant

**Sur au moins 20 rendez-vous tenus entre le 9 novembre et le 4 décembre 2026 : au moins 5 réservations avec moyen de paiement enregistré, et au moins 3 lettres d'engagement signées.**

| résultat | ce qu'on fait |
|---|---|
| **≥ 5 réservations et ≥ 3 lettres** | On continue : avocat, assurance, lancement. Les réservations deviennent les pilotes de janvier. |
| **3 ou 4 réservations, ou 1 ou 2 lettres** | Zone grise : une semaine de plus (jusqu'au 11/12) avec le pitch corrigé d'après les refus notés mot pour mot. Aucune grosse dépense pendant ce temps. |
| **≤ 2 réservations** | On s'arrête. Retour à `/founder-offer` (ou `/founder-pricing` si les refus parlent de prix). Le 12 janvier est abandonné. |

**Pourquoi cette ligne, et ce qu'elle change par rapport à l'étude du 18/10.** L'étude précédente proposait « 5 pilotes réservés avec carte + 3 engagements écrits ». On la garde, et on la précise :
- **Elle a un dénominateur et une date** (20 rendez-vous, 4 semaines). Sans eux, 5 réservations peuvent venir de 15 rendez-vous ou de 100, et ce n'est pas le même marché.
- **5 réservations, c'est la capacité de janvier** : `marketing.md` prévoit 6 pilotes installés en janvier. Le lancement démarre alors avec des pilotes déjà réservés au lieu de partir de zéro le 12.
- **3 lettres, c'est la condition du conseil** (« au moins 3 clients qui confirment le résultat par écrit », `board.md`), et c'est le plan du CFO : 25 sièges payants au mois 3, soit environ 3 sociétés de 8 à 10 personnes.
- **La lettre est liée au score**, ce qui mesure la vraie question que personne n'a encore : le passage du pilote gratuit au paiement (`offer.md`, `cfo.md`).
- **Le SEPA est accepté** à côté de la carte, pour ne pas compter comme un refus ce qui n'est qu'une habitude de paiement.

**La comparaison avec le panel.**

| | panel (simulé) | ligne de succès (réel) |
|---|---:|---:|
| « je lance le pilote gratuit » (panel v2, mêmes 20 acheteurs) | 45 % (9 sur 20) | — |
| réservation avec moyen de paiement | — | 25 % (5 sur 20) |
| achat (panel v1, 100 acheteurs) | 18 % | — |
| lettre d'engagement à payer si 8/10 | — | 15 % (3 sur 20) |

Une réservation avec moyen de paiement engage plus qu'un « oui » de panel au pilote gratuit : on s'attend à environ la moitié du taux du panel, d'où 25 %. La lettre, elle, ressemble à un achat sous condition : 15 % est proche des 18 % du premier panel. **Si le réel tombe sous 10 % de réservations (2 sur 20 ou moins), le panel s'est trompé de beaucoup : on fait confiance aux vrais acheteurs**, pas au panel.

**À noter chaque soir du test** : rendez-vous tenus, réservations, lettres, et les refus mot pour mot (confiance, prix, habitude, autre).

### Ce qu'on dépense avant le résultat, et ce qu'on attend

| dépense (`numbers.json`, `ops.md`) | montant | quand | pourquoi |
|---|---:|---|---|
| Nom de domaine, site, première page | ≈ 500 € (dans les dépenses de départ) | dès le choix du nom | Google l'exige pour la vérification, et le test a besoin d'une page |
| Immatriculation de la SAS | ≈ 252 € | maintenant | DPA, Stripe, Google : tout se signe au nom de la société |
| Évaluation CASA (TAC Security, niveau 2) | ≈ 540 à 720 $ par an | dès l'accord de Google pour lancer l'évaluation | **le délai l'impose** : attendre le résultat du test ferait glisser le lancement d'au moins un mois |
| Contrats relus par l'avocat (CGV, DPA, note CSE) | 2 500 € + 800 € | engagement le 20/11 si la mi-parcours compte ≥ 3 réservations, sinon le 4/12 | le DPA doit être prêt pour le soft launch ; en attendant, on part des clauses types de la CNIL |
| Assurance RC pro et cyber | ≈ 80 € par mois (estimation) | devis maintenant, signature après le test | obligatoire avant le premier pilote réel |
| Audit de sécurité par un tiers | 4 000 € | **après les premiers pilotes payants** | proposition n°3 du CFO : la trésorerie nécessaire passe de 10 284 € à 6 284 €. La cible du lancement n'est pas les prudents sécurité. |

---

## 2. Le 12 janvier tient-il ?

### Ce qui prend du temps (d'après `ops.md`, revérifié le 19/10)

| délai | durée | sur le chemin critique ? |
|---|---|---|
| **Vérification Google des scopes restreints + évaluation CASA** | Google : la vérification de marque prend « généralement 2 à 3 jours ouvrés » ; celle des scopes restreints « peut prendre plusieurs semaines » ; l'évaluation est à renouveler tous les 12 mois ([Google](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)). Aucun délai garanti. | **oui** |
| Choix du nom | dépend des fondateurs ; la vérification Google affiche le nom de l'application et demande un site sur un domaine vérifié. Changer de nom après la vérification oblige à refaire la vérification de marque. | **oui**, parce qu'il précède Google |
| Immatriculation de la SAS | 1 à 3 semaines (dépôt du capital, statuts, guichet unique, Kbis) ; estimation | **oui** pour le soft launch du 8/12 (« pas de DPA signé, pas de branchement », SOP 1) |
| Avocat (DPA, CGV, note CSE) | devis à demander ; 2 à 4 semaines estimées, avec les fêtes au milieu | non, si on part des clauses types de la CNIL pour le soft launch |
| Devis d'assurance | 1 à 2 semaines estimées | non, si on demande cette semaine |
| Sauvegardes Supabase | la mémoire du projet dit « pas de sauvegarde » ; Supabase Pro en annonce 7 jours. Une journée pour vérifier et tester une restauration. | non en durée, mais **c'est une barrière** : aucun pilote sans restauration testée |
| Slack Marketplace | revue de Slack, délai non publié dans nos sources | **non** : on sort Slack des pilotes de janvier (voir plus bas) |

### Ce qui est restreint, exactement

D'après la liste de Google ([aide Google Cloud](https://support.google.com/cloud/answer/13464325)) :

| source | scope | statut | ce que ça demande |
|---|---|---|---|
| Gmail (contenu ou seulement les en-têtes) | `gmail.readonly`, `gmail.metadata` | **restreint** | vérification + CASA |
| Drive (contenu) | `drive.readonly` | **restreint** | vérification + CASA |
| **Drive (métadonnées seulement)** | `drive.metadata.readonly` | **restreint aussi** | vérification + CASA. **L'audit des partages (SOP 2), qui ne lit que les métadonnées, est donc lui aussi bloqué** par la vérification. |
| Drive (fichiers choisis un par un) | `drive.file` | non restreint | ne donne accès qu'aux fichiers que l'utilisateur ouvre ou choisit : inutilisable pour une mémoire |
| Comptes rendus Google Meet | stockés comme documents dans Drive | **restreint** (passe par Drive) | vérification + CASA |
| Google Agenda | `calendar.readonly` | sensible, pas restreint (à confirmer dans la console Google) | vérification simple, sans CASA |
| Notion, Jira, Linear, HubSpot, Pipedrive, GitHub | leurs propres autorisations, hors Google | pas concernés par CASA | chaque plateforme a ses règles pour une application installée chez des tiers, **à vérifier cette semaine** (Zoom, par exemple, demande une publication sur sa Marketplace pour les comptes tiers) |
| Slack | recherche à la volée seulement | règles Slack de 2025 | publication sur la Slack Marketplace avant toute vente |

**Deux exceptions de Google utiles, à manier avec soin** ([aide Google Cloud](https://support.google.com/cloud/answer/13464323)) :
- **Application interne** : utilisée seulement dans notre propre organisation Google Workspace. Elle suffit pour les démos du test, sur nos propres données.
- **Application approuvée par l'administrateur du client** : l'administrateur Google Workspace du client peut ajouter une application tierce à sa liste d'applications de confiance, et une installation par l'administrateur reste possible pour une application non vérifiée, avec un avertissement affiché. C'est permis, mais demander à un dirigeant qui doute de nous d'approuver une application « non vérifiée » contredit tout le dossier confiance. **On ne l'utilise que pour le soft launch, avec des sociétés amies, et avec leur accord écrit.**

### Le verdict

**Le 12 janvier tient si, et seulement si, la vérification Google est déposée au plus tard le vendredi 13 novembre et acceptée au plus tard le vendredi 18 décembre.** Cela laisse environ 5 semaines à Google et au laboratoire CASA, avec Noël juste après. C'est possible, mais rien ne le garantit, et ça dépend d'abord d'un nom choisi avant le 30 octobre.

**Le point de décision : vendredi 18 décembre, à deux.**

| état de Google le 18/12 | décision |
|---|---|
| **Vert** : vérification acceptée | Lancement le **mardi 12 janvier 2027**, comme prévu, avec Gmail, Drive, Meet et l'audit des partages. |
| **Orange** : dossier déposé, CASA en cours, pas de refus | Lancement maintenu le 12 janvier, mais les pilotes de janvier démarrent sur les **sources non restreintes** (HubSpot ou Pipedrive, Notion, Jira ou Linear, GitHub, et Google Agenda si sa vérification est faite). Gmail, Drive et l'audit des partages s'ajoutent dès l'accord de Google, sans refaire l'installation. On le dit clairement au client dans la lettre d'engagement. **Limite honnête** : la promesse « ce qui a été promis au client » vit surtout dans les mails et les réunions. Un pilote sans Gmail est plus faible ; il tient chez les sociétés qui enregistrent leurs mails clients dans HubSpot ou Pipedrive et vivent dans Notion ou Jira. Le test des 10 questions se fait alors sur ces sources seulement. |
| **Rouge** : dossier non déposé au 13/11, refus de Google, ou corrections CASA lourdes | **Lancement repoussé au mardi 2 février 2027.** Tout le calendrier de `marketing.md` glisse de 3 semaines (J-14 = mardi 19 janvier). L'offre des 20 premières sociétés reste valable jusqu'au 31 mars 2027. |

La recommandation : **garder le 12 janvier comme objectif**, tout faire pour être vert, et ne pas faire semblant le 18 décembre. Un lancement public avec un écran « application non vérifiée » ferait plus de mal que trois semaines de retard.

---

## 3. Le compte à rebours

Semaines du lundi au vendredi. ★ = chemin critique (si la tâche glisse, le lancement glisse). D = David, A = Amos (proposition).

### S1, du 19 au 23 octobre : lancer ce qui est long

| tâche | qui | pour le |
|---|---|---|
| Relire ce plan à deux, accepter ou changer la date et la répartition | D + A | ven. 23/10 |
| ★ Ouvrir le choix du nom : liste courte (l'étude du 18/10 proposait Acquis, Pourquoi, Parce), vérifier marque à l'INPI, domaine, comptes LinkedIn | D + A | ven. 23/10 |
| ★ Lancer l'immatriculation de la SAS : statuts, dépôt du capital, devis de l'avocat pour statuts et pacte d'associés | A | ven. 23/10 |
| ★ Lire les exigences Google (vérification des scopes restreints, CASA niveau 2), réduire la liste des scopes au strict nécessaire, préparer le projet Google Cloud de production | D | ven. 23/10 |
| Demander les devis : avocat (DPA, CGV, note CSE), assurance RC pro et cyber (Hiscox, Stello, un courtier tech) | A | ven. 23/10 |
| Vérifier les règles d'installation chez des tiers pour HubSpot, Pipedrive, Notion, Jira, Linear, GitHub, Zoom (application publique, Marketplace, limites) | D | ven. 23/10 |

### S2, du 26 au 30 octobre : le nom

| tâche | qui | pour le |
|---|---|---|
| ★ **Choisir le nom retenu** et acheter le domaine | D + A | **ven. 30/10** |
| ★ Déployer l'application en production (Vercel Pro, base Supabase de production séparée de la base de développement partagée) | D | ven. 30/10 |
| Vérifier que les sauvegardes Supabase sont actives ; **tester une restauration** | D | ven. 30/10 |
| Préparer le test : script du rendez-vous, page de réservation, lettre d'engagement (première version d'après les clauses types de la CNIL, à faire relire), Stripe en mode enregistrement de carte et mandat SEPA | A | ven. 30/10 |
| Commencer la liste des 80 dirigeants (triés « noyés » ou non, déclencheur connu) et caler les 20 premiers rendez-vous | A + D | ven. 30/10 |

### S3, du 2 au 6 novembre : le site et le dossier Google

| tâche | qui | pour le |
|---|---|---|
| ★ Site en ligne sous le nom retenu : page d'accueil, politique de confidentialité, conditions, sur un domaine vérifié dans Google Search Console | A (texte) + D (mise en ligne) | ven. 6/11 |
| ★ Dossier de vérification Google : écran de consentement au nom retenu, justification de chaque scope, vidéo de démonstration | D | ven. 6/11 |
| Démo du test sur nos propres outils (application interne) : 10 questions sur nos données, score réel noté | D | ven. 6/11 |
| Kbis attendu ; ouvrir le compte bancaire et Stripe au nom de la SAS | A | ven. 6/11 |

### S4, du 9 au 13 novembre : le test commence, Google est déposé

| tâche | qui | pour le |
|---|---|---|
| ★ **Déposer la vérification Google** (marque, puis scopes restreints) | D | **ven. 13/11 au plus tard** (viser lun. 9/11) |
| **Test, semaine 1** : 5 à 6 rendez-vous | A + D | ven. 13/11 |
| Audit des partages et test des 10 questions qui marchent sur notre propre Workspace | D | ven. 13/11 |
| Recevoir et comparer les devis (avocat, assurance) | A | ven. 13/11 |

### S5, du 16 au 20 novembre : CASA, mi-parcours du test

| tâche | qui | pour le |
|---|---|---|
| ★ Évaluation CASA dès que Google la demande : choisir le laboratoire (TAC Security niveau 2), lancer le scan, corriger | D | en continu |
| **Test, semaine 2** ; **mi-parcours le vendredi** : si ≥ 3 réservations, engager l'avocat | A + D | **ven. 20/11** |
| Choisir les 2 ou 3 sociétés amies du soft launch (dirigeant qu'on connaît, administrateur Google présent, accord pour une application en cours de vérification) | A | ven. 20/11 |

### S6, du 23 au 27 novembre : test, semaine 3

| tâche | qui | pour le |
|---|---|---|
| **Test, semaine 3** | A + D | ven. 27/11 |
| ★ Corrections CASA, renvoi au laboratoire | D | ven. 27/11 |
| DPA, CGV du pilote, note CSE, AIPD type : première version (clauses types de la CNIL), relue par l'avocat si engagé | A | ven. 27/11 |
| Signer l'assurance RC pro et cyber | A | ven. 27/11 |

### S7, du 30 novembre au 4 décembre : verdict du test

| tâche | qui | pour le |
|---|---|---|
| **Test, semaine 4, et verdict le vendredi** contre la ligne de succès | A + D | **ven. 4/12** |
| Si succès : engager l'avocat s'il ne l'est pas ; fixer les dates d'installation des pilotes réservés (à partir du 12/01) | A | ven. 4/12 |
| Si échec : arrêter le lancement, retour à `/founder-offer` | D + A | ven. 4/12 |
| Préparer le soft launch : comptes, exclusions par défaut (paie, finance, RH), recettes de l'équipe | D | ven. 4/12 |

### S8, du 7 au 11 décembre : le soft launch

| tâche | qui | pour le |
|---|---|---|
| ★ **Soft launch** : installation chez les 2 ou 3 sociétés amies (SOP 1), DPA signé avant, Google en application approuvée par leur administrateur si la vérification n'est pas finie | D + A | **mar. 8/12 au jeu. 10/12** |
| Noter pour chaque installation : durée d'import des 30 derniers jours, durée totale, délai jusqu'à la première bonne réponse | D | à chaque installation |
| Fixer les appels de conversion du soft launch (J+25, soit vers le 4-5 janvier) | A | ven. 11/12 |

### S9, du 14 au 18 décembre : la décision de date

| tâche | qui | pour le |
|---|---|---|
| Revue des 10 questions chez les sociétés amies (J+3 à J+5), causes des échecs, corrections | D | mer. 16/12 |
| Page du pilote finale : pitch, réservation, dossier confiance téléchargeable, sous le nom retenu | A | ven. 18/12 |
| ★ **Point de décision vert / orange / rouge** (partie 2) | D + A | **ven. 18/12** |

### S10, du 21 au 23 décembre : corriger, puis souffler

| tâche | qui | pour le |
|---|---|---|
| Corriger ce que le soft launch a montré ; tests de non-régression des droits | D | mer. 23/12 |
| Fin de la liste des 80 dirigeants ; textes des posts LinkedIn 1 à 9 écrits d'avance | A | mer. 23/12 |
| Pas de prospection du 24 au 28 décembre | — | — |

### S11, du 28 décembre au 1er janvier : J-14

| tâche | qui | pour le |
|---|---|---|
| Calendrier de `marketing.md` : 10 messages « vœux et question » le 29/12, 10 de plus le 30/12 | D 10 + A 10 | mer. 30/12 |
| Astreinte du soft launch (une personne, les sociétés amies utilisent l'outil) | D | ven. 1/01 |

### S12, du 4 au 8 janvier : J-8 à J-4

| tâche | qui | pour le |
|---|---|---|
| Post 1 (lun. 4/01), 20 messages (mar. 5/01), post 2 (mer. 6/01), invitations au petit-déjeuner du 20/01 (jeu. 7/01), relances (ven. 8/01) | D, A | selon `marketing.md` |
| Appels de conversion du soft launch : **premiers chiffres réels de passage au payant** (à lire avec prudence : ce sont des amis) | A | mar. 5/01 |
| Créneaux de démo du 12 au 15 janvier ouverts dans Google Agenda ; installations des pilotes réservés calées | A | ven. 8/01 |
| Dernière vérification : sauvegarde restaurée, alertes Supabase, Vercel et budget Anthropic actives, comptes de démo prêts | D | ven. 8/01 |

### S13, du 11 au 15 janvier : le lancement

| tâche | qui | pour le |
|---|---|---|
| Relecture de la page et du dossier confiance (dim. 10/01), post 3 (lun. 11/01) | D | lun. 11/01 |
| **Lancement** | D + A | **mar. 12/01** |

---

## 4. Le jour du lancement : mardi 12 janvier 2027

**L'offre d'ouverture** (`pricing.md`, `marketing.md`) : le pilote 30 jours, gratuit, une équipe de 10 personnes maximum ; ensuite 25 € HT par utilisateur actif ; **les 20 premières sociétés : 19 € garantis 12 mois, pour un contrat signé avant le 31 mars 2027** ; 6 pilotes possibles en janvier (limite réelle : deux fondateurs installent à la main).

**Les rôles du jour** (proposition) : **D d'astreinte** (produit, ingestion, installations techniques), **A aux clients** (messages, rendez-vous, réservations). Les deux postent.

| heure | qui | quoi |
|---|---|---|
| 8 h 00 | D | Contrôle : tableau de bord, files d'ingestion, erreurs, coût LLM, état de la vérification Google. Page du pilote, réservation et Stripe testés de bout en bout (une fausse réservation, puis supprimée). |
| 8 h 00 | A | Liste des 30 messages du jour prête (15 chacun), personnalisés avec l'accroche 1 (le départ). Agenda : 4 créneaux de démo de 30 min ouverts (11 h 30, 14 h, 16 h, 17 h). |
| 8 h 30 | D | **Post LinkedIn de D** (accroche 1 : « Votre chef de projet senior part vendredi… »), avec le lien de la page du pilote. |
| 9 h 00 à 10 h 00 | A + D | 30 messages personnels envoyés (15 chacun). Jamais de message de masse. |
| 10 h 00 à 11 h 00 | D + A | **Installation d'un pilote réservé pendant le test** (SOP 1), en visio, à deux. Première question en direct, délai noté. |
| 11 h 00 | D | Contrôle de l'ingestion du pilote (30 derniers jours prêts ?). |
| 11 h 30 | A | Démo n°1. |
| 12 h 30 | A | **Post LinkedIn de A** (son propre texte, même offre, accroche 2 ou 3). Réponse à chaque commentaire dans l'heure, toute la journée. |
| 14 h 00 | A | Démo n°2. |
| 15 h 00 à 16 h 00 | D | Installation n°2 si réservée (sinon : réponses aux messages, suivi du pilote du matin). |
| 16 h 00 et 17 h 00 | A | Démos n°3 et n°4. À chaque démo qui dit oui : réservation et lettre d'engagement envoyées dans l'heure. |
| 17 h 00 | D | Contrôle de l'ingestion des pilotes du jour, exclusions respectées, récapitulatif écrit envoyé à chaque dirigeant installé. |
| 18 h 00 | A + D | **Les chiffres du jour**, dans le tableau partagé : messages envoyés, réponses, rendez-vous pris, réservations, lettres, installations, durée d'import, délai jusqu'à la première bonne réponse. |
| 18 h 30 | A + D | Débrief de 15 minutes : ce qui a marché, ce qu'on change demain, journal d'exploitation. |

### Si quelque chose casse (d'après le registre des risques de `ops.md`)

| ce qui casse | ce qu'on fait |
|---|---|
| **L'ingestion plante pendant une installation** (risque 9) | On ne bricole pas devant le client. D met l'import en pause et cherche la cause ; A continue la visio sur ce qui est déjà indexé, ou sur une autre source branchée (HubSpot, Notion), pour obtenir une première bonne réponse. Si rien n'est indexé : on le dit, on reprogramme sous 48 h, récapitulatif écrit le jour même. Le pilote est prolongé d'autant. |
| **L'ingestion plante chez tous les pilotes** | D suspend les nouvelles installations du jour ; A transforme les installations prévues en démos sur nos propres données et propose une nouvelle date. Les posts et les messages continuent : l'offre ne change pas. |
| **Une fuite de permission** (risque 1) | SOP 4 : couper tout de suite les réponses pour ce client, les deux fondateurs arrêtent tout le reste, prévenir le client par écrit sous 24 h, corriger pour tous les clients avant de reprendre. Aucune nouvelle installation tant que la cause n'est pas trouvée. |
| **Une réponse fausse affirmée avec assurance devant un dirigeant** (risque 5) | On le reconnaît sur le moment, on montre la source réelle, on l'ajoute aux tests (SOP 4). Pas de défense. |
| **Google bloque ou affiche un avertissement** (risque 3) | Arrêter les branchements Gmail et Drive ; continuer sur les sources non restreintes ; prévenir les pilotes concernés. |
| **Le fournisseur LLM est en panne** (risque 4) | Basculer sur l'autre fournisseur si le code le permet (Bedrock UE) ; sinon, prévenir les pilotes et décaler les démos. |
| **Le site tombe** | D revient au déploiement précédent sur Vercel ; A envoie le lien de réservation par message en attendant. |
| **Plus de demandes que de places** (plus de 6 pilotes) | Liste d'attente avec une vraie date d'installation en février. On ne monte pas la limite à la hâte : le support se dégraderait. |
| **Personne ne répond** | Pas de pub payée le jour même. On relance le 15/01 avec l'accroche 3, et on regarde la règle du 19/01. |

---

## 5. Les 30 premiers jours (12 janvier au 11 février 2027)

### Les chiffres de chaque vendredi

Notés dans le tableau partagé à la revue de la semaine (SOP 6). Les objectifs et les seuils viennent de `marketing.md` et `cfo.md` ; ceux marqués « proposition » sont nouveaux et à valider.

| chiffre | objectif | seuil qui déclenche un changement | quoi changer | source |
|---|---|---|---|---|
| Taux de réponse aux messages personnels | ≥ 25 % | **< 10 %** après 40 messages | l'accroche, ou la liste (pas assez de « noyés ») | `marketing.md` |
| Pilotes lancés par semaine | 1 à 2 | **0 deux semaines de suite** | l'offre ou la confiance : relire les refus mot pour mot | `marketing.md` |
| Rendez-vous qui deviennent des pilotes | ≥ 30 % | **< 20 %** après 8 rendez-vous | idem ; comparer aux 45 % du panel v2 et au taux réel du test de novembre | `marketing.md` |
| Usage dans les pilotes (utilisateurs qui posent au moins 2 questions dans la semaine) | ≥ 60 % | **< 40 %** en semaine 2 d'un pilote | l'installation et les recettes | `marketing.md` |
| Score au test des 10 questions | ≥ 8 sur 10 | **< 7 sur 10 sur deux pilotes de suite** (proposition) | arrêter les nouvelles installations et corriger le produit | `offer.md`, `ops.md` |
| Délai jusqu'à la première bonne réponse | le jour même, pendant la visio | **plus de 24 h** (proposition) | l'ordre d'import, les questions proposées pendant l'import | `ops.md` |
| Coût de service par siège | ≤ 5 € par siège-mois | **> 5 €** | pousser l'accès par MCP (2,5 €) ; à 11 €, l'année 1 devient négative | `cfo.md`, `ops.md` |
| Sièges payants | 10 fin février (mois 2 du plan), 25 fin mars | **< 10 fin février** | le passage au payant : revoir l'appel de conversion, la recette phare | `numbers.json` |
| Passage du pilote au payant | ≥ 50 % (proposition) | **< 40 % après 5 pilotes terminés** | la cible ou la recette phare, avant de lancer d'autres pilotes | `ops.md`, risque 2 |
| Argent dépensé en marketing | ≤ 1 000 € sur 30 jours | **> 542 € par client payant** | arrêter le canal le plus cher | `marketing.md` |
| Heures de fondateur sur la vente et les pilotes | ≈ 80 h par mois (estimation) | à noter, sans seuil le premier mois | sert à chiffrer le coût d'acquisition en temps (condition du conseil) | `marketing.md` |

**Le seuil de rentabilité, pour situer** : 60 sièges payants (environ 6 sociétés de 10 personnes), selon `cfo.md`. On ne l'atteindra pas dans les 30 jours : les pilotes de janvier finissent mi-février. Les seuls sièges payants possibles avant sont ceux du soft launch (conversion vers le 5 janvier) et des pilotes réservés en novembre.

### Les trois revues

**J+7, mardi 19 janvier (1 h, à deux)**
1. Combien de messages, de réponses, de rendez-vous, de réservations ? Quelle accroche a le mieux répondu ?
2. Les installations de la semaine : durée d'import, délai jusqu'à la première bonne réponse, incidents ?
3. Un post a-t-il fait venir au moins 2 demandes de pilote ? Si oui, test de pub LinkedIn de 300 € sur ce post ; sinon, non (`marketing.md`).
4. Les pilotes réservés en novembre sont-ils tous installés ? Sinon, pourquoi (DPO, CSE, administrateur absent) ?
5. Si on est en orange : où en est Google ? Les pilotes sans Gmail trouvent-ils quand même des réponses utiles ?

**J+14, mardi 26 janvier (1 h, à deux)**
1. L'usage en semaine 2 des premiers pilotes : au-dessus ou en dessous de 40 % ?
2. Les scores des 10 questions : combien de pilotes à 8 sur 10 ou plus ? Les causes des échecs ?
3. Le taux réel rendez-vous → pilote, comparé aux 45 % du panel et aux 25 % de réservations du test : le panel se trompe-t-il, et dans quel sens ?
4. Les sociétés du soft launch ont-elles payé ? Combien de sièges actifs ?
5. Qu'est-ce qui bloque chez les clients : CSE, DPO, avocat, administrateur Google ? Le dossier confiance suffit-il ?
6. Le bilan des canaux de `marketing.md` (jeudi 28/01) : on garde, on change ou on arrête chacun.

**J+30, jeudi 11 février (2 h, à deux)**
1. Combien de pilotes terminés, et combien sont passés au payant ? Au-dessus ou en dessous de 40 % ?
2. Combien de sièges payants, contre 10 prévus fin février et 60 pour le seuil ?
3. Le coût de service réel par siège : sous 5 € ?
4. Le coût par client payant (argent et heures) : sous 542 € ? Quel canal a amené les pilotes qui paient ?
5. Le passage de 19 € à 25 € : tient-on les 19 € pour les 20 premières sociétés jusqu'au 31 mars, comme promis ? (Oui : c'est un engagement public.)
6. Les dépenses repoussées : audit de sécurité tiers (4 000 €), restauration à la minute de Supabase (100 $ par mois), Slack Marketplace. On les déclenche maintenant ?
7. Capacité de février : combien de pilotes à deux sans dégrader le support ?
8. La décision : continuer tel quel, changer l'offre (retour à `/founder-offer`), changer le prix (`/founder-pricing`) ou changer de cible.

---

## Les questions ouvertes

1. **Le nom retenu**, avant le 30 octobre. Tout le chemin critique en dépend.
2. La répartition D / A est-elle la bonne ? Qui commence d'astreinte ?
3. Les règles d'installation chez des tiers pour HubSpot, Pipedrive, Notion, Jira, Linear, GitHub et Zoom (prévu en S1).
4. Le classement de `calendar.readonly` et des scopes de l'API Google Meet dans la console Google.
5. La forme juridique de la lettre d'engagement (avocat).
6. La SAS peut-elle être immatriculée avant le 6 novembre ? Sinon, le test démarre avec les lettres seules.

Prochaine étape du pack : `/founder-plan`, qui compile tout dans le plan d'affaires. Le pack conseille aussi `/founder-brand` pour le nom, qui est désormais sur le chemin critique.
