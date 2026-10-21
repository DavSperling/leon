# Les opérations : comment Leon tourne au jour le jour

19/10/2026 · Sources internes : `idea.md`, `board.md`, `offer.md`, `pricing.md`, `numbers.json`, `cfo.md`, l'étude de coûts (`docs/etudes/couts-2026-10/`). Prix publics relevés le 19/10/2026, liens dans chaque tableau. Ce document n'est pas un conseil juridique : chaque règle citée doit être confirmée avec un avocat, l'expert-comptable ou l'autorité concernée.

> **Pour le CFO : `numbers.json` a changé. Il faut relancer l'outil.**
> - Expert-comptable : 150 → **99 € par mois** (prix public Dougs, formule « Sérénité » pour une SAS).
> - Ajout : signature électronique **23 € par mois** (Yousign Plus en annuel, source secondaire, à confirmer).
> - Immatriculation : 500 → **252 €** (minimum légal 2026 ; les statuts rédigés par un avocat ne sont pas inclus).
> - Stripe : montant inchangé (0,45 €), mais le libellé ajoute Stripe Billing (0,7 %) que l'estimation n'expliquait pas.
>
> Effet : coûts fixes 840 → **812 € par mois**, dépenses de départ 8 300 → **8 052 €**. Le seuil passe d'environ 62 à environ **60 sièges** (812 / 13,55). C'est à confirmer en relançant l'outil.

## 1. Le cycle de chaque jour

Leon n'a pas de boutique qui ouvre à 8 h. Le cycle tourne autour des pilotes et des clients. La dernière colonne dit si le client le voit.

