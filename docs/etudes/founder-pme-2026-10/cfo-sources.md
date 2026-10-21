# D'où viennent les chiffres

| ligne | montant | source |
|---|---:|---|
| Prix | 19 € (an 1), 25 € ensuite | `pricing.md` : prix de lancement des 20 premières sociétés, garanti 12 mois |
| Coût de service IA et hébergement | 5 € par siège-mois | **Estimation**, à partir de l'étude de coûts du projet (`docs/etudes/couts-2026-10/`) et des essais du pipeline : environ 2,5 $ par siège si la lecture passe par le LLM du client, 4 à 11 $ avec le chat Leon. Valeur au milieu retenue. |
| Frais de paiement | 0,45 € par siège-mois | **Estimation** à partir des tarifs publics de Stripe pour les cartes de l'Espace économique européen (environ 1,5 % + 0,25 € par transaction), à vérifier sur stripe.com/fr/pricing |
| Outils et hébergement de base | 460 € par mois | Coûts fixes actuels déclarés par les fondateurs (environ 500 $) |
| Expert-comptable en ligne | 99 € par mois | Prix public Dougs « Sérénité » pour une SAS, relevé par l'étape opérations (`ops.md`) |
| Assurance RC pro et cyber | 80 € par mois | **Estimation** ; à faire chiffrer |
| Rémunération des fondateurs | 0 € | Décision des fondateurs (19/10/2026) : pas de rémunération avant que l'activité soit bien rentable |
| Signature électronique | 23 € par mois | Yousign Plus, annuel, prix relevé sur une source secondaire, à confirmer (`ops.md`) |
| Pilotes gratuits | 150 € par mois | **Estimation** : 3 pilotes par mois × 10 sièges × 5 € |
| Immatriculation | 252 € | Minimum légal 2026 relevé par l'étape opérations (`ops.md`), statuts et pacte d'associés non inclus |
| Contrats (CGV, DPA, confidentialité) relus par un avocat | 2 500 € | **Estimation** ; à faire chiffrer |
| Dossier confiance (note CSE, AIPD type) | 800 € | **Estimation** |
| Audit de sécurité léger par un tiers | 4 000 € | **Estimation** ; à faire chiffrer |
| Site, domaine, démos | 500 € | **Estimation** |
| Montée en charge (0 à 250 sièges en 12 mois) | | **Estimation** de cette étude, vérifiée seulement par le panel simulé : 45 % lancent le pilote (test sur 20 acheteurs), passage au payant inconnu |

Non inclus, à décider : la restauration à la minute de Supabase (PITR, environ 100 $ par mois, `ops.md`). Le projet n'a aujourd'hui aucune sauvegarde testée.
