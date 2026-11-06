import { describe, expect, it } from 'vitest';
import { ADAPTATEURS, cursorSlug } from './outils';

describe('ADAPTATEURS.codex.injection (C5)', () => {
  it('rend exactement la forme JSON que Codex attend, sans autre champ', () => {
    expect(
      JSON.parse(ADAPTATEURS.codex.injection('<contexte-leon>x</contexte-leon>', 'demarrage')),
    ).toStrictEqual({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: '<contexte-leon>x</contexte-leon>',
      },
    });
  });

  it('garde 8 000 octets accentués intacts, et ne demande jamais l’arrêt de la session', () => {
    const block = 'é’—'.repeat(8000 / 8).padEnd(8000 / 2, 'a');
    const output = ADAPTATEURS.codex.injection(block, 'demarrage');
    expect(JSON.parse(output).hookSpecificOutput.additionalContext).toBe(block);
    expect(output).not.toContain('"continue"');
  });
});

// T28 : Cursor, écrit avant l'essai T26 (forme snake_case de la doc). shortcut: rejouer les entrées relevées à T26.
describe('ADAPTATEURS.cursor', () => {
  const cursor = ADAPTATEURS.cursor;
  const HOME = '/Users/demo';
  const PROJECTS = '/Users/demo/.cursor/projects';

  it('enveloppe le bloc au premier message en gardant continue: true, et rend {"continue":true} sans bloc', () => {
    expect(JSON.parse(cursor.injection('Bloc', 'prompt'))).toStrictEqual({
      continue: true,
      additional_context: 'Bloc',
    });
    expect(JSON.parse(cursor.injection('Bloc', 'demarrage'))).toStrictEqual({
      additional_context: 'Bloc',
    });
    expect(cursor.vide('prompt')).toBe('{"continue":true}');
    expect(cursor.vide('tour')).toBe('{}');
    expect(cursor.uneFois).toBe(true);
    expect(cursor.injection('x', 'prompt')).not.toContain('followup_message');
  });

  it('lit la conversation, le dossier et le transcript ; déduit le transcript du dossier à défaut', () => {
    const entree = cursor.entree(
      {
        conversation_id: 'conv-1',
        generation_id: 'gen-1',
        hook_event_name: 'stop',
        workspace_roots: ['/Users/demo/projets/leon'],
        cursor_version: '3.27.0',
      },
      HOME,
      {},
    );

    expect(entree).toEqual({
      session: 'conv-1',
      dossier: '/Users/demo/projets/leon',
      fichiers: [
        `${PROJECTS}/Users-demo-projets-leon/agent-transcripts/conv-1/conv-1.jsonl`,
        `${PROJECTS}/Users-demo-projets-leon/agent-transcripts/conv-1.jsonl`,
      ],
      inactif: true,
    });
  });

  it('prend transcript_path, puis CURSOR_TRANSCRIPT_PATH, seulement sous ~/.cursor/projects', () => {
    const transcript = `${PROJECTS}/x/agent-transcripts/c/c.jsonl`;
    const fromInput = cursor.entree({ conversation_id: 'c', transcript_path: transcript }, HOME, {
      CURSOR_TRANSCRIPT_PATH: `${PROJECTS}/y/agent-transcripts/c/c.jsonl`,
    });
    expect(fromInput.fichiers[0]).toBe(transcript);
    expect(fromInput.fichiers[1]).toBe(`${PROJECTS}/y/agent-transcripts/c/c.jsonl`);

    const outside = cursor.entree(
      {
        conversation_id: '../c',
        transcript_path: '/etc/passwd',
        workspace_roots: ['/Users/demo/projets/leon'],
      },
      HOME,
      { CURSOR_TRANSCRIPT_PATH: `${PROJECTS}/../../secret.jsonl` },
    );
    expect(outside.fichiers).toEqual([]);
  });

  it('une entrée illisible ne donne ni session, ni dossier, ni fichier', () => {
    expect(cursor.entree(null, HOME, {})).toEqual({
      session: null,
      dossier: null,
      fichiers: [],
      inactif: true,
    });
  });
});

describe('cursorSlug', () => {
  it('rend le dossier, ses séparateurs en tirets, sans tiret au début', () => {
    expect(cursorSlug('/Users/demo/projets/leon')).toBe('Users-demo-projets-leon');
    expect(cursorSlug('/Users/demo/mon-projet/')).toBe('Users-demo-mon-projet');
  });
});
