import { describe, expect, it } from 'vitest';
import { PROVIDER_IDS, type ProviderId } from '@/capture/turn';
import {
  FAMILY_LABELS,
  PROVIDER_FAMILIES,
  PROVIDER_FAMILIES_ORDER,
  PROVIDER_LABELS,
} from './providers';

const ofFamily = (family: string): ProviderId[] =>
  PROVIDER_IDS.filter((id) => PROVIDER_FAMILIES[id] === family);

describe('providers', () => {
  it('donne à chaque outil un libellé non vide et une famille connue', () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDER_LABELS[id], id).toBeTruthy();
      expect(PROVIDER_FAMILIES_ORDER, id).toContain(PROVIDER_FAMILIES[id]);
    }
    expect(Object.keys(PROVIDER_LABELS).sort()).toEqual([...PROVIDER_IDS].sort());
    expect(Object.keys(PROVIDER_FAMILIES).sort()).toEqual([...PROVIDER_IDS].sort());
  });

  it('range les outils dans les familles des lots', () => {
    expect(ofFamily('dev')).toEqual(['github', 'notion', 'linear', 'gitlab', 'sentry']);
    expect(ofFamily('reunions')).toEqual([
      'granola',
      'fathom',
      'fireflies',
      'tldv',
      'circleback',
      'claap',
      'leexi',
      'gong',
    ]);
    expect(ofFamily('projet')).toEqual([
      'jira',
      'confluence',
      'asana',
      'clickup',
      'trello',
      'monday',
      'shortcut',
      'plane',
      'airtable',
      'basecamp',
      'miro',
      'productboard',
      'drive',
      'onedrive',
    ]);
    expect(ofFamily('crm')).toEqual(['hubspot', 'attio', 'folk', 'pipedrive', 'close']);
    expect(ofFamily('support')).toEqual([
      'intercom',
      'zendesk',
      'freshdesk',
      'helpscout',
      'front',
      'plain',
      'crisp',
      'missive',
    ]);
    expect(ofFamily('mails')).toEqual(['outlook', 'gmail', 'slack']);
  });

  it('écrit les noms comme les éditeurs', () => {
    expect(PROVIDER_LABELS.tldv).toBe('tl;dv');
    expect(PROVIDER_LABELS.helpscout).toBe('Help Scout');
    expect(PROVIDER_LABELS.monday).toBe('monday.com');
    expect(PROVIDER_LABELS.clickup).toBe('ClickUp');
    expect(PROVIDER_LABELS.gitlab).toBe('GitLab');
    expect(PROVIDER_LABELS.hubspot).toBe('HubSpot');
    expect(PROVIDER_LABELS.github).toBe('GitHub');
    expect(PROVIDER_LABELS.basecamp).toBe('Basecamp');
    expect(PROVIDER_LABELS.miro).toBe('Miro');
    expect(PROVIDER_LABELS.productboard).toBe('Productboard');
    expect(PROVIDER_LABELS.outlook).toBe('Outlook');
    expect(PROVIDER_LABELS.drive).toBe('Google Drive');
    expect(PROVIDER_LABELS.onedrive).toBe('OneDrive / SharePoint');
  });

  it('nomme les familles, dans leur ordre', () => {
    expect(PROVIDER_FAMILIES_ORDER.map((family) => FAMILY_LABELS[family])).toEqual([
      'Dev',
      'Réunions',
      'Projet',
      'CRM',
      'Support',
      'Mails, chat et agenda',
    ]);
  });
});
