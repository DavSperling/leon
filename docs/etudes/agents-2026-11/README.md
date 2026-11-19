# Étude agents : livrer quatre recettes finies, pas un atelier d'agents

19 novembre 2026 · David (avec Claude) · à relire par Amos

Annexes : huit rapports dans [`annexes/`](annexes/). [1 marché](annexes/01-marche-demande.md), [2 preuves d'utilité](annexes/02-preuves-utilite.md), [3 plateformes](annexes/03-plateformes-agents.md), [4 assistants déjà payés](annexes/04-assistants-deja-payes.md), [5 agents prêts à l'emploi](annexes/05-agents-prets-a-l-emploi.md), [6 besoins des PME françaises](annexes/06-besoins-pme-francaises.md), [7 faisabilité et risques](annexes/07-faisabilite-risques.md), [8 état interne](annexes/08-etat-interne.md). Suite de l'[étude concurrentielle d'octobre](../concurrents-2026-10/README.md).

Légende, reprise des annexes : **[OFF]** page de l'éditeur ou de l'organisme ; **[TIERS]** presse, blog, comparatif ; **[VENDEUR]** chiffre déclaré par le vendeur ; **[DED]** déduction d'un agent de recherche ; **[code]** et **[doc]** vu dans notre dépôt. Presque aucun chiffre externe n'a été lu sur sa page d'origine : voir « Méthode et limites » avant d'en citer un.

> **Mise à jour du 19/11, après lecture par David.** Il ne retient pas la prudence de cette synthèse (quatre recettes, en brouillon). La direction choisie est un système d'agents qui agissent, pour tous les services : voir [`systeme-complet.md`](systeme-complet.md). Les constats et les sources ci-dessous restent valables.

## La question

Leon est une mémoire unifiée pour PME françaises de 20 à 200 salariés. Elle n'a aucun client payant et se vend mal seule. Faut-il y ajouter des agents IA ? Y a-t-il un marché, sont-ils utiles, et que faut-il construire en premier, à quel prix, avec quels risques ?

## La réponse courte

1. **Oui, mais pas « des agents ».** Il faut livrer trois ou quatre recettes finies, qui lisent tous les outils et rendent un texte ou un brouillon que l'humain valide. Pas d'éditeur d'agents, pas d'agent autonome, pas d'envoi automatique.
2. **L'ordre recommandé** : (1) la fiche client à la demande, (2) le brief avant un rendez-vous, (3) le brouillon de réponse aux mails nourri par l'historique, (4) le point de la semaine par e-mail. Un cinquième, les suites de réunion, seulement si un pilote le demande.
3. **Le marché existe, mais il est étroit et surtout fait d'intentions.** 8 % des dirigeants de moins de 50 salariés utilisent un agent, 69 % « aimeraient » [TIERS, étude payée par un vendeur]. 32 % des PME paient une solution d'IA, 11 % des TPE-PME automatisent une tâche [OFF, France Num 2026].
4. **L'utilité n'est prouvée que dans un cas : un assistant étroit, logé dans l'outil déjà utilisé, avec un humain qui garde la main.** Deux mesures indépendantes existent : +14 % en support, 2 heures d'e-mail en moins par semaine. Rien n'est mesuré en PME. Rien n'est mesuré sur la préparation de rendez-vous.
5. **Leon se vend mal seul pour une raison précise** : la recherche citée avec droits d'origine est incluse dans ChatGPT Business et Claude Team à 20 $ le siège [OFF, par résumé]. Ce que personne n'inclut : croiser tous les outils d'une PME, capter les autres assistants, et livrer un résultat le premier jour sans que quelqu'un construise quoi que ce soit [DED].
6. **Le socle est aux deux tiers écrit**, mais jamais éprouvé : 3 connecteurs sur 42 ont été branchés sur un vrai compte, et le mécanisme « proposer puis confirmer » ne sert que GitHub [code]. Le premier travail est de la plomberie et des essais réels.
7. **Prix** : garder un prix par siège actif, recettes incluses, sans crédits visibles, avec un quota. 25 € tient face à l'empilement d'outils, pas face à la dépense IA médiane d'une PME. C'est à tester avec un pilote payant.
8. **Aucune de ces conclusions n'est validée par un client.** Les acheteurs de nos études internes sont simulés. Le plan de validation en bas de page compte autant que le plan de construction.

## Pourquoi Leon se vend mal seul

