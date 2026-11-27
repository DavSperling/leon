import { PROVIDER_IDS, type ProviderId } from '@/capture/turn';
import type { OAuthReturnPath } from '@/lib/connection-form';
import {
  PROVIDER_FAMILIES,
  PROVIDER_FAMILIES_ORDER,
  PROVIDER_LABELS,
  type ProviderFamily,
} from '@/lib/providers';
import { airtableCatalog } from './airtable/catalog';
import { asanaCatalog } from './asana/catalog';
import { attioCatalog } from './attio/catalog';
import { basecampCatalog } from './basecamp/catalog';
import { circlebackCatalog } from './circleback/catalog';
import { claapCatalog } from './claap/catalog';
import { clickupCatalog } from './clickup/catalog';
import { closeCatalog } from './close/catalog';
import { confluenceCatalog } from './confluence/catalog';
import { crispCatalog } from './crisp/catalog';
import { driveCatalog } from './drive/catalog';
import { fathomCatalog } from './fathom/catalog';
import { firefliesCatalog } from './fireflies/catalog';
import { folkCatalog } from './folk/catalog';
import { freshdeskCatalog } from './freshdesk/catalog';
import { frontCatalog } from './front/catalog';
import { githubCatalog } from './github/catalog';
import { gitlabCatalog } from './gitlab/catalog';
import { gmailCatalog } from './gmail/catalog';
import { gongCatalog } from './gong/catalog';
import { granolaCatalog } from './granola/catalog';
import { helpscoutCatalog } from './helpscout/catalog';
import { hubspotCatalog } from './hubspot/catalog';
import { intercomCatalog } from './intercom/catalog';
import { jiraCatalog } from './jira/catalog';
import { leexiCatalog } from './leexi/catalog';
import { linearCatalog } from './linear/catalog';
import { miroCatalog } from './miro/catalog';
import { missiveCatalog } from './missive/catalog';
import { mondayCatalog } from './monday/catalog';
import { notionCatalog } from './notion/catalog';
import { redirectUri } from './oauth';
import { oauthClient } from './oauth-env';
import { onedriveCatalog } from './onedrive/catalog';
import { outlookCatalog } from './outlook/catalog';
import { pipedreamEnv } from './pipedream';
import { pipedriveCatalog } from './pipedrive/catalog';
import { plainCatalog } from './plain/catalog';
import { planeCatalog } from './plane/catalog';
import { productboardCatalog } from './productboard/catalog';
import { getConnector } from './registry';
import { sentryCatalog } from './sentry/catalog';
import { shortcutCatalog } from './shortcut/catalog';
import { slackCatalog } from './slack/catalog';
import { tldvCatalog } from './tldv/catalog';
import { trelloCatalog } from './trello/catalog';
import type { AnyConnector, CatalogEntry } from './types';
import { zendeskCatalog } from './zendesk/catalog';

export type { CatalogEntry, CatalogField } from './types';

export type CatalogItem = Omit<CatalogEntry, 'keyAccepted' | 'en'> & {
  label: string;
  family: ProviderFamily;
  available: boolean; // le connecteur existe (sinon « bientôt »)
  privateRaw: boolean; // le texte lu reste privé à qui branche (boîte mail, Drive, Slack)
  // Le connecteur a un bouton et son appli (ou Pipedream) est configurée sur ce serveur.
  oauthReady: boolean;
  keyAccepted: boolean; // la clé collée reste possible
  oauthPreFields: string[]; // champs non secrets à remplir avant le clic
  // Lien d'accord de l'administrateur (Outlook, OneDrive). L'identifiant d'une appli n'est pas un secret ;
  // son secret ne sort jamais d'ici.
  adminConsentUrl: string | null;
};

