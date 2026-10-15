# Bible du jeu d'essai : Atelier Numérique Lebrun

Source unique de vérité pour écrire les ~60 conversations du jeu d'essai (spec : `docs/specs/2026-10-15-jeu-essai.md`, plan : tâche 14). Six rédacteurs, un par personnage, l'écrivent **sans se parler** : tout ce qui doit se recouper (noms, montants, dates) est fixé ici, à reprendre **à l'identique**. Ce qui n'est pas dans la bible est libre, à condition de ne contredire rien de ce qui y est écrit et de ne pas créer de fait durable non listé (un fait durable non listé serait compté comme faux positif du pipeline).

Tout est inventé. Les seuls noms réels autorisés sont des technologies ou services publics imposés par le plan : OVH (hébergeur), Chorus Pro (plateforme publique de facturation), Next.js, Postgres, React Native, SQLite, pg-boss, Supabase (seulement comme hypothèse), Factur-X, iOS, Android, RGPD, RGAA, TVA. Aucune personne réelle, aucun client réel, rien sur Leon ni sur ses fondateurs.

---

## 1. L'entreprise

- **Atelier Numérique Lebrun**, SAS fondée en 2019 à Nantes (bureaux quai de la Fosse), 15 personnes. Dirigeante : Claire Lebrun.
- Métier : intégrateur et éditeur de **Chantier+**, logiciel de devis, de planning et de facturation pour artisans du bâtiment (application web et application mobile).
- Pile technique : Next.js (web), Postgres managé (base), React Native (mobile), pg-boss (file de jobs, adoptée le 29/09). Hébergement OVH (un serveur applicatif + une base Postgres managée).
- Prix public de Chantier+ : **55 € HT par utilisateur et par mois** (passera à 59 € au 1er janvier 2027, décision de Claire le 01/10).
- Chiffre d'affaires 2025 : 1,1 M€ (connu de tous, pas sensible ; peut apparaître en passant, jamais comme fait attendu).
- Domaine des adresses : `@essai.leon.local` (ex. `karim@essai.leon.local`). Ne jamais inventer d'autre domaine.

### Les 15 personnes

| Nom | Rôle | Remarque |
|---|---|---|
| Claire Lebrun | Dirigeante | personnage |
| Karim Haddad | Commercial | personnage |
| Hugo Martin | Dev back, données | personnage, responsable technique de la refonte du module devis |
| Inès Moreau | Dev interface et mobile | personnage, responsable de l'application mobile v2 |
| Sophie Garnier | Admin et finances | personnage |
| Nadia Benali | Cheffe de projet | personnage |
| Marion Caradec | Dev back | entretien annuel le 02/10 (sensible), reprend les tests Chorus Pro |
| Thomas Guérin | Dev, alternant | fin d'alternance le 31/12/2026, négocie un CDI (sensible) |
| Julien Lefort | Support client | arrêt maladie du 28/09 au 16/10 (sensible, seule Sophie connaît la cause) |
| Léa Brossard | Commerciale junior | déménage à Rennes (sensible) |
| Romain Tessier | Support client | |
| Élodie Marchand | Comptabilité (mi-temps) | |
| Baptiste Kerjean | Dev web | |
| Camille Rivet | Formatrice clients | |
| Antoine Pellerin | Dev web | |

Anciens et futurs : **Yann Le Goff**, ancien commercial licencié en mars 2026, en litige prud'homal (sensible). **Bastien Royer**, développeur mobile embauché, arrive le 02/11/2026 (sensible pour le salaire et l'embauche).

## 2. Les personnages (ton et habitudes)

- **Claire Lebrun** (claude.ai) : tranche vite, parle chiffres, phrases courtes, demande des synthèses et des conseils RH. Vouvoie l'assistant. Écrit sans fautes.
- **Karim Haddad** (ChatGPT) : écrit en abrégé et avec des fautes (« jai », « c koi », « devis dupont 18.4k », « rdv », « stp », pas de majuscules, accents oubliés). Demande des mails de relance, des argumentaires, des comparatifs. Les réponses de l'assistant sont propres et structurées.
- **Hugo Martin** (Claude Code) : longues sessions de code et de débogage. Messages courts et techniques (« ok go », « non, garde la migration »), l'assistant répond longuement avec blocs de code, commandes, sorties d'outils (`$ pnpm test`, traces, diff). Lance des agents coéquipiers dont les rapports arrivent dans des tours `user` sous la forme `<teammate-message teammate_id="…">…</teammate-message>`.
- **Inès Moreau** (Claude Code et ChatGPT) : concise, compare des bibliothèques, tableaux de pour/contre. Sessions de code plus courtes que Hugo. Parle des choix de Hugo (« Hugo veut… », « avec Hugo on a dit… »).
- **Sophie Garnier** (ChatGPT) : précise, administrative, demande des modèles de courrier, des tableaux d'échéances, des explications de règles (TVA, arrêt maladie). Formules polies.
- **Nadia Benali** (claude.ai, parfois Claude Code pour des scripts de planning) : fait des plannings, des comptes rendus, relance. Listes à puces, dates partout, « on glisse », « jalon », « je relance ».

## 3. Le monde (noms fixes)

Chaque fait attendu se range dans une fiche. Le nom de fiche à utiliser (`fiche`), ses alias (`alias`) et son type (`typeFiche`) sont ceux-ci. Les fiches de décision et de règle sont nommées dans la liste des conversations.

### Clients (8)

| Fiche (alias) | Ville | Interlocuteur | Chiffres clés |
|---|---|---|---|
| Menuiserie Dupont (Dupont) | Angers | Gérard Dupont, gérant | 25 licences ; devis 18 400 € HT (22/09) renégocié à **16 900 € HT** (01/10) ; paiement : 45 jours selon Karim, 30 jours fin de mois selon Sophie (conflit) ; livraison de la refonte promise avant le 30/10 |
| Plomberie Rousseau (Rousseau) | Saint-Nazaire | Sandrine Rousseau, gérante | prospect, 12 licences, devis 9 600 € HT ; signature « mi-octobre » selon Karim, « novembre » selon Nadia (conflit) |
| SARL Bati-Ouest (Bati-Ouest) | La Roche-sur-Yon | Olivier Ménard, directeur technique, **remplacé le 01/10 par Stéphanie Caron, DSI** | plus gros client ; contrat annuel 42 000 € HT payé en 4 échéances trimestrielles ; licences : 60 selon Karim, 48 selon Claire (conflit) ; client pilote de l'application mobile v2 ; a besoin de Chorus Pro (marchés publics) |
| Électricité Perrin (Perrin) | Cholet | Damien Perrin, gérant | 8 licences ; ticket 482 : l'export PDF des devis coupe au-delà de 50 lignes |
| Couverture Le Bihan (Le Bihan) | Vannes | Maëlle Le Bihan, gérante | client depuis 2021, 15 licences ; a besoin de Chorus Pro ; renouvelle pour 2027 |
| Maçonnerie Fournier (Fournier) | Nantes (Rezé) | Patrick Fournier, gérant | 20 licences ; menace de partir chez Batinova ; reste avec une remise de 10 % (07/10) |
| Peinture & Déco Lambert (Lambert) | Laval | Aurélie Lambert, cogérante | nouveau client : signé le 23/09, 6 licences, 4 200 € HT la première année, facturé le 24/09 |
| Charpentes Morvan (Morvan) | Quimper | Erwan Morvan, gérant | prospect, 30 salariés ; démo prévue le 20/10 |

### Fournisseurs et prestataires (typeFiche `fournisseur`)

| Fiche (alias) | Objet | Chiffres clés |
|---|---|---|
| OVH | hébergement (serveur + Postgres managé) | 412 € HT par mois ; incident disque plein le 02/10 |
| Cabinet Ferrand & Associés (Ferrand) | expert-comptable, interlocuteur Michel Ferrand | clôture au 31/12 ; rendez-vous le 15/10 |
| Talents Ouest | agence de recrutement, interlocutrice Camille Joubert | 18 % du salaire brut annuel ; a trouvé Bastien Royer |
| Mapéo | ancienne API de géocodage et cartographie | 290 € HT par mois, 10 requêtes/s, préavis 1 mois ; résiliée le 05/10, effective le 05/11 |
| TerraCarte | nouvelle API de géocodage et cartographie | 180 € HT par mois, 50 requêtes/s ; remplace Mapéo à partir du 05/10 |
| Mutuelle Atlantique Santé | mutuelle collective | employeur 60 % ; hausse au 01/01/2027 : 4,5 % selon Sophie, 6 % selon Claire (conflit) |
| Lucas Fabre | designer UX indépendant | TJM 550 € (23/09) renégocié à **500 €** (01/10) ; 12 jours sur l'application mobile v2 ; maquettes le 09/10 ; paiement à 30 jours |
| Cabinet Vasseur Avocats (Vasseur) | avocate de l'entreprise, Maître Hélène Vasseur | forfait 3 500 € HT pour le dossier Le Goff (sensible) |

### Projets (typeFiche `projet`)

| Fiche (alias) | Responsable | Repères |
|---|---|---|
| Refonte du module devis (module devis) | Hugo | lignes dans une table `devis_lignes`, montants en centimes selon Hugo ; mise en production le **20/10 selon Hugo**, le **30/10 selon Nadia** (conflit) ; promise à Dupont avant le 30/10 ; 70 % fait au 09/10 |
| Application mobile v2 (appli v2, appli mobile) | Inès | React Native, hors ligne avec SQLite ; pilote Bati-Ouest à partir du 19/10 avec 10 compagnons ; livraison **15/10** (21/09) décalée au **05/11** (02/10) ; Bastien Royer y sera affecté |
| Connecteur Chorus Pro (Chorus Pro) | Hugo, tests repris par Marion | pour Bati-Ouest et Le Bihan ; livraison le 01/12/2026 ; démo à Bati-Ouest le 04/11 ; factures d'acompte reportées en v2 |
| Salon des Artisans de l'Ouest (salon, SAO) | Claire | parc des expositions de Nantes ; **13-14/11** (22/09) décalé aux **27-28/11** (07/10) ; stand 3 000 € HT ; objectif 40 démos |