| Constat | Source |
|---|---|
| 71 % des entreprises françaises qui n'utilisent pas l'IA « n'en voient pas l'utilité ». C'est le premier frein, devant les compétences (54 %). | [OFF] INSEE, TIC 2025, https://www.insee.fr/en/statistiques/9031103 ([annexe 1](annexes/01-marche-demande.md)) |
| ChatGPT Business inclut « company knowledge » : recherche multi-sources, droits de chaque utilisateur, citations. Claude Team inclut « Ask Your Org ». 20 $ par siège en annuel. | [OFF, par résumé] https://openai.com/index/introducing-company-knowledge/ ; https://academy.claude.com/courses/claude-101/enterprise-search ([annexe 4](annexes/04-assistants-deja-payes.md)) |
| Dans notre panel simulé, les déjà-équipés de ChatGPT Business, Claude Team ou Copilot achètent à 0 %. | [doc] `founder-pme-2026-10/panel-v2/results.md` ([annexe 8](annexes/08-etat-interne.md)) |
| Les clients de Glean apprécient la recherche et l'onboarding, « quasiment jamais les agents ». | [doc] [`cas-usage-2026-10`](../cas-usage-2026-10/README.md) |
| Sans faits datés, Leon « reste une recherche de plus ». | [doc] `marche-2026-10/etat-produit.md` |

Lecture : un dirigeant n'achète pas une recherche, il achète une tâche supprimée [DED, annexe 1]. L'étude d'octobre le disait déjà avec le cas « historique client ». Les agents ne changent pas le produit. Ils lui donnent une porte d'entrée.

## Y a-t-il un marché ?

Oui pour deux agents précis en petite équipe. Non prouvé pour « des agents en PME » en général.

| Signal | Chiffre | Solidité |
|---|---|---|
| Usage d'agents, dirigeants de moins de 50 salariés, France | 8 % en utilisent, 69 % aimeraient | [TIERS] OpinionWay pour Alibaba.com, 501 dirigeants. Étude de vendeur. https://www.prnewswire.com/fr/communiques-de-presse/etude-opinionway-x-alibabacom--en-france-plus-de-deux-tiers-des-dirigeants-de-tpepme-aimeraient-etre-assistes-par-des-agents-ia-mais-seuls-8-l-utilisent-302895930.html |
| PME françaises qui paient une solution d'IA | 32 % des PME, 19 % des TPE-PME ; automatisation de tâches : 11 % | [OFF] France Num 2026, https://www.entreprises.gouv.fr/espace-presse/barometre-france-num-2026-quatre-tpe-pme-sur-dix-utilisent-desormais-lintelligence |
| Usage régulier de l'IA générative en TPE-PME | 17 % (55 % déclarent un usage) | [OFF] Bpifrance Le Lab, janvier 2026 |
| Agents déployés à l'échelle hors grandes entreprises | 22 %, sans progression en un an | [OFF] McKinsey, août 2026, https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai |
| Passage à l'achat malgré les aides | 35 000 entreprises sensibilisées par « Osez l'IA », 70 Diag Data IA engagés | [TIERS], communiqué officiel non vu |
| Assistant de boîte mail | Fyxer : de 1 à 32 M$ d'ARR sur 2025 | [VENDEUR], estimation Sacra proche, https://sacra.com/c/fyxer-ai/ |
| Notes de réunion | Fathom 30 M$ d'ARR en 2025 ; Otter au-delà de 100 M$ | [VENDEUR] et [TIERS] |
| Plateforme d'agents la plus proche de nous | Dust : environ 20 M$ d'ARR, 3 000 organisations, non rentable ; 21 cas clients publiés sur 58 ont moins de 200 salariés | [TIERS] pour l'ARR ; [OFF, lu à la source] https://dust.tt/customers |
| « Employés IA » pour TPE en France | Limova : 7 à 8,6 M€ d'ARR, clients de 2 à 10 salariés | [VENDEUR] et [TIERS] |
| Prix de référence d'un agent en PME | Agences : 3 000 à 50 000 € de mise en place, puis 100 à 3 000 € par mois | [TIERS], sites d'agences |

Ce qu'il faut en retenir :

- **L'argent des agents est ailleurs** : code, service client et juridique des grands comptes (Sierra et Harvey autour de 400 M$ [TIERS]). Ajouter des agents ne nous place pas sur cette vague ([annexe 1](annexes/01-marche-demande.md)).
- **En petite équipe, l'argent prouvé est dans deux agents** : les notes de réunion et la boîte mail. Les deux se branchent en un clic et ne demandent rien à construire ([annexe 5](annexes/05-agents-prets-a-l-emploi.md)).
- **Les PME que Dust sert sont des cabinets de conseil et des éditeurs SaaS**, avec un champion interne et souvent un intégrateur. La PME traditionnelle sans champion n'apparaît nulle part [DED, annexe 3].
- **Le marché adressable calculé en annexe 1 (60 à 175 M€ par an) est fragile.** Il repose sur une part de salariés de bureau non trouvée. Ne pas le citer à l'extérieur.
- **Les tailles de marché des cabinets ne servent à rien** : de 7,6 à 206,5 Md$ pour la même année selon le périmètre.

## Les agents sont-ils utiles ?

Utiles quand ils sont étroits et relus. Non prouvés au-delà.

