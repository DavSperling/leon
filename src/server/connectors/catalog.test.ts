import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { PROVIDER_IDS } from '@/capture/turn';
import { PROVIDER_FAMILIES, PROVIDER_FAMILIES_ORDER, PROVIDER_LABELS } from '@/lib/providers';
import { fakeOAuthConnector } from '@/test/fake-oauth-connector';
import { catalogItem, listCatalog } from './catalog';
import { redirectUri } from './oauth';
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
  // La clé n'est expliquée que si l'outil l'accepte ; le bouton, lui, doit toujours l'être.
  const keyAccepted = entry.keyAccepted ?? true;
  if (keyAccepted && entry.keyHelp.trim() === '') problems.push('aide vide');
  if (!keyAccepted && secrets.length > 0) problems.push('outil sans clé : champ secret');
  if (!keyAccepted && !connector.oauth) problems.push('ni clé ni bouton');
  if (connector.oauth && !entry.oauthHelp?.trim()) problems.push('aide du bouton vide');
  // Les champs demandés avant le clic : dans le schéma, et visibles (jamais un secret).
  for (const name of connector.oauth?.preFields ?? []) {
    const field = entry.fields.find((candidate) => candidate.name === name);
    if (!keys.includes(name) || !field || field.kind === 'secret') {
      problems.push(`champ avant le clic : ${name}`);
    }
  }
  if (!entry.docsUrl.startsWith('https://')) problems.push('lien de la doc');
  return problems;
}

describe('listCatalog', () => {
  const items = listCatalog();

  it('rend les 39 outils, une fois chacun', () => {
    expect(items).toHaveLength(39);
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
      'Basecamp',
      'ClickUp',
      'Confluence',
      'GitLab',
      'Jira',
      'Miro',
      'monday.com',
      'Plane',
      'Productboard',
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
    expect(labelsOf('mails')).toEqual(['Outlook']);
  });

  it('marque disponible un outil dont le connecteur existe', () => {
    for (const item of items) {
      expect(item.available).toBe(getConnector(item.id) !== null);
    }
  });

  it('lit le bouton de chaque outil dans son connecteur', () => {
    for (const item of items) {
      const spec = getConnector(item.id)?.oauth;
      expect(item.oauthPreFields).toEqual(spec?.preFields ?? []);
      if (!spec) expect(item.oauthReady).toBe(false);
    }
  });
});