### Produit (typeFiche `produit`) : Chantier+ (alias Chantier plus, l'appli)

### Concurrents (typeFiche `concurrent`)

| Fiche | Repères |
|---|---|
| Batinova | Lyon, 39 € HT par utilisateur et par mois, démarche Maçonnerie Fournier |
| Ouvrio | Bordeaux, application mobile seule, 29 € HT par mois et par utilisateur |
| Planika BTP | Paris, a levé 4 M€ en septembre 2026, vise les entreprises de plus de 50 salariés |

### Outils (typeFiche `outil`)

- **Prospecta** : CRM de l'équipe commerciale (Karim, Léa).
- **Comptaflow** : logiciel de comptabilité (Sophie, Élodie).
- **Atelier Admin** : back-office maison de Chantier+ (licences, clients).
- **Postgres**, **pg-boss**, **rn-quickcharts** (bibliothèque de graphiques abandonnée le 30/09), **graphiko-native** (sa remplaçante).
- Billets de support : numérotés (« ticket 482 »), dans Atelier Admin.

## 4. Chronologie (21/09 → 10/10/2026)

Chaque ligne : ce qui se passe, qui le dit, dans quelle conversation, avec la valeur exacte. Les références D/R/C/S renvoient à la section 5.

**Lundi 21/09**
- Nadia annonce la livraison de l'application mobile v2 au **15 octobre** et l'interlocuteur Bati-Ouest **Olivier Ménard** (`nadia/2026-09-21-planning-mobile`). R2 ancien, R7 ancien.
- Claire lance le recrutement d'un dev mobile via Talents Ouest, 18 % (`claire/2026-09-21-plan-recrutement`).
- Hugo migre Postgres 15 → 16 ; il évoque « on pourrait passer à Supabase » (faux ami) (`hugo/2026-09-21-migration-postgres`).
- Sophie fait le point des contrats : OVH 412 €/mois, Mapéo 290 €/mois (`sophie/2026-09-21-contrats-fournisseurs`).
- Karim relance ses prospects : Sandrine Rousseau, Erwan Morvan (`karim/2026-09-21-relance-prospects`).
- Inès démarre la navigation de l'appli v2 (`ines/2026-09-21-mobile-navigation`).

**Mardi 22/09**
- Karim envoie le devis Dupont : **18 400 € HT**, 25 licences, paiement à **45 jours** (`karim/2026-09-22-devis-dupont`). R1 ancien, C4 a.
- Nadia prépare l'arrivée de Dupont : Gérard Dupont, formation en 2 sessions sur site (`nadia/2026-09-22-onboarding-dupont`). D1.
- Claire fixe le salon : **13 et 14 novembre**, stand 3 000 € HT, 40 démos (`claire/2026-09-22-strategie-salon`). R6 ancien.
- Inès choisit **rn-quickcharts** pour les graphiques (`ines/2026-09-22-choix-graphiques`). R4 ancien.

**Mercredi 23/09**
- Karim fait signer Peinture & Déco Lambert : 6 licences, 4 200 € HT (`karim/2026-09-23-signature-lambert`). D3.
- Hugo branche le géocodage sur **Mapéo**, 10 req/s ; débat d'agents A1 sur le cache (`hugo/2026-09-23-geocodage-mapeo`). R3 ancien.
- Nadia budgète Lucas Fabre à **550 €/jour**, 12 jours (`nadia/2026-09-23-budget-design`). R5 ancien.
- Sophie prépare la facture Lambert (émise le 24/09) (`sophie/2026-09-23-facture-lambert`). D3.

**Jeudi 24/09**
- Claire fait le point clients : Gérard Dupont (D1), pilote Bati-Ouest (D2), **48 licences** Bati-Ouest (C2 a), Fournier menace de partir (D5), Lambert signé (D3) (`claire/2026-09-24-point-clients`).
- Hugo conçoit le schéma du module devis : centimes (C3 a), mise en production le **20/10** (C5 a) (`hugo/2026-09-24-module-devis-schema`).
- Inès travaille le mode hors ligne, rappelle que Bati-Ouest est pilote (D2) (`ines/2026-09-24-hors-ligne`).
- Sophie : mutuelle **+4,5 %** au 01/01/2027 (`sophie/2026-09-24-mutuelle`). C6 a.

**Vendredi 25/09**
- Karim : devis Rousseau 9 600 € HT, signature **mi-octobre** (`karim/2026-09-25-prospect-rousseau`). C1 a.
- Claire valide l'embauche de Bastien Royer : 46 000 € brut annuel, arrivée le 02/11 (`claire/2026-09-25-embauche-bastien`). S1.
- Hugo débogue l'export PDF (ticket 482) : limite de 50 lignes codée en dur (`hugo/2026-09-25-debug-export-pdf`).
- Nadia écrit un script de suivi des projets ; comités le mardi à 10 h (`nadia/2026-09-25-tableau-suivi`).

**Lundi 28/09**
- Karim reçoit le ticket 482 de Damien Perrin et le relaie à Inès (`karim/2026-09-28-ticket-perrin`, `ines/2026-09-28-ticket-perrin`). D6.
- Sophie : arrêt maladie de Julien Lefort du 28/09 au 16/10 (`sophie/2026-09-28-arret-maladie`). S2.
- Hugo étudie Chorus Pro : livraison 01/12, Bati-Ouest et Le Bihan (`hugo/2026-09-28-chorus-pro-recherche`). D4.

**Mardi 29/09**
- Hugo, débat d'agents A2 : **décision** de générer les PDF côté serveur avec une file pg-boss (`hugo/2026-09-29-debat-generation-pdf`). D7.
- Claire : prud'hommes Yann Le Goff, conciliation le 13/11, Maître Vasseur, plafond 8 000 € (`claire/2026-09-29-litige-le-goff`). S3, D8.
- Nadia planifie Chorus Pro (D4) et annonce la signature Rousseau en **novembre** (`nadia/2026-09-29-planning-chorus`). C1 b.

**Mercredi 30/09**
- Karim : Fournier menace de partir chez Batinova à 39 € (`karim/2026-09-30-fournier-concurrent`). D5, D10.
- Inès abandonne rn-quickcharts pour **graphiko-native** (`ines/2026-09-30-abandon-quickcharts`). R4 nouveau.
- Sophie : Le Goff réclame 24 000 €, conciliation 13/11 (`sophie/2026-09-30-prudhommes`). D8.

**Jeudi 01/10**
- Karim renégocie Dupont à **16 900 € HT** (`karim/2026-10-01-renegociation-dupont`). R1 nouveau.
- Claire décide le prix 2027 : 59 € HT (`claire/2026-10-01-tarifs-2027`). D10.
- Sophie renégocie Lucas Fabre à **500 €/jour** ; elle colle par erreur l'accès OVH `password=MotDePasseOVH-Lebrun2026!` (`sophie/2026-10-01-prestataires-acces`). R5 nouveau, secret 2.
- Hugo : jetons de l'API mobile (`hugo/2026-10-01-api-mobile-auth`).
- Inès : montants de l'API en **euros décimaux** ; elle répète la décision pg-boss (`ines/2026-10-01-api-montants`). C3 b, D7.
- Nadia : Léa Brossard déménage à Rennes ; Julien Lefort absent jusqu'au 16/10 (`nadia/2026-10-01-absences-equipe`). S5.
- Stéphanie Caron devient l'interlocutrice de Bati-Ouest (dit par Karim le 05/10).

**Vendredi 02/10**
- Nadia décale la livraison de l'appli v2 au **5 novembre** (`nadia/2026-10-02-replanification-mobile`). R2 nouveau.
- Claire : entretien annuel de Marion Caradec (`claire/2026-10-02-entretien-marion`). S4.
- Hugo : incident disque plein chez OVH, 47 min d'indisponibilité (`hugo/2026-10-02-astreinte-incident`).
- Inès : maquettes de Lucas Fabre attendues le 09/10 (`ines/2026-10-02-design-maquettes`).

**Lundi 05/10**
- Sophie résilie Mapéo, contrat TerraCarte 180 €/mois (`sophie/2026-10-05-cartographie`). R3 nouveau.
- Karim : Bati-Ouest **60 licences** (C2 b), 42 000 € HT, Stéphanie Caron (R7 nouveau), Chorus Pro (D4) (`karim/2026-10-05-bati-ouest-contrat`).
- Nadia : mise en production du module devis le **30/10** (`nadia/2026-10-05-planning-devis`). C5 b.
- Inès : notifications push (`ines/2026-10-05-notifications-push`).

**Mardi 06/10**
- Hugo bascule le code sur TerraCarte ; il affiche par erreur `.env.local` avec `TERRACARTE_API_KEY=sk-essai-9fKx2LmQ7vNw4RtY8pZa3BcD` (`hugo/2026-10-06-bascule-terracarte`). D11, secret 1.
- Sophie relance Dupont : paiement à **30 jours fin de mois** (`sophie/2026-10-06-relance-dupont`). C4 b.
- Claire : négociation de Thomas Guérin (`claire/2026-10-06-negociation-thomas`). S6.