| Cas d'usage | Preuve | Niveau |
|---|---|---|
| Suggestion de réponse en support | +14 % de problèmes résolus par heure, 5 179 agents, une seule entreprise. [OFF] https://www.nber.org/papers/w31161 | Fort |
| Tri de boîte et brouillons | 2 heures d'e-mail en moins par semaine, essai randomisé, 7 137 salariés. Auteurs en partie salariés de Microsoft. [OFF] https://arxiv.org/abs/2504.11436 | Fort |
| Résumés, premiers jets, recherche interne | 19 à 26 minutes par jour, auto-déclaré ; un essai sans gain démontré. [TIERS] | Moyen |
| Compte-rendu de réunion | Très utilisé, mais aucun effet sur le temps de réunion dans l'essai randomisé. | Moyen à faible |
| Saisie CRM, relances, appels d'offres | Chiffres de vendeurs seulement. | Faible |
| Préparation de rendez-vous, rapports récurrents, accueil | Aucune mesure trouvée. | Non prouvé |

Trois limites à garder en tête ([annexe 2](annexes/02-preuves-utilite.md), [annexe 7](annexes/07-faisabilite-risques.md)) :

- **Les agents autonomes échouent trop souvent.** Sur des tâches de bureau à plusieurs étapes, les bancs d'essai donnent 30 à 65 % de réussite. CRMArena-Pro : environ 58 % en un tour, 35 % en plusieurs [OFF, papier] https://arxiv.org/abs/2505.18878. Les chiffres varient selon la date et la source (TheAgentCompany : 30,3 %, 42,9 % ou 52,7 %).
- **Une partie du gain repart en relecture** : un tiers à 40 % selon des sondages, dont un de vendeur [TIERS].
- **Plus on mesure large, plus le gain rétrécit** : 14 % sur une tâche, 2,8 % des heures de travail, 0,2 % par an à l'échelle de l'entreprise [DED, annexe 2].

Conséquence : ne pas promettre plus de 2 heures par semaine et par personne. C'est le seul gain mesuré proprement, et il porte sur le mail. Tout le reste est à mesurer chez nos pilotes.

## Ce que font Dust, Glean et les autres

| À reprendre | Chez qui | Source |
|---|---|---|
| Des agents préconfigurés, branchés en un clic sur Google ou Microsoft, qui vivent dans l'outil déjà utilisé | Fyxer, Granola, Fathom, Jace | [annexe 5](annexes/05-agents-prets-a-l-emploi.md) |
| Le brouillon, jamais l'envoi. Jace « rédige mais n'envoie jamais ». Qonto fait valider chaque action, avec double authentification | Jace, Qonto | annexes 5 et 6 |
| Les droits repris de la source, appliqués à chaque lecture | Glean | [annexe 3](annexes/03-plateformes-agents.md) |
| Un journal de chaque exécution et un périmètre d'écriture étroit (`drive.file`) | Dust [OFF] | https://dust.tt/blog/product-update-22 |
| Les déclencheurs là où les gens travaillent : e-mail, planification en langage naturel | Dust [OFF] | annexe 3 |
| Le canal des petits intégrateurs : les cas PME français de Dust sont presque tous signés par un partenaire (Idoption, Wesype, socIAty) | Dust | annexe 3 |

