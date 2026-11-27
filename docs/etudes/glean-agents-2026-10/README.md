# Étude : les agents Glean, ce qui sert vraiment, et ce que ça veut dire pour une PME

19 octobre 2026 · David (avec Claude) · à relire par Amos

Version mise en page : [`agents-glean-analyse.pdf`](agents-glean-analyse.pdf), 8 pages. Sa source HTML est [`source-pdf.html`](source-pdf.html) : pour régénérer le PDF, l'imprimer depuis Chrome. Complète l'[étude concurrentielle](../concurrents-2026-10/README.md).

## La question

On a envisagé de faire ressembler Leon à Glean, notamment avec son catalogue d'agents (onglets General, Engineering, IT, Sales, Support). Est-ce que ces agents servent vraiment ? Qu'est-ce que les clients de Glean apprécient ? Et est-ce que ça vaut quelque chose pour une société de 20 à 50 personnes, équipe par équipe ?

## La réponse courte

1. **Les clients de Glean n'achètent pas les agents.** Ils paient pour une seule recherche qui trouve tout, dans tous les outils, en respectant les droits d'accès, et pour l'onboarding.
2. **Parmi les agents, seuls ceux qui croisent plusieurs sources apportent une vraie valeur** (fiche client, rapport de la semaine, onboarding projet). Les autres sont déjà faits par Zendesk, Gong ou GitHub, ou ne sont que de la rédaction.
3. **Le problème existe aussi à 20-50 personnes** : 25 à 55 outils SaaS, environ 3 h par semaine perdues à chercher. À 25 € le siège, le gain estimé vaut environ 6 fois le prix (hypothèses en partie 5).
4. **À cette taille, l'information est surtout dans les conversations** plutôt que dans les documents, et il n'y a pas d'équipe IT. Il faut un outil prêt en 15 minutes, utile à chaque équipe, avec des droits irréprochables.

## 1. Ce qu'est un « agent » chez Glean

Un template Glean, c'est un prompt enregistré, branché sur la recherche interne de Glean, avec parfois quelques étapes et un connecteur obligatoire. Dust, leur concurrent, le résume : les agents Glean « dépendent de l'infrastructure de recherche ». Ils sont bons pour retrouver et synthétiser, beaucoup moins pour agir dans plusieurs outils.

Pour trier les templates, une seule question compte : **est-ce que la valeur vient du fait de croiser plusieurs sources ?** Si oui, une mémoire unifiée est indispensable. Sinon, l'outil source ou n'importe quel LLM fait déjà le travail.

## 2. Les templates, un par un

### Famille A : utiles, parce qu'ils croisent plusieurs sources (notre terrain)

| Template | Équipes en PME | Ce qu'il fait | Verdict |
|---|---|---|---|
| Customer 360 | Sales, CS, Direction | Fiche client : CRM, tickets, Slack, mails, notes de réunion, signaux d'alerte | Très utile : le cas le plus fort de la liste |
| Deal loss insights | Sales, Direction | Pourquoi une affaire a été perdue : appels, Slack, CRM, Drive | Utile. HubSpot l'a en natif dès Starter (CRM seul) ; ce qui reste, c'est le croisement avec les échanges |
| Rich Ticket Timeline | Support, Dev | Chronologie d'un ticket enrichie par d'autres sources | Utile : fait le lien entre support et dev |
| Find Similar Tickets | Support | Tickets ou cas proches | Moyen : natif dans un seul Zendesk |
| Engineering Project Onboarding | Dev, RH | Résume un projet pour un nouvel arrivant | Utile |
| Postmortem depuis Slack | Dev | Rédige le post-mortem d'un incident | Utile en PME, qui a rarement incident.io ou Rootly |
| Weekly work report | Tous, Direction | Ce que chacun a fait dans la semaine, par projet | Utile et sous-estimé : ne marche qu'avec une mémoire de l'activité |
| Extract Projects from User Activities | — | Sous-agent qui regroupe l'activité par projet | Brique interne du précédent |
| Q&A Chatbot | Tous, RH | Chatbot sur un sujet | Fonction de base : ce qui compte, ce sont les sources et les droits |

### Famille B : utiles, mais déjà faits par l'outil source

