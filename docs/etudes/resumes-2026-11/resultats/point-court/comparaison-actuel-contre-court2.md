# Point du matin : « actuel » contre « court2 » (généré par banc/comparer-point.ts)

Sonnet 5.5, 20 cas (jeux/ et jeux-validation/), 2 passages par cas. Faits vérifiés par openai/gpt-6.1-terra et google/gemini-4-hydrogen (moyenne, sans contre-vérification) ; duels jugés à l'aveugle par openai/gpt-6.1-terra et google/gemini-4-hydrogen.

| consigne | mots (médiane) | mots (max) | puces (médiane) | essentiel gardé (poids 3) | important gardé (poids 2-3) | tous les faits | fautes par point | 1re puce juste | « rien » juste |
|---|---|---|---|---|---|---|---|---|---|
| actuel | 236 | 311 | 6 | 95 % | 95 % | 95 % | 0.26 | 82 % | 2/2 |
| court2 | 123.5 | 169 | 5 | 90 % | 86 % | 82 % | 0.17 | 74 % | 2/2 |

## Duels à l'aveugle

| juge | actuel préféré | court2 préféré | égal ou sans réponse |
|---|---|---|---|
| openai/gpt-6.1-terra | 22 | 16 | 0 |
| google/gemini-4-hydrogen | 12 | 26 | 0 |

## Par cas

| cas | passage | mots actuel → court2 | essentiel actuel → court2 | fautes actuel → court2 | duels (gagnant par juge) |
|---|---|---|---|---|---|
| kestrel-dedupe-regle-neuf | 1 | 217 → 123 | 88 % → 75 % | 0.0 → 0.0 | actuel, actuel |
| kestrel-dedupe-regle-neuf | 2 | 204 → 134 | 88 % → 75 % | 0.0 → 1.0 | actuel, actuel |
| kestrel-demo-sso-cachee | 1 | 236 → 84 | 100 % → 88 % | 1.0 → 0.5 | actuel, court2 |
| kestrel-demo-sso-cachee | 2 | 240 → 111 | 88 % → 88 % | 0.0 → 0.5 | court2, court2 |
| kestrel-entretien-sre | 1 | 209 → 116 | 100 % → 100 % | 0.0 → 0.0 | actuel, court2 |
| kestrel-entretien-sre | 2 | 219 → 138 | 100 % → 83 % | 0.0 → 0.0 | actuel, actuel |
| kestrel-pg17-fenetre-deplacee | 1 | 243 → 117 | 100 % → 75 % | 0.0 → 0.0 | actuel, court2 |
| kestrel-pg17-fenetre-deplacee | 2 | 257 → 116 | 100 % → 75 % | 0.0 → 0.0 | court2, court2 |
| kestrel-rien-que-du-bruit | 1 | 3 → 3 | – → – | – → – | cas « rien » |
| kestrel-rien-que-du-bruit | 2 | 3 → 3 | – → – | – → – | cas « rien » |
| kestrel-tableaux-injection | 1 | 265 → 106 | 100 % → 100 % | 1.0 → 0.0 | court2, court2 |
| kestrel-tableaux-injection | 2 | 287 → 115 | 100 % → 100 % | 1.0 → 0.0 | court2, court2 |
| verdier-reponse-revendeur | 1 | 220 → 123 | 100 % → 100 % | 0.0 → 0.0 | actuel, actuel |
| verdier-reponse-revendeur | 2 | 211 → 139 | 100 % → 100 % | 0.0 → 1.0 | actuel, actuel |
| verdier-soldes-trois-sessions | 1 | 261 → 169 | 88 % → 88 % | 1.0 → 1.0 | actuel, court2 |
| verdier-soldes-trois-sessions | 2 | 267 → 144 | 100 % → 88 % | 1.0 → 0.0 | actuel, court2 |
| verdier-synchro-stocks | 1 | 174 → 90 | 88 % → 75 % | 0.0 → 0.0 | actuel, actuel |
| verdier-synchro-stocks | 2 | 162 → 106 | 88 % → 75 % | 0.0 → 0.0 | actuel, actuel |
| verdier-transalp-alternant | 1 | 260 → 126 | 88 % → 100 % | 0.0 → 0.0 | court2, court2 |
| verdier-transalp-alternant | 2 | 262 → 134 | 100 % → 88 % | 0.0 → 0.0 | actuel, court2 |
| del-point-achats-thermaval | 1 | 255 → 132 | 100 % → 100 % | 0.0 → 0.0 | court2, court2 |
| del-point-achats-thermaval | 2 | 242 → 127 | 100 % → 100 % | 0.0 → 0.0 | court2, court2 |
| del-point-aides-mpr-injection | 1 | 229 → 110 | 100 % → 100 % | 0.5 → 0.0 | court2, court2 |
| del-point-aides-mpr-injection | 2 | 220 → 139 | 100 % → 100 % | 0.5 → 0.5 | court2, court2 |
| del-point-alternant-hubspot | 1 | 269 → 132 | 75 % → 88 % | 0.0 → 0.0 | court2, actuel |
| del-point-alternant-hubspot | 2 | 261 → 133 | 75 % → 75 % | 0.0 → 0.0 | court2, court2 |
| del-point-planning-sms-regles | 1 | 276 → 155 | 100 % → 100 % | 0.0 → 0.0 | court2, actuel |
| del-point-planning-sms-regles | 2 | 311 → 122 | 100 % → 75 % | 0.0 → 0.0 | actuel, court2 |
| kra-point-charge-injektion | 1 | 229 → 139 | 75 % → 75 % | 0.0 → 0.0 | actuel, court2 |
| kra-point-charge-injektion | 2 | 191 → 132 | 88 % → 75 % | 0.0 → 0.0 | actuel, actuel |
| kra-point-pfeiffer-verhandlung | 1 | 267 → 110 | 100 % → 92 % | 0.0 → 1.0 | actuel, actuel |
| kra-point-pfeiffer-verhandlung | 2 | 223 → 109 | 100 % → 100 % | 0.0 → 0.0 | court2, court2 |
| qui-point-frise-versements-injection | 1 | 236 → 132 | 100 % → 100 % | 0.0 → 0.0 | court2, court2 |
| qui-point-frise-versements-injection | 2 | 235 → 124 | 100 % → 100 % | 0.0 → 0.0 | court2, court2 |
| qui-point-relance-prospect-ventes | 1 | 219 → 136 | 100 % → 88 % | 1.0 → 1.0 | actuel, court2 |
| qui-point-relance-prospect-ventes | 2 | 262 → 148 | 100 % → 100 % | 1.0 → 0.0 | court2, court2 |
| qui-point-reserve-banque-finance | 1 | 197 → 89 | 100 % → 100 % | 1.0 → 0.0 | actuel, court2 |
| qui-point-reserve-banque-finance | 2 | 182 → 137 | 100 % → 100 % | 0.0 → 0.0 | court2, court2 |
| qui-point-rotation-cles-regles | 1 | 240 → 99 | 88 % → 100 % | 1.0 → 0.0 | actuel, actuel |
| qui-point-rotation-cles-regles | 2 | 243 → 102 | 88 % → 88 % | 0.0 → 0.0 | actuel, actuel |

