import { describe, expect, it } from 'vitest';
import {
  fieldsFromForm,
  inputTypeFor,
  invalidFieldsMessage,
  otherOwnersNote,
  resultMessage,
  statusLine,
} from './connection-form';

const NOW = new Date('2026-10-15T12:00:00Z');
const MINUTE = 60_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const FIELDS = [
  { name: 'token', label: "Clé d'API", kind: 'secret' },
  { name: 'repos', label: 'Dépôts', kind: 'list' },
  { name: 'site', label: 'Site', kind: 'text' },
  { name: 'plan', label: 'Formule', kind: 'select' },
] as const;
const catalogFields = [...FIELDS];

describe('inputTypeFor', () => {
  it('masque la saisie d’un secret et choisit le bon champ pour les autres', () => {
    expect(inputTypeFor({ kind: 'secret' })).toBe('password');
    expect(inputTypeFor({ kind: 'text' })).toBe('text');
    expect(inputTypeFor({ kind: 'list' })).toBe('textarea');
    expect(inputTypeFor({ kind: 'select' })).toBe('select');
  });
});

describe('fieldsFromForm', () => {
  it('découpe les champs en liste par ligne, retire les lignes vides et les espaces', () => {
    const result = fieldsFromForm(catalogFields, { repos: 'acme/leon\r\n\n  acme/site  \n' });

    expect(result.repos).toEqual(['acme/leon', 'acme/site']);
  });

  it('retire les espaces et le retour à la ligne d’une clé collée', () => {
    expect(
      fieldsFromForm(catalogFields, { token: '  ghp_exemple\n', site: ' acme ' }),
    ).toMatchObject({ token: 'ghp_exemple', site: 'acme' });
  });

  it('omet un champ vide, mais rend une liste vide pour une liste vide', () => {
    const result = fieldsFromForm(catalogFields, { token: '   ', site: '' });

    expect(result).toEqual({ repos: [] });
  });

  it('ne garde que les champs du catalogue', () => {
    const result = fieldsFromForm(catalogFields, { token: 'abc', status: 'paused', secret: 'x' });

    expect(Object.keys(result).sort()).toEqual(['repos', 'token']);
  });
});

describe('invalidFieldsMessage', () => {
  it('nomme les champs à vérifier par leur libellé, dans l’ordre du formulaire, sans doublon', () => {
    expect(invalidFieldsMessage(catalogFields, ['repos', 'token', 'token'])).toBe(
      "Vérifiez les champs : Clé d'API, Dépôts",
    );
  });

  it('ignore un nom inconnu et ne dit rien d’autre qu’un libellé', () => {
    expect(invalidFieldsMessage(catalogFields, ['inconnu'])).toBe('Vérifiez les champs saisis.');
    expect(invalidFieldsMessage(catalogFields, [])).toBe('Vérifiez les champs saisis.');
  });
});

describe('statusLine', () => {
  const view = (override: Partial<Parameters<typeof statusLine>[0]>) => ({
    status: 'active' as const,
    lastSyncAt: ago(4 * MINUTE),
    itemsSynced: 128,
    lastError: null,
    ...override,
  });

  it('dit le dernier passage et le nombre d’éléments d’une connexion active', () => {
    expect(statusLine(view({}), NOW)).toBe('Actif · dernier passage il y a 4 min · 128 éléments');
  });

  it('met « élément » au singulier jusqu’à un', () => {
    expect(statusLine(view({ itemsSynced: 1 }), NOW)).toContain('· 1 élément');
    expect(statusLine(view({ itemsSynced: 0 }), NOW)).toContain('· 0 élément');
  });

  it('écrit « le » devant une date ancienne', () => {
    expect(statusLine(view({ lastSyncAt: ago(5 * 24 * 60 * MINUTE) }), NOW)).toBe(
      'Actif · dernier passage le 10 oct. 2026 · 128 éléments',
    );
  });

  it('attend le premier passage d’une connexion neuve', () => {
    expect(statusLine(view({ lastSyncAt: null, itemsSynced: 0 }), NOW)).toBe(
      'Actif · premier passage en attente',
    );
  });

  it('dit « En pause »', () => {
    expect(statusLine(view({ status: 'paused' }), NOW)).toBe('En pause');
  });

  it('donne la cause d’une erreur', () => {
    expect(
      statusLine(
        view({
          status: 'error',
          lastError: 'Clé refusée par GitHub : vérifiez-la ou remplacez-la.',
        }),
        NOW,
      ),
    ).toBe('En erreur : Clé refusée par GitHub : vérifiez-la ou remplacez-la.');
    expect(statusLine(view({ status: 'error', lastError: null }), NOW)).toBe('En erreur');
  });
});

describe('resultMessage', () => {
  it('annonce le compte trouvé ou rend le message d’erreur tel quel', () => {
    expect(resultMessage({ ok: true, account: 'David (acme)' })).toBe('Connecté : David (acme)');
    expect(resultMessage({ error: 'Clé refusée par Linear.' })).toBe('Clé refusée par Linear.');
  });
});

describe('otherOwnersNote', () => {
  const by = (id: string, name: string) => ({ createdBy: { id, name } });

  it('prévient quand quelqu’un d’autre a déjà branché l’outil', () => {
    expect(otherOwnersNote([by('david', 'David')], 'amos')).toBe('Déjà branché par David.');
    expect(
      otherOwnersNote([by('david', 'David'), by('marie', 'Marie'), by('david', 'David')], 'amos'),
    ).toBe('Déjà branché par David et Marie.');
    expect(
      otherOwnersNote([by('david', 'David'), by('marie', 'Marie'), by('paul', 'Paul')], 'amos'),
    ).toBe('Déjà branché par David, Marie et Paul.');
  });

  it('se tait pour ses propres connexions ou sans connexion', () => {
    expect(otherOwnersNote([by('amos', 'Amos')], 'amos')).toBeNull();
    expect(otherOwnersNote([], 'amos')).toBeNull();
  });
});
