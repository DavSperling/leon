import { describe, expect, it } from 'vitest';
import { readText } from './files';

// L'écran de consentement de l'extension dit à l'utilisateur ce que fait Leon de ses conversations. Le tri
// (extraction de faits, file « sujets sensibles ») est supprimé pour de bon : le texte ne doit plus le promettre.
// La réponse en tête (T10) et la discussion (T11) envoient des passages captés au fournisseur du modèle d'IA pour
// répondre : l'écran le dit, et dit que cela n'arrive que pour les questions de l'utilisateur lui-même.
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

  it('dit que des passages peuvent partir au fournisseur du modèle d’IA, pour répondre à vos seules questions', () => {
    const text = consentSection().replace(/\s+/g, ' ').toLowerCase();
    expect(text).toContain("fournisseur du modèle d'ia");
    expect(text).toContain('pour répondre');
    expect(text).toContain('vos questions');
  });

  it.each(['extraire', 'extraction', 'faits', 'sujets sensibles', 'analyser'])(
    'ne promet plus « %s » : le tri est supprimé',
    (word) => {
      expect(consentSection()).not.toContain(word);
    },
  );
});
