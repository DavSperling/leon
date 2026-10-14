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
});