**Mercredi 07/10**
- Karim : salon décalé aux **27 et 28 novembre** ; Fournier reste avec 10 % ; démo Morvan le 20/10 (`karim/2026-10-07-salon-decale`). R6 nouveau, D9, D14.
- Inès : pilote Bati-Ouest le 19/10, livraison au 05/11 (`ines/2026-10-07-tests-pilote`). D12, D13.
- Hugo : revue du module devis, remise plafonnée à 30 % (`hugo/2026-10-07-revue-code-devis`).
- Nadia : comité projet, démo Chorus Pro le 04/11 (`nadia/2026-10-07-comite-projet`). D15.

**Jeudi 08/10**
- Hugo, débat d'agents A3 sur le connecteur Chorus Pro (`hugo/2026-10-08-revue-agents-chorus`).
- Claire : comité de direction ; mutuelle **+6 %** (C6 b) ; Le Bihan renouvelle (D16) ; Fournier 10 % (D9) (`claire/2026-10-08-comite-direction`).
- Sophie : budget 2027, stand 3 000 € (`sophie/2026-10-08-budget-2027`).

**Vendredi 09/10**
- Karim : veille concurrents (`karim/2026-10-09-concurrents`).
- Inès : revue d'accessibilité (`ines/2026-10-09-revue-accessibilite`).
- Nadia : relances clients, démo Morvan 20/10 (D14), Le Bihan renouvelle (D16) (`nadia/2026-10-09-relances-clients`).

**Samedi 10/10**
- Hugo fait le bilan de la semaine, démo Chorus Pro le 04/11 (D15) (`hugo/2026-10-10-bilan-semaine`).

## 5. Les pièges

### Doublons : même information, plusieurs voix (fiches à fusionner, pas de conflit)

| # | Information | Faits | Conversations |
|---|---|---|---|
| D1 | Gérard Dupont est le gérant et l'interlocuteur de Menuiserie Dupont | F007, F054, F283 | claire 24/09, karim 22/09, nadia 22/09 |
| D2 | Bati-Ouest est le client pilote de l'appli mobile v2 | F008, F185, F281 | claire 24/09, ines 24/09, nadia 21/09 |
| D3 | Lambert a signé le 23/09 pour 6 licences, 4 200 € HT | F011, F056, F234 | claire 24/09, karim 23/09, sophie 23/09 |
| D4 | Connecteur Chorus Pro livré le 01/12 pour Bati-Ouest et Le Bihan | F113, F072, F289 | hugo 28/09, karim 05/10, nadia 29/09 |
| D5 | Maçonnerie Fournier menace de partir chez Batinova | F010, F064 | claire 24/09, karim 30/09 |
| D6 | Ticket 482 : l'export PDF de Perrin coupe au-delà de 50 lignes | F061, F186 | karim 28/09, ines 28/09 |
| D7 | Décision : PDF générés côté serveur par une file pg-boss | F117, F193 | hugo 29/09, ines 01/10 |
| D8 | Audience de conciliation Le Goff le 13/11/2026 | F017, F242 | claire 29/09, sophie 30/09 |
| D9 | Fournier reste client avec une remise de 10 % | F074, F030 | karim 07/10, claire 08/10 |
| D10 | Batinova facture 39 € HT par utilisateur et par mois | F065, F022 | karim 30/09, claire 01/10 |
| D11 | Le géocodage passe par TerraCarte | F253, F140 | sophie 05/10, hugo 06/10 |
| D12 | Livraison de l'appli v2 décalée au 05/11 | F298, F214 | nadia 02/10, ines 07/10 |
| D13 | Pilote Bati-Ouest à partir du 19/10 avec 10 compagnons | F300, F213 | nadia 02/10, ines 07/10 |
| D14 | Démo Charpentes Morvan le 20/10 | F075, F318 | karim 07/10, nadia 09/10 |
| D15 | Démo du connecteur Chorus Pro à Bati-Ouest le 04/11 | F311, F160 | nadia 07/10, hugo 10/10 |
| D16 | Couverture Le Bihan renouvelle pour 2027 | F029, F319 | claire 08/10, nadia 09/10 |
| D17 | Marion Caradec reprend les tests du connecteur Chorus Pro | F033, F149 | claire 02/10, hugo 08/10 |
| D18 | Stand du salon : 3 000 € HT | F005, F257 | claire 22/09, sophie 08/10 |
| D19 | Refonte du module devis promise à Dupont avant le 30/10 | F068, F312 | karim 01/10, nadia 05/10 |
| D20 | Bastien Royer arrive le 02/11/2026 (sensible des deux côtés) | F014, F310 | claire 25/09, nadia 07/10 |
| D21 | Ticket 482 : limite de 50 lignes | F128, F061, F186 | hugo 25/09 (cause technique), karim 28/09, ines 28/09 |

### Remplacements (`remplace` : déclaré dans la conversation de la **nouvelle** valeur)

| # | Quoi | Ancien → nouveau | Conversation ancienne → conversation qui déclare |
|---|---|---|---|
| R1 | Prix du devis Dupont | F052 (18 400 € HT) → F067 (16 900 € HT) | karim/2026-09-22-devis-dupont → **karim/2026-10-01-renegociation-dupont** |
| R2 | Livraison de l'appli mobile v2 | F280 (15/10) → F298 (05/11) | nadia/2026-09-21-planning-mobile → **nadia/2026-10-02-replanification-mobile** |
| R3 | Fournisseur de cartographie | F120 (Mapéo) → F253 (TerraCarte) | hugo/2026-09-23-geocodage-mapeo → **sophie/2026-10-05-cartographie** |
| R4 | Bibliothèque de graphiques | F184 (rn-quickcharts) → F192 (graphiko-native) | ines/2026-09-22-choix-graphiques → **ines/2026-09-30-abandon-quickcharts** |
| R5 | TJM de Lucas Fabre | F287 (550 €) → F246 (500 €) | nadia/2026-09-23-budget-design → **sophie/2026-10-01-prestataires-acces** |
| R6 | Dates du salon | F004 (13-14/11) → F073 (27-28/11) | claire/2026-09-22-strategie-salon → **karim/2026-10-07-salon-decale** |
| R7 | Interlocuteur Bati-Ouest | F282 (Olivier Ménard) → F071 (Stéphanie Caron) | nadia/2026-09-21-planning-mobile → **karim/2026-10-05-bati-ouest-contrat** |

### Conflits (`conflits` : déclaré dans la conversation de la **seconde** version)

| # | Quoi | a ↔ b | Conversation a → conversation qui déclare |
|---|---|---|---|
| C1 | Signature de Plomberie Rousseau | F060 (mi-octobre) ↔ F304 (novembre) | karim/2026-09-25-prospect-rousseau → **nadia/2026-09-29-planning-chorus** |
| C2 | Licences de Bati-Ouest | F009 (48) ↔ F069 (60) | claire/2026-09-24-point-clients → **karim/2026-10-05-bati-ouest-contrat** |
| C3 | Unité des montants de l'API | F124 (centimes) ↔ F194 (euros décimaux) | hugo/2026-09-24-module-devis-schema → **ines/2026-10-01-api-montants** |
| C4 | Délai de paiement de Dupont | F053 (45 jours) ↔ F264 (30 jours fin de mois) | karim/2026-09-22-devis-dupont → **sophie/2026-10-06-relance-dupont** |
| C5 | Mise en production du module devis | F125 (20/10) ↔ F306 (30/10) | hugo/2026-09-24-module-devis-schema → **nadia/2026-10-05-planning-devis** |
| C6 | Hausse de la mutuelle au 01/01/2027 | F240 (4,5 %) ↔ F031 (6 %) | sophie/2026-09-24-mutuelle → **claire/2026-10-08-comite-direction** |