export const CATALOG_ENTRIES: Record<ProviderId, CatalogEntry> = {
  github: githubCatalog,
  notion: notionCatalog,
  linear: linearCatalog,
  granola: granolaCatalog,
  fathom: fathomCatalog,
  fireflies: firefliesCatalog,
  tldv: tldvCatalog,
  circleback: circlebackCatalog,
  claap: claapCatalog,
  leexi: leexiCatalog,
  gong: gongCatalog,
  jira: jiraCatalog,
  confluence: confluenceCatalog,
  gitlab: gitlabCatalog,
  asana: asanaCatalog,
  clickup: clickupCatalog,
  trello: trelloCatalog,
  monday: mondayCatalog,
  shortcut: shortcutCatalog,
  plane: planeCatalog,
  airtable: airtableCatalog,
  sentry: sentryCatalog,
  hubspot: hubspotCatalog,
  attio: attioCatalog,
  folk: folkCatalog,
  pipedrive: pipedriveCatalog,
  close: closeCatalog,
  intercom: intercomCatalog,
  zendesk: zendeskCatalog,
  freshdesk: freshdeskCatalog,
  helpscout: helpscoutCatalog,
  front: frontCatalog,
  plain: plainCatalog,
  crisp: crispCatalog,
  missive: missiveCatalog,
  basecamp: basecampCatalog,
  miro: miroCatalog,
  productboard: productboardCatalog,
  outlook: outlookCatalog,
  gmail: gmailCatalog,
  drive: driveCatalog,
  slack: slackCatalog,
  onedrive: onedriveCatalog,
};

// Les textes de l'entrée dans la langue demandée : l'anglais vient du bloc `en`, tout autre code garde
// le français. Le bloc `en` lui-même ne sort jamais d'ici.
function localized(entry: CatalogEntry, locale: string): Omit<CatalogEntry, 'en'> {
  const { en, ...french } = entry;
  if (locale !== 'en') return french;
  return {
    ...french,
    keyHelp: en.keyHelp,
    oauthHelp: en.oauthHelp,
    warning: en.warning,
    fields: french.fields.map((field) => {
      const text = en.fields[field.name];
      return {
        ...field,
        label: text?.label ?? field.label,
        placeholder: text?.placeholder ?? field.placeholder,
        help: text?.help,
        options: field.options?.map((option) => ({
          ...option,
          label: text?.options?.[option.value] ?? option.label,
        })),
      };
    }),
  };
}

export function catalogItem(
  entry: CatalogEntry,
  connector: AnyConnector | null,
  locale = 'en',
  returnTo?: OAuthReturnPath,
): CatalogItem {
  const spec = connector?.oauth;
  const client = spec ? oauthClient(spec.appKey) : null;
  return {
    ...localized(entry, locale),
    label: PROVIDER_LABELS[entry.id],
    family: PROVIDER_FAMILIES[entry.id],
    available: connector !== null,
    privateRaw: connector?.privateRaw === true,
    oauthReady: client !== null || (connector?.pipedream !== undefined && pipedreamEnv() !== null),
    keyAccepted: entry.keyAccepted ?? true,
    oauthPreFields: spec?.preFields ?? [],
    adminConsentUrl:
      spec && client
        ? (spec.adminConsent?.url(client.id, redirectUri(spec), returnTo) ?? null)
        : null,
  };
}

// Par famille, puis par libellé. `locale` : la langue de l'interface (l'anglais par défaut). `returnTo` : la page
// où revient le lien d'accord de l'administrateur, si ce n'est pas Connexions.
export function listCatalog(locale = 'en', returnTo?: OAuthReturnPath): CatalogItem[] {
  return PROVIDER_IDS.map((id) =>
    catalogItem(CATALOG_ENTRIES[id], getConnector(id), locale, returnTo),
  ).sort(
    (a, b) =>
      PROVIDER_FAMILIES_ORDER.indexOf(a.family) - PROVIDER_FAMILIES_ORDER.indexOf(b.family) ||
      a.label.localeCompare(b.label, locale),
  );
}