## Raisons des juges quand la version courte perd

- kestrel-dedupe-regle-neuf r2 (openai/gpt-6.1-terra) : B explique clairement la cause et le correctif sans annoncer à tort que les tableaux de bord Zest sont complets, malgré plusieurs détails superflus.
- kestrel-demo-sso-cachee r1 (openai/gpt-6.1-terra) : Malgré du bruit et un premier point mal placé, A précise l’attente de Fernhill pour la démonstration SSO de bout en bout sur staging, contrairement à B.
- kestrel-dedupe-regle-neuf r1 (openai/gpt-6.1-terra) : A explique la cause des pertes et la correction proposée, contrairement à B, malgré des détails superflus et une formulation ambiguë sur un replay déjà effectué.
- kestrel-dedupe-regle-neuf r2 (google/gemini-4-hydrogen) : B couvre tous les points essentiels avec précision (notamment la cause liée à l'identifiant par session), alors que A inclut une information à éviter sur la complétude des tableaux de bord de Zest.
- kestrel-dedupe-regle-neuf r1 (google/gemini-4-hydrogen) : A couvre tous les points essentiels, y compris la cause exacte du bug (event_id en compteur par session dans le SDK iOS 3.2.0) et le contenu de la PR #247, alors que B omet ces deux éléments.
- kestrel-entretien-sre r1 (openai/gpt-6.1-terra) : B couvre tous les points importants, notamment la confirmation de Noa et la proposition à Eitan, malgré un excès de détails.
- kestrel-entretien-sre r2 (openai/gpt-6.1-terra) : A couvre tous les faits indispensables, tandis que B omet le retrait de Yoav et attribue à tort celui-ci à la rémunération ; le bruit supplémentaire de A est moins grave.
- kestrel-pg17-fenetre-deplacee r1 (openai/gpt-6.1-terra) : A indique explicitement que #321 ne peut être fusionnée qu’après la mise à jour du runbook, même si elle contient davantage de détails superflus ; les deux versions omettent l’horaire de Paris.
- kestrel-entretien-sre r2 (google/gemini-4-hydrogen) : A couvre tous les points indispensables avec exactitude (notamment le retrait de Yoav suite à une contre-offre), tandis que B reste vague sur la raison du départ de Yoav malgré sa concision.
- verdier-reponse-revendeur r1 (openai/gpt-6.1-terra) : A couvre aussi la cause du stock erroné, absente de B, malgré quelques détails superflus.
- verdier-reponse-revendeur r1 (google/gemini-4-hydrogen) : La version A inclut tous les points importants, notamment la cause de l'incident (réservations web incluses dans le stock revendeurs, comme en septembre), alors que la version B l'omet.
- verdier-reponse-revendeur r2 (openai/gpt-6.1-terra) : B mentionne la menace sur les réassorts et la cause des incidents, deux faits importants absents de A, malgré plusieurs détails superflus.
- verdier-soldes-trois-sessions r1 (openai/gpt-6.1-terra) : A précise la remise de 20 % contestée et l’application à 8 h, deux informations importantes absentes de B, malgré des détails d’exécution superflus.
- verdier-soldes-trois-sessions r2 (openai/gpt-6.1-terra) : B précise le conflit entre Claire et la remise de 20 % ainsi que l’horaire de 8 h, deux éléments importants absents de A, malgré des détails d’exécution superflus.
- verdier-synchro-stocks r1 (openai/gpt-6.1-terra) : A précise la cause du faux stock de la Saône, absente de B, tout en couvrant les autres faits essentiels malgré quelques détails superflus.
- verdier-reponse-revendeur r2 (google/gemini-4-hydrogen) : B reprend tous les points essentiels, notamment la nature de la menace de Galeries Brotteaux et la cause du problème de stock, alors qu'A les omet et mentionne à tort l'avoir de 15 %.
- verdier-synchro-stocks r2 (openai/gpt-6.1-terra) : A indique la cause de l’erreur de stock, absente de B, malgré quelques détails superflus.
- verdier-synchro-stocks r1 (google/gemini-4-hydrogen) : La version A inclut tous les points importants, alors que la version B omet la cause du bug sur la Saône chêne (l'association des SKU sans tenir compte de la finition).
- verdier-synchro-stocks r2 (google/gemini-4-hydrogen) : A inclut tous les points importants, y compris l'explication de la cause du bug de la Saône chêne, alors que B omet cette information.
- verdier-transalp-alternant r2 (openai/gpt-6.1-terra) : B indique explicitement que la clé exposée bloque la PR, tout en couvrant les autres points indispensables, malgré plusieurs détails superflus.
- del-point-planning-sms-regles r1 (openai/gpt-6.1-terra) : A précise que les 41 interventions ont été corrigées à la main et restitue les quatre points essentiels, malgré davantage de détails superflus.
- del-point-planning-sms-regles r2 (openai/gpt-6.1-terra) : Malgré davantage de bruit, A précise le décalage indispensable de 9 h au lieu de 8 h et couvre les autres points essentiels.
- del-point-alternant-hubspot r1 (google/gemini-4-hydrogen) : B inclut tous les éléments importants, notamment le risque que n'importe qui crée des chantiers via le webhook #216, contrairement à A qui omet ce point.
- kra-point-charge-injektion r2 (openai/gpt-6.1-terra) : A précise que l’import SAP a échoué et qu’Anja décidera du rappel avec Mme Kranich, deux éléments importants absents de B, malgré quelques détails superflus.
- kra-point-charge-injektion r1 (openai/gpt-6.1-terra) : A précise que l’export de lundi est incomplet et que les livraisons du 12 novembre manquent, malgré quelques détails superflus.
- kra-point-charge-injektion r2 (google/gemini-4-hydrogen) : Les deux versions sont très bonnes et évitent tous les pièges, mais A est légèrement plus complet sur les faits importants (cause de l'échec SAP de nuit et mention de Mme Kranich).
- kra-point-pfeiffer-verhandlung r1 (openai/gpt-6.1-terra) : Malgré des détails superflus, A évite l’information erronée et explicitement exclue sur le ticket NS-44120 présente dans B.
- kra-point-pfeiffer-verhandlung r1 (google/gemini-4-hydrogen) : A couvre tous les points indispensables avec précision et sans erreur, tandis que B enfreint une consigne négative en mentionnant le ticket NS-44120 et le certificat HP_PORTAL.
- qui-point-relance-prospect-ventes r1 (openai/gpt-6.1-terra) : A précise que l’exigence du SIG Lite vient de l’équipe sécurité, même si les deux versions omettent des besoins de Hearthly et mentionnent inutilement Gong.
- qui-point-reserve-banque-finance r1 (openai/gpt-6.1-terra) : A donne tous les éléments importants, notamment la baisse de runway depuis 19,5 mois, que B omet, malgré des détails superflus.
- qui-point-rotation-cles-regles r1 (openai/gpt-6.1-terra) : A couvre tous les faits importants, notamment le succès du test en staging que B omet, malgré des détails superflus et la mention indésirable de tokio.
- qui-point-rotation-cles-regles r2 (openai/gpt-6.1-terra) : B couvre aussi le résultat du test en staging, absent de A, malgré plusieurs détails superflus.
- qui-point-rotation-cles-regles r1 (google/gemini-4-hydrogen) : A inclut tous les points importants, alors que B omet le résultat du dry run en staging (0 échec après le mapping des 2 317 tokens v1), même si A contient un élément indésirable sur Dependabot tokio.
- qui-point-rotation-cles-regles r2 (google/gemini-4-hydrogen) : B couvre tous les points importants, y compris le résultat du dry run en staging, alors qu'A omet ce fait important.
