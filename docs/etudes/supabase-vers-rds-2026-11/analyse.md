# Passer de Supabase à AWS RDS ? (18/11/2026)

> **Décision du 18/11 (David)** : on migre tout de suite, sans attendre les crédits Activate (demandés le 18/11).
> Instance `leon` créée, répétition réussie (42 tables et 113 index identiques, `db:migrate` « Base à jour »).
> Marche à suivre : [bascule.md](bascule.md), scripts [preparer-rds.sql](preparer-rds.sql) et [migrer.sh](migrer.sh).

## En bref

- **On n'est pas obligés de passer sur AWS.** Passer Supabase en Pro (25 $/mois) règle les limites en cinq minutes, sans toucher au code, et nous donne enfin des sauvegardes (on n'en a aucune aujourd'hui).
- **La migration vers RDS est simple** : Leon n'utilise de Supabase que la base Postgres. Compter une demi-journée de préparation et 20 à 40 minutes de coupure du site.
- **RDS vaut le coup quand on a les crédits AWS** (1 000 $ Activate Founders : site en ligne, adresse professionnelle, compte AWS payant ; l'immatriculation n'est pas exigée). Sans crédits, RDS coûte un peu plus cher que Supabase Pro (≈ 33 $ contre 25 $) et nous donne plus de travail.
- **Le vrai problème n'est pas l'hébergeur** : la file de tâches (pg-boss) interroge la base environ 9 fois par seconde, jour et nuit. C'est très probablement ce qui fait déborder le quota de trafic sortant (egress). Ce trafic suivra la base chez AWS.

## 1. Ce qu'on a vérifié

**Le mail.** Dans la boîte mail de David, les seuls mails de Supabase sont : l'autorisation de l'application « Claude » par Amos (17/11) et l'avis sur les droits des nouvelles tables (20/10). Aucun mail de dépassement. Il est sans doute arrivé chez Amos, ou sur une autre adresse. **À relire pour savoir quelle limite est touchée et la date de fin du délai de grâce.**

**L'usage réel** (lu dans la base le 18/11) :

| Mesure | Valeur | Limite du plan gratuit |
|---|---|---|
| Taille de la base | 145 Mo (vecteurs 53 Mo, passages 39 Mo, file pg-boss 27 Mo) | 500 Mo |
| Connexions ouvertes | 19 | 60 au total, 15 par rôle via le pooler |
| Requêtes « prendre la tâche suivante » de pg-boss | **26,4 millions en 33 jours** (≈ 9 par seconde) | — |
| Lecture de la config des files pg-boss | 526 000 appels, 5,5 millions de lignes | — |
| Trafic sortant | non lisible sans le tableau de bord (connexion demandée) | 5 Go/mois |

Déduction (non mesurée) : 26 millions de petits allers-retours à quelques centaines d'octets chacun font plusieurs Go par mois. C'est assez pour dépasser les 5 Go gratuits, même sans aucun client. La taille de la base n'est pas en cause.

**Ce que Leon utilise de Supabase : uniquement Postgres.** La connexion, l'authentification (Better Auth), les tâches de fond et les fichiers sont gérés par notre code. Les schémas `auth`, `storage`, `realtime` et `vault` de Supabase sont présents mais inutilisés. Les extensions dont on a besoin (`vector`, `pg_trgm`, `btree_gist`) existent toutes sur RDS en PG 17.11.

## 2. Les trois options

| | Supabase gratuit | Supabase Pro | AWS RDS (db.t4g.small, Francfort) |
|---|---|---|---|
| Prix | 0 $ | **25 $/mois** (petite machine incluse) | **≈ 33,40 $/mois** (instance + 20 Go + IP publique) |
| Trafic sortant inclus | 5 Go, puis restriction | 250 Go, puis 0,09 $/Go | 100 Go (tout le compte), puis 0,09 $/Go |
| Disque inclus | 500 Mo | 8 Go | 20 Go (choisi) |
| Sauvegardes | **aucune** | quotidiennes, 7 jours | automatiques, 7 jours, restauration à la minute |
| Connexions | 15 par rôle (cause des pannes EMAXCONNSESSION) | 200 via le pooler | ≈ 200 directes |
| Plafond de dépense | — | activé par défaut | à poser soi-même (budget AWS) |
| Travail | — | 5 min, aucun code | ½ journée + coupure de 20-40 min |
| Crédits | — | — | 100-200 $ tout de suite (offre gratuite), 1 000 $ Activate sous conditions |