| Template | Qui le fait déjà nativement |
|---|---|
| Summarize Ticket, Draft a Response, Customer Sentiment Scorer, Simple Ticket Timeline | Zendesk Copilot et Intercom |
| Pull request review, PR style guide reviewer | GitHub Copilot code review (plus d'une revue sur cinq sur GitHub), CodeRabbit |
| CI/CD GitHub logs debugger | GitHub Copilot : « Explain error » et « Fix with Copilot » |
| Sales Call Coaching | Gong (1 400 à 1 600 $ par utilisateur et par an, plus des frais de plateforme), Modjo, outils de prise de notes |

### Famille C : de la rédaction, la mémoire compte peu

PRD to product comms, Draft a competitive brief (présent deux fois dans l'onglet Sales), LinkedIn Post Draft, Marketing Event Description.

## 3. Est-ce que les agents servent vraiment ?

- **Ce que dit Glean** (non vérifié) : Zillow, 3 400+ agents, 80 % d'adoption, 1,5 h gagnée par semaine ; GCash, 2 700+ agents, 2 à 3 h gagnées par semaine.
- **Études indépendantes** : plus de 40 % des projets d'agents annulés d'ici fin 2027 (Gartner) ; 79 à 89 % des pilotes jamais mis en production (plusieurs enquêtes, à revérifier) ; 56 % des commentaires de CodeRabbit rejetés et 36 % acceptés, sur 31 073 analysés.
- **L'indice le plus parlant** : Glean vend un cadre de gouvernance contre la « prolifération des agents ». La plupart sont créés une fois puis oubliés. Ceux qu'on utilise répondent à une question récurrente qui traverse plusieurs outils.

## 4. Ce que les clients aiment vraiment chez Glean

Notes : 4,4/5 sur Gartner Peer Insights (341 avis), 4,7/5 sur AWS Marketplace (348 avis). Les agents ne sont quasiment jamais cités comme raison principale.

**Ce qu'ils aiment**
- Chercher partout au même endroit : « J'adore que Glean se connecte à Slack, Gmail, Calendar et mon Drive. »
- La simplicité, d'où l'adoption : 70 % chez Confluent, 93 % sur deux ans dans l'étude Forrester.
- L'onboarding : 36 h gagnées par nouvelle recrue (Forrester).
- Le support : 5 à 10 min de moins par ticket (Confluent), 20 % de demandes internes en moins (Forrester).
- Une culture du « cherche d'abord » : « Si je ne le trouve pas sur Glean, c'est que ça n'existe pas. »

**Ce qu'ils n'aiment pas** : des résultats parfois manqués ou faux, des connecteurs incomplets, un prix élevé et non public (contrat minimum d'environ 60 k$ par an, médian d'environ 99 k$), une installation lourde, une gêne sur la vie privée, pas d'installation chez le client.

**Le retour sur investissement**, tous chiffres publiés par Glean ou commandés par lui : Forrester TEI (entreprise type de 10 000 personnes), ROI de 141 % sur 3 ans ; Confluent, 15 000 h par mois ; Super.com, « 17x » ; Duolingo, 5x ; Webflow, 3x. Ces cas ne sont pas audités : pas de groupe témoin, et les clients partis n'apparaissent pas. Chez Forrester, 23,2 M$ des 26,6 M$ de bénéfices viennent du seul temps de recherche converti en salaire.

## 5. Et pour une société de 20 à 50 personnes ?

- **25 à 55** applications SaaS dans une société de 25 à 55 personnes (PactAlert).
- **3,2 h** par semaine et par personne passées à chercher, avec **10 %** de réussite au premier essai (Slite 2026, environ 100 répondants). McKinsey et Atlassian donnent 19 à 25 % du temps de travail.
- **Le calcul pour 30 personnes**, avec mes hypothèses : 1 h gagnée par semaine, coût chargé d'environ 35 €/h (non vérifié).
  - Gain : 30 × 4,3 × 35 ≈ **4 500 € par mois**.
  - Coût à 25 € le siège : **750 € par mois**.
  - Environ 6 fois rentable.

| Équipe | Outils typiques | Questions | Utilité |
|---|---|---|---|
| Sales | HubSpot ou Pipedrive, Gmail, Agenda, Slack, Drive | « Où on en est avec ce client ? », préparer un rendez-vous, reprendre les comptes d'un commercial qui part | Très forte |
| Support / CS | Zendesk, Intercom ou Crisp, Slack, Notion, Linear | « Ce bug est-il connu ? », « qu'a-t-on promis ? » | Forte (lien support-dev) |
| Dev | GitHub, Linear ou Jira, Notion, Slack, Sentry, Claude Code ou Cursor | « Pourquoi ce choix ? », « qui connaît ce module ? », onboarding | Forte : capture des conversations LLM |
| RH | Lucca ou Payfit, Drive, livret Notion, Welcome to the Jungle | Congés, mutuelle, parcours d'arrivée | Moyenne : peu de questions, données sensibles |
| Marketing | Notion, Drive, Figma, HubSpot, Webflow | Dernier deck, clients citables, messages validés | Moyenne |
| Direction (l'acheteur) | Tous, plus Pennylane ou Qonto | « Que s'est-il passé cette semaine ? », « qu'a-t-on décidé ? » | Forte : c'est lui qui signe |

**Ce qui change à cette taille**
- **Peu de documents, beaucoup de conversations.** Le savoir est dans Slack, les mails, les réunions et les têtes.
- **Pas d'équipe IT** pour brancher les connecteurs : l'installation doit prendre 15 minutes.
- **Un seul outil pour toutes les équipes** : c'est l'argument de vente.
- **La confiance d'abord** : le sur-partage Drive est l'objection n°1 du panel, et les RH rendent les droits d'accès non négociables.

## 6. Ce que ça veut dire pour Leon

1. Vendre ce que les clients de Glean achètent vraiment : « je trouve tout, tout de suite, sans voir ce que je n'ai pas le droit de voir ». Les agents sont un bonus.
2. Ne pas construire un éditeur d'agents à la Glean.
3. Livrer des « recettes » par équipe, sous forme de prompts MCP ou de skills :
   - Sales : fiche client avant un rendez-vous, « pourquoi on a perdu ce deal ».
   - Support : « ce bug est-il connu ? ».
   - Dev : onboarding projet.
   - RH : livret d'accueil interrogeable.
   - Direction : rapport de la semaine.
4. Capter les conversations, pas seulement les documents.
5. Une installation en 15 minutes, sans équipe IT.
6. Ignorer la famille B.
7. Vérifier tout ça pendant les 12 entretiens avec des dirigeants.

## Limites

Les onglets General et IT n'ont pas été vus en entier. Les chiffres d'adoption et de ROI de Glean viennent de Glean ou d'études qu'il a commandées. G2, Gartner et Capterra bloquent la lecture automatique : leurs notes viennent des résultats de recherche. Les chiffres à 20-50 personnes reposent sur une source chacun, et le coût horaire de 35 € est une hypothèse.

## Sources

La liste complète (36 liens) est dans le PDF. Les principales :
- [Glean, templates d'agents](https://docs.glean.com/agents/templates)
- [Forrester TEI de Glean](https://tei.forrester.com/go/Glean/workAIplatform/?lang=en-us)
- [Glean, client Confluent](https://www.glean.com/resources/customer-stories/confluent)
- [Avis AWS Marketplace](https://aws.amazon.com/marketplace/reviews/reviews-list/prodview-3hxyfnuih42u2)
- [Gartner Peer Insights](https://www.gartner.com/reviews/market/enterprise-ai-search/vendor/glean)
- [The Revenue AI Report, analyse des cas Glean](https://www.therevenueaireport.com/capabilities/glean)
- [Macha, prix de Glean](https://www.getmacha.com/blog/glean-ai-pricing-explained)
- [Dust, sur les agents Glean](https://dust.tt/blog/glean-agents)
- [Dust, exemples d'agents par équipe](https://dust.tt/blog/ai-agents-examples)
- [HubSpot, agent Deal Loss](https://knowledge.hubspot.com/ai-tools/use-the-deal-loss-agent)
- [Groundy, étude CodeRabbit](https://groundy.com/articles/coderabbit-review-study-56-rejection-rate-demands-targeted-scoping/)
- [Slite, enquête recherche 2026](https://slite.com/learn/enterprise-search-survey-findings)
- [PactAlert, dépenses SaaS](https://pactalert.com/blog/saas-spending-statistics)
