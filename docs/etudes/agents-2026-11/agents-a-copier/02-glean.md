# Agents préconstruits de Glean (bibliothèque d'agents) : état des lieux au 22 novembre 2026

Sources lues le 22/11/2026 par curl : docs.glean.com et www.glean.com (pages `agent-library/*`, blogs, 35 cas clients). Rien d'autre n'a été consulté. Aucune requête web ne cite le produit ni ses fondateurs.

## Ce qu'il faut savoir avant le tableau

- La bibliothèque publique compte **33 agents** (https://www.glean.com/ai-agents/agent-library). Chaque agent a sa page `https://www.glean.com/agent-library/<slug>` (officiel). Le slug est donné dans le tableau. La mention « Featured » est sur les 33 pages : ce n'est pas un signal de popularité. Seuls trois sont mis en tête de page : Ghostwriter, Intelligent reminders, Delegation tracker.
- Les modèles sont **livrés tout faits dans la galerie « Créer un agent »** et personnalisables (Dec 2025 : « each one is ready to use as a template »). Le client doit les activer et brancher ses connecteurs. La page docs « Agent templates » (maj 14/10/2026) ne décrit que 8 modèles : Daily action items, Plan my day, Weekly work report et 5 marketing (https://docs.glean.com/agents/templates, officiel). Daily action items, Plan my day et Weekly work report n'ont pas de page sur le site : ils sont dans la doc seulement.
- Départements de la bibliothèque : Engineering 8, Marketing 7, Sales 7, Support 4, IT Operations 2, All teams 5. Le filtre propose aussi « HR », mais **aucun agent RH n'est listé** (non trouvé).
- Façons de réveiller un agent chez Glean (https://docs.glean.com/agents/concepts/triggers, officiel) : message dans le chat, formulaire (l'utilisateur colle une URL ou un nom), horloge (beta), événement dans un outil. Événements « recommandés » : Gong nouvel appel ; Jira ticket créé/modifié ; Salesforce enregistrement créé/modifié ; **Gmail nouvel email** ; **Outlook nouvel email** ; Google Agenda « avant l'événement » ; Slack nouveau message. Expérimentaux (latence de quelques heures à un jour) : Drive, GitHub, OneDrive, SharePoint, ServiceNow, Zendesk, Zoom (enregistrement terminé), Outlook Agenda.
- Exemples que la doc donne comme « utilisés par des clients aujourd'hui » (https://docs.glean.com/agents/concepts/content-trigger, officiel, maj 16/11/2026) : appel Gong transcrit, alors mise à jour de l'opportunité Salesforce et brouillon de mail de suivi ; ticket Jira P0, alors résumé + incidents proches + prochaines étapes ; nouvel email dans une boîte surveillée, alors brouillon de réponse ; avant un rendez-vous client, alors brief CRM/appels/mails/support.
- Agents « indépendants » (beta, doc maj 16/11/2026) : identité propre, mémoire, proactifs, présence dans Slack. Un seul est nommé : **On-call Assist** (escalade technique). Annoncés sans détail au Glean:GO (blog du 26/08/2026) : gestion d'astreinte, synthèse de la voix du client, ventes. Non trouvé : leur fiche.

Légende « chez nous » : R = lecture seule, W = écriture déjà accordée. CRM = HubSpot/Attio (W), Pipedrive/Close/folk (R). Enregistreur = Fathom, Fireflies, tl;dv, Circleback, Claap, Gong, Granola, Leexi (R). Glean lit Salesforce, Zoom, Teams, Meet : nous n'avons ni Salesforce ni Zoom/Meet/Teams, la source de la réunion est donc l'enregistreur. Pas d'écriture Slack, Zendesk, Drive ni autres outils support. Pas de Google Agenda.

## Tableau principal (agents de la bibliothèque, tous officiels)

Colonnes : Agent (slug) | Métier | Réveil | Lit | Produit, où | Chez nous.

### Pour tous les salariés

| Agent (slug) | Métier | Réveil | Lit | Produit, où | Chez nous |
|---|---|---|---|---|---|
| Meeting recap (`meeting-recap`) | Tous | Demande dans le chat : « résume ma dernière réunion avec X » | Agenda, transcription (Meet, Zoom, Teams), docs, experts internes | Résumé : objectif, points, actions avec propriétaire probable, documents utiles ; envoyé « à la destination choisie » | Enregistreur R + Outlook agenda R. Sortie en brouillon Outlook/Gmail W, tâches Linear/Asana/Jira/Notion W. Manque : réunion sans enregistreur |
| Daily meeting action summary (`daily-meeting-action-summary`) | Tous | Horloge (beta), chaque jour | Google Agenda, liens de transcription, un sous-agent par réunion (beta) | Liste d'actions du jour, message privé Slack | Enregistreur R + Outlook agenda R. Sortie : brouillon de mail à soi ou tâches W. Slack W manque |
| Intelligent reminders (`intelligent-reminders`) | Tous | Demande | Chats, mails, docs, notes et transcriptions récentes | Liste d'actions ouvertes triée par urgence, « claires » vs « ambiguës », dans le chat | Gmail, Outlook, Slack, enregistreur : tout en R. Sortie : tâches W |
| Delegation tracker (`delegation-tracker`) | Tous | Demande | Réunions du jour, Slack, Gmail, Outlook | Liste de ce qu'on a demandé sans réponse, dans le chat | Mail R, Slack R, enregistreur R. Sortie : brouillon de relance W |
| Ghostwriter (`ghostwriter`) | Tous | Demande : quoi écrire et dans quelle voix | Échantillons d'écriture (mail, chat, docs), réunions, Confluence, Notion, Jira, CRM | Brouillon dans le chat, à copier | Gmail/Outlook R pour le style, brouillon W direct dans la boîte. Très bon recoupement |
| Daily action items, Plan my day, Weekly work report (docs `agents/templates`) | Tous | Aucune saisie ; Plan my day : à l'ouverture du jour | Toutes les sources du salarié ; Plan my day : agenda Google ou Outlook | Rapport d'actions (« haute confiance » / « ambiguës ») ; brief du jour avec créneaux de concentration à créer en un clic ; bilan de semaine par projet | Mail, Slack, CRM, tâches R ; agenda Outlook R. Pas Google Agenda |

### Ventes

| Agent (slug) | Métier | Réveil | Lit | Produit, où | Chez nous |
|---|---|---|---|---|---|
| Prospect outreach email (`prospect-outreach-email`) | Commerciaux | Formulaire : nom de société (dispo) ; nouveau lead dans le CRM (beta) | Web, contacts, références clients internes, études de cas | Plusieurs variantes, la meilleure en **brouillon de mail** | CRM R, Gmail/Outlook brouillon W. Complet. Manque : recherche web |
| Account snapshot (`account-snapshot`) | Commerciaux, CS | Formulaire : nom du compte | CRM, mails/Slack, tickets support, usage produit, web | Google Doc partageable | CRM R, mail R, support R. Sortie : note dans le CRM W (HubSpot/Attio). Manque : usage produit |
| Account handoff (`account-handoff`) | Commerciaux, CS | Formulaire : nom du nouveau client | CRM, appels Gong, mails, notes | Fiche : état, obstacles, parties prenantes, actions, dans le chat | CRM R/W, enregistreur R, mail R |
| Deal strategy (`deal-strategy`) | Commerciaux | Chat | Docs de bonnes pratiques, CRM, appels, Slack | Fiche de deal et prochaines étapes, dans le chat | CRM R, enregistreur R |
| Deal loss insights (`deal-loss-insights`) | Directeur commercial | **Événement : opportunité passée en « perdue »** dans le CRM | Opportunité, appels, fils de messages du trimestre | Résumé des causes, ligne ajoutée à un tableur | CRM R (HubSpot, Attio, Pipedrive, Close), enregistreur R, Airtable W. Complet |
| Sales call coaching (`sales-call-coaching`) | Managers commerciaux | Formulaire : choisir des appels | Transcriptions Gong | Tableau de critères + notes de coaching, dans le chat | Enregistreur R seul |
| Competitive brief (`competitive-brief`) | Commerciaux | Formulaire : nom du concurrent | Drive, Slack, Gong, CRM, web | Note d'une page, dans le chat | Enregistreur R, CRM R, Drive R, Notion R. Manque : web |

### Support, IT

| Agent (slug) | Métier | Réveil | Lit | Produit, où | Chez nous |
|---|---|---|---|---|---|
| Support ticket next steps (`support-ticket-next-steps`) | Support | Formulaire : URL d'un ticket | Ticket, cas résolus, base de connaissances (Zendesk, ServiceNow) | Résumé + jusqu'à 3 prochaines étapes, dans le chat | Zendesk, Intercom, Front, Freshdesk, Help Scout R. Pas d'écriture dans le ticket |
| Support follow-up email (`support-follow-up-email`) | Support | Formulaire : URL du ticket + consigne | Ticket Zendesk | Réponse proposée ou réécrite (destination non précisée) | Support R, brouillon dans Gmail/Outlook W si le client écrit par mail. Réponse dans l'outil de support : manque |
| Detailed support ticket timeline (`detailed-support-ticket-timeline`) | Escalade | Formulaire : URL du ticket | Ticket, autres tickets du client, Slack, liens internes | Chronologie à copier dans l'outil support | Support R, Slack R. Collage manuel |
| Customer sentiment score (`customer-sentiment-score`) | Responsable support | Formulaire : compte | CRM, tickets, Slack | Sentiment + niveau de chaleur, dans le chat | CRM R, support R, Slack R |
| IT help desk (`it-help-desk`) | Tous (côté IT) | Message dans le chat | Tickets ouverts, documentation | Réponse ; propose de commenter ou créer un ticket Jira avec accord | Jira W. Les autres outils de tickets : R |
| Support documentation from ticket (`support-documentation-from-ticket`) | Support/IT | Formulaire : URL du ticket | Base de connaissances, ticket | Article rédigé, enregistré dans Google Drive | Notion/Confluence/Drive. Écriture Notion W, Drive manque |

### Ingénierie

| Agent (slug) | Métier | Réveil | Lit | Produit, où | Chez nous |
|---|---|---|---|---|---|
| Pull request review (`pull-request-review`) | Dév | Formulaire : lien de PR | Diff GitHub, guides de style, docs | **Commentaires et description réécrite postés dans la PR** | GitHub W. GitLab W. Complet |
| Resolve GitHub PR feedback (`resolve-github-pr-feedback`) | Dév | Formulaire : URL(s) de PR | Fils non résolus | Correctif (code writer) + réponses prêtes à coller | GitHub W |
| Resolve Jira ticket (`resolve-jira-tickets`) | Dév | Formulaire : ticket Jira | Ticket, dépôt | **Pull request** + résumé | Jira/Linear R, GitHub/GitLab W. Manque : l'écriture de code |
| Spec to implementation PR (`spec-to-implementation-pr`) | Dév | Formulaire : doc de conception | Spec, dépôt GitHub | Pull request | idem |
| Engineering standup (`engineering-standup`) | Dév | Prévu : veille ouvrée ; sinon demande | Jira, GitHub, Slack, docs, OKR | Message prêt pour Slack (3 points hier, 3 aujourd'hui) | Linear/Jira R, GitHub R. Slack W manque |
| Launch documentation (`launch-documentation`) | PM, dév | Formulaire : dates ou composant Jira | Tickets Jira terminés | Notes de version, **PR GitHub** | Jira/Linear R, GitHub W |
| Engineering project onboarding (`engineering-project-onboarding`) | Dév | Formulaire : nom de projet | Docs, tickets, messages, code | Fiche d'intégration, dans le chat | Tout en R |
| Engineering self-evaluation (`engineering-self-evaluation`) | Dév, managers | Formulaire : dates de période | Évaluations passées, Jira, Slack, PR | Google Doc d'auto-évaluation | Tout en R. Doc : Notion W |

### Marketing

| Agent (slug) | Métier | Réveil | Lit | Produit, où | Chez nous |
|---|---|---|---|---|---|
| Customer testimonials from calls (`customer-testimonials-from-calls`) | Marketing client | Demande | Appels Gong des 3 derniers mois, CRM | Tableau de citations (client, responsable de compte, lien) | Enregistreur R + CRM R |
| Customer reference summary (`customer-reference-summary`) | Marketing client | Formulaire : nom du client | Mail, Slack, présentations, appels, demandes de fonction | Fiche de référence | Mail, enregistreur, Jira R |
| SEO keyword research from sales calls (`seo-keyword-research-from-sales-calls`) | SEO | Formulaire : secteur | Appels Gong, recherche web | Google Doc | Enregistreur R. Manque : web |
| SEO article evaluation (`seo-article-evaluation`) | SEO | Formulaire : URL d'article | L'article (web) | Tableau vrai/faux sur 21 critères | Manque : lecture web |
| Persona-based event messaging (`persona-based-event-messaging`) | Événementiel | Formulaire : persona + événement | Docs de positionnement, références clients | Fiche d'événement | Notion/Confluence/Drive R |
| Marketing event description (`marketing-event-description`) | Événementiel | Formulaire : brief | Brief | Trois variantes, une version finale | Notion/Drive R. Sans lien avec nos outils |
| LinkedIn post draft (`linkedin-post-draft`) | Tous | Chat : sujet + URL | URL | Brouillon + lien de publication LinkedIn avec UTM | Non pertinent (pas de lecture web, pas de LinkedIn) |

### Agent indépendant nommé

| Agent | Métier | Réveil | Lit | Produit, où | Chez nous |
|---|---|---|---|---|---|
| On-call Assist (https://docs.glean.com/agents/independent-agents, officiel, beta) | Astreinte technique | Message dans un canal Slack d'escalade | Runbooks, propriétaires, incidents, logs | Statut dans le canal, mise à jour des tickets, escalade à un humain ; livré par Glean (usage interne cité, 30/06/2026) | Sentry R, Jira/Linear W, GitHub W. Manque : Slack W, présence dans le canal |

## Preuves d'usage

Marketing de l'éditeur (mis en avant, sans chiffre d'usage) : les 33 fiches de la bibliothèque, les « drops » (8 agents commerciaux le 12/2025, 7 marketing le 01/2026, 8 ingénierie le 02/2026), les 85 actions ajoutées (02/2026). Pour la bibliothèque, **aucun chiffre d'usage par modèle n'est publié**. La doc dit seulement que la colonne « usage » est affichée chez le client.

Usage réel cité par des clients (cas clients officiels, https://www.glean.com/resources/customer-stories/<nom>, non datés sur la page ; chiffres déclarés par l'éditeur et le client) :
- **Auto-évaluation / retour entre pairs** : Zillow, environ 10 000 exécutions au premier cycle, +7 % de participation ; Motive (RH), 1 100 exécutions, 60 à 90 min gagnées par exécution ; LegalZoom, devenu « l'agent le plus utilisé » ; SafetyCulture, 30 à 40 min par évaluation ; Harvey, plus de 50 % du temps de préparation. Cela correspond à Engineering self-evaluation et Weekly work report.
- **Agent de récap quotidien Gmail + Slack** (cousin de Daily action items / Plan my day) : Storable, « l'un des plus exécutés de l'entreprise » (storable).
- **Préparation avant client** : Storable (Gong + CRM + mails), 90 % de temps de préparation en moins ; Zapier (usage produit + Slack client + notes), utilisé aussi par dirigeants et marketing ; Motive (plan de compte stratégique), 3 jours réduits à 2 heures.
- **Mail de prospection** : Mediafly (brouillon personnalisé selon un modèle) ; Motive (agent d'e-mails de vente, environ 60 min par exécution).
- **Mise à jour du CRM** : Mediafly (contacts, nombre de commerciaux estimé, écrits dans Salesforce) ; Storable (écriture gouvernée dans Salesforce).
- **Questions-réponses en canal Slack** (pas un modèle de la bibliothèque) : Harvey, environ 100 questions résolues et 120 triées par mois ; McCarthy, l'agent le plus utilisé, plus de 40 000 exécutions en 2 mois (respect des règles internes) ; Zillow, Huntress, LegalZoom (milliers d'exécutions) ; Zapier, ZapIT répond à 98 % des tickets IT.
- **Support** : Mediafly (croise un ticket entrant avec Glean, repère les articles à mettre à jour) ; Harvey (propose des réponses à partir des tickets passés).
- **Volumes d'agents créés** (indicateur de construction, pas d'usage) : Zillow plus de 3 400, Ericsson près de 3 000, Motive plus de 2 000, DNI 84 dont environ 30 en usage quotidien.

## Les dix à copier en premier

1. **Compte rendu et actions de fin de réunion** (Meeting recap + Daily meeting action summary). Raison : c'est le cas que les fondateurs citent, et nos huit enregistreurs remplacent les transcriptions Zoom/Meet/Teams que Glean lit. Preuve : aucun chiffre propre ; deux fiches officielles et l'usage proche de Storable (récap quotidien). Sortie chez nous : brouillon de mail W et tâches Linear/Asana/Jira/Notion W.
2. **Mise à jour du CRM et brouillon de suivi après un appel** (exemple de la doc « content trigger », pas un modèle nommé). Raison : le réveil par événement est le plus proche de « sans qu'on le demande », et l'écriture HubSpot/Attio est accordée. Preuve : cité par la doc comme usage client ; Mediafly et Storable écrivent dans le CRM.
3. **Relances et à-faire ouverts** (Intelligent reminders + Delegation tracker + Daily action items). Raison : mis en tête de la bibliothèque, fonctionne sur mail, Slack et réunions, sans configuration. Preuve : mise en avant par l'éditeur ; l'agent de récap quotidien de Storable est l'un des plus exécutés.
4. **Brouillon de mail de prospection** (Prospect outreach email). Raison : sortie directe en brouillon dans la boîte, c'est notre droit d'écriture. Preuve : Mediafly, Motive (environ 60 min par exécution).
5. **Brief avant rendez-vous client** (Account snapshot). Raison : CRM, mails, support et appels sont déjà relevés. Preuve : Storable 90 %, Zapier, Motive ; chiffres déclarés par les clients.
6. **Auto-évaluation et bilan de période** (Engineering self-evaluation, Weekly work report, élargi à tous les métiers). Raison : meilleure preuve d'usage chiffrée de toute la recherche. Limite : usage saisonnier, utile surtout à 50 salariés et plus.
7. **Brief du jour** (Plan my day). Raison : le premier agent qu'on ouvre le matin ; lit agenda, mail et tâches. Limite : sans Google Agenda ; Outlook Agenda seulement. Preuve : l'agent quotidien de Storable.
8. **Ghostwriter**. Raison : mis en avant en premier par l'éditeur ; chez nous la lecture des mails envoyés donne le style et le brouillon part dans la boîte. Preuve : marketing seul, aucun chiffre trouvé.
9. **Ticket support : prochaines étapes et réponse proposée** (Support ticket next steps + Support follow-up email). Raison : métier fréquent à 20-200 salariés ; huit outils de support relevés. Limite : on ne peut pas écrire dans l'outil de support. Preuve : Mediafly, Harvey.
10. **Questions-réponses sur les documents internes, dans un canal** (IT help desk + « Ask agents » des clients). Raison : l'usage le plus massif trouvé. Limite : demande l'écriture Slack, que nous n'avons pas. Preuve : McCarthy 40 000 exécutions, Harvey, Zapier 98 % des tickets IT.

Viennent ensuite : Deal loss insights (réveil par événement CRM, ligne dans Airtable), Engineering standup, Pull request review (écriture GitHub/GitLab déjà accordée).

## Ce que je n'ai pas trouvé

- Aucun agent RH dans la bibliothèque, malgré le filtre « HR ». Les agents RH cités (auto-évaluation, questions-réponses RH, intégration) sont construits par les clients (Zillow, Motive, LegalZoom, McCarthy).
- Aucun chiffre d'usage par modèle de la bibliothèque (nombre d'exécutions, classement). Pas de date de publication sur les cas clients.
- Le détail des agents indépendants annoncés (astreinte, voix du client, ventes) : pas de fiche.
- Plan, prompt et sorties exactes : les fiches donnent les étapes, pas les prompts. Destination de sortie non précisée pour Meeting recap et Support follow-up email.
- Les pages « Daily action items », « Plan my day » et « Weekly work report » existent dans la doc mais pas dans la bibliothèque du site ; leur présence en galerie dépend du déploiement.
- Autres sources (avis d'utilisateurs, classements, forums) : sites non joignables, non lus.
