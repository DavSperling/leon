import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONSENT_VERSION } from './settings';

// Un accord ne vaut que pour le texte qu'on a lu (settings.ts). Ce test lie le texte de l'écran de consentement à
// CONSENT_VERSION : changer le texte sans monter la version le fait échouer. Pour un nouveau texte, monter
// CONSENT_VERSION et ajouter ici son empreinte ; une empreinte notée ne change jamais.
const CONSENT_FINGERPRINTS: Record<number, string> = {
  2: '48c5422c0a2afb2ac9e9949a77245510f0c446a222dfd632f564601086d1256a',
};

// Le texte lisible de la section #consent de la page d'options : sans balises, espaces regroupées.
function consentText(): string {
  const html = readFileSync(new URL('../entrypoints/options/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('<section id="consent"');
  const end = html.indexOf('</section>', start);
  expect(start).toBeGreaterThan(-1);
  return html
    .slice(start, end)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const fingerprint = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('version du texte de consentement', () => {
  it('correspond au texte de l’écran : un nouveau texte demande une nouvelle version, donc un nouvel accord', () => {
    const actual = fingerprint(consentText());
    expect(
      actual,
      `Le texte de l'écran de consentement a changé : passer CONSENT_VERSION à ${CONSENT_VERSION + 1} et noter ` +
        `son empreinte (${actual}) dans CONSENT_FINGERPRINTS.`,
    ).toBe(CONSENT_FINGERPRINTS[CONSENT_VERSION]);
  });

  it('a une empreinte notée pour chaque version, et aucune pour une version à venir', () => {
    expect(Math.max(...Object.keys(CONSENT_FINGERPRINTS).map(Number))).toBe(CONSENT_VERSION);
  });
});