| À éviter | Pourquoi | Source |
|---|---|---|
| La galerie d'agents en libre création | Doublons, puis une couche de plus à inventer (les skills) et un outil d'entretien. Un cas rapporté : 850 agents créés, une douzaine utilisés [TIERS, blog d'éditeur] | annexe 3 |
| Les crédits opaques | Tout le monde y est passé en 2026 (Dust le 23/06, Notion le 04/05, OpenAI le 06/07). Aucun ne publie le coût d'une exécution. C'est la plainte la plus constante | annexes 3, 4, 5 |
| Les droits redessinés à la main par un administrateur | Modèle des espaces de Dust. Une PME n'a personne pour ça | annexe 3 [DED] |
| Les plafonds qui poussent vers l'Enterprise | Dust Business : 3 connecteurs de données, 5 espaces, 24 € par siège [OFF, lu à la source] https://dust.tt/home/pricing | annexe 3 |

Glean ne sert pas une société de 30 personnes (minimum annuel de 25 000 à 50 000 $ [TIERS]). Sana est sorti du marché PME en octobre 2026 [TIERS, sources contradictoires].

## Recommandation : quatre recettes, dans cet ordre

L'ordre suit trois critères : ce que le code tient déjà, le risque, et ce qu'aucun assistant payé à 20 $ ne fait. Il ne suit pas le revenu prouvé du marché, qui mettrait le mail et les réunions en tête. Ce choix est discuté plus bas, dans les contradictions.

Efforts selon l'[annexe 8](annexes/08-etat-interne.md), tous déduits du code : petit = quelques jours, moyen = une à deux semaines, gros = un mois ou plus, pour deux fondateurs aidés d'agents de code.

| # | Recette | Preuve de demande | Effort | Écriture dans les outils |
|---|---|---|---|---|
| 1 | Fiche client à la demande | Faible, mais c'est la seule demande entendue d'un vrai dirigeant | Petit | Aucune |
| 2 | Brief avant un rendez-vous | Faible : mise en avant par les vendeurs, aucune mesure | Moyen | Aucune |
| 3 | Brouillon de réponse nourri par l'historique | La plus forte : essai randomisé et revenu Fyxer | Moyen | Brouillon seulement |
| 4 | Point de la semaine par e-mail | Faible : aucun plan PME n'inclut de brief, personne ne le vend seul | Moyen | E-mail à son seul lecteur |
| 5 | Suites de réunion (sous condition) | Forte en revenu, nulle en gain de temps mesuré | Moyen à gros | Brouillon de mail de suivi |

### 1. Fiche client à la demande

- **Preuve de demande.** Le dirigeant en rénovation énergétique rencontré par Amos : « l'historique de ce client, ce qu'on lui a posé, à quel prix, s'il paie encore » [doc, [étude d'octobre](../concurrents-2026-10/README.md)]. C'est un seul témoignage. Appui indirect : 8,65 heures par semaine à chercher de l'information en France [TIERS, étude Atlassian, éditeur intéressé]. Les logiciels du bâtiment concentrent leur IA sur le devis et ne répondent pas à cette question [DED, annexe 6].
- **Ce qui existe.** La discussion le fait déjà à la demande. Mails, CRM, support et réunions sont relevés [code].
- **Ce qui manque.** Une recette nommée. La synthèse large au-delà de 8 appels d'outils et 40 000 caractères. Une notion de « client » : aujourd'hui, seulement des noms en texte. Les fiches de CRM elles-mêmes (étape, montant) ne sont pas relevées, seulement les notes et activités. Aucun connecteur de facturation ni de logiciel métier.
- **Risque.** Sans le statut de paiement, la promesse faite au dirigeant n'est pas tenue (annexe 6). Les noms de client s'écrivent différemment selon les outils. La fiche doit rester un résultat par lecteur, pas une vérité stockée, sinon elle contredit l'abandon des fiches.
- **Le premier jour.** Le client branche sa boîte et son CRM. Il tape un nom de client. Il lit une page : derniers échanges, engagements pris, points ouverts, chaque ligne avec sa source.

### 2. Brief avant un rendez-vous

- **Preuve de demande.** Dust et Glean mettent tous deux la « fiche de compte avant rendez-vous » en tête de leurs cas de vente [OFF pour Dust]. Notre conseil simulé en fait la recette phare, avec la promesse « 2 minutes au lieu de 30 » [doc]. Mais : aucune mesure indépendante (annexe 2), et la préparation de rendez-vous n'apparaît dans aucun guide français de tâches à automatiser (annexe 6). La promesse chiffrée est une hypothèse, pas un fait.
- **Ce qui existe.** Le calendrier de la semaine sur l'Accueil, livré le 16/11, avec titre, heure, participants et source. Le patron du point du matin : matière rassemblée sous les droits du lecteur, un seul appel, cache, plafond en base, revérification à la lecture [code].
- **Ce qui manque.** Relier un rendez-vous à un client. Un rassemblement par personne ou société, et non par dépôt de code. Un connecteur Google Agenda : il n'y en a pas, les rendez-vous Gmail sont déduits des mails. L'écran.
- **Risque.** Gmail est relevé 4 fois par jour : un mail de 17 h 05 est vu le lendemain à 8 h [code]. Coût à plafonner : 0,3 à 12 centimes de dollar par brief selon le modèle [DED, annexe 7].
- **Le premier jour.** Le client ouvre l'Accueil, clique sur le rendez-vous de demain, et lit le brief : qui est en face, où en est le dossier, ce qui a été promis, les trois points à aborder. Rien ne sort de l'application.

### 3. Brouillon de réponse nourri par l'historique

- **Preuve de demande.** C'est la mieux prouvée. 2 heures d'e-mail en moins par semaine dans un essai randomisé [OFF]. Fyxer vend ce seul service 30 à 50 $ par siège [TIERS, prix contradictoires selon la date]. Un dirigeant français reçoit 390 mails par semaine [OFF/TIERS, OICN 2025, échantillon de grandes organisations].
- **Ce qui existe.** Les mails sont relevés. Les droits d'écriture sont déjà accordés : `Mail.ReadWrite` pour Outlook, qui ne permet pas d'envoyer, et `gmail.modify` par Pipedream [code]. La carte d'action et son journal existent.
- **Ce qui manque.** La fonction « créer un brouillon » dans les clients Gmail et Outlook. Des types d'action hors GitHub : la base n'accepte que 14 types `github.*`. Des essais réels.
- **Risque.** C'est la première écriture hors GitHub, et le mail auquel on répond peut porter une injection. Il faut filtrer liens et images dans le brouillon et limiter le destinataire à l'expéditeur [DED, annexe 7]. En automatique sur chaque mail reçu, l'effort devient gros et le contenu d'un tiers devient le déclencheur : à ne pas faire d'abord.
- **Notre différence possible.** Un brouillon nourri par le CRM, les tickets et les réunions, pas seulement par la boîte. C'est une hypothèse [DED, annexe 5].
- **Le premier jour.** Depuis un brief ou une discussion, le client demande « prépare la réponse ». Il voit le texte et ses sources sur une carte. Il clique. Le brouillon apparaît dans sa boîte. Rien n'est envoyé.

