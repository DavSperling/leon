import type { ProviderId } from '@/capture/turn';
import { airtableConnector } from './airtable/connector';
import { asanaConnector } from './asana/connector';
import { attioConnector } from './attio/connector';
import { basecampConnector } from './basecamp/connector';
import { circlebackConnector } from './circleback/connector';
import { claapConnector } from './claap/connector';
import { clickupConnector } from './clickup/connector';
import { closeConnector } from './close/connector';
import { confluenceConnector } from './confluence/connector';
import { crispConnector } from './crisp/connector';
import { fathomConnector } from './fathom/connector';
import { firefliesConnector } from './fireflies/connector';
import { folkConnector } from './folk/connector';
import { freshdeskConnector } from './freshdesk/connector';
import { frontConnector } from './front/connector';
import { githubConnector } from './github/connector';
import { gitlabConnector } from './gitlab/connector';
import { gongConnector } from './gong/connector';
import { granolaConnector } from './granola/connector';
import { helpscoutConnector } from './helpscout/connector';
import { hubspotConnector } from './hubspot/connector';
import { intercomConnector } from './intercom/connector';
import { jiraConnector } from './jira/connector';
import { leexiConnector } from './leexi/connector';
import { linearConnector } from './linear/connector';
import { miroConnector } from './miro/connector';
import { missiveConnector } from './missive/connector';
import { mondayConnector } from './monday/connector';
import { notionConnector } from './notion/connector';
import { outlookConnector } from './outlook/connector';
import { pipedriveConnector } from './pipedrive/connector';
import { plainConnector } from './plain/connector';
import { planeConnector } from './plane/connector';
import { productboardConnector } from './productboard/connector';
import { sentryConnector } from './sentry/connector';
import { shortcutConnector } from './shortcut/connector';
import { tldvConnector } from './tldv/connector';
import { trelloConnector } from './trello/connector';
import type { AnyConnector } from './types';
import { zendeskConnector } from './zendesk/connector';

// Les 39 connecteurs, un par outil. Un bouchon (null) apparaît « bientôt » dans l'interface.
export const CONNECTORS: Record<ProviderId, AnyConnector | null> = {
  github: githubConnector,
  notion: notionConnector,
  linear: linearConnector,
  granola: granolaConnector,
  fathom: fathomConnector,
  fireflies: firefliesConnector,
  tldv: tldvConnector,
  circleback: circlebackConnector,
  claap: claapConnector,
  leexi: leexiConnector,
  gong: gongConnector,
  jira: jiraConnector,
  confluence: confluenceConnector,
  gitlab: gitlabConnector,
  asana: asanaConnector,
  clickup: clickupConnector,
  trello: trelloConnector,
  monday: mondayConnector,
  shortcut: shortcutConnector,
  plane: planeConnector,
  airtable: airtableConnector,
  sentry: sentryConnector,
  hubspot: hubspotConnector,
  attio: attioConnector,
  folk: folkConnector,
  pipedrive: pipedriveConnector,
  close: closeConnector,
  intercom: intercomConnector,
  zendesk: zendeskConnector,
  freshdesk: freshdeskConnector,
  helpscout: helpscoutConnector,
  front: frontConnector,
  plain: plainConnector,
  crisp: crispConnector,
  missive: missiveConnector,
  basecamp: basecampConnector,
  miro: miroConnector,
  productboard: productboardConnector,
  outlook: outlookConnector,
};

export function getConnector(id: ProviderId): AnyConnector | null {
  return CONNECTORS[id];
}
