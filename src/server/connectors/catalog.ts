import { PROVIDER_IDS, type ProviderId } from '@/capture/turn';
import {
  PROVIDER_FAMILIES,
  PROVIDER_FAMILIES_ORDER,
  PROVIDER_LABELS,
  type ProviderFamily,
} from '@/lib/providers';
import { airtableCatalog } from './airtable/catalog';
import { asanaCatalog } from './asana/catalog';
import { attioCatalog } from './attio/catalog';
import { circlebackCatalog } from './circleback/catalog';
import { claapCatalog } from './claap/catalog';
import { clickupCatalog } from './clickup/catalog';
import { closeCatalog } from './close/catalog';
import { confluenceCatalog } from './confluence/catalog';
import { crispCatalog } from './crisp/catalog';
import { fathomCatalog } from './fathom/catalog';
import { firefliesCatalog } from './fireflies/catalog';
import { folkCatalog } from './folk/catalog';
import { freshdeskCatalog } from './freshdesk/catalog';
import { frontCatalog } from './front/catalog';
import { githubCatalog } from './github/catalog';
import { gitlabCatalog } from './gitlab/catalog';
import { gongCatalog } from './gong/catalog';
import { granolaCatalog } from './granola/catalog';
import { helpscoutCatalog } from './helpscout/catalog';
import { hubspotCatalog } from './hubspot/catalog';
import { intercomCatalog } from './intercom/catalog';
import { jiraCatalog } from './jira/catalog';
import { leexiCatalog } from './leexi/catalog';
import { linearCatalog } from './linear/catalog';
import { missiveCatalog } from './missive/catalog';
import { mondayCatalog } from './monday/catalog';
import { notionCatalog } from './notion/catalog';
import { pipedriveCatalog } from './pipedrive/catalog';
import { plainCatalog } from './plain/catalog';
import { planeCatalog } from './plane/catalog';
import { getConnector } from './registry';
import { sentryCatalog } from './sentry/catalog';
import { shortcutCatalog } from './shortcut/catalog';
import { tldvCatalog } from './tldv/catalog';
import { trelloCatalog } from './trello/catalog';
import type { CatalogEntry } from './types';
import { zendeskCatalog } from './zendesk/catalog';

export type { CatalogEntry, CatalogField } from './types';

export type CatalogItem = CatalogEntry & {
  label: string;
  family: ProviderFamily;
  available: boolean; // le connecteur existe (sinon « bientôt »)
};

const ENTRIES: Record<ProviderId, CatalogEntry> = {
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
};

// Par famille, puis par libellé.
export function listCatalog(): CatalogItem[] {
  return PROVIDER_IDS.map((id) => ENTRIES[id])
    .map((entry) => ({
      ...entry,
      label: PROVIDER_LABELS[entry.id],
      family: PROVIDER_FAMILIES[entry.id],
      available: getConnector(entry.id) !== null,
    }))
    .sort(
      (a, b) =>
        PROVIDER_FAMILIES_ORDER.indexOf(a.family) - PROVIDER_FAMILIES_ORDER.indexOf(b.family) ||
        a.label.localeCompare(b.label, 'fr'),
    );
}