### 4. Point de la semaine par e-mail

- **Preuve de demande.** Aucun des cinq grands assistants n'inclut de brief dans un plan PME : Pulse est réservé à ChatGPT Pro [OFF, par résumé ; « non trouvé » ailleurs ne veut pas dire absent]. Le « rapport hebdo pour le dirigeant » est déjà dans notre offre [doc]. Contre : le brief n'est jamais vendu seul, c'est une fonction d'appel [DED, annexe 5].
- **Ce qui existe.** L'outil `activite`, le tic planifié, le patron du point, Resend [code].
- **Ce qui manque.** Tout l'envoi de contenu : aucun e-mail de Leon ne porte aujourd'hui de contenu de la mémoire. Le réglage du jour et de l'heure. Et surtout : le point du matin actuel n'existe que pour qui a des sessions de code ou un dépôt GitHub. Pour un commercial ou un dirigeant, il n'y a rien.
- **Risque.** Un e-mail sort le contenu des droits : il doit être écrit sous les droits du destinataire et ne peut plus être revérifié. Un rapport sur l'équipe lu par le manager est le cas type du « mouchard ». Rester sur un point personnel.
- **Le premier jour.** Rien, justement : il arrive le lundi suivant. C'est une recette de rétention, pas de démonstration.

### 5. Suites de réunion, sous condition

- **Pour.** C'est le plus gros revenu cumulé en petite équipe [VENDEUR/TIERS]. L'annexe 5 le recommande en premier. Huit connecteurs de réunion relèvent déjà les transcriptions [code].
- **Contre.** La transcription est devenue gratuite (Fathom, Circleback, Meet, Notion). Le seul essai randomisé ne trouve aucun gain de temps. Aucun connecteur de réunion n'a été essayé en réel. Nous l'avons écarté le 25/10 parce que Granola, Fathom et Linear le font. Garder ce qui se dit en réunion est le premier refus de notre panel.
- **Décision proposée.** Ne pas le construire maintenant. Le rouvrir si un pilote a déjà un outil de réunion et demande le mail de suivi avec le contexte client.

### Le socle, à construire une fois

Trois briques servent plusieurs recettes [déduit, annexe 8] : la synthèse large (recettes 1 et 4), les actions hors GitHub avec une boîte « à valider » (recette 3), l'envoi par e-mail sous les droits du destinataire (recette 4). S'y ajoutent un plafond de dépense par organisation, qui n'existe pas, et un connecteur Google Agenda.

Ordre de construction proposé :

1. **Essais réels** des connecteurs du premier pilote, avant tout code d'agent. Vérifier d'abord quel logiciel métier et quelle facturation il utilise.
2. **Recettes 1 et 2**, dans l'application, à la demande. Elles ne rouvrent aucune décision.
3. **Recette 3**, à la demande, Outlook d'abord puisque le droit natif existe.
4. **Recette 4**, une fois l'envoi écrit.

Soit trois à cinq semaines pour les trois premières recettes si les estimations de l'annexe 8 tiennent, hors essais réels et hors vérifications juridiques [déduit]. Aucune de ces estimations n'est chiffrée dans le dépôt.

En parallèle, à faible coût : publier le serveur MCP dans les annuaires de ChatGPT, Claude et Copilot. Le format commun est un serveur distant avec `search` et `fetch` en lecture seule et OAuth, et notre serveur a déjà ces deux outils [DED annexe 4 ; code]. Les recettes peuvent aussi être livrées en prompts MCP, comme le prévoyait la spec du 19/10. C'est la réponse au déjà-équipé qui dit « que Leon se branche dans mon Claude Team ». Aucune jeune pousse qui vit de ces annuaires n'a été trouvée : c'est un canal à tester, pas un plan de revenus. À vérifier : la migration vers MCP 2026-07-28, sans session.

## Ce qu'il ne faut pas construire

