import { describe, expect, it } from 'vitest';
import { readText } from './files';

// L'écran de consentement de l'extension dit à l'utilisateur ce que fait Leon de ses conversations. Le tri
// (extraction de faits, file « sujets sensibles ») est supprimé pour de bon : le texte ne doit plus le promettre.
// Quand la réponse en tête et la discussion enverront des passages au modèle (T10, T11), ce même écran devra le
// dire ; ce test n'interdit donc pas de nommer le modèle, seulement l'extraction.
const OPTIONS_PAGE = 'extension/entrypoints/options/index.html';

function consentSection(): string {
  const html = readText(OPTIONS_PAGE);
  const start = html.indexOf('id="consent"');
  const end = html.indexOf('</section>', start);
  return html.slice(start, end);
}

describe("écran de consentement de l'extension", () => {
  it('existe et dit ce qui est envoyé, ce qui ne l’est jamais et qui voit la conversation', () => {
    const text = consentSection();
    expect(text).toContain('Ce qui est envoyé à votre serveur Leon');
    expect(text).toContain("Ce qui ne l'est jamais");
    expect(text).toContain('visible par vous seul');
  });

  it.each(['extraire', 'extraction', 'faits', 'sujets sensibles', 'analyser'])(
    'ne promet plus « %s » : le tri est supprimé',
    (word) => {
      expect(consentSection()).not.toContain(word);
    },
  );
});
