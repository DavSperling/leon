# Product

<!-- impeccable:product-schema 1 -->

Contexte produit durable pour les outils de design (Impeccable). Écrit le 31 octobre 2026 à partir du dépôt (README, `docs/specs/`, `docs/etudes/founder-pme-2026-10/`) et des réponses de David. Rien de visuel ici : les choix de forme vivent dans le code et, plus tard, dans DESIGN.md.

## Platform

web

## Users

Tous les employés d'une société de 20 à 200 personnes, quel que soit le poste : dev, tech, IT, ventes, RH, support, direction, chefs de projet, nouvelles arrivées. Pas seulement les dirigeants (confirmé par David le 31/10/2026). En France d'abord.

Leur situation : noyés dans les outils (mails, docs, tickets, CRM, messagerie, conversations avec des assistants d'IA), ils cherchent ce qui a été dit, décidé ou promis, et par qui. Déclencheurs d'achat relevés par l'étude du 19/10 : le départ d'un chef de projet senior, un client qui conteste un périmètre.

Qui n'achète pas (étude du 19/10) : les sociétés prudentes sur la sécurité et le RGPD tant qu'il n'y a pas de certification, et celles déjà équipées d'un ChatGPT Business ou Claude Team.

## Product Purpose

Leon est la mémoire unifiée de l'entreprise. Il se branche sur les outils de la société et sur les conversations avec les assistants d'IA (Claude, ChatGPT, Gemini, Cursor, Copilot, Claude Code), garde chaque élément tel quel (le brut), avec les droits d'accès d'origine, et l'indexe pour qu'on le retrouve d'une seule recherche, avec la source à l'appui.

Il n'extrait pas de faits et ne tient pas de fiches : personne ne remplit rien. Sur ce brut, il offre la recherche, la discussion (réponse citée), le point du matin, et un serveur MCP pour que l'assistant de chacun interroge la mémoire avec les mêmes droits.

Succès : la personne retrouve ce qui a été dit ou décidé, avec le lien vers l'original, en une recherche ; et quand Leon ne sait pas, il le dit.

## Positioning

« La source, ou rien. » Chaque réponse cite l'original ou dit « je ne sais pas ». Les concurrents (Glean, Dust, Dash, Qontext, Guru…) sont attaqués sur « ne trouve rien » et « réponses fausses » ; Leon se tient à ce que les données du client prouvent.

« Leon voit ce que vous voyez. Rien de plus. » La recherche, la discussion et l'assistant passent par les mêmes droits que l'utilisateur (RLS en base). Les conversations d'IA captées restent privées à leur auteur.

Rien n'est transformé : le brut est gardé tel quel, pas de fiche, pas de résumé figé. Et le site ne promet que ce que le code tient (la page Sécurité liste aussi « ce qui n'est pas encore là »).

## Operating Context

