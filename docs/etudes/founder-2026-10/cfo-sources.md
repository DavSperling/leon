# Sources des chiffres du CFO

Légende : [V] prix public vérifié le 17/10/2026 ; [E] estimation, raisonnement indiqué.

## Taux de change
- 1 $ = 0,92 € [E] : hypothèse de travail, à remplacer par le taux du jour.

## Coûts variables par siège-mois
- Embeddings : 0,7 M tokens par personne et par mois à 0,06 $/M (voyage-4) [V, https://docs.voyageai.com/docs/pricing] ≈ 0,05 $.
- Étiquetage léger : un passage Haiku 5.5 (0,10 $/M entrée, 0,50 $/M sortie) [V, https://platform.claude.com/docs/en/about-claude/pricing] sur 0,7 M tokens ≈ 0,30 $ → 0,28 €.
- Reprise de l'historique : 2 ans de données (≈ 18 M tokens par personne) embarqués et étiquetés une fois, ≈ 8,4 $ amortis sur 12 mois ≈ 0,70 $ → 0,64 € [E].
- Stockage : ~0,3 Go par siège et par an à 0,125 $/Go sur Supabase [V, https://supabase.com/pricing], plus part de calcul ≈ 0,10 $ → 0,09 € [E].
- Recherche et rerank : 440 requêtes par mois × 2 reranks de 50 candidats (Voyage rerank-2.5, 0,05 $/M tokens) [V] ≈ 1,30 $ → 1,20 € [E sur le nombre de requêtes].
- Génération : la moitié des requêtes dans le chat Leon avec Haiku (~0,004 $ par requête) ≈ 0,9 $ → 0,80 € ; l'autre moitié via MCP, payée par l'abonnement LLM du client [E].
- Transcription : 12 h de réunions par mois à 0,18 $/h (Voxtral Mini Transcribe V2) [V, https://mistral.ai/news/voxtral-transcribe-2] ≈ 2,2 $ pour la moitié des sièges sans transcript natif (Meet et Teams fournissent le transcript gratuitement) ≈ 1,00 € en moyenne [E].
- Stripe : 1,5 % + 0,25 € par transaction en Europe, plus Billing 0,7 % sur les abonnements [V, https://stripe.com/fr/pricing, vérifié par `ops.md`], réparti sur un client moyen de 20 sièges ≈ 0,56 €.
- Support et onboarding : 1 h de temps fondateur par client de 20 sièges et par mois, valorisée 30 € ≈ 1,50 € par siège [E].

## Coûts fixes mensuels
- Rémunération des fondateurs : 2 × 2 500 € [E, hypothèse à corriger par les fondateurs].
- Hébergement et LLM de développement : environ 500 $ mesurés dans `docs/etudes/couts-2026-10/README.md` + marge → 650 € [E].
- Outils, comptable, assurance, marketing, conformité : estimations [E] d'après les tarifs publics courants ; à confirmer par devis.

## Dépenses de lancement
- Immatriculation SAS : ~1 000 € tout compris (greffe, annonce légale, statuts en ligne) [E].
- Marque INPI : 190 € pour une classe + 40 € par classe supplémentaire [V, https://www.inpi.fr/].
- Documents juridiques RGPD et CGV : 2 500 € [E, fourchette avocat spécialisé].
- CASA Tier 2 : retirée des dépenses de lancement le 18/10 (l'offre v2 ne branche pas Google Workspace) ; à réintroduire (540 à 4 500 $/an, max 1 800 $ chez TAC Security selon `ops.md`) le jour où une équipe payante demande Gmail ou Drive.

## Volumes
- Rampe : 0 siège les deux premiers mois (immatriculation, pilotes gratuits), puis environ +30 % par mois ; 420 sièges au mois 12, plan de croisière 500 sièges (≈ 25 clients de 20 sièges) [E, à recaler avec le panel et les vrais pilotes].
- Capacité : 800 sièges (50 à 60 équipes), limite du support que deux fondateurs peuvent assurer d'après `ops.md` [E].

## Révision du 18/10 (après `ops.md`)
- Offre v2 (équipes dev) : plus de transcription de réunions ni de génération payée par Leon (lecture par MCP) ; ajout des sièges Solo gratuits (0,60 €) et de la garantie des 20 questions (0,20 €).
- Ligne « Sécurité » des coûts fixes ramenée à 200 € (pentest amorti, outils), sans CASA.
