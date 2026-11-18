# Point du matin : « actuel » contre « court » (généré par banc/comparer-point.ts)

Sonnet 5.5, 20 cas (jeux/ et jeux-validation/), 2 passages par cas. Faits vérifiés par openai/gpt-6.1-terra et google/gemini-4-hydrogen (moyenne, sans contre-vérification) ; duels jugés à l'aveugle par openai/gpt-6.1-terra et google/gemini-4-hydrogen.

| consigne | mots (médiane) | mots (max) | puces (médiane) | essentiel gardé (poids 3) | important gardé (poids 2-3) | tous les faits | fautes par point | 1re puce juste | « rien » juste |
|---|---|---|---|---|---|---|---|---|---|
| actuel | 236 | 311 | 6 | 95 % | 95 % | 95 % | 0.26 | 82 % | 2/2 |
| court | 97 | 138 | 4.5 | 82 % | 74 % | 71 % | 0.07 | 79 % | 2/2 |

## Duels à l'aveugle

| juge | actuel préféré | court préféré | égal ou sans réponse |
|---|---|---|---|
| openai/gpt-6.1-terra | 29 | 9 | 0 |
| google/gemini-4-hydrogen | 20 | 18 | 0 |

## Par cas

| cas | passage | mots actuel → court | essentiel actuel → court | fautes actuel → court | duels (gagnant par juge) |
|---|---|---|---|---|---|
| kestrel-dedupe-regle-neuf | 1 | 217 → 76 | 88 % → 75 % | 0.0 → 0.0 | actuel, actuel |
| kestrel-dedupe-regle-neuf | 2 | 204 → 91 | 88 % → 63 % | 0.0 → 1.0 | actuel, actuel |
| kestrel-demo-sso-cachee | 1 | 236 → 91 | 100 % → 88 % | 1.0 → 0.0 | actuel, court |
| kestrel-demo-sso-cachee | 2 | 240 → 95 | 88 % → 100 % | 0.0 → 0.0 | court, court |
| kestrel-entretien-sre | 1 | 209 → 104 | 100 % → 67 % | 0.0 → 0.0 | actuel, actuel |
| kestrel-entretien-sre | 2 | 219 → 91 | 100 % → 75 % | 0.0 → 0.0 | actuel, actuel |
| kestrel-pg17-fenetre-deplacee | 1 | 243 → 91 | 100 % → 75 % | 0.0 → 0.0 | court, court |
| kestrel-pg17-fenetre-deplacee | 2 | 257 → 100 | 100 % → 75 % | 0.0 → 0.0 | court, court |
| kestrel-rien-que-du-bruit | 1 | 3 → 3 | – → – | – → – | cas « rien » |
| kestrel-rien-que-du-bruit | 2 | 3 → 3 | – → – | – → – | cas « rien » |
| kestrel-tableaux-injection | 1 | 265 → 112 | 100 % → 100 % | 1.0 → 0.0 | court, court |
| kestrel-tableaux-injection | 2 | 287 → 99 | 100 % → 100 % | 1.0 → 0.0 | court, actuel |
| verdier-reponse-revendeur | 1 | 220 → 98 | 100 % → 38 % | 0.0 → 0.5 | actuel, actuel |
| verdier-reponse-revendeur | 2 | 211 → 109 | 100 % → 63 % | 0.0 → 0.0 | actuel, actuel |
| verdier-soldes-trois-sessions | 1 | 261 → 138 | 88 % → 88 % | 1.0 → 0.0 | actuel, court |
| verdier-soldes-trois-sessions | 2 | 267 → 125 | 100 % → 88 % | 1.0 → 0.0 | actuel, court |
| verdier-synchro-stocks | 1 | 174 → 90 | 88 % → 88 % | 0.0 → 0.0 | actuel, actuel |
| verdier-synchro-stocks | 2 | 162 → 84 | 88 % → 100 % | 0.0 → 0.0 | actuel, actuel |
| verdier-transalp-alternant | 1 | 260 → 111 | 88 % → 75 % | 0.0 → 0.0 | actuel, court |
| verdier-transalp-alternant | 2 | 262 → 105 | 100 % → 88 % | 0.0 → 0.0 | actuel, court |
| del-point-achats-thermaval | 1 | 255 → 91 | 100 % → 75 % | 0.0 → 0.0 | actuel, actuel |
| del-point-achats-thermaval | 2 | 242 → 97 | 100 % → 75 % | 0.0 → 0.0 | actuel, actuel |
| del-point-aides-mpr-injection | 1 | 229 → 83 | 100 % → 100 % | 0.5 → 0.0 | actuel, court |
| del-point-aides-mpr-injection | 2 | 220 → 84 | 100 % → 100 % | 0.5 → 0.0 | actuel, court |
| del-point-alternant-hubspot | 1 | 269 → 112 | 75 % → 100 % | 0.0 → 0.0 | court, court |
| del-point-alternant-hubspot | 2 | 261 → 115 | 75 % → 100 % | 0.0 → 0.0 | court, court |
| del-point-planning-sms-regles | 1 | 276 → 100 | 100 % → 100 % | 0.0 → 0.0 | actuel, actuel |
| del-point-planning-sms-regles | 2 | 311 → 122 | 100 % → 100 % | 0.0 → 1.0 | actuel, actuel |
| kra-point-charge-injektion | 1 | 229 → 90 | 75 % → 38 % | 0.0 → 0.0 | actuel, actuel |
| kra-point-charge-injektion | 2 | 191 → 86 | 88 % → 38 % | 0.0 → 0.0 | actuel, actuel |
| kra-point-pfeiffer-verhandlung | 1 | 267 → 108 | 100 % → 92 % | 0.0 → 0.0 | actuel, actuel |
| kra-point-pfeiffer-verhandlung | 2 | 223 → 91 | 100 % → 75 % | 0.0 → 0.0 | actuel, court |
| qui-point-frise-versements-injection | 1 | 236 → 115 | 100 % → 100 % | 0.0 → 0.0 | court, court |
| qui-point-frise-versements-injection | 2 | 235 → 118 | 100 % → 100 % | 0.0 → 0.0 | court, court |
| qui-point-relance-prospect-ventes | 1 | 219 → 116 | 100 % → 63 % | 1.0 → 0.0 | actuel, court |
| qui-point-relance-prospect-ventes | 2 | 262 → 113 | 100 % → 63 % | 1.0 → 0.0 | actuel, court |
| qui-point-reserve-banque-finance | 1 | 197 → 67 | 100 % → 88 % | 1.0 → 0.0 | actuel, actuel |
| qui-point-reserve-banque-finance | 2 | 182 → 97 | 100 % → 88 % | 0.0 → 0.0 | actuel, actuel |
| qui-point-rotation-cles-regles | 1 | 240 → 89 | 88 % → 88 % | 1.0 → 0.0 | actuel, actuel |
| qui-point-rotation-cles-regles | 2 | 243 → 87 | 88 % → 88 % | 0.0 → 0.0 | actuel, actuel |