describe('catalogItem : le bouton', () => {
  afterEach(() => vi.unstubAllEnvs());

  const entry: CatalogEntry = {
    id: 'github',
    fields: [
      { name: 'token', label: 'Jeton', kind: 'secret' },
      { name: 'repos', label: 'Dépôts', kind: 'list' },
    ],
    keyHelp: 'Sur github.com : Settings › Developer settings.',
    docsUrl: 'https://docs.github.com/',
    triedForReal: false,
    oauthHelp: 'GitHub demandera les dépôts à partager.',
  };
  const withApp = () => {
    vi.stubEnv('LEON_OAUTH_GITHUB_ID', 'id-exemple');
    vi.stubEnv('LEON_OAUTH_GITHUB_SECRET', 'secret-exemple');
  };

  it('est prêt quand le connecteur a un bouton et que l’appli est configurée', () => {
    expect(catalogItem(entry, fakeOAuthConnector()).oauthReady).toBe(false);
    withApp();
    expect(catalogItem(entry, fakeOAuthConnector()).oauthReady).toBe(true);
  });

  it('n’est pas prêt avec une paire incomplète, ni sans bouton, ni sans connecteur', () => {
    vi.stubEnv('LEON_OAUTH_GITHUB_ID', 'id-exemple');
    vi.stubEnv('LEON_OAUTH_GITHUB_SECRET', '');
    expect(catalogItem(entry, fakeOAuthConnector()).oauthReady).toBe(false);
    withApp();
    const { oauth: _bouton, ...keyOnly } = fakeOAuthConnector();
    expect(catalogItem(entry, keyOnly).oauthReady).toBe(false);
    expect(catalogItem(entry, null).oauthReady).toBe(false);
  });

  it('accepte la clé sauf si le catalogue dit le contraire', () => {
    expect(catalogItem(entry, fakeOAuthConnector()).keyAccepted).toBe(true);
    expect(catalogItem({ ...entry, keyAccepted: true }, null).keyAccepted).toBe(true);
    expect(catalogItem({ ...entry, keyAccepted: false }, null).keyAccepted).toBe(false);
  });

  it('rend les champs demandés avant le clic, ou aucun sans bouton', () => {
    expect(catalogItem(entry, fakeOAuthConnector()).oauthPreFields).toEqual(['repos']);
    expect(catalogItem(entry, null).oauthPreFields).toEqual([]);
  });

  it('garde l’aide du bouton du catalogue', () => {
    expect(catalogItem(entry, fakeOAuthConnector()).oauthHelp).toBe(entry.oauthHelp);
  });

  describe('lien d’accord de l’administrateur', () => {
    const connector = (): AnyConnector => {
      const base = fakeOAuthConnector();
      return {
        ...base,
        oauth: {
          ...(base.oauth as NonNullable<AnyConnector['oauth']>),
          adminConsent: {
            isConsentError: () => false,
            url: (clientId, uri) =>
              `https://login.test/adminconsent?client_id=${clientId}&redirect_uri=${encodeURIComponent(uri)}`,
          },
        },
      };
    };

    it('porte l’identifiant de l’appli et l’adresse de retour quand l’appli est configurée', () => {
      withApp();
      const item = catalogItem(entry, connector());
      const spec = connector().oauth as NonNullable<AnyConnector['oauth']>;
      expect(item.adminConsentUrl).toBe(
        `https://login.test/adminconsent?client_id=id-exemple&redirect_uri=${encodeURIComponent(redirectUri(spec))}`,
      );
    });

    it('est nul sans appli configurée, ou pour un outil sans accord administrateur', () => {
      expect(catalogItem(entry, connector()).adminConsentUrl).toBeNull();
      withApp();
      expect(catalogItem(entry, fakeOAuthConnector()).adminConsentUrl).toBeNull();
      expect(catalogItem(entry, null).adminConsentUrl).toBeNull();
    });
  });

  it('ne laisse jamais le secret de l’appli dans ce que reçoit l’interface', () => {
    withApp();
    const { oauth, ...rest } = fakeOAuthConnector();
    const spec = oauth as NonNullable<typeof oauth>;
    const item = catalogItem(entry, {
      ...rest,
      oauth: {
        ...spec,
        adminConsent: { isConsentError: () => false, url: (id) => `https://x.test/?c=${id}` },
      },
    });
    expect(JSON.stringify(item)).not.toContain('secret-exemple');
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

  const oauthSample: AnyConnector = fakeOAuthConnector();
  const oauthEntry: CatalogEntry = {
    id: 'github',
    fields: [
      { name: 'token', label: 'Jeton', kind: 'secret' },
      { name: 'repos', label: 'Dépôts', kind: 'list' },
    ],
    keyHelp: 'Sur github.com : Settings › Developer settings.',
    docsUrl: 'https://docs.github.com/',
    triedForReal: false,
    oauthHelp: 'GitHub demandera les dépôts à partager.',
  };

  it('ne trouve rien à redire à un outil à bouton bien décrit', () => {
    expect(catalogProblems(oauthEntry, oauthSample)).toEqual([]);
  });

  it('exige l’aide du bouton seulement d’un connecteur qui en a un', () => {
    expect(catalogProblems({ ...oauthEntry, oauthHelp: undefined }, oauthSample)).toContain(
      'aide du bouton vide',
    );
    expect(catalogProblems({ ...oauthEntry, oauthHelp: ' ' }, oauthSample)).toContain(
      'aide du bouton vide',
    );
    expect(catalogProblems({ ...entry, oauthHelp: undefined }, sample)).toEqual([]);
  });

  it('exige l’aide de la clé seulement d’un outil qui l’accepte', () => {
    const buttonOnly = { ...oauthEntry, keyHelp: '', keyAccepted: false };
    const noKey: AnyConnector = { ...oauthSample, secretFields: [] };
    const noKeyEntry = {
      ...buttonOnly,
      fields: oauthEntry.fields.filter((f) => f.kind !== 'secret'),
    };
    expect(catalogProblems(noKeyEntry, noKey)).toEqual([]);
    expect(catalogProblems({ ...oauthEntry, keyHelp: '' }, oauthSample)).toContain('aide vide');
  });

  it('repère un outil sans clé qui garde un champ secret, ou qui n’a pas de bouton', () => {
    expect(catalogProblems({ ...oauthEntry, keyAccepted: false }, oauthSample)).toContain(
      'outil sans clé : champ secret',
    );
    const { oauth: _bouton, ...keyOnly } = oauthSample;
    expect(
      catalogProblems(
        { ...oauthEntry, keyAccepted: false, fields: [], oauthHelp: undefined },
        {
          ...keyOnly,
          secretFields: [],
        },
      ),
    ).toContain('ni clé ni bouton');
  });

  it('repère un champ avant le clic absent du schéma, absent du catalogue ou secret', () => {
    const asking = (preFields: string[]): AnyConnector => ({
      ...oauthSample,
      oauth: { ...(oauthSample.oauth as NonNullable<AnyConnector['oauth']>), preFields },
    });
    expect(catalogProblems(oauthEntry, asking(['repos', 'inconnu']))).toEqual([
      'champ avant le clic : inconnu',
    ]);
    expect(catalogProblems(oauthEntry, asking(['token']))).toEqual(['champ avant le clic : token']);
    const hidden = { ...oauthEntry, fields: oauthEntry.fields.filter((f) => f.name !== 'repos') };
    expect(catalogProblems(hidden, asking(['repos']))).toEqual(['champ avant le clic : repos']);
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
