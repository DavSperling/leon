import { describe, expect, it } from 'vitest';
import { ACCOUNT_MAX, accountLabel, sameAccountKey } from './account-label';

// Audit 4 n° 10 : le bouton et la clé nomment la connexion par la même fonction.
describe('accountLabel', () => {
  it('met le compte sur une ligne et le coupe à ACCOUNT_MAX caractères', () => {
    expect(accountLabel('Marie\nDurand\t(acme)', 'GitHub')).toBe('Marie Durand (acme)');
    expect(Array.from(accountLabel('é'.repeat(300), 'GitHub'))).toHaveLength(ACCOUNT_MAX);
    expect(ACCOUNT_MAX).toBe(120);
  });

  it('rend le nom de l’outil quand le compte est vide', () => {
    expect(accountLabel(' \n ', 'GitHub')).toBe('GitHub');
  });
});

describe('sameAccountKey', () => {
  it('ClickUp et Airtable : même utilisateur et un espace en commun, même compte', () => {
    expect(sameAccountKey('clickup', '101:9001', '101:9001:9002')).toBe(true);
    expect(sameAccountKey('airtable', 'usr1:appA:appB', 'usr1:appB')).toBe(true);
  });

  it('ClickUp et Airtable : autre espace seulement, ou autre utilisateur, autre compte', () => {
    expect(sameAccountKey('clickup', '101:9001', '101:9002')).toBe(false);
    expect(sameAccountKey('clickup', '101:9001', '102:9001')).toBe(false);
  });

  it('ClickUp et Airtable : une clé ancienne (utilisateur seul) se compare à l’utilisateur', () => {
    expect(sameAccountKey('clickup', '101', '101:9001')).toBe(true);
    expect(sameAccountKey('airtable', 'usr1', 'usr2:appA')).toBe(false);
  });

  it('les autres outils comparent la clé entière', () => {
    expect(sameAccountKey('jira', 'acc:cloud1', 'acc:cloud1')).toBe(true);
    expect(sameAccountKey('jira', 'acc:cloud1', 'acc:cloud1:cloud2')).toBe(false);
  });
});
