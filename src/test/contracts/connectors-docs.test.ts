import { describe, expect, it } from 'vitest';
import { FAMILY_LABELS } from '@/lib/providers';
import { listCatalog } from '@/server/connectors/catalog';
import { pathExists, productionSources, readText } from './files';

// La documentation des connecteurs (README, guide de vérification) recopie des données que le code
// porte : la liste des 39 outils et leur état « essayé en réel », les libellés des boutons. Sans
// cette garde, un outil passé à « essayé en réel » ou un bouton renommé laisse la doc fausse.

const GUIDE = 'docs/guides/connecteurs-verification.md';

// Section « ## Connecteurs » du README, jusqu'au titre de même niveau suivant.
function connectorsSection(): string {
  const readme = readText('README.md');
  const start = readme.indexOf('\n## Connecteurs\n');
  if (start === -1) return '';
  const rest = readme.slice(start + 1);
  const next = rest.indexOf('\n## ', 1);
  return next === -1 ? rest : rest.slice(0, next);
}

// Lignes du tableau des outils : | Outil | Famille | Essayé en réel |
function toolRows(section: string): string[][] {
  return section
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

describe('README : section Connecteurs', () => {
  const section = connectorsSection();

  it('existe et explique la clé de chiffrement, la page et la relève', () => {
    expect(section).toContain('LEON_CONNECTORS_KEY');
    expect(section).toContain('openssl rand -base64 32');
    expect(section).toContain('Connexions');
    expect(section).toContain('15 minutes');
    expect(section).toContain(`(${GUIDE})`);
  });

  it('liste chacun des 39 outils, avec sa famille et son état, une fois', () => {
    const rows = toolRows(section).filter(
      (cells) => cells[0] !== 'Outil' && !/^-+$/.test(cells[0] ?? ''),
    );
    const expected = listCatalog().map((item) => [
      item.label,
      FAMILY_LABELS[item.family],
      item.triedForReal ? 'oui' : 'non',
    ]);

    expect(expected).toHaveLength(39);
    expect(rows).toEqual(expected);
  });
});

describe('guide de vérification des connecteurs', () => {
  it('existe', () => {
    expect(pathExists(GUIDE)).toBe(true);
  });

  // Les boutons et messages que le guide demande de cliquer ou de lire existent dans l'interface.
  it.each([
    'Tester et brancher',
    'Synchroniser maintenant',
    'Mettre en pause',
    'Reprendre',
    'Remplacer la clé',
    'Supprimer',
    'Ouvrir dans',
    'Clé refusée par',
  ])('cite « %s », qui existe dans le code', (label) => {
    expect(readText(GUIDE)).toContain(label);
    const sources = productionSources('src/**/*.{ts,tsx}');
    expect(sources.some(({ text }) => text.includes(label))).toBe(true);
  });
});
