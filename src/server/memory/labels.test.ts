import { describe, expect, it } from 'vitest';
import { clientLabel, isoDate, SENSITIVE_CATEGORY_LABELS, SOURCE_KIND_LABELS } from './labels';

describe('labels', () => {
  it('nomme les sources et les catégories sensibles', () => {
    expect(SOURCE_KIND_LABELS).toEqual({
      claude_code: 'Claude Code',
      claude_ai: 'claude.ai',
      chatgpt: 'ChatGPT',
      mcp_remember: 'Note MCP',
    });
    expect(SENSITIVE_CATEGORY_LABELS.perso).toBe('Vie personnelle');
    expect(SENSITIVE_CATEGORY_LABELS.remuneration).toBe('Rémunération');
  });

  it('nomme les clients du journal de lecture', () => {
    expect(clientLabel('interface')).toBe('Interface');
    expect(clientLabel('claude-code')).toBe('Claude Code');
    expect(clientLabel('cursor')).toBe('cursor');
    expect(clientLabel('constructor')).toBe('constructor');
  });

  it('écrit la date en AAAA-MM-JJ, en UTC', () => {
    expect(isoDate(new Date('2026-10-13T23:30:00-02:00'))).toBe('2026-10-14');
  });
});
