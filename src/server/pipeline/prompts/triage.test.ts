import { describe, expect, it } from 'vitest';
import { buildTriagePrompt, NOT_SENSITIVE } from './triage';

describe('buildTriagePrompt', () => {
  it('borne la sensibilité aux personnes et aux affaires confidentielles de l entreprise', () => {
    const { system } = buildTriagePrompt({
      sourceKindLabel: 'Claude Code',
      title: null,
      turns: [],
    });

    expect(system).toContain(NOT_SENSITIVE);
    expect(system).toContain('En cas de doute sur un de ces cas, le tour est sensible.');
  });

  it('demande les tours de bruit, sans jamais y ranger un rapport d agent', () => {
    const { system } = buildTriagePrompt({
      sourceKindLabel: 'Claude Code',
      title: null,
      turns: [],
    });

    expect(system).toContain('noiseTurns');
    expect(system).toContain('n’est jamais du bruit');
    expect(system).toContain('En cas de doute, le tour n’est pas du bruit.');
  });
});
