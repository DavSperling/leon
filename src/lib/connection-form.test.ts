import { describe, expect, it } from 'vitest';
import {
  canReconnect,
  fieldsFromForm,
  inputTypeFor,
  invalidFieldsMessage,
  OAUTH_RETURN_CODES,
  oauthNotice,
  oauthStartPath,
  otherOwnersNote,
  panelMode,
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
    createdBy: { id: 'u1', name: 'Bob' },
    creatorLeft: false,
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

  // Audit 3 n° 14 : la relève saute la connexion d'un créateur parti, la vue le dit.
  it('dit « Arrêtée » quand le créateur n’est plus membre, quel que soit le statut', () => {
    for (const status of ['active', 'paused', 'error'] as const) {
      expect(statusLine(view({ status, creatorLeft: true }), NOW)).toBe(
        "Arrêtée : Bob n'est plus membre",
      );
    }
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

describe('oauthStartPath', () => {
  it('mène au début du déroulé de l’outil', () => {
    expect(oauthStartPath('linear')).toBe('/api/v1/connexions/oauth/linear/debut');
    expect(oauthStartPath('helpscout')).toBe('/api/v1/connexions/oauth/helpscout/debut');
  });
});

describe('panelMode', () => {
  it('met le bouton en premier quand l’appli est configurée, avec la clé en secours si elle est acceptée', () => {
    expect(panelMode({ oauthReady: true, keyAccepted: true })).toBe('oauth+key');
    expect(panelMode({ oauthReady: true, keyAccepted: false })).toBe('oauth');
  });

  it('ne propose que la clé quand l’appli n’est pas configurée', () => {
    expect(panelMode({ oauthReady: false, keyAccepted: true })).toBe('key');
  });

  it('ne propose rien à un outil sans clé dont l’appli n’est pas configurée', () => {
    expect(panelMode({ oauthReady: false, keyAccepted: false })).toBe('none');
  });
});

describe('canReconnect', () => {
  it('propose « Reconnecter » à une connexion branchée par le bouton', () => {
    expect(canReconnect({ config: { authMode: 'oauth', expiresAt: null } })).toBe(true);
  });

  it('laisse « Remplacer la clé » à une connexion à clé, avec ou sans authMode', () => {
    expect(canReconnect({ config: { authMode: 'key' } })).toBe(false);
    expect(canReconnect({ config: { repos: ['acme/leon'] } })).toBe(false);
  });
});

describe('oauthNotice', () => {
  it('annonce un outil branché', () => {
    expect(oauthNotice({ branche: 'linear' })).toEqual({
      tone: 'success',
      text: 'Linear est branché. La première synchronisation démarre dans la minute.',
      adminConsent: false,
      tool: 'linear',
    });
  });

  it('dit de quel outil il s’agit quand l’adresse le sait', () => {
    expect(oauthNotice({ erreur: 'admin', outil: 'outlook' })?.tool).toBe('outlook');
    expect(oauthNotice({ erreur: 'admin' })?.tool).toBeNull();
    expect(oauthNotice({ erreur: 'expire', outil: 'inconnu' })?.tool).toBeNull();
  });

  it('dit chaque erreur en français, avec le nom de l’outil', () => {
    const text = (erreur: string) => oauthNotice({ erreur, outil: 'linear' })?.text;
    expect(text('annule')).toBe('Connexion à Linear annulée.');
    expect(text('expire')).toBe('Le lien a expiré, recommencez.');
    expect(text('refuse')).toBe("Linear a refusé l'autorisation.");
    expect(text('indisponible')).toBe('Linear ne répond pas, réessayez dans un moment.');
    expect(text('champs')).toBe('Vérifiez les champs saisis.');
    expect(text('admin')).toBe(
      "L'administrateur Microsoft de votre entreprise doit d'abord autoriser Leon.",
    );
    expect(text('admin_accorde')).toBe(
      'Accord donné : cliquez de nouveau sur Se connecter avec Outlook.',
    );
    expect(text('autre_compte')).toBe(
      'Reconnectez Linear avec le même compte et le même site, ou ajoutez une autre connexion.',
    );
  });

  it('couvre chaque code que le retour peut rendre, et rien d’autre', () => {
    expect([...OAUTH_RETURN_CODES].sort()).toEqual(
      [
        'admin',
        'admin_accorde',
        'annule',
        'autre_compte',
        'champs',
        'expire',
        'indisponible',
        'refuse',
      ].sort(),
    );
    for (const erreur of OAUTH_RETURN_CODES) {
      expect(oauthNotice({ erreur, outil: 'outlook' })).not.toBeNull();
    }
  });

  it('écrit « l’outil » quand l’adresse ne dit pas lequel', () => {
    expect(oauthNotice({ erreur: 'annule' })?.text).toBe("Connexion à l'outil annulée.");
    expect(oauthNotice({ erreur: 'refuse' })?.text).toBe("L'outil a refusé l'autorisation.");
    expect(oauthNotice({ erreur: 'indisponible', outil: 'inconnu' })?.text).toBe(
      "L'outil ne répond pas, réessayez dans un moment.",
    );
  });

  it('garde l’écriture du nom de l’outil en début de phrase', () => {
    expect(oauthNotice({ erreur: 'refuse', outil: 'monday' })?.text).toBe(
      "monday.com a refusé l'autorisation.",
    );
  });

  it('marque le refus faute d’accord de l’administrateur, pour que la page joigne le lien', () => {
    expect(oauthNotice({ erreur: 'admin', outil: 'outlook' })).toMatchObject({
      tone: 'error',
      adminConsent: true,
    });
    expect(oauthNotice({ erreur: 'refuse', outil: 'outlook' })?.adminConsent).toBe(false);
  });

  it('ne dit rien d’une valeur inconnue, d’une liste ou d’une adresse vide', () => {
    expect(oauthNotice({})).toBeNull();
    expect(oauthNotice({ erreur: 'oups', outil: 'linear' })).toBeNull();
    expect(oauthNotice({ erreur: ['annule', 'expire'], outil: 'linear' })).toBeNull();
    expect(oauthNotice({ branche: 'inconnu' })).toBeNull();
    expect(oauthNotice({ branche: ['linear'] })).toBeNull();
    expect(oauthNotice({ erreur: undefined, branche: undefined, outil: 'linear' })).toBeNull();
  });

  it('ne reprend jamais le texte de l’adresse dans le message', () => {
    const hostile = '<script>alert(1)</script>';
    for (const params of [{ erreur: hostile, outil: hostile }, { branche: hostile }]) {
      expect(oauthNotice(params)).toBeNull();
    }
    expect(oauthNotice({ erreur: 'annule', outil: hostile })?.text).not.toContain('script');
  });

  it('préfère l’erreur à la réussite quand l’adresse porte les deux', () => {
    expect(oauthNotice({ branche: 'linear', erreur: 'expire' })?.tone).toBe('error');
  });
});