## Raisons des juges quand la version courte perd

- kestrel-dedupe-regle-neuf r1 (openai/gpt-6.1-terra) : A donne le nombre d’événements perdus, la cause et le seuil d’alerte, que B omet, malgré quelques détails superflus.
- kestrel-dedupe-regle-neuf r2 (openai/gpt-6.1-terra) : B couvre les faits et actions essentiels, dont le nombre d’événements perdus, tandis que A les omet et rapporte à tort la confirmation des tableaux de bord Zest.
- kestrel-demo-sso-cachee r1 (openai/gpt-6.1-terra) : A précise que la démonstration Fernhill sera de bout en bout sur staging et donne le bon déploiement, malgré beaucoup de détails superflus.
- kestrel-dedupe-regle-neuf r2 (google/gemini-4-hydrogen) : B couvre tous les points essentiels, y compris les faits indispensables manquants dans A (la cause liée à #240 et le chiffre de ~1,18 million d'événements), et évite l'information interdite sur les tableaux de bord de Zest présente dans A.
- kestrel-dedupe-regle-neuf r1 (google/gemini-4-hydrogen) : A inclut tous les éléments essentiels, notamment le chiffre de 1,18 million d'événements perdus attendu par Maya, la cause du bug dans le SDK iOS 3.2.0 et le contenu du correctif #247, alors que B omet ces informations importantes.
- kestrel-entretien-sre r1 (openai/gpt-6.1-terra) : Malgré trop de détails et une répétition, B reprend tous les faits indispensables, tandis que A omet les deux candidats et attribue à tort les deux retraits au salaire.
- kestrel-entretien-sre r2 (openai/gpt-6.1-terra) : A couvre tous les faits essentiels, tandis que B omet notamment le retrait de Yoav et la fourchette salariale, et attribue à tort son départ à la rémunération.
- kestrel-entretien-sre r1 (google/gemini-4-hydrogen) : B inclut tous les faits indispensables avec exactitude (noms et raisons des désistements de Yoav et Elena, fourchette de ₪42–48k, heure d'Israël), alors que A omet ces détails et résume à tort les deux désistements comme liés au salaire.
- kestrel-entretien-sre r2 (google/gemini-4-hydrogen) : A inclut tous les faits essentiels et précis (le retrait de Yoav suite à une contre-offre, la fourchette salariale de ₪42–48k, la présence de Noa dans le panel et l'heure d'Israël), alors que B omet la fourchette, reste imprécis sur le départ de Yoav et ne mentionne pas Noa dans le panel.
- verdier-reponse-revendeur r1 (openai/gpt-6.1-terra) : A reprend tous les faits essentiels, tandis que B omet les 10 %, les quatre tables réservées et la cause du problème, et reporte à tort la réponse à demain.
- verdier-reponse-revendeur r2 (openai/gpt-6.1-terra) : B contient tous les faits importants, notamment la remise de 10 %, la réservation, la menace et la cause du problème de stock, malgré des détails superflus.
- verdier-reponse-revendeur r1 (google/gemini-4-hydrogen) : A contient tous les éléments essentiels, notamment les 10 % sur les 4 tables, la réservation de janvier, la menace de suspension et la cause technique, alors que B omet un point indispensable et plusieurs informations clés.
- verdier-soldes-trois-sessions r1 (openai/gpt-6.1-terra) : A précise la remise de 20 % contestée et l’horaire de 8 h, deux éléments importants absents de B, malgré des détails d’exécution superflus.
- verdier-reponse-revendeur r2 (google/gemini-4-hydrogen) : B couvre tous les points essentiels, y compris le détail indispensable du geste commercial (10 % sur les 4 tables), la réservation sur le réassort de janvier, la menace sur les commandes des soldes et la cause technique de l'incident, alors que A omet ces quatre informations.
- kestrel-tableaux-injection r2 (google/gemini-4-hydrogen) : A couvre tous les points importants, y compris la raison de la disparition de l'export CSV, alors que B omet ce point même s'il évite les détails d'interface superflus présents dans A.
- verdier-soldes-trois-sessions r2 (openai/gpt-6.1-terra) : Malgré des détails d’exécution superflus, B signale le conflit indispensable sur la remise de 20 % et précise l’heure d’application, contrairement à A.
- verdier-synchro-stocks r1 (openai/gpt-6.1-terra) : A précise la cause de l'affichage erroné du stock de la Saône chêne, un fait important absent de B, malgré quelques détails superflus.
- verdier-synchro-stocks r2 (openai/gpt-6.1-terra) : A couvre aussi la cause de l’erreur de stock de la Saône chêne, que B omet, malgré quelques détails superflus.
- verdier-transalp-alternant r1 (openai/gpt-6.1-terra) : A précise que la clé en dur figure aussi dans l’historique git, un fait important omis par B, malgré plusieurs détails superflus.
- verdier-synchro-stocks r1 (google/gemini-4-hydrogen) : La version A inclut l'explication du bug de la Saône (association des SKU sans tenir compte de la finition chêne/noyer), contrairement à la version B qui l'omet.
- verdier-synchro-stocks r2 (google/gemini-4-hydrogen) : La version A couvre tous les points importants, y compris l'explication de l'erreur de stock sur la Saône chêne, alors que la version B omet cette cause.
- verdier-transalp-alternant r2 (openai/gpt-6.1-terra) : Malgré davantage de détails superflus, B précise que la clé figure aussi dans l’historique git et couvre tous les points indispensables.
- del-point-achats-thermaval r1 (openai/gpt-6.1-terra) : Malgré plusieurs détails superflus, B couvre les quatre points importants, notamment la réception Marchand, les deux lots et le refus des pénalités, que A omet.
- del-point-achats-thermaval r2 (openai/gpt-6.1-terra) : B couvre tous les faits indispensables, les deux lots et le refus de pénalité, malgré plusieurs détails superflus ; A omet la réception du 4 décembre et les informations sur les lots et la pénalité.
- del-point-achats-thermaval r1 (google/gemini-4-hydrogen) : B inclut tous les éléments importants, notamment la réception du 4/12 pour Marchand, le détail des deux lots Thermaval et le refus des pénalités de retard, alors que A omet ces trois points.
- del-point-achats-thermaval r2 (google/gemini-4-hydrogen) : B couvre tous les points indispensables et importants, notamment la réception du 4/12 pour Marchand, les deux lots (8 et 6) et le refus de pénalité par Thermaval, que A omet.
- del-point-aides-mpr-injection r1 (openai/gpt-6.1-terra) : Malgré du bruit, B précise les informations attendues par Patrick et leur lien avec l’avance, contrairement à A.
- del-point-aides-mpr-injection r2 (openai/gpt-6.1-terra) : A précise les informations à fournir à Patrick, absentes de B, même s’il contient davantage de détails superflus.
- del-point-planning-sms-regles r1 (openai/gpt-6.1-terra) : A couvre les quatre points importants, notamment l’indisponibilité de la réécriture de Lucas avant le 30/11, que B omet, malgré davantage de détails superflus.
- kra-point-charge-injektion r1 (openai/gpt-6.1-terra) : A inclut les livraisons manquantes et les 180 appareils concernés, deux faits indispensables que B omet, malgré quelques détails superflus.
- del-point-planning-sms-regles r1 (google/gemini-4-hydrogen) : A couvre l'ensemble des points importants, y compris le fait que la réécriture du module rappels par Lucas n'est pas prête avant le 30/11, alors que B omet cette précision.
- del-point-planning-sms-regles r2 (openai/gpt-6.1-terra) : A couvre les quatre points importants, dont l’échéance de la réécriture de Lucas, malgré plusieurs détails superflus.
- del-point-planning-sms-regles r2 (google/gemini-4-hydrogen) : A couvre tous les points importants sans aucune erreur, tandis que B mentionne la PR Dependabot #205 qui ne doit pas y figurer et omet la date du 30/11 pour la réécriture de Lucas.
- kra-point-charge-injektion r1 (google/gemini-4-hydrogen) : A inclut tous les faits indispensables, contrairement à B qui omet de préciser que la liste de lundi est incomplète (livraisons du 12/11 manquantes, dont 180 appareils en Autriche).
- kra-point-charge-injektion r2 (openai/gpt-6.1-terra) : A précise que la liste est incomplète et identifie les livraisons manquantes, un fait indispensable omis par B, malgré quelques détails superflus.
- kra-point-charge-injektion r2 (google/gemini-4-hydrogen) : A inclut tous les éléments indispensables, notamment les livraisons manquantes du 12/11 (180 appareils en Autriche) et l'échec de l'import SAP de nuit, que B omet.
- kra-point-pfeiffer-verhandlung r1 (openai/gpt-6.1-terra) : A précise la décision sur le bonus et le seuil de 3 M€, que B omet, même s’il contient davantage de détails superflus et formule maladroitement le statut du 1er avril.
- kra-point-pfeiffer-verhandlung r2 (openai/gpt-6.1-terra) : B précise le seuil annuel de 3 M€ et l’absence de séparation par revendeur, deux éléments importants omis par A, malgré davantage de détails superflus.
- kra-point-pfeiffer-verhandlung r1 (google/gemini-4-hydrogen) : A inclut tous les points indispensables ainsi que les chiffres clés de la décision de Sabine Kranich (bonus à 2 % et engagement de 3 M€), alors que B reste trop vague sur ces conditions.
- qui-point-relance-prospect-ventes r1 (openai/gpt-6.1-terra) : A précise le risque d’exclusion sans le SIG Lite, un point indispensable omis par B, malgré une notification Gong superflue.
- qui-point-relance-prospect-ventes r2 (openai/gpt-6.1-terra) : A précise le risque d’élimination si le SIG Lite n’est pas remis à temps, contrairement à B, malgré le bruit sur Gong et l’absence de certains besoins de Hearthly.
- qui-point-reserve-banque-finance r1 (openai/gpt-6.1-terra) : A contient les deux faits indispensables ainsi que l’impact sur la trésorerie et les autres décisions à prendre, malgré des détails superflus.
- qui-point-reserve-banque-finance r2 (openai/gpt-6.1-terra) : B reprend tous les faits importants, notamment le montant total de la réserve et l’effet sur la runway, malgré quelques détails superflus.
- qui-point-rotation-cles-regles r1 (openai/gpt-6.1-terra) : A couvre tous les faits importants, notamment le résultat du test en staging et le gel des changements, malgré quelques détails superflus.
- qui-point-reserve-banque-finance r1 (google/gemini-4-hydrogen) : A inclut tous les points importants, notamment l'impact sur le runway (de 19,5 à 18,3 mois, juste au-dessus du seuil de 18 mois), que B omet.
- qui-point-reserve-banque-finance r2 (google/gemini-4-hydrogen) : B couvre tous les points importants, y compris l'impact sur le runway (de 19,5 à 18,3 mois, juste au-dessus du plancher de 18 mois) et les montants clés, alors que A omet l'information sur le runway.
- qui-point-rotation-cles-regles r1 (google/gemini-4-hydrogen) : A couvre tous les points importants (notamment le gel du 1er décembre, le refus des captures d'écran et le résultat du dry run en staging) qui manquent dans B, même si A mentionne à tort la PR Dependabot tokio.
- qui-point-rotation-cles-regles r2 (openai/gpt-6.1-terra) : Malgré plusieurs détails superflus, B couvre tous les faits importants, notamment le résultat du test en staging et le gel des changements, absents de A.
- qui-point-rotation-cles-regles r2 (google/gemini-4-hydrogen) : B couvre tous les points essentiels, y compris le gel du 1er décembre, le rejet des captures d'écran par l'auditeur et le succès du test à blanc après correction, alors qu'A omet ces trois éléments importants.
