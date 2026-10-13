import { describe, expect, it } from 'vitest';
import { clientLabelFromUserAgent } from './client-label';

describe('clientLabelFromUserAgent', () => {
  it('garde le produit, sans la version ni le reste', () => {
    expect(clientLabelFromUserAgent('claude-code/2.1.296 (darwin)')).toBe('claude-code');
    expect(clientLabelFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe('mozilla');
  });

  it('vaut mcp sans User-Agent exploitable', () => {
    expect(clientLabelFromUserAgent(undefined)).toBe('mcp');
    expect(clientLabelFromUserAgent('')).toBe('mcp');
    expect(clientLabelFromUserAgent('   ')).toBe('mcp');
    expect(clientLabelFromUserAgent('!!!/1.0')).toBe('mcp');
  });

  it('retire les caractères hors [a-z0-9._-]', () => {
    expect(clientLabelFromUserAgent('Mon_Client+é$/1.0')).toBe('mon_client');
  });

  it('tient en 40 caractères au plus', () => {
    expect(clientLabelFromUserAgent('a'.repeat(100))).toBe('a'.repeat(40));
  });
});
