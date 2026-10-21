# Gmail : se faire certifier ou passer par un tiers ?

Recherche rapide du 21/10/2026. La plupart des sources sont des éditeurs qui vendent l'accès Gmail : à revérifier chez Google et auprès d'un laboratoire avant de décider.

## Le problème

Lire Gmail demande le scope `gmail.readonly`, que Google classe « restreint ». Une appli en production qui l'utilise doit passer la vérification OAuth de Google et un audit de sécurité **CASA**, à refaire **tous les 12 mois** ([Nylas](https://developer.nylas.com/docs/provider-guides/google/google-verification-security-assessment-guide.md)).

## Option 1 : faire la certification nous-mêmes

- **Coût de l'audit.** Chez le laboratoire TAC Security, à partir de 675 $ pour le niveau AL1 et 5 400 $ pour AL2. C'est Google qui choisit le niveau ([Nango](https://docs.nango.dev/integrations/google-security-review)). Ailleurs, on lit « 540 à 1 000 $ par an » en libre-service et « 15 à 75 k$ » pour l'ancienne filière ([Unipile](https://www.unipile.com/integrating-google-oauth-2-0-user-authentication-into-your-app/)), deux chiffres non vérifiés.
- **Délai.** 2 à 8 semaines selon les éditeurs ; Google dit « plusieurs mois » selon les données demandées.
- **Pour.** Les données ne passent que par nous (UE), et nous ne dépendons de personne.
- **Contre.** Le délai, le renouvellement annuel, et un dossier de sécurité à tenir.

## Option 2 : payer un tiers déjà certifié

Ces tiers ont leur propre appli Google déjà vérifiée. Les utilisateurs de Leon donnent leur accord à l'appli du tiers, et Leon lit Gmail à travers son API.

| Tiers | Ce qu'il annonce | Prix trouvé |
|---|---|---|
| Nylas | Appli Google partagée, CASA niveau 3 ([Nylas](https://developer.nylas.com/docs/provider-guides/google/shared-gcp-app/)) | non relevé |
| Unipile | Clé Google pré-certifiée, puis bascule possible vers notre propre appli une fois certifiés ([Unipile](https://www.unipile.com/integrating-google-oauth-2-0-user-authentication-into-your-app/)) | non relevé |
| Truto | CASA niveau 2 déjà fait ([Truto](https://truto.one/google.md)) | 10 $ par connexion |
| Composio | Appli OAuth partagée ([Composio](https://composio.dev/blog/ship-gmail-integration-in-minutes)) | non relevé |

- **Pour.** Gmail disponible en quelques jours.
- **Contre.**
  - Les e-mails des clients transitent par un sous-traitant, souvent américain. Il faut un DPA, et ça affaiblit l'argument « hébergé en UE ».
  - Sur l'écran de consentement, le client voit le nom du tiers, pas celui de Leon.
  - Coût par boîte mail.
  - Leon dépend du tiers : s'il change ses prix ou perd sa certification, Gmail tombe.

## Option 3 (trouvée en chemin) : l'appli interne du client

Pour un pilote, aucune certification n'est nécessaire si l'appli OAuth est **interne** au Google Workspace du client, ou si elle a moins de 100 utilisateurs en mode test ([Nylas](https://developer.nylas.com/docs/provider-guides/google/google-verification-security-assessment-guide.md)). L'admin du client crée l'appli dans sa propre console Google, ou autorise un compte de service avec délégation sur le domaine ([Unipile](https://www.unipile.com/gmail-api-service-account-domain-wide-delegation/)), et nous donne les identifiants.

- **Pour.** Gratuit, immédiat, et les données restent entre le client et nous.
- **Contre.**
  - Il faut 15 à 30 minutes à l'admin du client.
  - Ça ne passe pas à l'échelle au-delà de quelques pilotes.
  - Une appli en mode test voit ses jetons expirer au bout de 7 jours : il faut donc préférer l'appli interne ou le compte de service.

## Recommandation

1. **Pour les pilotes : option 3.** Elle ne coûte rien et ne demande à Leon qu'un champ « identifiants de votre appli Google » dans le connecteur.
2. **En parallèle : lancer l'option 1 tout de suite**, puisque le délai est le vrai coût.
3. **Option 2 en secours seulement**, si la certification traîne au-delà des premiers clients payants. Dans ce cas, choisir un tiers qui permet de basculer ensuite vers notre propre appli (Unipile le propose).

**À trancher :**
- Les e-mails peuvent-ils passer par un sous-traitant américain ? Si non, l'option 2 tombe.
- Qui porte le dossier CASA ?
