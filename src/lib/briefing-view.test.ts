import { describe, expect, it } from 'vitest';
import { renderBriefing, renderEmptyBriefing } from '@/server/briefing/briefing-prompt';
import type { SourceInfo } from '@/server/search/types';
import { parseBriefing, withoutDismissed } from './briefing-view';

const NOW = new Date('2026-11-12T06:00:00.000Z');
const source = (id: string): SourceInfo => ({
  sourceId: id,
  kind: 'github',
  nature: 'ticket',
  title: `Ticket ${id}`,
  url: `https://github.com/acme/leon/issues/${id}`,
  origin: {},
  lastTs: new Date('2026-11-11T17:00:00.000Z'),
});
const references = [1, 2, 3].map((n) => ({ n, source: source(String(n)) }));

const stored = (body: string) =>
  renderBriefing({ project: 'github.com/acme/leon', preparedAt: NOW, body, references });

describe('parseBriefing : le point gardé, tel que l’Accueil le montre', () => {
  it('ne garde que les trois parties et leurs lignes, chacune avec ses numéros', () => {
    const view = parseBriefing(
      stored(
        [
          '## What you did',
          '- Renewed the deploy token [1].',
          '- Reviewed **the billing PR** [2][3].',
          '## What changed',
          '- Sophie moved the migration to Dec 2 [3].',
          '## What is still open',
          '- The quote for R&D <draft> [2]',
        ].join('\n'),
      ),
    );
    expect(view).toEqual([
      {
        title: 'What you did',
        lines: [
          { text: 'Renewed the deploy token.', refs: [1] },
          { text: 'Reviewed the billing PR.', refs: [2, 3] },
        ],
      },
      {
        title: 'What changed',
        lines: [{ text: 'Sophie moved the migration to Dec 2.', refs: [3] }],
      },
      { title: 'What is still open', lines: [{ text: 'The quote for R&D <draft>', refs: [2] }] },
    ]);
  });

  it('ni l’en-tête, ni les lignes de garde, ni la liste des sources', () => {
    const view = parseBriefing(stored('## What you did\n- Done [1].'));
    const text = JSON.stringify(view);
    expect(text).not.toContain('Morning briefing');
    expect(text).not.toContain('Sources');
    expect(text).not.toContain('github.com');
  });

  it('une ligne sans renvoi reste, une partie vide disparaît, une ligne continuée se recolle', () => {
    expect(
      parseBriefing(
        stored('## What you did\n- Nothing cited\n  but continued.\n## What changed\n'),
      ),
    ).toEqual([
      { title: 'What you did', lines: [{ text: 'Nothing cited but continued.', refs: [] }] },
    ]);
  });

  it('pas de bloc (rien de nouveau), ou un bloc vide : null', () => {
    expect(parseBriefing(renderEmptyBriefing('github.com/acme/leon', NOW, 14))).toBeNull();
    expect(parseBriefing(stored('## What you did\n'))).toBeNull();
    expect(parseBriefing('')).toBeNull();
  });
});

describe('les lignes retirées par l’utilisateur (0074)', () => {
  const markdown = stored(
    [
      '## What you did',
      '- Renewed the deploy token [1].',
      '- Reviewed the billing PR,',
      '  then merged it [2].',
      '## What is still open',
      '- The quote for R&D <draft> [3]',
    ].join('\n'),
  );

  it('l’Accueil ne les montre plus, et une partie vidée disparaît', () => {
    expect(
      parseBriefing(markdown, [
        'Reviewed the billing PR, then merged it.',
        'The quote for R&D <draft>',
      ]),
    ).toEqual([
      { title: 'What you did', lines: [{ text: 'Renewed the deploy token.', refs: [1] }] },
    ]);
    expect(
      parseBriefing(markdown, [
        'Renewed the deploy token.',
        'Reviewed the billing PR, then merged it.',
        'The quote for R&D <draft>',
      ]),
    ).toBeNull();
  });

  it('le texte du crochet les perd, puce et lignes de suite, sans toucher au reste', () => {
    const kept = withoutDismissed(markdown, [
      'Reviewed the billing PR, then merged it.',
      'The quote for R&D <draft>',
    ]);
    expect(kept).not.toContain('billing');
    expect(kept).not.toContain('merged');
    expect(kept).not.toContain('R&amp;D');
    expect(kept).toContain('- Renewed the deploy token [1].\n## What is still open\n');
    expect(kept).toContain('Sources:');
    expect(parseBriefing(kept)).toEqual(
      parseBriefing(markdown, [
        'Reviewed the billing PR, then merged it.',
        'The quote for R&D <draft>',
      ]),
    );
    expect(withoutDismissed(markdown, [])).toBe(markdown);
    expect(withoutDismissed(markdown, ['Not in this briefing.'])).toBe(markdown);
  });
});