Prix Supabase lus sur [supabase.com/pricing](https://supabase.com/pricing) le 18/11/2026. Prix RDS tirés de l'étude `etude-bdd` (Price List AWS du 06/10/2026, Francfort, Single-AZ, à la demande).

**Avec les crédits**, RDS devient presque gratuit : 1 000 $ couvrent la base pendant toute leur durée de validité (12 à 24 mois), et le reste peut payer Claude via Bedrock. Mais Activate exige : un compte AWS payant, un site en ligne au nom de la société (leonmemory.com convient), **une adresse mail professionnelle** (pas Gmail), une startup créée il y a moins de 10 ans, autofinancée ou avant la série B. Les pages Activate ne demandent pas d'immatriculation (vérifié le 18/11 sur [aws.amazon.com/startups/credits](https://aws.amazon.com/startups/credits) et [la page française](https://startups.aws.com/lp/aws-activate-credits?lang=fr)) ; le seul motif de refus écrit est une information inexacte. Réponse en 7 à 10 jours ouvrés.

**Sans les crédits**, AWS ne rapporte rien aujourd'hui : un peu plus cher, plus de réglages à faire nous-mêmes (sauvegardes, réseau, alertes de coût), et aucune fonction en plus dont Leon a besoin.

## 3. La migration vers RDS, de bout en bout

Difficulté : **moyenne-basse**. Aucune ligne de logique à réécrire. Les pièges sont dans les réglages, pas dans le code.

### Avant (sans coupure, ½ journée)

1. **Compte AWS** : ouvrir avec l'adresse au domaine, activer la double authentification, créer un budget avec alertes (25, 50, 100 $). Les cinq petites activités de l'offre gratuite donnent +100 $ de crédits.
2. **Créer la base** : PostgreSQL 17.11, db.t4g.small, eu-central-1 (Francfort, comme aujourd'hui), Single-AZ, 20 Go gp3, sauvegardes 7 jours, chiffrement activé, accès public activé. Railway n'a pas d'adresse IP de sortie fixe sur notre offre : le port 5432 reste ouvert à Internet, protégé par TLS obligatoire et des mots de passe forts. C'est la même situation qu'aujourd'hui chez Supabase.
3. **Préparer la base vide** (en compte maître) : adapter `docker/postgres/init.sql` (créer `leon_owner`, `leon_app` sans BYPASSRLS, la base `leon`, l'extension `vector`). **Piège PG 16+** : le compte maître doit recevoir `GRANT leon_owner TO <maître>`, sinon il ne peut pas créer la base au nom de `leon_owner`.
4. **Certificat TLS** : ajouter le certificat racine RDS de Francfort dans `certs/`, à côté de celui de Supabase. Les adresses de base passent de `sslrootcert=/app/certs/supabase-ca-2021.crt` à ce nouveau fichier, toujours en `sslmode=verify-full`.
5. **Rejouer les migrations** sur RDS : `pnpm db:migrate` avec `DATABASE_URL_ADMIN` pointant sur RDS en `leon_owner`. Les 62 migrations recréent tout le schéma, y compris celui de pg-boss.
6. **Répétition générale** : copier les données une première fois (étape 8 ci-dessous), lancer les tests de droits (RLS) contre RDS, comparer le nombre de lignes par table. On jette ensuite cette copie.

### La bascule (20 à 40 minutes de coupure)

7. **Arrêter le service Railway** (sinon des écritures se perdent pendant la copie).
8. **Copier les données** : `pg_dump --data-only --no-owner --no-privileges` des schémas `public` et `pgboss` depuis Supabase, en `leon_owner`, puis restauration sur RDS en `leon_owner`. Aucune table n'est en `FORCE ROW LEVEL SECURITY`, donc le propriétaire voit et écrit toutes les lignes. Les compteurs (séquences) suivent dans le dump. Avec 145 Mo, la copie prend quelques minutes.
9. **Vérifier** : nombre de lignes par table identique des deux côtés.
10. **Changer deux variables sur Railway** (`DATABASE_URL`, `DATABASE_URL_ADMIN`) puis redéployer. La migration avant déploiement ne trouve rien à faire. Attendre `/api/health` au vert, puis se connecter et poser une question pour vérifier.

### Après

11. **Retour arrière possible** : remettre les deux anciennes variables. On garde Supabase intact deux semaines, puis on le supprime.
12. **Ménage** : mettre à jour le README (section déploiement), et le commentaire de la taille du pool, qui était réglé sur la limite de 15 de Supabase. On peut alors relever le pool, et les pannes EMAXCONNSESSION disparaissent.
13. **Exercice de restauration** : restaurer une sauvegarde RDS une fois et noter la marche à suivre. Une restauration crée une nouvelle base avec une nouvelle adresse, qu'il faut recopier dans Railway.

### Ce qui peut mal tourner

| Risque | Parade |
|---|---|
| Rôles ou extension refusés (pas de superutilisateur sur RDS) | Le piège `GRANT leon_owner TO <maître>`, testé à l'étape 6 |
| Connexion refusée pour cause de certificat | Le certificat RDS dans `certs/`, testé à l'étape 6 |
| Données écrites pendant la copie, puis perdues | Service arrêté pendant la bascule |
| Facture AWS surprise | Budget avec alertes posé dès l'ouverture du compte |
| Le trafic pg-boss coûte aussi chez AWS | Au-delà de 100 Go/mois seulement ; à corriger de toute façon (voir 4) |

## 4. À faire quel que soit le choix

- **Calmer pg-boss** : allonger son intervalle d'interrogation (2 secondes par défaut, multiplié par le nombre de files) ou réduire le nombre de files qui interrogent la base. C'est le levier qui fait vraiment baisser le trafic, chez Supabase comme chez AWS. À mesurer avant et après.
- **Railway** : l'essai finit vers le 22/11. Il faudra un plan payant pour garder le site, quelle que soit la base.

## Recommandation

1. **Maintenant** : passer Supabase en **Pro** (25 $/mois). On règle les limites et on obtient des sauvegardes, sans coupure ni risque. Et calmer pg-boss.
2. **Ensuite** : demander Activate dès que le compte AWS est ouvert, et passer sur **RDS quand les crédits sont accordés**. La migration est simple et réversible : rien ne nous enferme chez Supabase, donc rien ne presse.
3. **Si vous voulez AWS tout de suite** : c'est faisable cette semaine. Les 100 à 200 $ de l'offre gratuite paient environ 4 à 6 mois de base. Suivre la section 3 et faire la répétition générale avant la bascule.

## Non vérifié

- Le contenu exact du mail de Supabase (non trouvé dans la boîte de David).
- Le trafic sortant réel du mois (tableau de bord Supabase non accessible sans connexion).
- La région Railway du service : la latence vers Francfort reste la même qu'aujourd'hui si on reste à Francfort.
- Les prix RDS datent du 06/10/2026 ; ils bougent rarement, mais à relire avant de s'engager.
