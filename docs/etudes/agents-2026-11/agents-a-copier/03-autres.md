# Agents livrés par les autres éditeurs (hors Dust et Glean)

État des lieux au 22 novembre 2026, par recherche web uniquement (WebSearch, aucune page éditeur lue en entier). Les dates viennent des résultats ; beaucoup de sources tierces sont mal datées, signalé quand c'est le cas. Preuves d'usage : presque toutes déclarées par l'éditeur. « Non trouvé » = je n'ai rien trouvé.

Légende. Réveil : D = demande, H = horloge, E = événement dans un outil. Statut : L = livré tout fait, M = modèle à adapter, C = à construire par le client. Source : off = éditeur, tiers = blog ou presse. Chez nous : L = lecture, É = écriture ; entre parenthèses ce qui manque.

## Tableau principal

| Agent (éditeur) | Pour qui | Réveil | Lit | Produit, où | Statut | Source (nature) | Chez nous |
|---|---|---|---|---|---|---|---|
| Brouillons de réponse (Fyxer) | tout salarié, dirigeant | E : mail entrant jugé à réponse | boîte, mails passés (ton), agenda | brouillon dans Gmail/Outlook, jamais envoyé ; effacé après 14 jours par défaut | L | support.fyxer.com ; gmelius.com/blog/fyxer-ai-review (off + tiers) | Gmail É, Outlook É (brouillons) ; manque : étiquettes/dossiers de tri, apprentissage du ton |
| Tri de la boîte (Fyxer) | tout salarié | E : mail entrant | boîte | étiquettes/dossiers dans la boîte | L | idem (off + tiers) | Gmail É (libellés) ; Outlook : écriture de catégories non accordée |
| Notes de réunion + brouillon de suivi (Fyxer) | tout salarié | E : réunion Zoom/Teams/Meet (robot invité) | audio, agenda | résumé et actions par mail ; brouillon de suivi | L | idem (off + tiers) | L des 8 enregistreurs ; manque : brouillon de suivi (Gmail/Outlook É ok) |
| Brouillons de planification et liens de rendez-vous (Fyxer) | tout salarié | E : mail demandant un créneau | agenda, règles de disponibilité | brouillon proposant des horaires ou lien de réservation | L | support.fyxer.com/article/scheduling-with-fyxer-drafts-vs-scheduling-links (off) | Agenda L/É ; Google Agenda non relevé ; manque : calcul de disponibilité |
| Auto Drafts + Auto Reminders (Superhuman Go) | commerciaux, dirigeants (Business/Enterprise) | E : mail sans réponse ; H : rappel | boîte, Slack, notes de réunion, documents | brouillon de relance préparé environ 1 h avant le rappel, dans la boîte | L | help.superhuman.com (off) ; blog.superhuman.com 19/11/2026 (off) ; techcrunch.com 14/07/2026 (tiers) | Gmail/Outlook É brouillon ; Slack L ; manque : détection « sans réponse » à écrire |
| Assistant personnel Go (Superhuman) | tout salarié | D + proactif | outils connectés | liste de priorités, prochaines étapes, préparation de réunion de dernière minute | L (annoncé 19/11/2026) | blog.superhuman.com ; siliconangle.com 19/11/2026 | Tout L ; manque : file de priorités |
| Assistant IA (Shortwave) | tout salarié | D | boîte, agenda | recherche, agenda, tâches | L | blog.superhuman.com/shortwave-email (concurrent, partial) | non étudié en détail |
| Notes de réunion Zoom, Quick Recap, Next steps (Zoom AI Companion, rebaptisé Zoom AI, ZoomMate payant pour certains usages) | tout salarié | E : fin de réunion Zoom | audio, transcription | e-mail de résumé (Quick Recap, Summary, Next Steps), tâches Zoom | L | news.zoom.com/zoom-launches-ai-companion-3-0 (off) ; scribbl.co (tiers) | Zoom non relevé ; passer par les 8 enregistreurs |
| Modèle « Post Meeting Follow Up » (Zoom AI Companion 3.0) | organisateur de réunion | E : fin de réunion | notes, tâches | tâches de suivi + brouillon de mail | M | news.zoom.com (off, lancement vieux d'un an) | brouillon Gmail/Outlook É ; tâches Asana/Linear/Jira É |
| Intelligent Recap (Teams, Copilot) | participants | E : fin de réunion Teams | transcription | chapitres, notes, actions dans la réunion | L (Teams Premium ou licence Copilot) | tiers (spguides.com, uctoday.com) | Teams non relevé |
| Facilitator (Teams, Copilot) | organisateur | E : pendant la réunion | ordre du jour, échanges | notes Loop partagées, tâches, minuteur ; mi-2026 : propose une recherche web | L (licence Copilot) | tiers (whysogeek.com) | non relevé ; usage pendant la réunion hors périmètre |
| Préparation de réunion Copilot dans Outlook (classique, Windows) | tout salarié | D : sélection d'une réunion | fichiers, mails, contexte | synthèse avant la réunion | L (note de version 11/08/2026) | learn.microsoft.com release-notes (off) | Outlook agenda L/É, Drive/Notion L ; manque : sélection par contexte |
| Agent Sales (Copilot) : préparation et suivi de rendez-vous | commerciaux | D ou ouverture de l'agent | CRM (Dynamics 365/Salesforce), mails, agenda | cartes : réunions externes des 4 jours, 3 points clés chacune | L (licence Copilot) | learn.microsoft.com/microsoft-sales-copilot/meeting-prep-sales-chat (off) | HubSpot/Attio L ; manque : agenda externe croisé CRM |
| Notes « Take notes for me » (Gemini dans Meet) | tout salarié (Business Standard+) | E : début de réunion Meet (manuel ou auto) | audio | Google Doc Summary / Decisions / Next steps, rattaché à l'événement | L | blog.google/.../take-notes-for-me (off) ; tldv.io (tiers) | Meet/Agenda non relevés ; Drive L |
| Modèles Workspace Studio : résumé quotidien des mails, étiquette « action », briefs avant réunion dans le chat | tout salarié | H, E | Gmail, Agenda, Gems | message de chat, libellé, résumé | M | support.google.com/workspace-studio/answer/16444479 (off) | Gmail É (libellé), Slack L ; manque : brief envoyé en chat |
| Notes + résumé de réunion (Fathom) | commerciaux | E : fin de réunion | audio | résumé dans le CRM (HubSpot, activité sur contact), brouillon de mail de suivi | L | fathom.ai/integrations-crm (off) | HubSpot É, Attio É ; chez nous les 8 enregistreurs sont lus |
| Autofill CRM + e-mail de suivi (Fireflies) | commerciaux | E : fin de réunion | transcription | champs CRM proposés à valider ; brouillon de mail | L (Business/Enterprise) | tiers (weflow.ai/blog/fathom-vs-fireflies) | HubSpot É ; Pipedrive non écrit : manque |
| Notes améliorées + synchro CRM (Granola) | commerciaux, CS | D : « Enhance notes », puis validation | notes | note dans HubSpot, Attio, Affinity (Business) | L | granola.ai/blog (off) | HubSpot/Attio É |
| Agent Client Breeze (HubSpot) | support | E : conversation entrante | base de connaissances, CRM | réponse au client ; prix 0,50 $ par conversation résolue (14/04/2026) | L | constellationr.com (tiers) | HubSpot L/É ; manque : canal de chat |
| Agent Prospection Breeze (HubSpot) | commerciaux | E : signaux d'achat | CRM, contacts existants | prospects recommandés, brouillons de relance à approuver ; 1 $ par prospect | L | idem (tiers) | HubSpot L/É ; manque : signaux |
| Fin (Intercom) | support | E : conversation | base de connaissances | réponse automatique ; 0,99 $ par résolution | L | tiers (pluno.ai) | Intercom L ; manque : réponse client |
| Agent personnalisé Notion : déclencheur « Note de réunion résumée » | tout salarié | E : note de réunion IA terminée (juillet 2026) | note, bases Notion | mises à jour d'un suivi, récap Slack/mail, tickets | C (Business/Enterprise) | notion.com/releases/2026-07-31 (off) | Notion É, Slack L ; manque : envoi Slack |
| Modèle « Meeting Prep Alert » (Lindy) | commerciaux | H : avant l'événement | agenda, mails, CRM | briefing par mail ou SMS | M | lindy.ai/templates/meeting-prep-alert (off) | Agenda L, HubSpot L ; manque : SMS |
| Routine « brouillon de mails » et « Meeting Recorder » (Lindy) | dirigeants | E | boîte, réunion | brouillons dans la boîte ; notes | M | docs.lindy.ai/teammate/routines (off) | Gmail É |
| Pre-meeting Prepper, Meeting Scheduler, Inbound Qualifier (Relevance AI) | commerciaux | E | CRM, web | brief avant appel ; réunion planifiée | M | relevanceai.com/agents (off) | HubSpot L ; manque : web |
| Agents Zapier : Call Follow-Up Assistant | commerciaux | E : fin d'appel | notes | actions dans le CRM, mails de suivi | M | tiers (mindstudio.ai) ; liste officielle sans cet agent | HubSpot É |
| Agents d'espace de travail ChatGPT (modèles ventes, finance, marketing) | équipes (Business/Enterprise) | H ; E : nouveau Gmail, message Slack, PR GitHub (août 2026) | connecteurs | brouillon, message Slack, document | M/C | openai.com/index/introducing-workspace-agents-in-chatgpt (off) ; developers.openai.com cookbook « sales meeting prep » | tout L/É déjà accordé ; modèle à copier |
| Cowork : tâches planifiées et plugin petite entreprise (Claude) | dirigeants, petites équipes | H : horaire, quotidien, hebdo | Gmail, Agenda, Drive | brief du lundi, relance factures, préparation de réunion | M | useflori.com, aiagentslibrary.com (tiers) ; officiel non lu | Gmail L, Drive L |

## Preuves d'usage (par produit)

- Fyxer : de 1 M$ à environ 30-35 M$ de revenu récurrent en 2025 (sacra.com, estimation) ; l'éditeur annonce 25 000 entreprises, 41 millions de brouillons, 1,4 milliard de mails traités en 2025. 53 % des brouillons acceptés tels quels, rapporté sans source primaire. Tout déclaré, non audité.
- Superhuman : Go dépasse 1 million d'utilisateurs mensuels, +20 % par mois (19/11/2026, déclaré). Auto Drafts : 9 minutes économisées par brouillon (déclaré) ; en bêta de juillet : 40 % des brouillons envoyés sous un jour, dont 60 % sans retouche (Vohra, relayé par tiers).
- HubSpot : agent Client activé par plus de 8 000 clients, résolution autour de 65 % ; agent Prospection activé par plus de 10 000 clients (appel de résultats, avril 2026, déclaré).
- Intercom Fin : 76 % de résolution moyenne sur 12 000 clients (déclaré, relayé par tiers).
- Notion : rien trouvé sur l'adoption des agents ; un blog prévient que chaque note déclenche une exécution payante.
- Teams : retour de bâton en juillet 2026, Microsoft permet de couper Copilot, Facilitator et Recap en réunion (windowslatest.com 05/07/2026) : signe que le marketing dépasse l'usage voulu.
- Lindy, Relevance, Zapier, Zoom, Gemini, Fathom, Fireflies, Granola : non trouvé (aucun chiffre d'usage).

## Le déroulé chez le meilleur produit, par famille

- Répondre aux mails (Fyxer ; Superhuman pour la relance). Déclencheur : un mail arrive et est jugé à réponse. La personne voit un brouillon dans le dossier Brouillons de Gmail ou Outlook, dans son ton appris sur ses anciens mails ; jamais d'envoi (« will never send », page sécurité Fyxer). Elle relit, modifie, envoie. Les brouillons non utilisés sont effacés après 14 jours (réglable de 1 à 30). Durée : non trouvée.
- Fin de réunion (Fyxer, Fathom, Fireflies, Zoom). Déclencheur : la réunion se termine (robot invité ou enregistreur de l'application). Fyxer annonce résumé, actions et brouillon de suivi prêts à la fin de l'appel ou avant la fermeture de l'onglet (page du produit, marketing). La personne valide le brouillon et, chez Fireflies (Autofill CRM), les champs CRM proposés ; Fathom Business écrit les champs sans validation (tiers). Fireflies n'envoie pas de mail de suivi tout seul (tiers).
- Préparer un rendez-vous (Lindy « Meeting Prep Alert », Copilot dans Outlook, agent Sales). Déclencheur : horloge avant l'événement (Lindy : mail ou SMS) ou ouverture de l'agenda (Copilot). La personne voit un brief (participants, contexte passé, ordre du jour). L'agent Sales de Microsoft montre les réunions externes des 4 prochains jours, 3 points clés chacune, uniquement en discussion plein écran (documentation Microsoft). Aucune validation : lecture seule.
- Relancer (Superhuman Auto Reminders + Auto Drafts). Déclencheur : un fil sans réponse après un délai. Le fil revient en haut de la boîte, expédié par reminders@superhuman.com, avec un brouillon de relance préparé environ une heure avant (aide Superhuman, officiel). La personne relit et envoie. Offre Business et Enterprise. Meilleur produit trouvé pour cette famille ; les autres relances (HubSpot Prospection) sont à approuver.

## Les dix à copier en premier

1. Brouillon de réponse aux mails entrants (Fyxer). Raison : l'agent que les clients citent le plus, et il tient dans nos droits (Gmail et Outlook brouillons). Preuve : 25 000 entreprises et 41 millions de brouillons déclarés, 53 % acceptés tels quels (non vérifié).
2. Relance automatique des fils sans réponse (Superhuman Auto Drafts). Raison : seul à faire de la relance de bout en bout, brouillon en place avant que la personne y pense. Preuve : 40 % des brouillons envoyés sous un jour, 60 % sans retouche (bêta, déclaré) ; 1 M d'utilisateurs de Go.
3. Résumé de fin de réunion + brouillon de suivi (Fyxer, Fathom). Raison : on lit déjà huit enregistreurs ; il manque seulement le brouillon. Preuve : cité partout, aucun chiffre d'usage indépendant.
4. Mise à jour du CRM après réunion avec validation (Fireflies Autofill CRM, Granola). Raison : écriture HubSpot et Attio déjà accordée ; la validation évite l'erreur. Preuve : marketing seul, non trouvé.
5. Brief avant rendez-vous (Lindy Meeting Prep Alert, Copilot Outlook). Raison : lecture seule, risque nul, déclenchée par l'agenda. Preuve : non trouvée ; fonction livrée dans Outlook (note de version 11/08/2026).
6. Tri de la boîte (Fyxer). Raison : porte d'entrée de l'adoption chez Fyxer. Limite : écriture de catégories Outlook non accordée.
7. Brouillon de planification (Fyxer) : propose des créneaux dans un brouillon. Raison : tâche répétitive, brouillon seulement. Limite : calcul de disponibilité à faire sur Outlook et Gmail.
8. Agent qui s'exécute à la fin d'une note de réunion (Notion, juillet 2026) : met à jour le suivi, poste le récap. Raison : même mécanique que 3 et 4 vers Notion. Preuve : non trouvée ; un blog note un coût par exécution.
9. Brief du lundi et résumé quotidien des mails (Cowork, Workspace Studio). Raison : agents planifiés, lecture seule, faciles. Preuve : non trouvée.
10. Agents déclenchés par un nouveau mail ou un message Slack (modèles ChatGPT, août 2026). Raison : montre le patron « modèle + déclencheur + validation » à copier. Preuve : seulement notes de version.

Pour le support (Fin, Breeze Client) : revenus déclarés en chiffres (Fin 76 % de résolution, 0,99 $ ; Breeze 65 %, 0,50 $), mais ils répondent au client sans validation ; hors liste de départ.

## Ce que je n'ai pas trouvé

- Aucun chiffre d'usage pour Notion, Lindy, Relevance AI, Zapier Agents, Zoom, Gemini dans Meet, Granola, Fireflies ; ni classement des modèles les plus installés chez Lindy, Zapier, Relevance AI, ChatGPT.
- Pages officielles de Claude (Cowork, offre petites entreprises) : non lues, sources tierces seulement. Même chose pour la nomination de Zoom AI et ZoomMate (nom changé en juin 2026 selon un blog).
- Copilot : durée entre la fin d'une réunion Teams et le récapitulatif ; plans exacts. Gemini dans Gmail (agents propres) : non trouvé, seulement Workspace Studio.
- Fyxer : délai exact des brouillons ; la note du ton tient aux anciens mails (tiers).
- Fathom : écriture CRM automatique et dépendance de l'offre, sources contradictoires.
- Les dates des tiers sont souvent incohérentes ; à vérifier sur les pages officielles avant toute décision.
- Ce qui manque chez nous pour tout copier : planificateur d'agents (horloge), réception d'événements (nouveau mail, fin de réunion), brouillons Gmail et Outlook (écriture accordée), Zoom, Teams, Google Meet, Google Agenda non relevés.
