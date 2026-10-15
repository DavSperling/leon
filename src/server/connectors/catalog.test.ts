import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PROVIDER_IDS } from '@/capture/turn';
import { PROVIDER_FAMILIES, PROVIDER_FAMILIES_ORDER, PROVIDER_LABELS } from '@/lib/providers';
import { listCatalog } from './catalog';
import { CONNECTORS, getConnector } from './registry';
import type { AnyConnector, CatalogEntry, Connector } from './types';

// Les écarts entre la partie publique d'un connecteur et le connecteur lui-même.
function catalogProblems(entry: CatalogEntry, connector: AnyConnector): string[] {
  const problems: string[] = [];
  const keys = Object.keys((connector.configSchema as z.ZodObject).shape);
  const secrets = entry.fields.filter((f) => f.kind === 'secret').map((f) => f.name);
  if ([...secrets].sort().join() !== [...connector.secretFields].sort().join()) {
    problems.push('champs secrets');
  }
  for (const field of entry.fields) {
    if (!keys.includes(field.name)) problems.push(`champ inconnu : ${field.name}`);
  }
  if (entry.keyHelp.trim() === '') problems.push('aide vide');
  if (!entry.docsUrl.startsWith('https://')) problems.push('lien de la doc');
  return problems;
}

describe('listCatalog', () => {
  const items = listCatalog();

  it('rend les 35 outils, une fois chacun', () => {
    expect(items).toHaveLength(35);
    expect(items.map((item) => item.id).sort()).toEqual([...PROVIDER_IDS].sort());
  });

  it('ajoute le libellé et la famille de chaque outil', () => {
    for (const item of items) {
      expect(item.label).toBe(PROVIDER_LABELS[item.id]);
      expect(item.family).toBe(PROVIDER_FAMILIES[item.id]);
    }
  });

  it('ordonne par famille, puis par libellé', () => {
    const labelsOf = (family: string) =>
      items.filter((item) => item.family === family).map((item) => item.label);

    expect(items.map((item) => PROVIDER_FAMILIES_ORDER.indexOf(item.family))).toEqual(
      items.map((item) => PROVIDER_FAMILIES_ORDER.indexOf(item.family)).sort((a, b) => a - b),
    );
    expect(labelsOf('dev')).toEqual(['GitHub', 'Linear', 'Notion']);
    expect(labelsOf('reunions')).toEqual([
      'Circleback',
      'Claap',
      'Fathom',
      'Fireflies',
      'Gong',
      'Granola',
      'Leexi',
      'tl;dv',
    ]);
    expect(labelsOf('projet')).toEqual([
      'Airtable',
      'Asana',
      'ClickUp',
      'Confluence',
      'GitLab',
      'Jira',
      'monday.com',
      'Plane',
      'Sentry',
      'Shortcut',
      'Trello',
    ]);
    expect(labelsOf('crm')).toEqual(['Attio', 'Close', 'folk', 'HubSpot', 'Pipedrive']);
    expect(labelsOf('support')).toEqual([
      'Crisp',
      'Freshdesk',
      'Front',
      'Help Scout',
      'Intercom',
      'Missive',
      'Plain',
      'Zendesk',
    ]);
  });

  it('marque disponible un outil dont le connecteur existe', () => {
    for (const item of items) {
      expect(item.available).toBe(getConnector(item.id) !== null);
    }
  });
});

describe('registre', () => {
  it('range chaque connecteur sous son identifiant', () => {
    expect(Object.keys(CONNECTORS).sort()).toEqual([...PROVIDER_IDS].sort());
    for (const id of PROVIDER_IDS) {
      const connector = getConnector(id);
      if (connector) expect(connector.id).toBe(id);
    }
  });
});

describe('catalogue et connecteur', () => {
  it('est cohérent pour chaque connecteur disponible', () => {
    const entries = new Map(listCatalog().map((item) => [item.id, item]));
    for (const id of PROVIDER_IDS) {
      const connector = getConnector(id);
      const entry = entries.get(id);
      if (!connector || !entry) continue;
      expect({ id, problems: catalogProblems(entry, connector) }).toEqual({ id, problems: [] });
    }
  });

  // Un exemple typé : un Connector<Config> doit rester assignable à AnyConnector.
  const jira: Connector<{ site: string; token: string }> = {
    id: 'jira',
    configSchema: z.object({ site: z.string(), token: z.string() }),
    secretFields: ['token'],
    hosts: (config) => [`${config.site}.atlassian.net`],
    verify: async () => ({ account: 'Marie' }),
    async *sync() {},
  };
  const sample: AnyConnector = jira;
  const entry: CatalogEntry = {
    id: 'jira',
    fields: [
      { name: 'site', label: 'Site Atlassian', kind: 'text' },
      { name: 'token', label: 'Jeton d’API', kind: 'secret' },
    ],
    keyHelp: 'Dans Atlassian : Sécurité › Jetons d’API.',
    docsUrl: 'https://support.atlassian.com/',
    triedForReal: false,
  };

  it('ne trouve rien à redire à un catalogue juste', () => {
    expect(catalogProblems(entry, sample)).toEqual([]);
  });

  it('repère un secret oublié, un champ inconnu, une aide vide et un lien non sécurisé', () => {
    const forgotten = { ...entry, fields: entry.fields.filter((f) => f.kind !== 'secret') };
    expect(catalogProblems(forgotten, sample)).toContain('champs secrets');
    const stray = {
      ...entry,
      fields: [...entry.fields, { name: 'site2', label: 'x', kind: 'text' as const }],
    };
    expect(catalogProblems(stray, sample)).toContain('champ inconnu : site2');
    const extra = {
      ...entry,
      fields: [...entry.fields, { name: 'site', label: 'Site', kind: 'secret' as const }],
    };
    expect(catalogProblems(extra, sample)).toContain('champs secrets');
    expect(catalogProblems({ ...entry, keyHelp: ' ' }, sample)).toContain('aide vide');
    expect(catalogProblems({ ...entry, docsUrl: 'http://x.test' }, sample)).toContain(
      'lien de la doc',
    );
  });
});