Dans la conversation qui déclare, le personnage ne signale **pas** la contradiction (il ne connaît pas l'autre version) : il affirme simplement sa valeur.

### Sensible (`sensible: true`)

| # | Sujet | Catégorie | Faits |
|---|---|---|---|
| S1 | Embauche et salaire de Bastien Royer | rh, remuneration | F012-F015, F310 |
| S2 | Arrêt maladie de Julien Lefort | sante | F236, F237, F308 |
| S3 | Litige prud'homal Yann Le Goff | juridique | F016-F019, F241-F243 |
| S4 | Entretien annuel de Marion Caradec | rh | F023-F025 |
| S5 | Situation personnelle de Léa Brossard | perso, rh | F307, F309 |
| S6 | Négociation salariale de Thomas Guérin | remuneration, rh | F026-F028 |

### Faux secrets (jamais dans un fait, jamais dans un `extrait`)

1. `sk-essai-9fKx2LmQ7vNw4RtY8pZa3BcD` : `hugo/2026-10-06-bascule-terracarte`, tour **t-009** (assistant). L'assistant lance `cat .env.local` et affiche la sortie, dont la ligne `TERRACARTE_API_KEY=sk-essai-9fKx2LmQ7vNw4RtY8pZa3BcD` (avec deux ou trois autres variables sans secret : `DATABASE_URL=postgres://chantier:***@localhost:5432/chantier`, `GEOCODER=terracarte`). Au t-010, Hugo écrit « merde j'ai affiché la clé, je la régénère sur la console TerraCarte ». Entrée N047.
2. `MotDePasseOVH-Lebrun2026!` : `sophie/2026-10-01-prestataires-acces`, tour **t-005** (user). Sophie colle, pour demander une procédure à suivre : « identifiant : sophie@essai.leon.local password=MotDePasseOVH-Lebrun2026! ». La chaîne `password=MotDePasseOVH-Lebrun2026!` est écrite exactement ainsi (sans espace autour du `=`). L'assistant lui conseille de changer le mot de passe. Entrée N104.

Un fait voisin peut être attendu dans ces tours, à condition que son `extrait` ne touche pas la ligne du secret.

### Faux amis (pas retenir)

Hypothèses (« on pourrait passer à Supabase » N041, « -15 % et ils signent » N023, « Ouvrio va sûrement couler » N029, une supposition sur TerraCarte N053, une piste d'agent non confirmée N056…), brouillons de courrier ou d'annonce (N001, N005, N008, N026, N101, N103, N105, N106, N125, N126…), questions générales (préavis CDI N002, procédure prud'homale N006, acompte N021, RGPD N007, autoliquidation de TVA N100, carence N102, React Native contre Flutter N081, RGAA N088, Chorus Pro en général N045). La liste exacte est dans la section 6.

### Débats d'agents (Hugo)

- **A1** `hugo/2026-09-23-geocodage-mapeo` : deux coéquipiers (`teammate_id="cache-postgres"`, `teammate_id="cache-memoire"`) comparent un cache en table Postgres et un cache mémoire. Un rapport mesure −70 % d'appels (F122). Pas de décision : Hugo dit « on verra plus tard ».
- **A2** `hugo/2026-09-29-debat-generation-pdf` : trois coéquipiers (`teammate_id="pdf-a-la-volee"`, `teammate_id="pdf-file-jobs"`, `teammate_id="pdf-service-externe"`) défendent chacun une option, avec mesures. **Décision** de Hugo : file pg-boss côté serveur (F117).
- **A3** `hugo/2026-10-08-revue-agents-chorus` : deux relecteurs (`teammate_id="relecteur-api"`, `teammate_id="relecteur-tests"`) rendent un rapport sur le connecteur. Faits tirés des rapports (F147, F148).

Les tours `<teammate-message>` sont des tours `user`, longs (1 500 à 4 000 caractères), avec constats, chiffres et recommandation. Ils ne sont **jamais** du bruit.

## 6. Les conversations

Format : `clé` · source.kind · date et heure de début · nombre de tours visé · pièges. Puis les faits attendus `F… · énoncé · fiche (typeFiche) · sensible`, les pas-retenir `N… · énoncé · pourquoi`, et les remplacements ou conflits à déclarer dans cette conversation.

Pièges : **bruit**, **doublon** (D), **change** (R), **conflit** (C), **sensible** (S), **secret**, **faux ami**, **agents** (A).

### Claire (claude_ai) : 9 conversations, 70 tours, bloc F001-F049, N001-N019

#### `claire/2026-09-21-plan-recrutement` · claude_ai · 21/09 09:10 · 8 tours · faux ami
- F001 · Atelier Numérique Lebrun recrute un développeur mobile React Native en CDI. · Recrutement développeur mobile (decision) · non
- F002 · Le recrutement du développeur mobile est confié à l'agence Talents Ouest. · Talents Ouest (fournisseur) · non
- F003 · Talents Ouest facture 18 % du salaire brut annuel du candidat recruté. · Talents Ouest (fournisseur) · non
- F032 · L'interlocutrice chez Talents Ouest est Camille Joubert. · Talents Ouest (fournisseur) · non
- N001 · Brouillon d'annonce d'offre d'emploi rédigé par l'assistant. · brouillon
- N002 · Durée légale du préavis de démission en CDI. · question générale

#### `claire/2026-09-22-strategie-salon` · claude_ai · 22/09 14:30 · 7 tours · change (R6 ancien), doublon (D18), faux ami
- F004 · Le Salon des Artisans de l'Ouest a lieu les 13 et 14 novembre 2026 au parc des expositions de Nantes. · Salon des Artisans de l'Ouest (projet) · non
- F005 · Le budget du stand au Salon des Artisans de l'Ouest est de 3 000 € HT. · Salon des Artisans de l'Ouest (projet) · non
- F006 · L'objectif au Salon des Artisans de l'Ouest est de faire 40 démonstrations de Chantier+. · Salon des Artisans de l'Ouest (projet) · non
- N003 · Idée d'un webinaire à la place du salon, évoquée puis écartée. · hypothèse

#### `claire/2026-09-24-point-clients` · claude_ai · 24/09 08:45 · 8 tours · doublon (D1, D2, D3, D5), conflit (C2 a), faux ami
- F007 · Gérard Dupont est le gérant de Menuiserie Dupont et l'interlocuteur pour Chantier+. · Menuiserie Dupont (client) · non
- F008 · SARL Bati-Ouest est le client pilote de l'application mobile v2. · Application mobile v2 (projet) · non
- F009 · SARL Bati-Ouest utilise 48 licences Chantier+. · SARL Bati-Ouest (client) · non
- F010 · Maçonnerie Fournier menace de quitter Chantier+ pour Batinova. · Maçonnerie Fournier (client) · non
- F011 · Peinture & Déco Lambert a signé le 23 septembre 2026 pour 6 licences à 4 200 € HT. · Peinture & Déco Lambert (client) · non
- N004 · Projection du nombre de clients nécessaires pour atteindre 1,5 M€ de CA. · projection, hypothèse

#### `claire/2026-09-25-embauche-bastien` · claude_ai · 25/09 17:20 · 8 tours · sensible (S1), doublon (D20), faux ami
- F012 · Bastien Royer est embauché comme développeur mobile en CDI. · Bastien Royer (personne) · oui (rh)
- F013 · Le salaire de Bastien Royer est de 46 000 € brut annuel. · Bastien Royer (personne) · oui (remuneration)
- F014 · Bastien Royer commence le 2 novembre 2026. · Bastien Royer (personne) · oui (rh)
- F015 · La période d'essai de Bastien Royer est de 3 mois. · Bastien Royer (personne) · oui (rh)
- N005 · Brouillon de lettre de proposition d'embauche. · brouillon

#### `claire/2026-09-29-litige-le-goff` · claude_ai · 29/09 11:00 · 7 tours · sensible (S3), doublon (D8), faux ami
- F016 · Yann Le Goff, ancien commercial licencié en mars 2026, a saisi les prud'hommes contre l'entreprise. · Yann Le Goff (personne) · oui (juridique)
- F017 · L'audience de conciliation du litige Le Goff est fixée au 13 novembre 2026. · Yann Le Goff (personne) · oui (juridique)
- F018 · L'entreprise est défendue par Maître Hélène Vasseur dans le litige Le Goff. · Cabinet Vasseur Avocats (fournisseur) · oui (juridique)
- F019 · Claire refuse toute transaction au-delà de 8 000 € dans le litige Le Goff. · Yann Le Goff (personne) · oui (juridique)
- N006 · Explication générale de la procédure prud'homale. · question générale

#### `claire/2026-10-01-tarifs-2027` · claude_ai · 01/10 10:15 · 8 tours · doublon (D10), faux ami
- F020 · Le prix de Chantier+ passe de 55 € à 59 € HT par utilisateur et par mois au 1er janvier 2027. · Chantier+ (produit) · non
- F021 · Les clients existants gardent le prix de 55 € jusqu'au renouvellement de leur contrat. · Tarifs Chantier+ 2027 (decision) · non
- F022 · Batinova facture 39 € HT par utilisateur et par mois. · Batinova (concurrent) · non
- N007 · Ce que le RGPD impose en général sur une hausse de tarif annoncée par courriel. · question générale
- N009 · Idée d'un forfait illimité « un jour peut-être ». · hypothèse

#### `claire/2026-10-02-entretien-marion` · claude_ai · 02/10 15:00 · 8 tours · sensible (S4), doublon (D17)
- F023 · L'entretien annuel de Marion Caradec a eu lieu le 2 octobre 2026. · Marion Caradec (personne) · oui (rh)
- F024 · Marion Caradec souhaite devenir référente back-end. · Marion Caradec (personne) · oui (rh)
- F025 · Objectif fixé à Marion Caradec : livrer la partie API du connecteur Chorus Pro avant décembre. · Marion Caradec (personne) · oui (rh)
- F033 · Marion Caradec reprend les tests du connecteur Chorus Pro. · Connecteur Chorus Pro (projet) · non

#### `claire/2026-10-06-negociation-thomas` · claude_ai · 06/10 18:40 · 7 tours · sensible (S6), faux ami
- F026 · Thomas Guérin demande 36 000 € brut annuel pour un CDI à la fin de son alternance. · Thomas Guérin (personne) · oui (remuneration)
- F027 · Claire propose à Thomas Guérin 34 000 € brut annuel et une prime de 1 500 €. · Thomas Guérin (personne) · oui (remuneration)
- F028 · L'alternance de Thomas Guérin se termine le 31 décembre 2026. · Thomas Guérin (personne) · oui (rh)
- N008 · Brouillon de réponse à Thomas Guérin, non envoyé. · brouillon

#### `claire/2026-10-08-comite-direction` · claude_ai · 08/10 08:30 · 9 tours · doublon (D9, D16), conflit (C6 b), faux ami
- F029 · Couverture Le Bihan renouvelle son contrat Chantier+ pour 2027. · Couverture Le Bihan (client) · non
- F030 · Maçonnerie Fournier reste client avec une remise de 10 %. · Maçonnerie Fournier (client) · non
- F031 · La cotisation de la Mutuelle Atlantique Santé augmente de 6 % au 1er janvier 2027. · Mutuelle Atlantique Santé (fournisseur) · non
- F034 · Décision : le connecteur Chorus Pro passe avant la refonte du module devis jusqu'au 1er décembre. · Priorité Chorus Pro (decision) · non
- F035 · Le comité de direction a lieu le jeudi à 8 h 30. · Comité de direction (regle) · non
- conflits : `{ a: F240, b: F031 }` (C6)

### Karim (chatgpt) : 10 conversations, 80 tours, bloc F050-F099, N020-N039

#### `karim/2026-09-21-relance-prospects` · chatgpt · 21/09 09:40 · 7 tours · faux ami, bruit
- F050 · L'interlocutrice chez Plomberie Rousseau est Sandrine Rousseau, la gérante. · Plomberie Rousseau (client) · non
- F051 · L'interlocuteur chez Charpentes Morvan est Erwan Morvan, le gérant. · Charpentes Morvan (client) · non
- F079 · Charpentes Morvan compte 30 salariés. · Charpentes Morvan (client) · non
- N020 · Brouillon de mail de relance générique. · brouillon

#### `karim/2026-09-22-devis-dupont` · chatgpt · 22/09 10:05 · 9 tours · change (R1 ancien), conflit (C4 a), doublon (D1), faux ami
- F052 · Le devis de Menuiserie Dupont s'élève à 18 400 € HT. · Menuiserie Dupont (client) · non
- F053 · Menuiserie Dupont paie ses factures à 45 jours. · Menuiserie Dupont (client) · non
- F054 · Gérard Dupont est le gérant de Menuiserie Dupont. · Menuiserie Dupont (client) · non
- F055 · Le devis de Menuiserie Dupont porte sur 25 licences, le déploiement et la formation. · Menuiserie Dupont (client) · non
- N021 · Définition générale de l'acompte. · question générale

#### `karim/2026-09-23-signature-lambert` · chatgpt · 23/09 16:50 · 7 tours · doublon (D3)
- F056 · Peinture & Déco Lambert a signé le 23 septembre 2026 pour 6 licences. · Peinture & Déco Lambert (client) · non
- F057 · Le contrat de Peinture & Déco Lambert s'élève à 4 200 € HT la première année. · Peinture & Déco Lambert (client) · non
- F058 · L'interlocutrice chez Peinture & Déco Lambert est Aurélie Lambert, cogérante. · Peinture & Déco Lambert (client) · non
- F080 · Les nouveaux clients sont saisis dans le CRM Prospecta. · Prospecta (outil) · non

#### `karim/2026-09-25-prospect-rousseau` · chatgpt · 25/09 11:30 · 8 tours · conflit (C1 a), faux ami
- F059 · Le devis de Plomberie Rousseau s'élève à 9 600 € HT pour 12 licences. · Plomberie Rousseau (client) · non
- F060 · Plomberie Rousseau doit signer mi-octobre 2026. · Plomberie Rousseau (client) · non
- N022 · Argumentaire général pour vendre un logiciel aux plombiers. · question générale
- N023 · « Si on leur fait -15 % ils signent direct » : piste non décidée. · hypothèse

#### `karim/2026-09-28-ticket-perrin` · chatgpt · 28/09 14:10 · 7 tours · doublon (D6, D21), bruit
- F061 · Électricité Perrin signale (ticket 482) que l'export PDF des devis coupe les lignes au-delà de 50 postes. · Électricité Perrin (client) · non
- F062 · L'interlocuteur chez Électricité Perrin est Damien Perrin, le gérant. · Électricité Perrin (client) · non
- F063 · Électricité Perrin utilise 8 licences Chantier+. · Électricité Perrin (client) · non
- N024 · Formule d'excuse type pour un client mécontent. · brouillon

#### `karim/2026-09-30-fournier-concurrent` · chatgpt · 30/09 09:20 · 8 tours · doublon (D5, D10), faux ami
- F064 · Maçonnerie Fournier menace de partir chez Batinova. · Maçonnerie Fournier (client) · non
- F065 · Batinova propose 39 € HT par utilisateur et par mois. · Batinova (concurrent) · non
- F066 · L'interlocuteur chez Maçonnerie Fournier est Patrick Fournier, le gérant. · Maçonnerie Fournier (client) · non
- F081 · Maçonnerie Fournier utilise 20 licences Chantier+. · Maçonnerie Fournier (client) · non
- N025 · Comparatif général des CRM du marché. · question générale

#### `karim/2026-10-01-renegociation-dupont` · chatgpt · 01/10 15:45 · 8 tours · change (R1 nouveau), doublon (D19), faux ami
- F067 · Le devis de Menuiserie Dupont est renégocié à 16 900 € HT. · Menuiserie Dupont (client) · non
- F068 · Gérard Dupont veut la refonte du module devis livrée avant le 30 octobre 2026. · Menuiserie Dupont (client) · non
- N026 · Brouillon de mail « proposition finale » non envoyé. · brouillon
- remplace : `{ ancien: F052, nouveau: F067 }` (R1)

#### `karim/2026-10-05-bati-ouest-contrat` · chatgpt · 05/10 10:00 · 8 tours · conflit (C2 b), change (R7 nouveau), doublon (D4)
- F069 · SARL Bati-Ouest a 60 licences Chantier+. · SARL Bati-Ouest (client) · non
- F070 · Le contrat annuel de SARL Bati-Ouest s'élève à 42 000 € HT. · SARL Bati-Ouest (client) · non
- F071 · Depuis le 1er octobre 2026, l'interlocutrice chez SARL Bati-Ouest est Stéphanie Caron, nouvelle DSI. · SARL Bati-Ouest (client) · non
- F072 · SARL Bati-Ouest a besoin du connecteur Chorus Pro, attendu le 1er décembre, pour facturer ses marchés publics. · Connecteur Chorus Pro (projet) · non
- remplace : `{ ancien: F282, nouveau: F071 }` (R7) · conflits : `{ a: F009, b: F069 }` (C2)

#### `karim/2026-10-07-salon-decale` · chatgpt · 07/10 13:15 · 8 tours · change (R6 nouveau), doublon (D9, D14), faux ami
- F073 · Le Salon des Artisans de l'Ouest est décalé aux 27 et 28 novembre 2026. · Salon des Artisans de l'Ouest (projet) · non
- F074 · Maçonnerie Fournier reste client avec une remise de 10 %. · Maçonnerie Fournier (client) · non
- F075 · Une démonstration de Chantier+ est prévue chez Charpentes Morvan le 20 octobre 2026. · Charpentes Morvan (client) · non
- N027 · Conseils généraux pour réussir un pitch de salon. · question générale
- remplace : `{ ancien: F004, nouveau: F073 }` (R6)

#### `karim/2026-10-09-concurrents` · chatgpt · 09/10 16:00 · 10 tours · faux ami, bruit
- F076 · Ouvrio vend une application mobile seule à 29 € HT par utilisateur et par mois. · Ouvrio (concurrent) · non
- F077 · Planika BTP a levé 4 millions d'euros en septembre 2026. · Planika BTP (concurrent) · non
- F078 · Planika BTP vise les entreprises du bâtiment de plus de 50 salariés. · Planika BTP (concurrent) · non
- F082 · Ouvrio est basé à Bordeaux. · Ouvrio (concurrent) · non
- F083 · Batinova est basé à Lyon. · Batinova (concurrent) · non
- N028 · Taille du marché des logiciels du bâtiment en France, chiffre non vérifié. · hypothèse non sourcée
- N029 · « Ouvrio va sûrement couler d'ici un an. » · spéculation
- N030 · Définition générale d'un argumentaire différenciant. · question générale

### Hugo (claude_code) : 12 conversations, 204 tours, bloc F100-F179, N040-N079

Sessions longues : l'assistant répond avec du code, des commandes, des sorties (`$ pnpm test`, `psql`, `df -h`, traces). Au moins un tiers des tours est du bruit sans entrée. Les faits sont dits par Hugo ou dans une synthèse de l'assistant validée par Hugo (« ok, on garde ça »).

#### `hugo/2026-09-21-migration-postgres` · claude_code · 21/09 09:30 · 16 tours · bruit, faux ami
- F100 · Chantier+ tourne sur une base Postgres managée chez OVH. · Chantier+ (produit) · non
- F101 · La base de production de Chantier+ est passée de Postgres 15 à Postgres 16 le 21 septembre 2026. · Postgres (outil) · non
- F102 · Les sauvegardes de la base de Chantier+ sont conservées 14 jours. · Sauvegardes de la base (regle) · non
- F103 · La migration de Postgres se fait hors des heures ouvrées, après 20 h. · Mises en production (regle) · non
- N040 · Sorties de `psql` et de `pg_upgrade`. · sortie d'outil
- N041 · « On pourrait passer à Supabase un jour. » · hypothèse

#### `hugo/2026-09-23-geocodage-mapeo` · claude_code · 23/09 10:00 · 18 tours · agents (A1, sans décision), change (R3 ancien), bruit
- F120 · Le géocodage des adresses de chantier de Chantier+ passe par l'API Mapéo. · Mapéo (fournisseur) · non
- F121 · L'API Mapéo limite à 10 requêtes par seconde. · Mapéo (fournisseur) · non
- F122 · Un agent mesure que le cache de géocodage réduit d'environ 70 % les appels à Mapéo. · Cache de géocodage (outil) · non
- F123 · Les résultats de géocodage sont mis en cache 30 jours. · Cache de géocodage (outil) · non
- N042 · Débogage d'erreurs 429 sans décision. · débogage sans décision
- N043 · Proposition d'un agent de passer à un cache mémoire, non tranchée. · proposition non retenue

#### `hugo/2026-09-24-module-devis-schema` · claude_code · 24/09 09:15 · 18 tours · conflit (C3 a, C5 a), bruit
- F124 · Dans l'API de Chantier+, les montants sont des entiers en centimes. · Refonte du module devis (projet) · non
- F125 · La mise en production de la refonte du module devis est prévue le 20 octobre 2026. · Refonte du module devis (projet) · non
- F126 · Les lignes de devis passent dans une table dédiée devis_lignes. · Refonte du module devis (projet) · non
- F127 · Hugo Martin est le responsable technique de la refonte du module devis. · Refonte du module devis (projet) · non
- F150 · Chaque devis garde l'historique de ses versions. · Refonte du module devis (projet) · non
- N044 · Migration SQL et code TypeScript générés. · code

#### `hugo/2026-09-25-debug-export-pdf` · claude_code · 25/09 14:00 · 16 tours · doublon (D21), bruit
- F128 · Le bug du ticket 482 vient d'une limite de 50 lignes codée en dur dans le générateur PDF. · Électricité Perrin (client) · non
- F129 · Le bug du ticket 482 touche tous les devis de plus de 50 lignes, pas seulement ceux d'Électricité Perrin. · Chantier+ (produit) · non
- N046 · Traces de pile et sorties de test. · sortie d'outil
- N048 · Correctif tenté puis annulé (`git checkout`). · débogage sans décision

#### `hugo/2026-09-28-chorus-pro-recherche` · claude_code · 28/09 09:45 · 16 tours · doublon (D4), faux ami
- F113 · Le connecteur Chorus Pro doit être livré le 1er décembre 2026 pour SARL Bati-Ouest et Couverture Le Bihan. · Connecteur Chorus Pro (projet) · non
- F130 · Décision : le connecteur Chorus Pro utilise un compte technique dédié par client. · Connecteur Chorus Pro (projet) · non
- F131 · Le connecteur Chorus Pro envoie les factures au format Factur-X. · Connecteur Chorus Pro (projet) · non
- N045 · Présentation générale de Chorus Pro et de l'obligation de facturation électronique. · question générale
- N049 · Résultats de recherche web bruts, non vérifiés. · recherche non vérifiée

#### `hugo/2026-09-29-debat-generation-pdf` · claude_code · 29/09 10:30 · 20 tours · agents (A2, décision), doublon (D7), bruit
- F117 · Décision : les PDF de devis sont générés côté serveur par une file de jobs pg-boss, et non plus à la volée. · Génération des PDF de devis (decision) · non
- F132 · Un agent mesure 4,2 s en moyenne pour générer à la volée un devis de 80 lignes. · Génération des PDF de devis (decision) · non
- F133 · Le correctif du ticket 482 d'Électricité Perrin est prévu pour le 6 octobre 2026, avec la nouvelle génération des PDF. · Électricité Perrin (client) · non
- F134 · Option rejetée : un service externe de génération de PDF, pour des raisons de coût et de données clients. · Génération des PDF de devis (decision) · non
- N050 · Code du worker pg-boss. · code

#### `hugo/2026-10-01-api-mobile-auth` · claude_code · 01/10 09:00 · 16 tours · bruit
- F135 · Les jetons d'accès de l'API mobile durent 15 minutes et le jeton de rafraîchissement 30 jours. · Application mobile v2 (projet) · non
- F136 · L'API de l'application mobile est versionnée sous /api/v2. · Application mobile v2 (projet) · non
- F151 · L'API mobile limite chaque utilisateur à 100 requêtes par minute. · Application mobile v2 (projet) · non
- N051 · Débogage CORS sans décision. · débogage sans décision

#### `hugo/2026-10-02-astreinte-incident` · claude_code · 02/10 07:50 · 16 tours · bruit
- F137 · Le 2 octobre 2026, Chantier+ a été indisponible 47 minutes à cause d'un disque plein sur le serveur OVH. · Chantier+ (produit) · non
- F138 · Une alerte se déclenche quand le disque du serveur dépasse 80 %. · Surveillance du serveur (regle) · non
- F139 · Les journaux applicatifs de Chantier+ sont conservés 7 jours. · Surveillance du serveur (regle) · non
- F152 · L'astreinte technique tourne chaque semaine entre Hugo Martin, Baptiste Kerjean et Antoine Pellerin. · Astreinte technique (regle) · non
- N052 · Sorties de `df -h` et `journalctl`. · sortie d'outil

#### `hugo/2026-10-06-bascule-terracarte` · claude_code · 06/10 10:20 · 18 tours · secret (sk-essai, t-009), doublon (D11), bruit
- F140 · Le géocodage de Chantier+ passe désormais par l'API TerraCarte. · TerraCarte (fournisseur) · non
- F141 · L'API TerraCarte autorise 50 requêtes par seconde. · TerraCarte (fournisseur) · non
- F142 · Le cache de géocodage de 30 jours est conservé avec TerraCarte. · Cache de géocodage (outil) · non
- N047 · Contenu du fichier `.env.local` affiché, avec la clé d'API TerraCarte. · secret
- N053 · « Peut-être que TerraCarte gère mal les lieux-dits » : supposition non vérifiée. · hypothèse

#### `hugo/2026-10-07-revue-code-devis` · claude_code · 07/10 14:00 · 18 tours · bruit
- F143 · Le module devis gère les lignes en variante (option ou alternative). · Refonte du module devis (projet) · non
- F144 · La remise globale d'un devis est plafonnée à 30 %. · Remise maximale sur un devis (regle) · non
- F145 · Toute modification du module devis passe par une relecture de code avant fusion. · Relecture de code (regle) · non
- F154 · Un devis signé n'est plus modifiable : toute modification crée un avenant. · Avenants de devis (regle) · non
- N054 · Sorties de tests et diff. · sortie d'outil
- N055 · Renommages de variables sans portée fonctionnelle. · session

#### `hugo/2026-10-08-revue-agents-chorus` · claude_code · 08/10 09:30 · 20 tours · agents (A3), doublon (D17), faux ami
- F146 · Décision : les factures d'acompte sont reportées à une version 2 du connecteur Chorus Pro. · Connecteur Chorus Pro (projet) · non
- F147 · Rapport d'agent : 3 des 5 cas de test du connecteur Chorus Pro échouent sur les factures d'acompte. · Connecteur Chorus Pro (projet) · non
- F148 · Rapport d'agent : le connecteur ne gère pas encore les avoirs. · Connecteur Chorus Pro (projet) · non
- F149 · Marion Caradec reprend les tests du connecteur Chorus Pro. · Connecteur Chorus Pro (projet) · non
- N056 · Hypothèse d'un agent sur une cause de rejet, non confirmée. · hypothèse

#### `hugo/2026-10-10-bilan-semaine` · claude_code · 10/10 10:00 · 12 tours · doublon (D15), faux ami
- F160 · La démonstration du connecteur Chorus Pro chez SARL Bati-Ouest est prévue le 4 novembre 2026. · Connecteur Chorus Pro (projet) · non
- F161 · La refonte du module devis est faite à 70 % au 9 octobre 2026. · Refonte du module devis (projet) · non
- F162 · Hugo Martin rédige un bilan technique chaque vendredi pour l'équipe. · Bilan technique hebdomadaire (regle) · non
- N057 · Bavardage de fin de semaine. · bavardage
- N058 · « Il faudrait peut-être réécrire tout le back en Go. » · hypothèse

### Inès (claude_code et chatgpt) : 10 conversations, 100 tours, bloc F180-F229, N080-N099

#### `ines/2026-09-21-mobile-navigation` · claude_code · 21/09 10:00 · 12 tours · bruit
- F180 · L'application mobile v2 est développée en React Native. · Application mobile v2 (projet) · non
- F181 · Inès Moreau est responsable de l'application mobile v2. · Application mobile v2 (projet) · non
- F182 · L'application mobile v2 a quatre onglets : chantiers, devis, planning, profil. · Application mobile v2 (projet) · non
- F183 · L'application mobile v2 vise au minimum iOS 16 et Android 12. · Application mobile v2 (projet) · non
- N080 · Code des écrans de navigation. · code

#### `ines/2026-09-22-choix-graphiques` · chatgpt · 22/09 11:20 · 8 tours · change (R4 ancien), faux ami
- F184 · Décision : l'application mobile v2 utilise la bibliothèque rn-quickcharts pour ses graphiques. · Application mobile v2 (projet) · non
- F199 · Les graphiques de l'application mobile v2 montrent l'avancement des chantiers et le montant signé du mois. · Application mobile v2 (projet) · non
- N081 · React Native contre Flutter en général. · question générale

#### `ines/2026-09-24-hors-ligne` · claude_code · 24/09 13:30 · 12 tours · doublon (D2), bruit
- F185 · SARL Bati-Ouest est le client pilote de l'application mobile v2. · Application mobile v2 (projet) · non
- F187 · L'application mobile v2 fonctionne hors ligne et se synchronise au retour du réseau. · Application mobile v2 (projet) · non
- F188 · Les données hors ligne de l'application mobile v2 sont stockées en SQLite. · Application mobile v2 (projet) · non
- N082 · Débogage de la synchronisation sans décision. · débogage sans décision

#### `ines/2026-09-28-ticket-perrin` · claude_code · 28/09 15:00 · 10 tours · doublon (D6, D21), bruit
- F186 · Karim a relayé le ticket 482 d'Électricité Perrin : l'export PDF des devis coupe au-delà de 50 lignes. · Électricité Perrin (client) · non
- F189 · Le ticket 482 est confié à Hugo Martin, car il touche au générateur PDF côté serveur. · Électricité Perrin (client) · non
- F200 · Damien Perrin a envoyé un devis de 63 lignes pour reproduire le ticket 482. · Électricité Perrin (client) · non
- N083 · Contournement provisoire testé (export en deux PDF). · session

#### `ines/2026-09-30-abandon-quickcharts` · claude_code · 30/09 10:45 · 12 tours · change (R4 nouveau), bruit
- F190 · rn-quickcharts n'est plus maintenue depuis mars 2026. · rn-quickcharts (outil) · non
- F191 · rn-quickcharts plante sur Android 15. · rn-quickcharts (outil) · non
- F192 · Décision : l'application mobile v2 abandonne rn-quickcharts et passe à graphiko-native. · Application mobile v2 (projet) · non
- F201 · graphiko-native est publiée sous licence MIT. · graphiko-native (outil) · non
- N084 · Code de migration des composants graphiques. · code
- remplace : `{ ancien: F184, nouveau: F192 }` (R4)

#### `ines/2026-10-01-api-montants` · chatgpt · 01/10 14:20 · 8 tours · conflit (C3 b), doublon (D7), faux ami
- F193 · Avec Hugo, il est décidé que les PDF de devis sont générés côté serveur par une file de jobs. · Génération des PDF de devis (decision) · non
- F194 · Les montants renvoyés par l'API de Chantier+ sont en euros décimaux. · Refonte du module devis (projet) · non
- N085 · Différence générale entre float et decimal. · question générale
- conflits : `{ a: F124, b: F194 }` (C3)

#### `ines/2026-10-02-design-maquettes` · chatgpt · 02/10 11:00 · 8 tours · faux ami
- F195 · Lucas Fabre livre les maquettes de l'application mobile v2 le 9 octobre 2026. · Lucas Fabre (fournisseur) · non
- F196 · La couleur principale de Chantier+ est le bleu #1F4E79. · Chantier+ (produit) · non
- F202 · L'application mobile v2 propose un mode sombre. · Application mobile v2 (projet) · non
- N086 · Brouillon de textes de l'écran d'accueil. · brouillon

#### `ines/2026-10-05-notifications-push` · claude_code · 05/10 09:10 · 12 tours · bruit
- F197 · Le chef de chantier reçoit une notification push quand un devis est signé. · Application mobile v2 (projet) · non
- F198 · Les notifications push sont désactivables par type dans le profil. · Application mobile v2 (projet) · non
- F203 · Le client signe le devis sur le téléphone du chef de chantier, dans l'application mobile v2. · Application mobile v2 (projet) · non
- N087 · Débogage des jetons de notification sans décision. · débogage sans décision

#### `ines/2026-10-07-tests-pilote` · claude_code · 07/10 16:00 · 10 tours · doublon (D12, D13), bruit
- F213 · Le pilote de l'application mobile v2 chez SARL Bati-Ouest démarre le 19 octobre 2026 avec 10 compagnons. · Application mobile v2 (projet) · non
- F214 · La livraison de l'application mobile v2 est décalée au 5 novembre 2026. · Application mobile v2 (projet) · non
- F204 · Inès Moreau forme les 10 compagnons de SARL Bati-Ouest le 16 octobre 2026, avant le pilote. · Application mobile v2 (projet) · non
- N089 · Sortie des tests end-to-end. · sortie d'outil

#### `ines/2026-10-09-revue-accessibilite` · chatgpt · 09/10 10:30 · 8 tours · faux ami
- F215 · La taille de police minimale de l'application mobile v2 est de 16 px. · Application mobile v2 (projet) · non
- F216 · Les boutons de l'application mobile v2 font au moins 44 px de haut. · Application mobile v2 (projet) · non
- F205 · Les contrastes de couleur de l'application mobile v2 respectent un ratio d'au moins 4,5 pour 1. · Application mobile v2 (projet) · non
- N088 · Ce qu'est le RGAA, en général. · question générale

### Sophie (chatgpt) : 9 conversations, 70 tours, bloc F230-F279, N100-N119

#### `sophie/2026-09-21-contrats-fournisseurs` · chatgpt · 21/09 08:50 · 8 tours · faux ami
- F230 · OVH facture 412 € HT par mois pour l'hébergement de Chantier+. · OVH (fournisseur) · non
- F231 · Le contrat Mapéo coûte 290 € HT par mois, avec un préavis de résiliation d'un mois. · Mapéo (fournisseur) · non
- F232 · L'expert-comptable de l'entreprise est le Cabinet Ferrand & Associés, interlocuteur Michel Ferrand. · Cabinet Ferrand & Associés (fournisseur) · non
- F233 · L'exercice comptable de l'entreprise se clôt au 31 décembre. · Clôture comptable (regle) · non
- F244 · Le contrat OVH se renouvelle chaque année au 1er mars. · OVH (fournisseur) · non
- N107 · Tableau d'échéances proposé par l'assistant à titre d'exemple. · brouillon

#### `sophie/2026-09-23-facture-lambert` · chatgpt · 23/09 15:30 · 7 tours · doublon (D3), faux ami
- F234 · Peinture & Déco Lambert a signé pour 6 licences à 4 200 € HT ; la facture est émise le 24 septembre 2026. · Peinture & Déco Lambert (client) · non
- F235 · Les factures sont émises dans Comptaflow. · Comptaflow (outil) · non
- F245 · Les clients de l'entreprise paient uniquement par virement. · Facturation clients (regle) · non
- N100 · Explication générale de l'autoliquidation de TVA dans le BTP. · question générale

#### `sophie/2026-09-24-mutuelle` · chatgpt · 24/09 10:10 · 7 tours · conflit (C6 a), faux ami
- F240 · La cotisation de la Mutuelle Atlantique Santé augmente de 4,5 % au 1er janvier 2027. · Mutuelle Atlantique Santé (fournisseur) · non
- F238 · L'employeur prend en charge 60 % de la cotisation de la mutuelle. · Mutuelle Atlantique Santé (fournisseur) · non
- N101 · Brouillon de note d'information aux salariés sur la mutuelle. · brouillon

#### `sophie/2026-09-28-arret-maladie` · chatgpt · 28/09 09:00 · 8 tours · sensible (S2), faux ami
- F236 · Julien Lefort est en arrêt maladie du 28 septembre au 16 octobre 2026. · Julien Lefort (personne) · oui (sante)
- F237 · L'entreprise maintient le salaire de Julien Lefort pendant son arrêt (subrogation). · Julien Lefort (personne) · oui (sante)
- F239 · Pendant l'absence de Julien Lefort, Romain Tessier assure seul le support client. · Support client (regle) · non
- N102 · Délai de carence d'un arrêt maladie, en général. · question générale

#### `sophie/2026-09-30-prudhommes` · chatgpt · 30/09 14:00 · 8 tours · sensible (S3), doublon (D8), faux ami
- F241 · Yann Le Goff réclame 24 000 € à l'entreprise devant les prud'hommes. · Yann Le Goff (personne) · oui (juridique)
- F242 · L'audience de conciliation du dossier Le Goff a lieu le 13 novembre 2026. · Yann Le Goff (personne) · oui (juridique)
- F243 · Maître Hélène Vasseur facture un forfait de 3 500 € HT pour le dossier Le Goff. · Cabinet Vasseur Avocats (fournisseur) · oui (juridique)
- N103 · Brouillon de courrier à l'avocate. · brouillon

#### `sophie/2026-10-01-prestataires-acces` · chatgpt · 01/10 11:15 · 8 tours · change (R5 nouveau), secret (password, t-005)
- F246 · Le TJM de Lucas Fabre est renégocié à 500 € HT. · Lucas Fabre (fournisseur) · non
- F247 · Lucas Fabre est payé à 30 jours. · Lucas Fabre (fournisseur) · non
- F248 · Le compte client OVH de l'entreprise est géré par Sophie Garnier. · OVH (fournisseur) · non
- N104 · Identifiant et mot de passe d'accès OVH collés dans le message. · secret
- remplace : `{ ancien: F287, nouveau: F246 }` (R5)

#### `sophie/2026-10-05-cartographie` · chatgpt · 05/10 09:30 · 8 tours · change (R3 nouveau), doublon (D11), faux ami
- F253 · TerraCarte remplace Mapéo comme fournisseur de géocodage et de cartographie à partir du 5 octobre 2026. · TerraCarte (fournisseur) · non
- F254 · L'abonnement TerraCarte coûte 180 € HT par mois. · TerraCarte (fournisseur) · non
- F255 · La résiliation de Mapéo est envoyée le 5 octobre 2026 et prend effet le 5 novembre 2026. · Mapéo (fournisseur) · non
- F258 · L'abonnement TerraCarte est sans durée minimale et résiliable à tout moment. · TerraCarte (fournisseur) · non
- N105 · Brouillon de lettre de résiliation. · brouillon
- remplace : `{ ancien: F120, nouveau: F253 }` (R3)

#### `sophie/2026-10-06-relance-dupont` · chatgpt · 06/10 16:20 · 7 tours · conflit (C4 b), faux ami
- F264 · Menuiserie Dupont paie ses factures à 30 jours fin de mois. · Menuiserie Dupont (client) · non
- F265 · La facture annuelle de SARL Bati-Ouest est payée en 4 échéances trimestrielles. · SARL Bati-Ouest (client) · non
- F263 · Les relances de factures impayées partent 10 jours après l'échéance. · Facturation clients (regle) · non
- N106 · Modèle de relance de facture impayée. · brouillon
- conflits : `{ a: F053, b: F264 }` (C4)

#### `sophie/2026-10-08-budget-2027` · chatgpt · 08/10 14:45 · 9 tours · doublon (D18), faux ami
- F266 · Le budget formation 2027 est de 6 000 €. · Budget 2027 (decision) · non
- F256 · Sophie Garnier a rendez-vous avec Michel Ferrand le 15 octobre 2026 pour préparer la clôture. · Cabinet Ferrand & Associés (fournisseur) · non
- F257 · Le budget du stand au Salon des Artisans de l'Ouest est confirmé à 3 000 € HT. · Salon des Artisans de l'Ouest (projet) · non
- F267 · Le budget 2027 prévoit l'embauche d'un deuxième commercial au second semestre. · Budget 2027 (decision) · non
- N108 · Projection de trésorerie non validée. · hypothèse

### Nadia (claude_ai et claude_code) : 10 conversations, 80 tours, bloc F280-F329, N120-N139

#### `nadia/2026-09-21-planning-mobile` · claude_ai · 21/09 11:00 · 8 tours · change (R2 ancien, R7 ancien), doublon (D2)
- F280 · La livraison de l'application mobile v2 est prévue le 15 octobre 2026. · Application mobile v2 (projet) · non
- F281 · SARL Bati-Ouest est le client pilote de l'application mobile v2. · Application mobile v2 (projet) · non
- F282 · L'interlocuteur chez SARL Bati-Ouest est Olivier Ménard, directeur technique. · SARL Bati-Ouest (client) · non
- N120 · Brouillon de rétroplanning proposé par l'assistant puis modifié. · brouillon

#### `nadia/2026-09-22-onboarding-dupont` · claude_ai · 22/09 09:30 · 8 tours · doublon (D1)
- F283 · Gérard Dupont, le gérant, est l'interlocuteur de Menuiserie Dupont. · Menuiserie Dupont (client) · non
- F284 · La formation de Menuiserie Dupont se fait en 2 sessions sur site, à Angers. · Menuiserie Dupont (client) · non
- F285 · Camille Rivet assure la formation de Menuiserie Dupont. · Menuiserie Dupont (client) · non
- F286 · La première session de formation chez Menuiserie Dupont a lieu le 13 octobre 2026. · Menuiserie Dupont (client) · non

#### `nadia/2026-09-23-budget-design` · claude_ai · 23/09 14:00 · 8 tours · change (R5 ancien), faux ami
- F287 · Le TJM de Lucas Fabre est de 550 € HT. · Lucas Fabre (fournisseur) · non
- F288 · Lucas Fabre est engagé pour 12 jours sur l'application mobile v2. · Lucas Fabre (fournisseur) · non
- N121 · « Si on prenait une agence plutôt qu'un freelance ? » : piste non retenue. · hypothèse

#### `nadia/2026-09-25-tableau-suivi` · claude_code · 25/09 16:30 · 8 tours · bruit
- F290 · Les comités projet ont lieu le mardi à 10 h. · Comité projet (regle) · non
- F291 · Le suivi des projets est un fichier suivi-projets.md mis à jour chaque lundi. · Suivi des projets (outil) · non
- N122 · Script de génération du tableau et sa sortie. · code

#### `nadia/2026-09-29-planning-chorus` · claude_ai · 29/09 10:00 · 8 tours · doublon (D4), conflit (C1 b)
- F289 · Le connecteur Chorus Pro doit être livré le 1er décembre 2026 pour SARL Bati-Ouest et Couverture Le Bihan. · Connecteur Chorus Pro (projet) · non
- F304 · Plomberie Rousseau doit signer en novembre 2026. · Plomberie Rousseau (client) · non
- F305 · L'interlocutrice chez Couverture Le Bihan est Maëlle Le Bihan, la gérante. · Couverture Le Bihan (client) · non
- conflits : `{ a: F060, b: F304 }` (C1)

#### `nadia/2026-10-01-absences-equipe` · claude_ai · 01/10 09:15 · 8 tours · sensible (S5), faux ami
- F307 · Léa Brossard déménage à Rennes parce que son conjoint y est muté. · Léa Brossard (personne) · oui (perso)
- F309 · Léa Brossard passe en télétravail 3 jours par semaine à partir de novembre 2026. · Léa Brossard (personne) · oui (rh)
- F308 · Julien Lefort est absent jusqu'au 16 octobre 2026. · Julien Lefort (personne) · oui (rh)
- N123 · Bavardage sur le week-end. · bavardage

#### `nadia/2026-10-02-replanification-mobile` · claude_ai · 02/10 10:30 · 8 tours · change (R2 nouveau), doublon (D12, D13)
- F298 · La livraison de l'application mobile v2 est décalée au 5 novembre 2026. · Application mobile v2 (projet) · non
- F299 · Le décalage de l'application mobile v2 vient du retard des maquettes et de l'abandon de rn-quickcharts. · Application mobile v2 (projet) · non
- F300 · Le pilote chez SARL Bati-Ouest démarre le 19 octobre 2026 avec 10 compagnons. · Application mobile v2 (projet) · non
- F301 · Claire Lebrun a validé le nouveau planning de l'application mobile v2 le 2 octobre 2026. · Application mobile v2 (projet) · non
- remplace : `{ ancien: F280, nouveau: F298 }` (R2)

#### `nadia/2026-10-05-planning-devis` · claude_code · 05/10 11:00 · 8 tours · conflit (C5 b), doublon (D19), bruit
- F306 · La mise en production de la refonte du module devis est prévue le 30 octobre 2026. · Refonte du module devis (projet) · non
- F312 · La refonte du module devis a été promise à Menuiserie Dupont avant le 30 octobre 2026. · Menuiserie Dupont (client) · non
- F313 · Le gel des développements du module devis commence le 23 octobre 2026. · Refonte du module devis (projet) · non
- N124 · Sortie du script de mise à jour du planning. · sortie d'outil
- conflits : `{ a: F125, b: F306 }` (C5)

#### `nadia/2026-10-07-comite-projet` · claude_ai · 07/10 10:00 · 8 tours · doublon (D15, D20), sensible (S1)
- F310 · Bastien Royer arrive le 2 novembre 2026 et rejoint l'application mobile v2. · Bastien Royer (personne) · oui (rh)
- F311 · La démonstration du connecteur Chorus Pro chez SARL Bati-Ouest est prévue le 4 novembre 2026. · Connecteur Chorus Pro (projet) · non
- F314 · Le compte rendu de chaque comité projet est envoyé le jour même. · Comité projet (regle) · non
- N125 · Brouillon d'ordre du jour du comité. · brouillon

#### `nadia/2026-10-09-relances-clients` · claude_ai · 09/10 15:30 · 8 tours · doublon (D14, D16)
- F318 · Une démonstration est prévue chez Charpentes Morvan le 20 octobre 2026. · Charpentes Morvan (client) · non
- F319 · Couverture Le Bihan renouvelle son contrat pour 2027. · Couverture Le Bihan (client) · non
- F320 · Nadia Benali relance chaque client sans réponse au bout de 5 jours ouvrés. · Relance clients (regle) · non
- F321 · Erwan Morvan veut voir l'application mobile pendant la démonstration du 20 octobre. · Charpentes Morvan (client) · non
- N126 · Brouillon de mail de relance. · brouillon

## 7. Règles d'écriture

- **Format** : celui de la tâche 15 du plan (payload `IngestPayload` + attendu). `source.external_id` = `essai-<personnage>-<AAAA-MM-JJ>-<sujet>` ; tours `t-001`, `t-002`… ; `role` vaut `user` ou `assistant` uniquement. Les sorties d'outils et les commandes sont dans le texte des tours `assistant` ; les `<teammate-message>` dans des tours `user`.
- **Heures** : ISO 8601 avec le décalage `+02:00`, à partir de l'heure de début indiquée, strictement croissantes, quelques secondes à quelques minutes entre deux tours (plus long quand Hugo lance des agents).
- **Nombre de tours** : celui indiqué, à ±2 près. Un tour fait au plus 20 000 caractères. Chez Hugo, des tours assistant de 1 000 à 11 000 caractères ; chez Inès, plus courts.
- **Les faits attendus** : chaque F est dit **clairement et une seule fois** dans la conversation, dans un seul tour, de préférence par le personnage (tour `user`), ou par l'assistant puis validé par lui. L'`extrait` est copié **tel quel** du texte du tour (8 à 300 caractères, sans « … »). L'`enonce` de l'attendu reprend l'énoncé de la bible ; `fiche`, `alias` et `typeFiche` aussi (alias : section 3). Le personnage n'a pas à employer la formule de la bible : Karim écrit « dupont c 45j », c'est l'extrait.
- **Fait ou bruit** : un fait attendu est durable et utile à l'auteur ou à l'équipe (décision, engagement, chiffre convenu, fait sur un client, un fournisseur, un projet, une personne, un outil, une règle). Le code, les sorties d'outils, le débogage sans décision, les questions générales et le bavardage n'ont pas d'entrée (ou une entrée N quand la bible le demande).
- **Rien de plus** : n'ajoutez pas d'autre information durable que celles de la bible (pas de nouveau client, montant, date ou décision). Le décor (code, explications, politesse) est libre.
- **Les N** : le contenu du faux ami doit être clairement une hypothèse (« peut-être », « on pourrait »), un brouillon (« voici un projet de courrier ») ou une question générale. Le champ `tour` pointe vers le tour qui le porte.
- **Doublons** : chaque voix formule l'information à sa façon, jamais copiée d'un autre personnage.
- **Remplacements et conflits** : la nouvelle valeur ou la seconde version est affirmée sans référence à l'ancienne (sauf R1, R2, R4 et R6, où le personnage peut dire « on passe de… à… »). Ils ne se déclarent que dans la conversation indiquée en section 5, avec ces identifiants.
- **Secrets** : uniquement aux deux endroits fixés, chaîne exacte. Aucun fait attendu, `enonce` ni `extrait` ne contient un secret.
- **Sensible** : `sensible: true` exactement pour les faits marqués « oui » ; la catégorie n'est pas dans l'attendu, elle sert de guide.
- **Identifiants** : uniquement ceux de votre bloc, uniquement ceux listés pour la conversation.
- **Réalisme** : pas de nom réel, pas de vraie adresse, téléphone fictif au format `02 40 00 00 xx` si besoin. Tutoiement de l'assistant permis sauf Claire.
