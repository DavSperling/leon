import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseClaudeCodeSession } from './claude-code';
import { SECRET_MASK } from './mask-secrets';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/claude-code/${name}.jsonl`, import.meta.url), 'utf8');

const line = (type: 'user' | 'assistant', n: number, content: unknown, extra = {}) =>
  JSON.stringify({
    type,
    uuid: `uuid-${n}`,
    sessionId: 'session-1',
    timestamp: '2026-10-13T08:00:00.000Z',
    message: { content },
    ...extra,
  });

describe('parseClaudeCodeSession', () => {
  it('lit les six tours de session-simple dans l’ordre', () => {
    const session = parseClaudeCodeSession(fixture('session-simple'));

    expect(session).toMatchObject({
      sessionId: '11111111-1111-4111-8111-111111111111',
      cwd: '/Users/demo/projets/acme',
      title: 'Offre ACME',
    });
    expect(session?.turns.map((t) => [t.external_id, t.role, t.ts, t.capture_mode])).toEqual([
      ['a0000001-0000-4000-8000-000000000001', 'user', '2026-10-13T08:00:00.000Z', 'file'],
      ['a0000001-0000-4000-8000-000000000002', 'assistant', '2026-10-13T08:00:05.000Z', 'file'],
      ['a0000001-0000-4000-8000-000000000003', 'user', '2026-10-13T08:01:00.000Z', 'file'],
      ['a0000001-0000-4000-8000-000000000004', 'assistant', '2026-10-13T08:01:04.000Z', 'file'],
      ['a0000001-0000-4000-8000-000000000005', 'user', '2026-10-13T08:02:00.000Z', 'file'],
      ['a0000001-0000-4000-8000-000000000006', 'assistant', '2026-10-13T08:02:03.000Z', 'file'],
    ]);
  });

  it('joint les blocs text par une ligne vide et accepte un texte en chaîne', () => {
    const turns = parseClaudeCodeSession(fixture('session-simple'))?.turns ?? [];

    expect(turns[0]?.text).toBe("Peux-tu résumer l'offre faite à ACME ?");
    expect(turns[3]?.text).toBe(
      'ACME paie à quarante-cinq jours.\n\nUne relance est prévue le 20 octobre.',
    );
  });

  it('prend le titre aiTitle sans customTitle, sinon le premier texte utilisateur coupé à 80', () => {
    const aiTitled = [
      line('user', 1, 'Question'),
      JSON.stringify({ type: 'ai-title', aiTitle: 'Titre proposé' }),
    ].join('\n');
    const long = line('user', 1, 'x'.repeat(200));

    expect(parseClaudeCodeSession(aiTitled)?.title).toBe('Titre proposé');
    expect(parseClaudeCodeSession(long)?.title).toBe('x'.repeat(80));
  });

  it('ne garde de session-bruit que les textes utilisateur et assistant', () => {
    const session = parseClaudeCodeSession(fixture('session-bruit'));

    expect(session?.turns.map((t) => [t.role, t.text])).toEqual([
      ['user', 'Prépare le devis Orion.'],
      ['assistant', 'Je lis le dossier Orion.'],
      ['user', `Voici la clé de test : ${SECRET_MASK}`],
      ['assistant', "C'est noté."],
    ]);
  });

  it('ignore les lignes isSidechain de session-sous-agent', () => {
    const session = parseClaudeCodeSession(fixture('session-sous-agent'));

    expect(session?.turns.map((t) => t.text)).toEqual([
      'Lance une recherche sur le fournisseur Delta.',
      'Delta livre en dix jours.',
    ]);
  });

  it('renvoie null pour un fichier vide ou sans conversation exploitable', () => {
    expect(parseClaudeCodeSession('')).toBeNull();
    expect(parseClaudeCodeSession('{"type":"mode"}\nn’importe quoi\n')).toBeNull();
  });

  it('ignore une ligne sans identifiant ou sans date valide', () => {
    const content = [
      line('user', 1, 'Sans date', { timestamp: 'hier' }),
      line('user', 2, 'Sans identifiant', { uuid: undefined }),
      line('user', 3, 'Valide'),
    ].join('\n');

    expect(parseClaudeCodeSession(content)?.turns.map((t) => t.text)).toEqual(['Valide']);
  });
});