| Quoi | Pourquoi | Source |
|---|---|---|
| Un éditeur ou une galerie d'agents | Dust, Glean, Notion, Rovo et ChatGPT en ont un, à 20-25 € le siège ou inclus. Décision interne déjà écrite deux fois. Qui entretiendrait les agents dans une PME de 50 personnes ? | annexes 3, 4, 8 |
| Les agents génériques : recherche approfondie, tableurs, présentations, tâches planifiées | Inclus ou annoncés chez au moins trois des cinq grands assistants | annexe 4 [DED] |
| Un « commercial IA » autonome ou des « employés IA » | Désabonnement cité de 50 à 80 % [TIERS, sans mesure neutre] ; Sintra noté 2,4/5 sur G2 ; Lindy et Motion ont quitté ce positionnement | annexe 5 |
| L'envoi automatique de mails, et tout agent qui lit du contenu externe puis écrit dans la foulée | « Triplet fatal » : données privées, contenu non fiable, canal sortant. EchoLeak, ShadowLeak, AgentFlayer ont touché Microsoft, OpenAI, Google, Salesforce | [OFF, auteur] https://simonwillison.net/tags/lethal-trifecta/ ; annexe 7 |
| Le suivi des engagements et des relances | C'est l'extraction abandonnée le 19/10. Effort gros, bruit, 7,70 $ par personne mesurés au premier jet | annexe 8 |
| Un agent qui répond dans Slack ou Teams | Tout le canal est à écrire. Une réponse en canal montre le contenu à des gens aux droits différents. Les conditions de Slack sont déjà un problème | annexes 7, 8 |
| Devis, paiements, comptabilité, paie, accueil téléphonique | Pris par ceux qui possèdent la donnée : Obat, Batappli, Qonto, Pennylane, PayFit, Ringover | annexe 6 [DED] |
| Un agent de support qui résout seul | Le seul agent autonome qui se vend bien, mais au résultat (0,50 à 2 $ la résolution) et par les éditeurs de helpdesk | annexes 5, 7 |
| Un rapport sur l'équipe pour le manager | Premier refus du panel : la surveillance. « Pas un mouchard » | [doc] [`PRODUCT.md`](../../../PRODUCT.md) |
| Des crédits visibles, ou des outils d'écriture exposés par MCP sans validation côté serveur | Factures surprises ; un modèle que nous ne contrôlons pas aurait la main | annexes 5, 7 |

## Prix et emballage

- **Garder un prix par siège actif, recettes incluses, sans crédits visibles.** Tout le marché est passé aux crédits en 2026 et s'en fait reprocher l'opacité. Un quota par siège protège la marge : le plafond en base existe déjà pour le point (4 par jour) [code].
- **25 € HT tient face à l'empilement.** Équiper 30 personnes en mail, réunions, support et automatisation coûte 50 à 105 $ par personne et par mois [DED, annexe 5]. Dust Pro est à 24 €, avec 3 connecteurs [OFF].
- **25 € ne tient pas face à la dépense réelle.** L'entreprise américaine médiane qui paie de l'IA dépense 16,32 $ par salarié et par mois, tous outils confondus, dans un échantillon très technophile [OFF, Ramp] https://ramp.com/data/ai-index. Limova vend un forfait de 80 à 140 € pour cinq utilisateurs [TIERS]. Un déjà-équipé à 20 $ n'ajoute pas 25 €.
- **Parler au dirigeant en forfait mensuel.** Son prix de référence pour un agent est le forfait d'agence : 200 à 900 € par mois après quelques milliers d'euros de mise en place [TIERS]. 30 sièges à 25 € font 750 € : même zone, sans projet sur mesure [DED, annexe 1].
- **Pas de minimum de sièges, essai immédiat.** L'entrée se fait par une personne, pas par un achat d'équipe [DED, annexe 5].
- **Deux emballages à tester.** « Leon complet » avec les recettes. Et « Leon dans votre assistant » par MCP pour les déjà-équipés, dont le prix reste à fixer ; son coût de service est estimé à 2,5 $ par siège [doc].
- **Pas de prix au résultat.** Un brief ou un brouillon n'a pas de résultat comptable [DED, annexe 7].
- **La marge est le point dur.** Un usage soutenu coûte environ 12 $ par siège et par mois en mélangeant petit modèle, cache et lots ; 17 à 35 $ sur le modèle moyen [DED, annexe 7, hypothèses de volume fortes]. Nos documents comptaient 4 à 11 $ avec le chat, et 13,55 € de marge au prix de lancement de 19 € [doc]. Avec des recettes utilisées chaque jour, 19 € laisse peu [déduit]. Mesurer le coût réel par siège pendant le pilote avant de fixer le prix.

## Plan de validation

Leon n'a aucun client. Les panels et le conseil sont simulés. Le test interne du 9 novembre au 4 décembre n'a pas de compte-rendu dans le dépôt. Ce plan est une proposition.

