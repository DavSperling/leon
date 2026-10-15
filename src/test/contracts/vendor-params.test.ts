import { describe, expect, it } from 'vitest';
import { asanaClient } from '@/server/connectors/asana/client';
import { asanaConnector } from '@/server/connectors/asana/connector';
import tasksEmpty from '@/server/connectors/asana/fixtures/tasks-empty.json';
import { testHttp } from '../fake-fetch';
import { callProblems, loadVendorSpec, type SentCall, type VendorSpec } from './vendor-spec';

// Les connecteurs envoient des requêtes que les fausses réponses de leurs tests ne contrôlent pas :
// un paramètre mal nommé ou une valeur d'opt_fields que l'API refuse passent tant que la fixture
// répond. testHttp confronte donc chaque requête à l'extrait de la spec officielle du fournisseur
// (vendor-specs/<id>.json) ; ces tests vérifient le contrôle lui-même et son extrait Asana.

const SPECS = ['jira', 'confluence', 'shortcut', 'asana', 'clickup', 'sentry'];
const ASANA = 'https://app.asana.com/api/1.0';

function specOf(id: string): VendorSpec {
  const spec = loadVendorSpec(id);
  if (!spec) throw new Error(`extrait manquant : ${id}`);
  return spec;
}

const get = (url: string): SentCall => ({ method: 'GET', url });

describe('extraits des specs officielles', () => {
  it.each(SPECS)('%s : un extrait versionné, avec sa source', (id) => {
    const spec = specOf(id);
    expect(spec.sources.length).toBeGreaterThan(0);
    expect(spec.versions).toHaveLength(spec.sources.length);
    expect(Object.keys(spec.operations).length).toBeGreaterThan(0);
  });

  it('un connecteur sans extrait n’est pas contrôlé', () => {
    expect(loadVendorSpec('inconnu')).toBeUndefined();
  });
});

describe('callProblems', () => {
  const asana = specOf('asana');

  it('laisse passer une requête que la spec décrit, variable de chemin comprise', () => {
    const call = get(`${ASANA}/tasks/4001/stories?resource_subtype=comment_added&limit=100`);
    expect(callProblems(asana, call)).toEqual([]);
  });

  it('refuse un chemin ou une méthode que la spec ne décrit pas', () => {
    expect(callProblems(asana, get(`${ASANA}/taches`))).toHaveLength(1);
    expect(callProblems(asana, { method: 'POST', url: `${ASANA}/tasks` })).toHaveLength(1);
  });

  it('refuse un paramètre que la spec ne cite pas', () => {
    expect(callProblems(asana, get(`${ASANA}/tasks?project=1&since=2026-01-01`))).toEqual([
      'paramètre « since » absent de la spec',
    ]);
  });

  it('contrôle chaque valeur d’une liste, séparée par des virgules ou répétée', () => {
    const fields = `${ASANA}/tasks?opt_fields=name,notes,created_by.name`;
    expect(callProblems(asana, get(fields))).toEqual([
      'valeur « created_by.name » absente de la spec pour « opt_fields »',
    ]);
    const repeated = `${ASANA}/tasks?opt_fields=name&opt_fields=created_by`;
    expect(callProblems(asana, get(repeated))).toEqual([]);
  });

  it('retire le préfixe de la passerelle Atlassian avant de chercher l’opération', () => {
    const gateway = 'https://api.atlassian.com/ex';
    const id = '1324a887-45db-1bf4-1e99-ef0ff456d421';
    const jira = specOf('jira');
    const confluence = specOf('confluence');

    expect(callProblems(jira, get(`${gateway}/jira/${id}/rest/api/3/myself`))).toEqual([]);
    expect(callProblems(confluence, get(`${gateway}/confluence/${id}/wiki/api/v2/pages`))).toEqual(
      [],
    );
    expect(callProblems(jira, get(`${gateway}/jira/${id}/rest/api/3/inconnu`))).toHaveLength(1);
    expect(callProblems(jira, get(`${gateway}/jira/${id}/rest/api/3/myself?since=1`))).toEqual([
      'paramètre « since » absent de la spec',
    ]);
  });

  it('ne retire ce préfixe que sur la passerelle Atlassian', () => {
    const site = 'https://acme.atlassian.net/ex/jira/1324a887/rest/api/3/myself';

    expect(callProblems(specOf('jira'), get(site))).toHaveLength(1);
  });

  it('refuse un champ de corps que la spec ne cite pas', () => {
    const shortcut = specOf('shortcut');
    const url = 'https://api.app.shortcut.com/api/v3/stories/search';
    const body = { updated_at_start: '2026-01-01T00:00:00Z', includes_description: true };
    expect(callProblems(shortcut, { method: 'POST', url, body })).toEqual([]);
    expect(callProblems(shortcut, { method: 'POST', url, body: { ...body, since: 1 } })).toEqual([
      'champ de corps « since » absent de la spec',
    ]);
  });
});

describe('asana : GET /tasks', () => {
  it('ne demande que des opt_fields que la doc liste', async () => {
    const config = { token: 'jeton-de-test-0123456789' };
    const route = { url: `${ASANA}/tasks`, json: tasksEmpty };
    const { http, calls } = testHttp(asanaConnector, config, [route]);

    await asanaClient(config.token, http).tasks('3001', '2026-09-15T00:00:00.000Z', null);

    expect(calls).toHaveLength(1);
    expect(callProblems(specOf('asana'), calls[0] as SentCall)).toEqual([]);
  });
});