- Outils reliés : 39 connecteurs sur le site (Gmail, Drive, Slack, GitHub, GitLab, Linear, Notion, Sentry… ; 48 logos dans `public/logos`), relevés par tâches de fond toutes les 15 minutes environ, dans le processus de l'application.
- Conversations d'IA : captées par l'extension Chrome (`extension/`) et importées depuis Claude Code par le CLI (`pnpm leon`). Les secrets reconnaissables à leur forme sont masqués avant stockage.
- Surfaces web : le site public sans session (accueil, produit, cas d'usage par équipe, connecteurs, sécurité, tarifs, connexion, inscription), puis l'application (recherche, discussions, connexions, documents, réglages, tableau admin), et les écrans d'authentification (invitation par lien, 2FA, mot de passe oublié, suppression de compte).
- Un espace par société ; l'invitation se fait par lien ; un organigramme managers/équipes est en cours (PR #69).
- Langue : français d'abord, anglais en traduction (`messages/fr.json`, `messages/en.json`, next-intl).
- Hébergement : une instance Railway allumée en continu, base Supabase (Francfort). Pas de facturation codée.
- Stack : Next.js (App Router), React, Tailwind, Radix, Motion, Hono pour l'API, Drizzle sur Postgres avec pgvector, Better Auth, Anthropic SDK, serveur MCP.

## Capabilities and Constraints

- Fait aujourd'hui : connexion des outils, capture des conversations d'IA, recherche (plein texte + vecteurs, seuil réglé), discussion citée, point du matin, documents déposés, MCP, invitations, 2FA, suppression de compte, tableau admin.
- Vocabulaire : « brut », « source », « point du matin », « connexions », « discussions », « espace » (l'organisation). Le mot « IA » n'apparaît pas comme argument dans l'interface ; aucun nom d'assistant ni de concurrent sur le site.
- Contrainte forte : aucune fuite de droits. Une réponse ne doit jamais montrer un contenu auquel la personne n'a pas accès. Paie et finance exclues par défaut (prévu par `ops.md`).
- Une seule instance par base, un seul modèle de vecteurs à la fois.
- Non décidé : les tarifs (trois formules proposées dans `docs/etudes/founder-pme-2026-10/pricing.md`, pilote gratuit 30 jours, 25 € HT par utilisateur actif, dédiée sur devis ; rien d'arrêté, rien de facturé) ; la certification de sécurité (ISO 27001 ou SOC 2, pas financée au départ) ; la certification Google CASA pour Gmail et Drive.

## Brand Commitments

- Le nom est **Leon** et on le garde (décision de David, 31/10/2026 ; l'étude de marque du 19/10 recommandait d'en changer, elle est caduque sur ce point). Logo SVG dans `src/components/verre/shell/brand.tsx`, favicon `src/app/icon.svg`, le mot « Leon » en texte à côté.
- Voix (`docs/etudes/founder-pme-2026-10/brand.md` et `marketing.md`, appliquées au site) : précis, franc, posé ; vouvoiement ; phrases courtes ; ni point d'exclamation ni émoji ; pas de texte de remplissage ni d'enthousiasme de commande.
- Interdits de fond : aucun témoignage, logo client ou chiffre non mesuré ; rien que le code ne tient pas (pas de « RGPD », « hébergé en Europe », « certifié », « lecture seule ») ; les exemples (ACME, Julie, Thomas…) sont fictifs et marqués « Exemple fictif ».
- Pas un mouchard : rien qui évoque l'œil, l'oreille, l'espion, le « cerveau » de l'IA (refus n°1 du panel : la surveillance). En visuel, pas de loupe, de cadenas, d'étincelles ni d'œil.

## Evidence on Hand

- Les logos d'outils dans `public/logos` (48 fichiers SVG).
- Un jeu d'essai fictif (société « Atelier Lebrun », 6 personnages, 60 conversations, PR #15) pour les démos et les captures.
- Les études dans `docs/etudes/` (marché, concurrents, coûts, cas d'usage, pack founder). Le panel du pack est fait d'acheteurs simulés : ce ne sont pas des clients.
- Absences à ne pas inventer : aucun client réel, aucun témoignage, aucune mesure d'usage, aucune certification, aucun chiffre de performance publiable.

## Product Principles

1. La source, ou rien : citer l'original ou dire « je ne sais pas ».
2. Les droits de la personne, jamais plus : chaque réponse passe par ses accès, ses conversations d'IA restent à elle.
3. Le brut tel quel : on garde, on ne résume pas, on ne fait remplir aucune fiche.
4. Dire seulement ce que le code tient : promesses, sécurité et tarifs suivent l'état réel, y compris « pas encore ».
5. Le même écran pour tous les métiers : un dev et une personne des ventes lisent la même réponse, sans vocabulaire technique imposé.

## Accessibility & Inclusion

Pas de norme imposée par un client. Pratiques déjà tenues dans le code, à préserver : mouvement réduit respecté (état final, rien ne tourne), texte à 4,5:1 au moins, visuels 3D décoratifs en `aria-hidden` avec le même contenu en texte à côté, animations arrêtées hors écran. Interface en français avec traduction anglaise.