1. **Avant de coder : dix à quinze entretiens** dans un ou deux secteurs, en commençant par la rénovation énergétique. Trois questions que les annexes laissent sans réponse : quelles tâches le dirigeant veut déléguer, classées ; quels outils il utilise vraiment (logiciel métier, facturation) ; qui entretiendrait quoi que ce soit chez lui. Montrer une maquette de la fiche client et du brief.
2. **Trois pilotes de 30 jours, dont au moins un payant.** C'était déjà la conclusion d'octobre. Un pilote chiffré en PME serait une preuve que personne n'a (annexe 2).
3. **Brancher le pilote sans attendre les vérifications.** Chez Google, une appli « Internal » au Workspace du client ou marquée « Trusted » par son admin n'exige aucune vérification [OFF] https://support.google.com/cloud/answer/13463817?hl=en.
4. **Mesurer nous-mêmes**, puisque personne ne l'a fait : le temps de préparation d'un rendez-vous avant et après ; la part de brouillons envoyés sans réécriture ; le nombre de personnes actives chaque semaine à la quatrième semaine ; le coût de modèle par siège. Les abonnés d'applications d'IA résilient surtout dans les deux premiers mois [TIERS].
5. **Tester le prix pendant le pilote** : forfait d'équipe contre prix par siège, et l'emballage MCP chez un déjà-équipé.
6. **Fixer les critères d'arrêt avant de commencer.** Par exemple : si aucun pilote ne paie à la fin, ou si moins de la moitié des personnes utilisent une recette chaque semaine au bout d'un mois, on ne construit pas la suite. Les seuils sont à choisir par David et Amos.
7. **Tester un canal** : deux ou trois petits intégrateurs ou agences d'automatisation, qui ont les clients et facturent surtout de la supervision [DED, annexes 1 et 3].
8. **Au-delà de 50 salariés, préparer un dossier pour le CSE.** Voir plus bas.

## Où les annexes se contredisent

| Sujet | Les versions | Notre lecture |
|---|---|---|
| Le premier agent | Annexe 2 : brouillons de mail, puis support. Annexe 5 : suites de réunion, puis brouillons. Annexes 3, 6, 8 : fiche client et brief de rendez-vous | La preuve externe va au mail. Le code et la demande du pilote vont à la fiche client. On commence par ce qui est petit et sans écriture, et le pilote dira si le brouillon doit passer devant |
| Le point du matin | Annexes 3 et 4 : c'est déjà un agent planifié, à mettre en avant. Annexe 5 : il ne suffit pas, personne ne le vend seul. Annexe 8 : il n'existe que pour les équipes de code | L'annexe 8 a lu le code. Pour une PME non technique, le point du matin est à construire |
| Notre avantage en connecteurs | Annexe 3 : « 40 connecteurs contre 3 » chez Dust. Annexe 8 : 3 sur 42 essayés en réel ; Gmail, Drive et Slack par Pipedream en mode développement | L'avantage est sur le papier tant que les essais réels ne sont pas faits |
| Le prix de 25 € | Annexe 5 : il tient. Annexe 1 : au-dessus de la dépense médiane. Annexe 6 : il se heurte au forfait de Limova | Les trois ont raison selon le point de comparaison. À trancher en pilote |
| Le coût par siège | Annexe 7 : environ 12 $ en usage soutenu. Documents internes : 4 à 11 $ | Hypothèses de volume différentes. À mesurer |
| Chiffres Ramp | 85 000 entreprises et 16,32 $ par salarié (annexe 1) ; 70 000 et « environ 12 $ par mois » (annexe 4) ; part d'Anthropic 43,8 % ou 44,8 % | Relevés de mois différents. Citer le mois |
| Enquête OpinionWay pour Alibaba.com | Terrain du 24 août au 11 septembre (annexe 1) ou octobre 2026 (annexe 6) | Non tranché |
| Prix de Limova, Fyxer, Langdock, Sana, Mistral | Deux ou trois grilles chacun | Aucun n'a été lu sur la page officielle |
| Désillusion | Ramp : la dépense ralentit à cause de la baisse des prix. TechCrunch et Apollo : plafonnement | Pas de reflux mesuré en PME françaises |

## Où cette étude touche à nos décisions écrites

| Décision écrite | Ce que la recommandation en fait |
|---|---|
| « Un éditeur ou un catalogue d'agents : à ne pas construire » (spec du 19/10) | Confirmée. Les recettes 1, 2 et 4 sont celles que la fiche produit du 19/10 nommait déjà |
| Abandon de l'extraction de faits et des fiches (19/10) | Respecté, à une condition : la fiche client est un résultat calculé par lecteur, pas une fiche stockée. Le suivi des engagements, lui, rouvrirait la décision : écarté |
| « Leon lit ; il n'écrit pas » (25/10) | **Contredit par la recette 3.** Elle suit en revanche la décision du 23/10 de demander l'écriture d'avance, et la spec GitHub du 26/10. Il faut trancher, et corriger le README qui dit encore « lecture seule » |
| Point quotidien sur la boîte de réception écarté comme « une seule source » (25/10) | La recette 3 n'est défendable que si le brouillon croise plusieurs sources. Sinon c'est Fyxer en moins bien |
| « Transformer un appel en tâches » écarté (25/10) | Maintenu. L'annexe 5 dit le contraire ; nous ne la suivons pas pour l'instant |
| « Pas un mouchard » | Exclut le rapport d'équipe au manager, la réponse en canal et le compte-rendu diffusé. La vue manager ne doit jamais s'activer dans une tâche de fond |
| Le mot « IA » n'est pas un argument, et « agent » n'est pas dans notre vocabulaire | Confirmé par l'extérieur : les agents sont au pic de la hype selon Gartner [TIERS], et le frein est « à quoi ça sert ». Vendre « la fiche client » et « le brief », pas « des agents » |
| « Dire seulement ce que le code tient » | Ne promettre ni « s'il paie encore » ni un brief « à jour » tant que la facturation n'est pas lue et que Gmail est relevé 4 fois par jour |

