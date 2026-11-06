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

// T33 : Antigravity, écrit avant l'essai T31 (forme d'`agy` 1.4). shortcut: rejouer les entrées relevées à T31.
describe('ADAPTATEURS.antigravity', () => {
  const agy = ADAPTATEURS.antigravity;
  const HOME = '/Users/demo';
  const BRAIN = '/Users/demo/.gemini/antigravity/brain';

  it('enveloppe le bloc en injectSteps, et ne répond que {} sans bloc', () => {
    expect(JSON.parse(agy.injection('Bloc', 'prompt'))).toStrictEqual({
      injectSteps: [{ systemMessage: { systemMessage: 'Bloc' } }],
    });
    expect(agy.injection('Bloc', 'demarrage')).toBe(agy.injection('Bloc', 'prompt'));
    for (const evenement of ['demarrage', 'prompt', 'tour', 'fin'] as const) {
      expect(agy.vide(evenement)).toBe('{}');
    }
    expect(agy.uneFois).toBe(true);
  });

  it('lit la conversation, l’espace de travail, et préfère transcript_full.jsonl', () => {
    const transcript = `${BRAIN}/conv-1/.system_generated/logs/transcript.jsonl`;
    expect(
      agy.entree(
        {
          conversationId: 'conv-1',
          transcriptPath: transcript,
          workspacePaths: ['/Users/demo/projets/leon'],
          fullyIdle: true,
        },
        HOME,
        {},
      ),
    ).toEqual({
      session: 'conv-1',
      dossier: '/Users/demo/projets/leon',
      fichiers: [`${BRAIN}/conv-1/.system_generated/logs/transcript_full.jsonl`, transcript],
      inactif: true,
    });
  });

  it('rien n’est capté tant que fullyIdle est faux ; un transcript hors de brain n’est pas lu', () => {
    expect(agy.entree({ fullyIdle: false }, HOME, {}).inactif).toBe(false);
    expect(agy.entree({}, HOME, {}).inactif).toBe(true);
    expect(agy.entree({ transcriptPath: '/tmp/transcript.jsonl' }, HOME, {}).fichiers).toEqual([]);
  });
});