| # | étape | quand | qui | le client voit ? |
|---|---|---|---|---|
| 1 | **Contrôle du matin** : tableau de bord (erreurs, files d'ingestion, coût LLM de la veille, alertes Supabase et Vercel) | 9 h, 15 min | fondateur d'astreinte | non |
| 2 | **Demandes entrantes** : nouvelles réservations de pilote, réponses aux prospects, prise de rendez-vous d'installation | 9 h 15, 30 min | fondateur « clients » | oui |
| 3 | **Installation d'un pilote** (SOP 1) : visio d'une heure, branchement des sources, exclusions, recettes réglées | sur rendez-vous | les deux fondateurs au début, un seul ensuite | oui |
| 4 | **Audit des partages** (SOP 2) : rapport sur les documents trop partagés, avant de brancher Drive | le jour de l'installation, avant l'ingestion | fondateur d'astreinte | oui (rapport remis) |
| 5 | **Ingestion** : suivi de l'import de l'historique, relance des erreurs, vérification que les exclusions sont respectées | en continu, contrôle à 12 h et 17 h | automatique, contrôlé par l'astreinte | oui (barre d'avancement) |
| 6 | **Test des 10 questions** (SOP 3) : relecture des réponses, score remis au client | J+2 à J+5 du pilote | fondateur « clients » | oui |
| 7 | **Support** : messages des utilisateurs, mauvaises réponses signalées (SOP 4) | réponse en moins de 4 h ouvrées | astreinte | oui |
| 8 | **Facturation** : fin de pilote, passage au payant, comptage des utilisateurs actifs, factures Stripe | le 1er du mois, et à chaque fin de pilote | fondateur « clients » | oui |
| 9 | **Surveillance** : erreurs, coût LLM par siège, disponibilité, alertes de sécurité | alertes en continu, revue à 17 h | astreinte | non |
| 10 | **Incidents** : panne, fuite de permission, réponse fausse grave (SOP 4) | dès l'alerte | astreinte, puis les deux | oui, si l'incident touche le client |
| 11 | **Demandes RGPD** : accès, suppression, export, fin de pilote (SOP 5) | sous 5 jours ouvrés (le délai légal du client est d'un mois) | astreinte | oui |
| 12 | **Clôture** : note du jour dans le journal d'exploitation (incidents, pilotes, chiffres) | 18 h, 10 min | astreinte | non |

### Les cinq premières minutes du client (condition du conseil)

Le conseil demande qu'elles soient écrites et mesurées. Ce qu'on vise, à mesurer sur les premiers pilotes :

1. **Minute 0 à 15** : connexion Google Workspace et sources choisies, exclusions cochées (paie, finance, RH exclues par défaut).
2. **Pendant l'import** : Leon n'affiche pas un champ vide. Il montre ce qui est déjà indexé (« 1 240 mails sur 18 000, les 30 derniers jours sont prêts ») et propose 3 questions qui marchent sur les 30 derniers jours. On importe donc **du plus récent au plus ancien**.
3. **Première bonne réponse le jour même**, pendant la visio, sur une question posée par le client, avec la source citée.
4. **À mesurer à chaque pilote** : durée d'import des 30 derniers jours, durée d'import complet, délai jusqu'à la première bonne réponse. On les note dans le journal (SOP 6).

### Où vit l'expérience principale (condition du conseil)

Pour le pilote : **l'application Leon d'abord.** C'est là qu'on contrôle la citation, le « je ne sais pas » et le score des 10 questions. L'accès par MCP (ChatGPT, Claude, Cursor) est proposé ensuite, comme option. C'est aussi la voie la moins chère (2,5 € par siège au lieu de 5 €, voir `cfo.md`). Mais rien ne garantit que le LLM du client affiche la citation : on le vérifie sur chaque pilote avec les mêmes 10 questions, posées dans les deux interfaces.

### Le cas Slack (condition du conseil)

Depuis le 29 mai 2025 (le 30 juin 2025 pour les applications existantes), les conditions de l'API Slack interdisent à une application tierce de constituer des copies, des archives ou des index durables des données Slack. La distribution commerciale doit passer par la Slack Marketplace. Slack propose à la place une recherche en temps réel, sans stockage ([conditions de l'API](https://slack.com/terms-of-service/api), [changelog du 29/05/2025](https://docs.slack.dev/changelog/2025/05/29/tos-updates/), [Real-time Search API](https://docs.slack.dev/apis/web-api/real-time-search-api/)). Dans le produit et dans l'installation :

- l'écran des sources affiche deux colonnes : **« Leon garde »** (Gmail, Drive, réunions, tickets, CRM) et **« Leon va chercher à la volée »** (Slack) ;
- les réponses qui viennent de Slack portent la mention « trouvé en direct dans Slack, non conservé » ;
- l'application Slack doit être publiée sur la Marketplace avant toute vente. Le délai de revue est à prévoir dans le plan de lancement.

## 2. Les fournisseurs

Montants HT, relevés le 19/10/2026. Les prix en $ sont facturés en dollars.

| poste | fournisseur | prix public | conditions | source | alternatives |
|---|---|---|---|---|---|
| Base de données | **Supabase Pro** (Francfort, déjà en place) | 25 $ par mois, avec 10 $ de crédit de calcul ; instance Small 15 $, Medium 60 $, Large 110 $ ; sauvegardes quotidiennes gardées 7 jours ; restauration à la minute (PITR) 100 $ par mois pour 7 jours | sans engagement, carte | [supabase.com/pricing](https://supabase.com/pricing) | Scaleway, OVHcloud, AWS Paris (relevés dans `couts-2026-10/annexes/04-stockage-infra.md`) |
| Hébergement web | **Vercel Pro** | 20 $ par membre et par mois, 20 $ d'usage inclus. Le plan gratuit Hobby est réservé à un usage personnel non commercial : il faut le Pro pour vendre | sans engagement | [vercel.com/pricing](https://vercel.com/pricing) | Scaleway, Clever Cloud (prix à relever) |
| LLM | **Anthropic, API Claude** | Haiku 5.5 : 0,10 $ / 0,50 $ par million de jetons (entrée / sortie, jusqu'à 100 000 jetons de contexte) ; Sonnet 5.5 : 2 $ / 10 $ ; Opus 5.5 : 4 $ / 20 $ ; batch −50 % ; lecture en cache à 0,1 fois le prix d'entrée (0,05 fois sur Sonnet et Opus 5.5) | prépayé ou facture mensuelle | [pricing Claude](https://platform.claude.com/docs/en/about-claude/pricing) | **AWS Bedrock** en point de terminaison régional UE : **+10 %** sur le prix global, selon la même page ([tarifs Bedrock](https://aws.amazon.com/bedrock/pricing/)). C'est la voie si un client exige un traitement en UE, car l'API Anthropic directe ne propose qu'un routage global ou US. **Mistral** : la page publique cite Mistral Large à 0,5 $ / 1,5 $ ([mistral.ai/pricing](https://mistral.ai/pricing)) ; les autres modèles sont à relever |
| E-mails du produit | **Resend** | gratuit jusqu'à 3 000 mails par mois (100 par jour) ; Pro 20 $ pour 50 000 | sans engagement | [resend.com/pricing](https://resend.com/pricing) | Brevo, Postmark (prix à relever) |
| Paiement | **Stripe** | carte UE standard 1,5 % + 0,25 € ; carte UE premium 2,8 % + 0,25 € ; prélèvement SEPA 0,35 € ; **Stripe Billing 0,7 %** du volume ; Invoicing 0,4 % (2 $ max par facture) | sans abonnement ; virement sur le compte selon le calendrier Stripe | [stripe.com/fr/pricing](https://stripe.com/fr/pricing) | GoCardless pour le prélèvement SEPA (prix à relever). Pour les factures de 200 à 2 000 € par mois, le **prélèvement SEPA à 0,35 €** coûte bien moins que la carte : à proposer par défaut |
| Signature électronique | **Yousign** (renommé Youtrust en 2026) | Plus : 23 € par utilisateur et par mois en annuel, 30 € sans engagement ; Pro : 38 € / 48 € ; signature qualifiée en plus | annuel ou mensuel | source secondaire : [lelabotpe.fr](https://lelabotpe.fr/bureau-mobile/yousign-tarifs/) ; site officiel [yousign.com](https://www.yousign.com/fr-fr), page tarifs inaccessible le 19/10 | Docusign, signature intégrée à Pennylane (prix à relever) |
| Expert-comptable | **Dougs** | SAS : Liberté 79 € par mois, **Sérénité 99 €** (télédéclaration, AG annuelle, dépôt des comptes inclus), Exclusivité 129 € | abonnement mensuel | [dougs.fr/tarifs](https://www.dougs.fr/tarifs) | **Pennylane** logiciel : Basique 29 €, Essentiel 49 €, Premium avec module comptable 149 € par mois ([pennylane.com/fr/tarifs/medium](https://www.pennylane.com/fr/tarifs/medium)) ; un cabinet local, sur devis |
| Assurance RC pro et cyber | **Hiscox** | « à partir de » 21,60 € par mois pour le pack métiers de l'informatique, selon un comparateur ; le cyber est une option | **devis nécessaire** : un SaaS qui stocke des mails clients n'a pas le profil d'un freelance | source secondaire : [sidecare.com](https://www.sidecare.com/responsabilite-civile-professionnelle/hiscox-pack-100k-2022-2023-copie-4c518b4b-3b95-4ebc-a624-8b42631076bf) ; [hiscox.fr](https://www.hiscox.fr/) | Stello, AXA, un courtier spécialisé tech (devis) |
| Audit Google (CASA) | **TAC Security** (laboratoire mis en avant par Google) | niveau 2 : environ 540 $ par an, 720 $ avec rescans illimités, 1 800 $ « Enterprise » ; niveau 3 environ 4 500 $ | **renouvellement tous les 12 mois** | source secondaire : [switchlabs.dev](https://www.switchlabs.dev/post/casa-tier-2-tier-3-security-review-providers-pricing-and-the-cheapest-option) ; cadre officiel : [App Defense Alliance](https://appdefensealliance.dev/casa) ; déjà compté dans les ~500 $ de coûts fixes de l'étude de coûts | autres laboratoires agréés de la liste ADA (plus chers, devis) |
| Audit de sécurité (pentest) | **Vaadata** | selon l'éditeur, 3 500 à 10 000 € pour une startup, « mini-pentest » d'un jour sous 1 500 € | devis | [blog Vaadata](https://www.vaadata.com/en/blog/pentest-for-less-than-1500/) ; [besoins d'une startup](https://www.vaadata.com/en/blog/what-security-needs-and-type-of-pentest-for-startup/) | Yogosha, cabinets locaux (devis). Les 4 000 € de `numbers.json` sont dans la fourchette |
| Avocat (CGV, DPA, confidentialité, note CSE) | avocat en droit du numérique ou des données | **devis nécessaire** ; 2 500 € + 800 € dans `numbers.json`, non vérifiés | forfait à négocier | la CNIL publie des [clauses types responsable / sous-traitant](https://www.cnil.fr/fr/clauses-contractuelles-types-entre-responsable-de-traitement-et-sous-traitant) qui réduisent le travail | legaltech (LegalPlace, Captain Contrat) pour les CGV seulement |

**Ce qui reste à faire chiffrer** (questions ouvertes) : l'assurance RC pro et cyber, l'avocat (contrats, statuts, pacte d'associés), le pentest, et le prix exact de Yousign sur le site officiel.

**À noter** : la mémoire du projet dit que la base Supabase n'a « pas de sauvegarde ». Le plan Pro annonce 7 jours de sauvegardes quotidiennes : il faut vérifier qu'elles sont actives et **tester une restauration** avant le premier pilote. La restauration à la minute coûte 100 $ par mois, à décider dès qu'il y a des clients payants (ce coût n'est pas dans `numbers.json`).

## 3. Les personnes

Deux fondateurs, aucun salarié, **aucune rémunération** (décision des fondateurs, pas de calcul de salaire). Les charges sociales des dirigeants non rémunérés d'une SAS, et le choix d'un éventuel statut ou d'aides (ACRE), sont à voir avec l'expert-comptable.

Deux rôles, qui tournent :
- **Astreinte** (une semaine sur deux) : surveillance, ingestion, support, incidents, demandes RGPD, audit des partages. Celui qui est d'astreinte a son téléphone allumé de 8 h à 20 h en semaine.
- **Clients** : prospection, installations, test des 10 questions, facturation, revue de la semaine.

La rotation est volontaire : les deux doivent savoir tout faire (voir le risque 7). Qui commence où reste à décider entre David et Amos.

### Le premier mois, lent : environ 3 pilotes

Hypothèse de `numbers.json` : 3 pilotes par mois. Un pilote demande environ 6 heures de fondateur sur 30 jours : 1 h d'installation (à deux au début, donc 2 h), 1 h d'audit des partages, 1 h de revue des 10 questions, 4 points de 15 minutes, 45 min d'appel de conversion. Ces durées sont des estimations, à mesurer.

| | lundi | mardi | mercredi | jeudi | vendredi |
|---|---|---|---|---|---|
| **Astreinte** | contrôle 30 min ; produit le reste du jour | contrôle ; produit | contrôle ; audit des partages du pilote de la semaine (1 h) | contrôle ; produit | contrôle ; journal |
| **Clients** | prospection 3 h | installation pilote (1 h, à deux) ; prospection | relances, rendez-vous | revue des 10 questions (1 h) | **revue de la semaine à deux, 1 h** (SOP 6) |

Le temps opérationnel reste faible : **environ 5 h par semaine à deux**. Le reste va au produit (le test qui prouve que Leon bat Claude Team ou ChatGPT Business, demandé par le conseil) et à la vente.

### Avec environ 25 clients (≈ 250 sièges, mois 12 du plan)

| tâche | hypothèse | heures par semaine |
|---|---|---|
| Support et mauvaises réponses | 20 min par client et par semaine (estimation) | 8 h |
| Surveillance, ingestion, incidents | | 4 h |
| Installations | 2 nouveaux clients par mois (le plan passe de 220 à 250 sièges) | 1 h |
| Pilotes en cours | 3 pilotes × 1,5 h | 4,5 h |
| Demandes RGPD, sécurité, CASA, sous-traitants | | 1,5 h |
| Facturation, comptabilité | | 1 h |
| Revue de la semaine | à deux | 2 h |
| **Total opérations** | | **environ 22 h par semaine**, soit un peu plus d'un demi-temps |

| | lundi | mardi | mercredi | jeudi | vendredi |
|---|---|---|---|---|---|
| **Astreinte** | contrôle, support (2 h) | support, ingestion (2 h) | audits, RGPD (2 h) | support (2 h) | support, journal (2 h) |
| **Clients** | prospection, relances (3 h) | installation ou pilote (2 h) | revues des 10 questions (2 h) | appels de conversion (2 h) | revue de la semaine à deux (1 h) ; facturation le 1er du mois |

Au-delà d'environ 50 clients, l'installation à la main n'est plus tenable (`offer.md` le note déjà). Il faudra une installation sans fondateur, ou une première embauche (support). Ce sera à chiffrer par le CFO, avec un salaire tiré d'une source publique.

## 4. Les routines (SOP)

Chaque SOP tient sur une page. Elle doit pouvoir être suivie par l'autre fondateur sans explication.

### SOP 1 : installer un pilote (visio d'une heure)

**Avant la visio (J−2)**
1. Envoyer le dossier confiance : DPA à signer (Yousign), liste des sous-traitants (Supabase, Vercel, Anthropic ou Bedrock, Resend, Stripe), note d'information pour le CSE, politique de suppression.
2. Vérifier que le DPA est signé. **Pas de DPA signé, pas de branchement.**
3. Demander qui sera présent : le dirigeant, et l'administrateur Google Workspace (indispensable pour l'installation à l'échelle du domaine).
4. Demander à l'équipe pilote (10 personnes maximum) d'écrire ses 10 questions, avec les réponses attendues.

**Pendant la visio**
5. (5 min) Rappeler le déroulé et ce que Leon garde ou ne garde pas (Slack : recherche à la volée, rien n'est stocké).
6. (10 min) L'administrateur connecte Google Workspace. Leon lance d'abord l'**audit des partages** (SOP 2), sans rien ingérer.
7. (10 min) Parcourir le rapport d'audit ensemble. Valider les exclusions : paie, finance et RH exclues par défaut ; dossiers, boîtes et canaux en plus si le client le veut.
8. (5 min) Lancer l'ingestion, du plus récent au plus ancien. Montrer la barre d'avancement.
9. (15 min) Régler la recette de l'équipe (fiche client, « ce bug est-il connu ? »…).
10. (10 min) **Première question en direct** sur les 30 derniers jours. Noter le délai jusqu'à la première bonne réponse.
11. (5 min) Fixer la date de la revue des 10 questions (J+3 à J+5) et la date de l'appel de conversion (J+25).

**Après**
12. Noter dans le journal : durée d'import des 30 jours, durée totale, première bonne réponse, exclusions choisies.
13. Envoyer un récapitulatif écrit au dirigeant le jour même.

### SOP 2 : l'audit des partages (avant tout branchement de Drive)

1. Lire seulement les **métadonnées de partage** de Drive (qui voit quoi), pas le contenu.
2. Lister les documents partagés avec « toute l'organisation », « toute personne disposant du lien » ou un groupe de plus de 20 personnes.
3. Les classer : **rouge** (paie, salaires, contrats de travail, arrêts maladie, marges, banque, mots de passe : détection par titre, dossier et type) ; **orange** (finance, RH, juridique) ; **gris** (le reste).
4. Exclure par défaut tout le rouge et l'orange de l'ingestion.
5. Remettre au dirigeant un rapport d'une page : nombre de documents par couleur, les 20 plus exposés, et la règle « Leon applique les droits de Drive : si un document est trop partagé dans Drive, il l'est déjà aujourd'hui ».
6. Le dirigeant choisit : corriger les partages dans Drive, ou garder l'exclusion dans Leon. Sa réponse est notée.
7. Ne rien ingérer de Drive avant cette réponse.

### SOP 3 : la revue du test des 10 questions

1. Vérifier que les 10 questions viennent de l'équipe et que les réponses attendues sont écrites **avant** le test.
2. Poser chaque question dans l'application Leon, puis dans le LLM du client par MCP si l'option est prise.
3. Pour chaque réponse, noter : **juste** (bonne réponse, bonne source citée), **partielle**, **« je ne sais pas »** (acceptable si l'info n'est pas dans les sources branchées), ou **fausse**.
4. Une réponse fausse affirmée avec assurance compte double dans le compte rendu : c'est l'objection n°5 des acheteurs.
5. Chercher la cause de chaque échec : source pas encore importée, document exclu, mauvaise recherche, mauvaise citation. Corriger ce qui peut l'être sans tricher (pas de réglage spécial pour une question).
6. Remettre le score au client, réponse par réponse, avec les causes. Repère du panel : plusieurs acheteurs ne paient qu'à **8 sur 10 ou plus**.
7. Noter le score dans le journal, avec le score par MCP s'il a été mesuré.

### SOP 4 : une mauvaise réponse ou un incident de permission

**Mauvaise réponse (pas de fuite)**
1. Accuser réception dans les 4 heures ouvrées.
2. Retrouver la question dans le journal des questions : sources consultées, citation, modèle utilisé.
3. Classer la cause (source manquante, recherche, raisonnement du modèle, citation fausse) et corriger.
4. Répondre au client avec la cause et la correction. L'ajouter aux tests de non-régression.

**Incident de permission** (quelqu'un a vu, dans une réponse ou une citation, un contenu qu'il ne pouvait pas voir à la source)
1. **Couper tout de suite** : suspendre les réponses pour ce client (ou la source en cause). Ne rien supprimer : garder les journaux.
2. Prévenir l'autre fondateur. Les deux traitent l'incident jusqu'à sa fin.
3. Établir les faits : quelle question, quel utilisateur, quel document, quel droit à la source, depuis quand.
4. **Prévenir le client par écrit sans délai** et au plus tard dans les 24 heures. En tant que sous-traitant, Leon doit notifier le responsable de traitement « dans les meilleurs délais » après en avoir pris connaissance (RGPD, article 33.2). C'est au client de juger s'il doit notifier la CNIL dans les 72 heures ([CNIL : notifier une violation](https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles)). Lui fournir les faits de l'étape 3.
5. Corriger la cause, et tester sur tous les clients, pas seulement celui-ci.
6. Rétablir le service avec l'accord écrit du client.
7. Tenir le registre des violations (obligatoire même si rien n'est notifié), et prévenir l'assureur si le contrat le demande.

### SOP 5 : une demande de suppression RGPD

Leon est **sous-traitant** : le client (l'employeur) est responsable du traitement. Les demandes des salariés s'adressent au client. Leon l'aide à y répondre (RGPD, article 28.3) ([CNIL : droits des personnes](https://www.cnil.fr/fr/respecter-les-droits-des-personnes)).

1. Si la demande arrive directement d'un salarié : ne pas y répondre sur le fond, la transmettre au client dans les 2 jours ouvrés et le dire au demandeur.
2. Obtenir l'instruction écrite du client : qui, quelles sources, quelle période.
3. Supprimer les données brutes, les morceaux indexés, les vecteurs et tout ce qui en est dérivé (étiquettes, fiches, journal des questions de cette personne si le client le demande).
4. Exclure la personne ou la source de l'ingestion future, pour qu'elle ne revienne pas à la prochaine synchronisation.
5. Vérifier par une recherche que plus rien ne sort.
6. Confirmer au client par écrit, avec la date. Préciser que les sauvegardes s'effacent à leur expiration (7 jours sur Supabase Pro), comme l'annonce le DPA.
7. Délai interne : **5 jours ouvrés**. Le client a un mois pour répondre à la personne (RGPD, article 12).

**Fin de pilote sans conversion, ou fin de contrat** : même routine, pour tout le compte, sous 30 jours comme promis dans l'offre. Export proposé avant.

### SOP 6 : la revue de la semaine (vendredi, 1 h, à deux)

1. **Pilotes** : en cours, scores des 10 questions, dates de conversion, ce qui bloque (DPO, CSE, avocat du client).
2. **Clients** : utilisateurs actifs par client (ils font la facture), questions posées par utilisateur, clients qui baissent.
3. **Qualité** : mauvaises réponses signalées et leurs causes, « je ne sais pas », incidents.
4. **Les cinq premières minutes** : durées d'import et délai jusqu'à la première bonne réponse des pilotes de la semaine.
5. **Coût de service par siège** (la ligne à surveiller selon le CFO) : facture LLM et hébergement de la semaine, divisée par les sièges actifs. Alerte au-dessus de 5 € par siège-mois.
6. **Sécurité et conformité** : demandes RGPD ouvertes, échéance CASA, changements chez les sous-traitants, changements des conditions Slack ou Google.
7. **Registre des risques** : relire les 10 risques, mettre à jour.
8. **Décisions** : écrire 3 décisions maximum et qui les porte. Changer de fondateur d'astreinte.

## 5. Les outils

La plus petite pile qui fait tourner l'affaire. La pile produit (Supabase, Vercel, LLM) est dans la partie 2.

| besoin | outil | prix public | pourquoi |
|---|---|---|---|
| Abonnements et paiements | Stripe Billing, prélèvement SEPA par défaut | 0,7 % + 0,35 € par prélèvement | gère la facture à l'utilisateur actif (usage mesuré) ; le SEPA coûte moins que la carte pour des factures B2B |
| Factures et comptabilité | Dougs (Sérénité) | 99 € par mois | bilan, TVA, dépôt des comptes ; la facture électronique entre entreprises devient obligatoire ([impots.gouv](https://www.impots.gouv.fr/professionnel/je-passe-la-facturation-electronique)) : vérifier avec le comptable que Stripe et Dougs suffisent |
| Contrats | Yousign Plus | 23 € par mois (à confirmer) | DPA et bons de commande signés en ligne |
| E-mails produit | Resend (gratuit au départ) | 0 €, puis 20 $ par mois | invitations, alertes, rapport de la semaine |
| Prise de rendez-vous | à choisir (Google Agenda, inclus dans Workspace, suffit au départ) | 0 € | installations et revues |
| Journal d'exploitation et registre | un document partagé dans le repo (`docs/`) | 0 € | journal des incidents, registre des traitements, registre des violations |
| Surveillance | les alertes de Supabase et Vercel, plus une alerte de budget sur la console Anthropic | inclus | erreurs, coût LLM |

## 6. Licences, obligations et conformité (France et UE)

**Ce n'est pas un conseil juridique.** Les règles changent et dépendent de chaque situation. Chaque point doit être confirmé avec un avocat, l'expert-comptable ou l'autorité concernée.

### La société

- [ ] **Immatriculer la SAS** au guichet unique de l'INPI ([procedures.inpi.fr](https://procedures.inpi.fr/)). Coût minimum 2026 : environ 252 € (33,83 € d'immatriculation, 199 € HT d'annonce légale, 19,33 € pour les bénéficiaires effectifs, selon [LegalPlace](https://www.legalplace.fr/guides/cout-creation-sas/)). À faire **avant de signer le premier DPA** : un contrat de sous-traitance se signe entre deux sociétés.
- [ ] Statuts et pacte d'associés entre David et Amos (avocat, sur devis).
- [ ] Compte bancaire professionnel, numéro de TVA intracommunautaire (délivré à l'immatriculation).
- [ ] Facture électronique : se mettre en conformité avec le calendrier de la réforme ([impots.gouv](https://www.impots.gouv.fr/professionnel/je-passe-la-facturation-electronique)).
- [ ] Mentions légales, CGV, politique de confidentialité, gestion des cookies sur le site ([Service Public Entreprendre](https://entreprendre.service-public.fr/vosdroits/F31228)).
- [ ] Assurance RC pro et cyber (devis).

### RGPD : Leon comme sous-traitant de ses clients

- [ ] **DPA conforme à l'article 28** du RGPD avec chaque client ([texte, chapitre IV](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre4) ; [clauses types de la CNIL](https://www.cnil.fr/fr/clauses-contractuelles-types-entre-responsable-de-traitement-et-sous-traitant) ; [guide du sous-traitant](https://www.cnil.fr/sites/cnil/files/atoms/files/rgpd-guide_sous-traitant-cnil.pdf)).
- [ ] **Registre des activités de traitement** : celui de Leon comme sous-traitant (catégories de traitements faits pour les clients), et celui de Leon comme responsable (ses propres prospects et clients) ([CNIL : le registre](https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement)).
- [ ] **Liste des sous-traitants ultérieurs** (Supabase, Vercel, Anthropic ou AWS, Resend, Stripe) avec leurs propres DPA ([Supabase DPA](https://supabase.com/legal/dpa), [conditions commerciales Anthropic](https://www.anthropic.com/legal/commercial-terms)), et un préavis au client avant tout changement.
- [ ] **Transferts hors UE** : Vercel, Anthropic (routage global) et Stripe sont des sociétés américaines. Documenter le mécanisme de transfert et, si besoin, une analyse d'impact des transferts ([CNIL : transférer hors de l'UE](https://www.cnil.fr/fr/transferer-des-donnees-hors-de-lue)). Bedrock en région UE est la réponse pour les clients qui l'exigent.
- [ ] **Registre des violations** et procédure de notification au client (SOP 4).

### RGPD et droit du travail : ce que le client doit faire, et que Leon l'aide à faire

- [ ] **AIPD** : la liste de la CNIL rend l'analyse d'impact obligatoire pour les traitements qui ont pour finalité de « surveiller de manière constante l'activité des employés » ([liste CNIL](https://www.cnil.fr/sites/default/files/atoms/files/liste-traitements-aipd-requise.pdf) ; [CNIL : l'AIPD](https://www.cnil.fr/fr/ce-quil-faut-savoir-sur-lanalyse-dimpact-relative-la-protection-des-donnees-aipd)). Leon n'a pas cette finalité, mais il conserve les mails et les réunions de tous les salariés. Le dossier confiance fournit donc une **AIPD type** que le client adapte. À faire valider par un avocat.
- [ ] **Informer et consulter le CSE** avant la mise en place d'outils qui permettent de contrôler l'activité des salariés ([Code du travail, article L2312-38](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000035610275/)). Le dossier confiance fournit la note d'information. Les sociétés de moins de 50 personnes ont des obligations différentes : à préciser avec l'avocat.
- [ ] **Informer chaque salarié** au préalable (Code du travail, article L1222-4, et la page de la CNIL sur le [contrôle de l'activité des personnes employées](https://www.cnil.fr/fr/controle-de-lactivite-des-personnes-employees)).
- [ ] **La capture des conversations ChatGPT et Claude** reste désactivée par défaut. Son activation demande sans doute une analyse à part : à faire valider avant de la proposer.

### IA

- [ ] **AI Act, article 50** : depuis le 2 août 2026, un système d'IA qui dialogue avec des personnes doit leur dire qu'elles parlent à une IA, sauf si c'est évident ([texte de l'article 50](https://artificialintelligenceact.eu/article/50/) ; [règlement (UE) 2024/1689 sur EUR-Lex](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32024R1689)). Pour Leon : une mention claire dans l'application. Leon ne semble pas relever des usages « à haut risque » de l'annexe III, mais une utilisation pour évaluer des salariés pourrait changer ça : l'interdire dans les CGV et le faire confirmer par l'avocat.

### Plateformes

- [ ] **Google : vérification OAuth et CASA.** Gmail et Drive en lecture sont des scopes « restreints ». Selon Google, toute application qui y accède et peut faire passer les données par un serveur tiers doit passer une évaluation de sécurité selon le cadre CASA, **à renouveler au moins tous les 12 mois** ([vérification des scopes restreints](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), [exigences de vérification](https://support.google.com/cloud/answer/13464321), [évaluation de sécurité](https://support.google.com/cloud/answer/13465431)). L'installation à l'échelle du domaine dispense de la vérification de marque, mais **pas** de la vérification des scopes restreints. Google prévient que la vérification « peut prendre plusieurs semaines ». Une application non vérifiée est limitée en nombre d'utilisateurs et affiche un écran d'avertissement : ce n'est pas acceptable pour un pilote qui vend la confiance. **À lancer maintenant**, avant le premier pilote. Vérifier aussi quel scope demande l'audit des partages (métadonnées de Drive).
- [ ] **Slack** : publication sur la Slack Marketplace, recherche à la volée sans stockage (partie 1).

## 7. Le registre des risques

Probabilité et gravité : faible, moyenne, haute. Estimations des fondateurs à revoir chaque vendredi (SOP 6).

| # | risque | probabilité | gravité | ce qu'on fait avant | ce qu'on fait si ça arrive |
|---|---|---|---|---|---|
| 1 | **Fuite de permission** : un utilisateur voit, dans une réponse ou une citation, un document qu'il ne pouvait pas voir | moyenne | **très haute** (fin de la confiance, violation RGPD) | contrôle des droits à chaque réponse, pas seulement à l'ingestion ; droits les plus restrictifs sur le dérivé ; audit des partages ; tests de non-régression des droits sur chaque version | SOP 4 : couper, prévenir le client sous 24 h, corriger pour tous |
| 2 | **Le pilote ne convertit pas** : « oui » au pilote gratuit ne veut pas dire « je paie » | haute | haute (le plan de 250 sièges repose dessus) | score des 10 questions dès J+5 ; appel de conversion fixé dès l'installation ; offre de lancement à 19 € ; mesurer le taux sur les 5 premiers pilotes | après 5 pilotes sous 40 % de conversion, revoir la cible ou la recette phare avant d'en lancer d'autres |
| 3 | **Google ou Slack change ses règles** : CASA refusé ou retardé, scope retiré, Slack qui durcit encore | haute (Slack l'a déjà fait en 2025) | haute (Gmail et Drive sont le cœur) | lancer la vérification Google maintenant ; ne pas dépendre de Slack pour la valeur ; suivre les changelogs | basculer sur les sources restantes, prévenir les clients, adapter la promesse |
| 4 | **Panne ou hausse de prix du fournisseur LLM** | moyenne (les prix bougent : Anthropic a annulé au dernier moment une hausse prévue de Sonnet 5 au 1er septembre 2026) | moyenne | code capable de changer de modèle (Anthropic, Bedrock UE, Mistral) ; alerte de budget ; suivi du coût par siège chaque semaine | basculer sur l'autre fournisseur ; si le coût dépasse 5 € par siège, pousser l'accès par MCP (2,5 €) |
| 5 | **Une réponse fausse affirmée avec assurance** devant un client | haute | moyenne à haute | « je ne sais pas » préféré à une réponse non sourcée ; citation obligatoire ; test des 10 questions | SOP 4, partie mauvaise réponse ; ajout au jeu de tests |
| 6 | **Un fondateur indisponible** (maladie, vie perso, départ) | moyenne | haute (deux personnes, astreinte) | astreinte qui tourne ; SOP écrites ; accès partagés dans un gestionnaire de mots de passe ; pacte d'associés | l'autre prend l'astreinte ; geler les nouveaux pilotes plutôt que dégrader le support |
| 7 | **Perte de données** : base corrompue, erreur de migration, sauvegarde absente | moyenne (la base partagée a déjà posé des problèmes en développement) | très haute | vérifier les sauvegardes Supabase et tester une restauration avant le premier pilote ; PITR dès les premiers clients payants ; environnements séparés | restaurer, ré-ingérer depuis les sources, prévenir les clients |
| 8 | **Piratage ou fuite de secrets** (clés d'API, jetons OAuth des clients) | faible à moyenne | très haute | jetons chiffrés, secrets hors du repo, accès minimum, double authentification partout, pentest | révoquer tous les jetons, SOP 4, prévenir les clients et l'assureur |
| 9 | **Index vide ou lent au premier contact** | haute | moyenne | import du plus récent au plus ancien ; questions proposées sur les 30 derniers jours ; mesure à chaque pilote | prolonger le pilote, refaire la revue des 10 questions une fois l'import fini |
| 10 | **Le CSE ou le DPO du client bloque** (« surveillance ») | moyenne | moyenne (un pilote perdu ou retardé) | dossier confiance envoyé avant la visio ; capture des conversations IA désactivée ; paie et RH exclues ; journal des questions visible | proposer un périmètre réduit (une équipe, sans réunions), rencontrer le CSE avec le dirigeant |

**Les trois risques à traiter d'abord** : la fuite de permission (1), le pilote qui ne convertit pas (2), et la dépendance aux règles de Google et Slack (3). Le premier tue la confiance, le deuxième tue le plan, le troisième peut couper l'accès aux données.

## Les questions ouvertes

1. Devis : assurance RC pro et cyber, avocat (DPA, CGV, note CSE, statuts, pacte), pentest.
2. Prix exact de Yousign sur le site officiel (page tarifs inaccessible le 19/10).
3. Les sauvegardes Supabase sont-elles actives ? Une restauration a-t-elle été testée ? PITR (100 $ par mois) à ajouter au plan ?
4. Calendrier de la vérification Google (scopes restreints et CASA) : à lancer maintenant ; quel scope l'audit des partages demande-t-il ?
5. Le traitement en UE est-il exigé par les premiers clients ? Si oui, Bedrock UE (+10 %) devient le fournisseur par défaut.
6. Obligations vis-à-vis du CSE pour les clients de moins de 50 personnes, et AIPD type : à faire valider par l'avocat.
7. Les durées des SOP (6 h par pilote, 20 min de support par client et par semaine) sont des estimations : les mesurer sur les 3 premiers pilotes.

Prochaine étape du pack : `/founder-launch`.