## Points de vigilance

- **Les trous se referment en mois.** ChatGPT Space, Copilot Workspaces, Gemini agent et Claude Tag visent tous le contexte partagé d'équipe. Aucun n'est pleinement livré en plan PME au 19/11 [annexe 4, plusieurs « à vérifier »]. Ce qui reste durable : être neutre entre assistants et couvrir tous les outils.
- **Le marché se regroupe.** Fathom racheté par Superhuman, Fin par Salesforce, Claap par lemlist, Poke par Cognition [TIERS].
- **Slack est un risque pour le produit actuel, pas seulement pour les agents.** Ses conditions interdisent les copies et index durables [TIERS, cabinets]. Notre code le note lui-même : « à trancher avant un client ». À faire lire par un juriste en priorité.
- **L'audit CASA est probablement déjà dû** pour la lecture de Gmail, agents ou pas : plusieurs semaines, 540 à 5 400 $ par an selon les sources [OFF pour le principe, TIERS pour le coût]. Le brouillon n'y ajoute rien [DED]. Pipedream le contourne aujourd'hui, à 10 comptes de test.
- **Le CSE peut faire suspendre un pilote.** Au-delà de 50 salariés, plusieurs juges ont suspendu des outils d'IA déployés sans consultation, pilote compris (Nanterre, 14 février 2025 ; Créteil, 15 juillet 2025). Une ordonnance contraire existe pour Copilot 365 [TIERS, décisions non lues] https://cms.law/fr/fra/legal-updates/quand-le-cse-stoppe-le-deploiement-de-l-ia. Ce n'est pas un avis juridique. Commencer par des pilotes de moins de 50 salariés simplifie.
- **Une seule instance, pas de webhook.** Des tâches de fond plus nombreuses chargent un seul processus, et un déploiement les coupe. 100 points à 6 h font environ 25 minutes de file [code].
- **L'injection change de nature avec les déclencheurs.** Nos garde-fous supposent un humain qui demande et qui confirme. Un agent déclenché par un mail reçu n'a plus cette protection [déduit, annexe 8]. D'où : à la demande d'abord.
- **L'entretien.** Dust écrit lui-même qu'un agent « qui marche aujourd'hui peut donner d'autres résultats la semaine prochaine ». Quatre recettes que nous entretenons valent mieux que cent que personne n'entretient.
- **La capture des conversations d'IA reste sans concurrent et sans preuve de demande** (annexe 5). Les recettes ne la valident pas. Le pilote doit dire si elle compte.

## Méthode et limites

Sept agents Claude ont cherché le 19 novembre 2026, un par volet. Un huitième a lu le dépôt sans rien exécuter. Cette synthèse ne s'appuie que sur leurs huit annexes.

- **Presque rien n'a été lu à la source.** Le réseau bloquait les pages. Tous les chiffres externes viennent de résumés de moteur de recherche. Un fait [OFF] est attribué à une page officielle, il n'a pas été relu dessus. Seule exception : dust.tt, lu directement.
- **Plusieurs volets sont incomplets.** Des limites d'usage ont coupé les recherches : 19 requêtes au lieu de 40 à 50 pour les preuves d'utilité, une douzaine pour les plateformes hors Dust. Non traités : les secteurs hors bâtiment (agences, négoce, industrie, immobilier), le support et le SAV en France, les conditions Microsoft et Teams, les règles pour être listé chez ChatGPT ou Copilot avec des actions d'écriture, les avis d'utilisateurs lus en direct.
- **Beaucoup de chiffres viennent de vendeurs** : revenus, temps gagné, taux d'adoption de 70 à 97 % chez Dust, étude OpinionWay payée par Alibaba.com. Les blogs d'agences françaises vendent ce qu'ils décrivent.
- **Aucune mesure ne porte sur des PME de 20 à 200 salariés.** Les mesures de temps perdu portent sur les TPE ou les grands groupes. Les études d'échec portent sur des projets sur mesure de grands comptes.
- **Les efforts sont déduits du code, pas chiffrés.** 39 connecteurs sur 42 n'ont jamais vu un vrai compte : toute estimation peut doubler au premier essai réel.
- **Le volet juridique rapporte des commentaires, pas les textes.** Ni les ordonnances, ni le règlement sur l'IA, ni les pages de la CNIL n'ont été relus.
- **Nos acheteurs sont simulés.** Le seul témoignage réel est celui du dirigeant rencontré par Amos en octobre.
- **Deux études internes citées manquent au dépôt** : celle des agents Glean (PR #23) et celle de Pipedream.

À revérifier sur la page officielle avant tout usage externe : les prix de ChatGPT Business, Claude Team, Dust, Fyxer et Limova ; les chiffres France Num et INSEE ; les conditions d'API de Slack ; les règles Google sur les scopes restreints.
