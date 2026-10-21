// Fiches des 39 outils, copiées telles quelles du vrai Leon (server/connectors/*/catalog.ts) : libellés, aides,
// avertissements. Générées : ne pas retoucher à la main.
import type { CatalogEntry, ProviderId } from './providers';

export const CATALOG: Record<ProviderId, CatalogEntry> = {
  airtable: {
    fields: [
      {
        name: "token",
        label: "Jeton d’accès personnel",
        kind: "secret",
        placeholder: "pat…",
        help: "Donnez-lui seulement les portées de lecture data.records:read, data.recordComments:read et schema.bases:read, et ajoutez-y les bases à lire. Sans la deuxième portée, les commentaires ne sont pas lus."
      },
      {
        name: "bases",
        label: "Bases",
        kind: "list",
        placeholder: "appXXXXXXXXXXXXXX",
        help: "Une base par ligne (20 au plus), par son identifiant : il commence par app et se trouve dans l’adresse de la base, airtable.com/appXXXXXXXXXXXXXX/… Toutes ses tables sont lues, enregistrement par enregistrement ; les pièces jointes sont ignorées. Obligatoire avec une clé collée ; avec le bouton, laissez vide pour lire toutes les bases que vous autorisez chez Airtable."
      }
    ],
    keyHelp: "Sur airtable.com/create/tokens : Create new token, cochez les portées data.records:read, data.recordComments:read et schema.bases:read, ajoutez les bases à lire, puis copiez le jeton (il commence par pat).",
    docsUrl: "https://airtable.com/developers/web/api/authentication",
    oauthHelp: "Airtable vous demande de choisir les bases que Leon peut lire (une par une, ou tout un espace de travail), puis d’autoriser trois droits en lecture seule : voir les enregistrements, voir les commentaires et voir la structure des bases. Leon ne modifie rien. Il lit toutes les bases que vous autorisez (20 au plus), sauf si vous en nommez quelques-unes ci-dessous. L’accès se retire à tout moment dans Airtable : Account › Integrations › Third-party integrations."
  },
  asana: {
    fields: [
      {
        name: "token",
        label: "Jeton d’accès personnel",
        kind: "secret",
        help: "Le jeton lit tout ce que votre compte Asana voit : les projets privés dont vous êtes membre en font partie."
      },
      {
        name: "workspace",
        label: "Espace de travail (facultatif)",
        kind: "text",
        placeholder: "Acme",
        help: "Le nom ou l’identifiant de l’espace à lire. Laissé vide : le premier espace de votre compte."
      }
    ],
    keyHelp: "Sur app.asana.com/0/my-apps (console des développeurs d’Asana) : Jetons d’accès personnels › Créer un jeton, puis donnez-lui un nom.",
    docsUrl: "https://developers.asana.com/docs/personal-access-token",
    oauthHelp: "Asana vous demande d’autoriser Leon à lire vos tâches, vos projets, leurs commentaires et votre profil, en lecture seule. Leon ne lit que ce que votre compte Asana voit."
  },
  attio: {
    fields: [
      {
        name: "token",
        label: "Jeton d’accès",
        kind: "secret",
        help: "Donnez au jeton la lecture des notes (note:read), des commentaires (comment:read), des membres (user_management:read) et des fiches (object_configuration:read, record_permission:read). Leon ne fait que lire. Les notes modifiées après leur création ne sont pas relues."
      }
    ],
    keyHelp: "Dans Attio, en tant qu’administrateur : menu à côté du nom de l’espace › Workspace settings › onglet Developers › + New access token, puis réglez les droits en lecture et copiez le jeton.",
    docsUrl: "https://docs.attio.com/rest-api/guides/authentication",
    oauthHelp: "Attio vous demande d’autoriser Leon à lire les notes, les commentaires, les membres et les fiches de votre espace, en lecture seule. Seul un administrateur de l’espace peut donner cette autorisation. Tant que l’appli n’est pas validée par Attio, un avertissement « pas encore approuvée » s’affiche : vous pouvez continuer.",
    warning: "Revue d’Attio nécessaire au-delà de 25 espaces."
  },
  basecamp: {
    fields: [],
    keyHelp: "",
    docsUrl: "https://github.com/basecamp/bc3-api/blob/master/sections/authentication.md",
    oauthHelp: "Basecamp vous demande d’autoriser Leon à accéder à votre compte. Si vous avez plusieurs comptes Basecamp, Leon prend le premier.",
    keyAccepted: false,
    warning: "Basecamp n’a pas de droit en lecture seule : l’autorisation couvre tout votre compte, mais Leon ne fait que lire les messages, les documents et les commentaires."
  },
  circleback: {
    fields: [
      {
        name: "apiKey",
        label: "Clé d’API",
        kind: "secret",
        placeholder: "cb_…",
        help: "Leon lit les réunions du propriétaire de la clé, pas celles qu’on lui a seulement partagées."
      }
    ],
    keyHelp: "Dans Circleback : Settings › API keys, puis créer une clé (elle commence par cb_ et ne s’affiche qu’une seule fois).",
    docsUrl: "https://circleback.ai/docs/api"
  },
  claap: {
    fields: [
      {
        name: "apiKey",
        label: "Clé d’API",
        kind: "secret",
        placeholder: "cla_…",
        help: "N’activez pas « Full access » sur la clé : les enregistrements privés deviendraient lisibles par toute l’équipe dans Leon."
      }
    ],
    keyHelp: "Dans Claap, avec un compte administrateur : nom de l’espace › Settings › API & Webhooks › API, puis Create API key (la clé n’est affichée qu’une fois).",
    docsUrl: "https://docs.claap.io/api-reference/overview",
    warning: "L’API de Claap est limitée à 3 000 requêtes par jour pour tout l’espace, toutes clés confondues : Leon lit au plus 100 transcriptions par passage."
  },
  clickup: {
    fields: [
      {
        name: "token",
        label: "Jeton personnel",
        kind: "secret",
        placeholder: "pk_…",
        help: "Le jeton agit au nom de votre compte ; Leon ne fait que lire. Il donne accès à tous vos espaces de travail ClickUp : les tâches (fermées comprises) et leurs commentaires sont lus."
      }
    ],
    keyHelp: "Dans ClickUp : cliquez sur votre avatar › Settings › Apps › API Token › Generate, puis copiez le jeton (il commence par pk_ et n’expire pas).",
    docsUrl: "https://developer.clickup.com/docs/authentication",
    oauthHelp: "ClickUp vous demande de choisir les espaces de travail que Leon peut ouvrir, puis d’autoriser l’accès. ClickUp ne propose pas de droit en lecture seule : l’autorisation donne les mêmes droits que votre compte sur ces espaces, mais Leon ne fait que lire les tâches et leurs commentaires.",
    warning: "À faire confirmer par écrit avant tout client : les conditions de ClickUp interdisent d’entraîner des modèles sur les données des utilisateurs sans leur accord exprès."
  },
  close: {
    fields: [
      {
        name: "apiKey",
        label: "Clé d’API",
        kind: "secret",
        help: "La clé agit au nom de votre compte Close ; Leon ne fait que lire. Sont lus : les notes, les appels (avec leur transcription), les e-mails, les SMS et les messages WhatsApp des fiches que ce compte peut voir. Une note modifiée après sa création n’est pas relue."
      }
    ],
    keyHelp: "Dans Close : Réglages › Développeur › Clés d’API › créez une clé, puis copiez-la.",
    docsUrl: "https://developer.close.com/api/overview/api-key-authentication"
  },
  confluence: {
    fields: [
      {
        name: "site",
        label: "Site Atlassian",
        kind: "text",
        placeholder: "acme",
        help: "La partie avant .atlassian.net dans l’adresse de votre Confluence (acme pour acme.atlassian.net). Avec le bouton, facultatif : utile si votre compte a plusieurs sites Atlassian et que vous voulez choisir celui à lire."
      },
      {
        name: "email",
        label: "Adresse e-mail du compte Atlassian",
        kind: "text",
        placeholder: "marie@acme.com"
      },
      {
        name: "apiToken",
        label: "Jeton d’API",
        kind: "secret",
        help: "Un jeton créé sans portées : un jeton avec portées sera refusé."
      }
    ],
    keyHelp: "Sur id.atlassian.com › Sécurité › Jetons d’API : créer un jeton d’API (sans portées), puis le copier ; Leon lit ce que ce compte peut lire.",
    docsUrl: "https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/",
    oauthHelp: "Atlassian vous demande d’autoriser Leon à lire les pages, les commentaires, les espaces et les profils de votre site Confluence (lecture seule), et de choisir le site si votre compte en a plusieurs. Leon ne peut rien modifier.",
    warning: "Pages et commentaires de pied de page lus avec les droits du compte. Les commentaires en ligne ne sont pas lus. Atlassian fait expirer les jetons (un an par défaut) : en cas d’erreur, créez-en un nouveau."
  },
  crisp: {
    fields: [
      {
        name: "websiteId",
        label: "Identifiant du site",
        kind: "text",
        placeholder: "5d3f2a10-7b44-4c1e-9a30-0b1e6c2d4f01",
        help: "Dans Crisp : Settings › Workspace Settings › Setup Instructions (le « Website ID »)."
      },
      {
        name: "identifier",
        label: "Identifiant du jeton",
        kind: "secret",
        help: "Crisp ne l’affiche qu’une fois, à la création du jeton : copiez aussi la clé."
      },
      {
        name: "key",
        label: "Clé du jeton",
        kind: "secret",
        help: "Leon ne fait que lire : les conversations du site, avec leurs messages et leurs notes internes."
      }
    ],
    keyHelp: "Dans Crisp : Settings › Workspace Settings › Advanced configuration › API Token › Generate Token (réservé au propriétaire de l’espace de travail).",
    docsUrl: "https://docs.crisp.chat/guides/rest-api/authentication/website-token/",
    warning: "Jeton de site seulement (un jeton de plugin n’est pas pris en charge). Crisp limite ce jeton à 10 000 requêtes par jour : un premier passage sur une longue période peut en consommer une bonne part."
  },
  fathom: {
    fields: [
      {
        name: "apiKey",
        label: "Clé d’API",
        kind: "secret",
        help: "La clé ne voit que les réunions enregistrées par son propriétaire ou partagées avec lui."
      }
    ],
    keyHelp: "Dans Fathom : User Settings › API Access, puis générer une clé (Paramètres › Accès à l’API).",
    docsUrl: "https://developers.fathom.ai/quickstart",
    warning: "Conditions de Fathom à faire confirmer avant usage client"
  },
  fireflies: {
    fields: [
      {
        name: "apiKey",
        label: "Clé d’API",
        kind: "secret",
        help: "La clé est personnelle : Leon ne lit que les réunions auxquelles son propriétaire a accès."
      }
    ],
    keyHelp: "Sur fireflies.ai : Integrations (Intégrations) › Fireflies API, puis copiez la clé d’API.",
    docsUrl: "https://docs.fireflies.ai/fundamentals/authorization",
    warning: "Le plan gratuit limite l’API à 30 requêtes par minute et 500 par jour."
  },
  folk: {
    fields: [
      {
        name: "apiKey",
        label: "Clé d’API",
        kind: "secret",
        help: "La clé agit au nom de votre compte folk ; Leon ne fait que lire. Les notes publiques des contacts et des entreprises sont lues ; les notes privées ne le sont pas."
      }
    ],
    keyHelp: "Dans folk : réglages de l’espace › API › créez une clé d’API, puis copiez-la.",
    docsUrl: "https://developer.folk.app/api-reference/authentication",
    warning: "API récente. Seules les notes sont lues : les interactions (appels, e-mails, rendez-vous) sont encore en bêta chez folk et ne sont pas reprises."
  },
  freshdesk: {
    fields: [
      {
        name: "domain",
        label: "Domaine Freshdesk",
        kind: "text",
        placeholder: "acme",
        help: "Le début de l’adresse de votre Freshdesk : acme pour acme.freshdesk.com."
      },
      {
        name: "apiKey",
        label: "Clé d’API",
        kind: "secret",
        help: "Leon ne fait que lire ce que le compte de la clé voit : prenez celle d’un agent qui voit les tickets de l’équipe. Une clé réinitialisée coupe aussi les autres outils qui l’utilisent."
      }
    ],
    keyHelp: "Dans Freshdesk : votre photo de profil en haut à droite › Paramètres du profil, puis « Afficher la clé d’API » (il faut valider un captcha).",
    docsUrl: "https://support.freshdesk.com/support/solutions/articles/215517-how-to-find-your-api-key",
    warning: "L’API de Freshdesk est fermée au plan gratuit : il faut un plan payant ou un essai."
  },
  front: {
    fields: [
      {
        name: "token",
        label: "Jeton d’API",
        kind: "secret",
        help: "Leon ne fait que lire. Les boîtes personnelles ne sont lues que si le jeton couvre les ressources privées et si leur propriétaire a activé l’accès par API."
      }
    ],
    keyHelp: "Dans Front, un administrateur ouvre Settings › Developers › API tokens › Create API token, active « Access resources », choisit les ressources partagées (toutes les boîtes à lire) et la permission « Read », puis copie le jeton : il ne s’affiche qu’une fois.",
    docsUrl: "https://dev.frontapp.com/docs/create-and-revoke-api-tokens",
    warning: "Une clause des conditions de Front sur l’entraînement de modèles est ambiguë : à faire confirmer par écrit avant tout client."
  },
  github: {
    fields: [
      {
        name: "token",
        label: "Jeton d’accès à grain fin",
        kind: "secret",
        placeholder: "github_pat_…"
      },
      {
        name: "repos",
        label: "Dépôts",
        kind: "list",
        placeholder: "acme/leon",
        help: "Un dépôt par ligne, au format propriétaire/nom (20 au plus). Dépôt inaccessible ? Une organisation peut exiger que le jeton soit approuvé par un administrateur."
      }
    ],
    keyHelp: "Sur github.com : Settings › Developer settings › Personal access tokens › Fine-grained tokens ; choisissez comme propriétaire le compte ou l’organisation des dépôts, limitez l’accès aux dépôts voulus et donnez-lui la lecture de Issues, Pull requests et Metadata.",
    docsUrl: "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens",
    oauthHelp: "GitHub vous demande d’autoriser l’appli Leon à lire les tickets (Issues) et les Pull requests, en lecture seule. Elle ne voit que les dépôts où elle est installée : installez-la d’abord sur le compte ou l’organisation voulus (page de l’appli Leon sur github.com, bouton Install), en limitant l’accès aux dépôts à brancher. Dans une organisation, un propriétaire doit approuver l’installation. Pour changer les dépôts plus tard : Settings › Applications › Installed GitHub Apps › Leon › Configure."
  },
  gitlab: {
    fields: [
      {
        name: "token",
        label: "Jeton d’accès personnel",
        kind: "secret",
        placeholder: "glpat-…",
        help: "Cochez seulement la portée read_api : le jeton ne donne alors que la lecture."
      },
      {
        name: "projects",
        label: "Projets",
        kind: "list",
        placeholder: "acme/leon",
        help: "Un projet par ligne, au format groupe/projet ou groupe/sous-groupe/projet (20 au plus). Ses tickets et ses demandes de fusion sont lus, avec leurs commentaires."
      }
    ],
    keyHelp: "Sur gitlab.com : votre avatar › Modifier le profil › Accès › Jetons d’accès personnels › Générer un jeton (jeton classique), avec la portée read_api. Le jeton expire au plus tard dans un an : il faudra alors le remplacer.",
    docsUrl: "https://docs.gitlab.com/user/profile/personal_access_tokens/",
    oauthHelp: "GitLab vous demande d’autoriser Leon à lire vos projets (droit « read_api », lecture seule). Ce droit couvre tous vos projets : GitLab ne permet pas de le limiter, mais Leon ne lit que ceux de la liste. L’accès se retire à tout moment dans GitLab : votre avatar › Modifier le profil › Accès › Applications.",
    warning: "Seul gitlab.com est pris en charge, pas une installation de GitLab hébergée par vous."
  },
  gong: {
    fields: [
      {
        name: "baseUrlHost",
        label: "Sous-domaine de l’API",
        kind: "text",
        placeholder: "us-12345",
        help: "La partie avant « .api.gong.io » dans l’adresse de base affichée sur la page API de Gong."
      },
      {
        name: "accessKey",
        label: "Clé d’accès",
        kind: "secret",
        help: "Une clé remplacée a une nouvelle clé d’accès : elle se saisit aussi."
      },
      {
        name: "accessKeySecret",
        label: "Secret de la clé d’accès",
        kind: "secret",
        help: "La clé doit permettre de lire les appels et leurs transcriptions."
      }
    ],
    keyHelp: "Dans Gong : Centre d’administration › Paramètres › API (sous Écosystème), puis « Obtenir une clé d’API » ; seul un administrateur technique peut la créer, et le secret ne s’affiche qu’une fois.",
    docsUrl: "https://help.gong.io/docs/receive-access-to-the-api"
  },
  granola: {
    fields: [
      {
        name: "apiKey",
        label: "Clé d’API",
        kind: "secret",
        placeholder: "grn_…"
      }
    ],
    keyHelp: "Dans l’application Granola : Settings › Connectors › API keys › Create new key, avec les accès « Personal notes » et « Public notes ».",
    docsUrl: "https://docs.granola.ai/introduction",
    warning: "Plan Business ou Enterprise requis. Seules les notes qui ont un résumé et une transcription sont lues, et seulement celles que la clé peut voir."
  },
  helpscout: {
    fields: [
      {
        name: "appId",
        label: "Identifiant de l’appli",
        kind: "text",
        help: "L’identifiant (App ID) affiché sur la fiche de l’appli que vous avez créée."
      },
      {
        name: "appSecret",
        label: "Secret de l’appli",
        kind: "secret",
        help: "Le secret (App Secret) de la même appli. Leon ne fait que lire les conversations."
      }
    ],
    keyHelp: "Dans Help Scout : Your Profile › My apps › Create My App (une adresse de redirection quelconque suffit, par exemple https://example.com), puis copiez l’identifiant (App ID) et le secret (App Secret) de l’appli.",
    docsUrl: "https://developer.helpscout.com/mailbox-api/overview/authentication/",
    oauthHelp: "Help Scout vous demande d’autoriser Leon. Son accès suit vos droits dans Help Scout (l’API n’a pas de droits séparés), mais Leon ne fait que lire les conversations. Il faut être un utilisateur actif du compte.",
    warning: "Plan Standard ou supérieur requis (pas d’API en gratuit). L’appli doit être créée par un utilisateur actif du compte, qui doit avoir accès aux boîtes à lire."
  },
  hubspot: {
    fields: [
      {
        name: "token",
        label: "Jeton d’appli privée",
        kind: "secret",
        placeholder: "pat-eu1-…",
        help: "Leon ne fait que lire : les notes, appels, réunions et e-mails de votre compte HubSpot, avec le nom de l’entreprise, de l’affaire ou du contact auxquels ils sont liés."
      }
    ],
    keyHelp: "Dans HubSpot : Développement › Applis héritées (Legacy apps) › Créer une appli héritée › Privée ; onglet Portées (Scopes), cochez en lecture crm.objects.contacts.read, crm.objects.companies.read, crm.objects.deals.read, crm.objects.owners.read et sales-email-read ; onglet Authentification (Auth) › Afficher le jeton.",
    docsUrl: "https://developers.hubspot.com/docs/apps/legacy-apps/private-apps/overview",
    oauthHelp: "HubSpot vous demande d’autoriser Leon à lire les notes, appels, réunions et e-mails de votre compte, avec le nom des contacts, entreprises et affaires auxquels ils sont liés. Seul un super administrateur du compte peut installer l’appli. Leon ne fait que lire."
  },
  intercom: {
    fields: [
      {
        name: "token",
        label: "Jeton d’accès",
        kind: "secret",
        help: "Leon ne fait que lire. L’appli doit avoir la permission « Read conversations » ; sans elle, Intercom refuse la lecture des conversations."
      },
      {
        name: "region",
        label: "Région de l’espace",
        kind: "select",
        options: [
          {
            value: "api.intercom.io",
            label: "États-Unis (api.intercom.io)"
          },
          {
            value: "api.eu.intercom.io",
            label: "Europe (api.eu.intercom.io)"
          },
          {
            value: "api.au.intercom.io",
            label: "Australie (api.au.intercom.io)"
          }
        ],
        help: "Celle où Intercom héberge les données de l’espace : app.intercom.com (États-Unis), app.eu.intercom.com (Europe) ou app.au.intercom.com (Australie) dans l’adresse de la boîte de réception."
      }
    ],
    keyHelp: "Dans Intercom : Developer Hub › Your apps › New app (installée dans votre espace), puis la page Authentication de l’appli affiche le jeton d’accès à copier.",
    docsUrl: "https://developers.intercom.com/docs/build-an-integration/getting-started",
    warning: "Le jeton agit au nom de l’appli : il lit toutes les conversations de l’espace, notes internes comprises. Intercom ne donne pas de lien vers une conversation : la source n’en porte pas."
  },
  jira: {
    fields: [
      {
        name: "site",
        label: "Site Atlassian",
        kind: "text",
        placeholder: "acme",
        help: "Le début de l’adresse de votre Jira : acme pour acme.atlassian.net. Avec le bouton, facultatif : utile si votre compte a plusieurs sites Atlassian et que vous voulez choisir celui à lire."
      },
      {
        name: "email",
        label: "E-mail du compte Atlassian",
        kind: "text",
        placeholder: "prenom@entreprise.fr"
      },
      {
        name: "apiToken",
        label: "Jeton d’API Atlassian",
        kind: "secret",
        help: "Créez un jeton d’API ordinaire, pas un jeton « avec portées » : celui-ci ne marche pas avec l’adresse du site. Leon lit ce que votre compte voit dans Jira. Le jeton expire au bout d’un an au plus."
      }
    ],
    keyHelp: "Sur id.atlassian.com : Sécurité › Jetons d’API › Créer un jeton d’API.",
    docsUrl: "https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/",
    oauthHelp: "Atlassian vous demande d’autoriser Leon à lire vos tickets, leurs commentaires et les profils de votre site Jira (lecture seule), et de choisir le site si votre compte en a plusieurs. Leon ne peut rien modifier."
  },
  leexi: {
    fields: [
      {
        name: "keyId",
        label: "Identifiant de la clé",
        kind: "secret",
        help: "Affiché avec le secret à la création de la clé. Une clé remplacée a un nouvel identifiant : il se saisit aussi."
      },
      {
        name: "keySecret",
        label: "Secret de la clé",
        kind: "secret",
        help: "Affiché une seule fois, à la création de la clé : copiez-le tout de suite."
      }
    ],
    keyHelp: "Dans Leexi : Paramètres › Avancé › Clés API, bouton « Ajouter » (compte administrateur requis), avec la permission « Lecture des appels ».",
    docsUrl: "https://docs.leexi.ai/fr/guides/general-settings/api-keys",
    warning: "L’API demande le plan AI Meeting au minimum. Tous les appels que la clé voit (selon ses règles d’accès) deviennent visibles de toute l’équipe dans Leon."
  },
  linear: {
    fields: [
      {
        name: "apiKey",
        label: "Clé d’API personnelle",
        kind: "secret",
        placeholder: "lin_api_…",
        help: "La clé donne accès à ce que votre compte voit dans Linear. Choisissez l’accès en lecture seule."
      }
    ],
    keyHelp: "Dans Linear : Réglages › Compte › Sécurité et accès › Clés d’API personnelles.",
    docsUrl: "https://linear.app/docs/api-and-webhooks",
    oauthHelp: "Linear vous demande « Autoriser Leon à lire votre espace ? ». Leon ne demande que la lecture, au nom de votre compte."
  },
  miro: {
    fields: [],
    keyHelp: "",
    docsUrl: "https://developers.miro.com/docs/getting-started-with-oauth",
    oauthHelp: "Miro vous demande de choisir l’équipe où installer Leon, puis d’autoriser la lecture de ses tableaux. Leon lit le texte des notes, des textes, des formes, des cartes, des cadres et des documents de ces tableaux, jamais les images. Pour changer d’équipe, utilisez Reconnecter.",
    keyAccepted: false,
    warning: "Les commentaires des tableaux ne sont pas lus : l’API de Miro ne les donne pas. Seuls les tableaux de l’équipe choisie, auxquels votre compte a accès, sont lus."
  },
  missive: {
    fields: [
      {
        name: "token",
        label: "Jeton d’API personnel",
        kind: "secret",
        help: "Leon lit les conversations des équipes de votre compte, avec leurs messages et leurs commentaires, mais pas votre courrier personnel. Missive limite le débit à une requête par seconde en continu : un premier passage sur beaucoup de conversations prend plusieurs minutes."
      }
    ],
    keyHelp: "Dans Missive : Préférences › onglet API › « Créer un nouveau jeton ».",
    docsUrl: "https://missiveapp.com/docs/developers/rest-api",
    warning: "Forfait Productive requis : Missive ne permet de créer un jeton d’API qu’aux organisations qui l’ont. Tout ce que la boîte « Tout » de vos équipes contient devient visible de toute l’équipe dans Leon ; une conversation personnelle que vous avez partagée avec une équipe en fait partie."
  },
  monday: {
    fields: [
      {
        name: "token",
        label: "Jeton d’API personnel",
        kind: "secret",
        help: "Le jeton reprend vos droits dans monday.com : Leon lit les tableaux que vous voyez. Les observateurs et les invités n’ont pas de jeton."
      }
    ],
    keyHelp: "Dans monday.com : photo de profil › Développeurs › Jeton d’API › Afficher (un administrateur le trouve aussi dans Administration › Connexions › Jeton d’API personnel).",
    docsUrl: "https://developer.monday.com/api-reference/docs/authentication",
    oauthHelp: "monday.com vous demande « Autoriser Leon à lire vos tableaux ? ». Leon ne demande que la lecture (tableaux, éléments, mises à jour et votre profil), avec vos propres droits : il ne voit que les tableaux que vous voyez.",
    warning: "Conditions d’utilisation de monday.com : l’API est réservée à un usage interne. À faire confirmer par écrit avant tout client."
  },
  notion: {
    fields: [
      {
        name: "token",
        label: "Secret d’intégration interne",
        kind: "secret",
        help: "Dans la connexion, cochez Lire le contenu, Lire les commentaires et Lire les informations des utilisateurs, adresses e-mail comprises."
      }
    ],
    keyHelp: "Dans Notion, en tant que propriétaire de l’espace : portail des développeurs (app.notion.com/developers/connections) › nouvelle connexion interne › onglet Configuration, pour copier le secret ; puis, sur chaque page voulue, menu … › Ajouter des connexions.",
    docsUrl: "https://developers.notion.com/guides/get-started/authorization",
    oauthHelp: "Notion vous demande de choisir l’espace, puis les pages à partager avec Leon : seules celles-là seront lues, avec leurs commentaires non résolus. Pour en partager d’autres plus tard, utilisez Reconnecter.",
    warning: "Seules les pages partagées avec la connexion sont lues, avec leurs commentaires non résolus."
  },
  outlook: {
    fields: [],
    keyHelp: "",
    docsUrl: "https://learn.microsoft.com/en-us/graph/auth-v2-user",
    oauthHelp: "Microsoft vous demande « Autoriser Leon à lire votre courrier et votre agenda ? ». Leon ne lit que la boîte de réception, les éléments envoyés et l’agenda, en lecture seule. L’administrateur Microsoft de votre entreprise doit d’abord avoir donné son accord à Leon, une fois pour toute l’entreprise : sans lui, Microsoft refuse la connexion.",
    keyAccepted: false,
    warning: "Le texte des courriers et de l’agenda reste privé, comme une conversation : vous seul le voyez. Les événements personnels, privés ou confidentiels ne sont pas lus."
  },
  pipedrive: {
    fields: [
      {
        name: "company",
        label: "Entreprise Pipedrive",
        kind: "text",
        placeholder: "acme",
        help: "Le début de l’adresse de votre Pipedrive : acme pour acme.pipedrive.com."
      },
      {
        name: "token",
        label: "Jeton d’API personnel",
        kind: "secret",
        help: "Leon lit les notes et les activités que votre compte voit. Si l’option API n’apparaît pas dans vos préférences, un administrateur doit l’activer pour votre compte. Pipedrive limite le nombre d’appels par jour selon votre forfait."
      }
    ],
    keyHelp: "Dans Pipedrive : votre nom en haut à droite › Paramètres de l’entreprise › Préférences personnelles › API.",
    docsUrl: "https://pipedrive.readme.io/docs/how-to-find-the-api-token"
  },
  plain: {
    fields: [
      {
        name: "apiKey",
        label: "Clé d’API",
        kind: "secret",
        placeholder: "plainApiKey_…",
        help: "La clé n’est montrée qu’une fois à sa création. Donnez-lui des droits de lecture seulement."
      }
    ],
    keyHelp: "Dans Plain : Settings › Machine users, créez un utilisateur machine puis ajoutez-lui une clé d’API avec les droits de lecture des fils (thread:read), de leurs messages (timeline:read) et des clients (customer:read).",
    docsUrl: "https://www.plain.com/docs/graphql/authentication"
  },
  plane: {
    fields: [
      {
        name: "apiKey",
        label: "Clé d’API",
        kind: "secret",
        placeholder: "plane_api_…",
        help: "La clé ne s’affiche qu’une fois, à sa création. Elle a les droits de son propriétaire : créez-la avec un compte qui ne voit que les projets voulus."
      },
      {
        name: "workspace",
        label: "Espace de travail",
        kind: "text",
        placeholder: "mon-equipe",
        help: "L’identifiant qui figure dans l’adresse de Plane : dans app.plane.so/mon-equipe/projects/, c’est mon-equipe."
      }
    ],
    keyHelp: "Dans Plane : votre profil › Paramètres du profil › Jetons d’accès personnels › Ajouter un jeton d’accès personnel (donnez-lui un titre et, si vous voulez, une date d’expiration).",
    docsUrl: "https://developers.plane.so/api-reference/v2/authentication",
    warning: "Seul Plane en ligne (app.plane.so) est pris en charge, pas une installation de Plane hébergée par vous."
  },
  productboard: {
    fields: [],
    keyHelp: "",
    docsUrl: "https://developer.productboard.com/reference/oauth-authorization-code",
    oauthHelp: "Productboard vous demande d’autoriser Leon à lire les notes de votre espace. Leon ne demande que la lecture. Seul un Maker administrateur peut accepter, et l’accès à l’API demande un plan Pro ou supérieur.",
    keyAccepted: false,
    warning: "Seul un Maker administrateur peut autoriser Leon."
  },
  sentry: {
    fields: [
      {
        name: "token",
        label: "Jeton d’intégration interne",
        kind: "secret",
        help: "Lecture seule suffit : la portée event:read (problèmes). Leon ne lit ni les traces de pile ni les données des événements."
      },
      {
        name: "organization",
        label: "Organisation",
        kind: "text",
        placeholder: "acme",
        help: "L’identifiant (slug) de l’organisation, visible dans les adresses de Sentry : …/organizations/<identifiant>/."
      },
      {
        name: "region",
        label: "Région des données",
        kind: "select",
        options: [
          {
            value: "sentry.io",
            label: "États-Unis (sentry.io)"
          },
          {
            value: "de.sentry.io",
            label: "Europe (de.sentry.io)"
          }
        ],
        help: "Celle où Sentry stocke les données de l’organisation, indiquée dans ses réglages."
      }
    ],
    keyHelp: "Dans Sentry : Settings › Developer Settings › New Internal Integration, avec la lecture seule (Read) sur les problèmes (Issue & Event) ; le jeton s’affiche à la création et n’expire pas.",
    docsUrl: "https://docs.sentry.io/organization/integrations/integration-platform/internal-integration/",
    warning: "À faire lire avant tout client : le §2.3 b des conditions de Sentry interdit d’utiliser le service pour le compte de tiers."
  },
  shortcut: {
    fields: [
      {
        name: "token",
        label: "Jeton d’API",
        kind: "secret",
        help: "Leon ne fait que lire. Si Shortcut refuse un jeton en lecture seule pour la recherche des histoires, créez-en un avec écriture."
      }
    ],
    keyHelp: "Dans Shortcut : Settings › Your Account › API Tokens, donnez un nom au jeton puis cliquez sur Generate Token. Le jeton est propre à votre compte et à cet espace de travail.",
    docsUrl: "https://developer.shortcut.com/api/rest/v3"
  },
  tldv: {
    fields: [
      {
        name: "apiKey",
        label: "Clé d’API",
        kind: "secret"
      }
    ],
    keyHelp: "Dans tl;dv : Paramètres personnels › Clés d’API (tldv.io/app/settings/personal-settings/api-keys).",
    docsUrl: "https://doc.tldv.io",
    warning: "API réservée aux offres Pro, Business et Entreprise (selon l’offre de l’organisateur de la réunion). Conditions de tl;dv à faire confirmer avant usage client : elles interdisent de copier ou de stocker une partie importante du contenu."
  },
  trello: {
    fields: [
      {
        name: "apiKey",
        label: "Clé d’API",
        kind: "text",
        placeholder: "Clé de votre Power-Up",
        help: "La clé seule ne donne accès à rien : c’est le jeton qui ouvre les tableaux."
      },
      {
        name: "token",
        label: "Jeton",
        kind: "secret",
        help: "Ouvrez https://trello.com/1/authorize?expiration=never&scope=read&response_type=token&key= suivi de votre clé d’API, puis autorisez : la page affiche le jeton (lecture seule, sans expiration). Il donne accès à tous vos tableaux ouverts."
      }
    ],
    keyHelp: "Sur trello.com/apps/admin : créez un Power-Up, générez sa clé d’API (onglet d’authentification), puis obtenez un jeton en lecture seule avec le lien indiqué sous le champ « Jeton ».",
    docsUrl: "https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/"
  },
  zendesk: {
    fields: [
      {
        name: "subdomain",
        label: "Sous-domaine Zendesk",
        kind: "text",
        placeholder: "acme",
        help: "Le début de l’adresse de votre Zendesk : acme pour acme.zendesk.com."
      },
      {
        name: "email",
        label: "E-mail de l’administrateur",
        kind: "text",
        placeholder: "prenom@entreprise.fr",
        help: "L’adresse du compte administrateur qui a créé le jeton."
      },
      {
        name: "apiToken",
        label: "Jeton d’API Zendesk",
        kind: "secret",
        help: "Le jeton agit au nom de cet administrateur ; Leon ne fait que lire. Il lit tous les tickets, notes internes comprises. Zendesk le décrit comme déconseillé au profit d’OAuth, mais il fonctionne toujours."
      }
    ],
    keyHelp: "Dans le Centre d’administration Zendesk : Applications et intégrations › API › API Zendesk › Ajouter un jeton d’API (l’accès par jeton doit être activé).",
    docsUrl: "https://developer.zendesk.com/api-reference/introduction/security-and-auth/",
    warning: "Il faut le jeton d’un administrateur : Zendesk réserve l’export des tickets aux administrateurs."
  }
};
