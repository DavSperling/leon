import { describe, expect, it } from 'vitest';
import {
  CAPTURE_KINDS,
  CODE_SESSION_KINDS,
  type IngestPayload,
  IngestPayloadSchema,
  ITEM_NATURES,
  isCodeSessionKind,
  PROJECT_KEY_PATTERN,
  PROVIDER_IDS,
  projectKeyFromInput,
  SOURCE_KINDS,
  TOOL_KINDS,
  TURN_TEXT_MAX,
  TURNS_PER_BATCH_MAX,
  TurnSchema,
} from './turn';

const turn = {
  external_id: 'msg-1',
  role: 'user',
  text: 'Bonjour',
  ts: '2026-10-13T09:00:00+02:00',
  capture_mode: 'network',
} as const;

const payload: IngestPayload = {
  source: { kind: 'chatgpt', external_id: 'conv-1', title: 'Relance ACME' },
  turns: [turn],
};

function withTurn(override: Record<string, unknown>) {
  return { ...payload, turns: [{ ...turn, ...override }] };
}

describe('IngestPayloadSchema', () => {
  it('accepte un envoi valide', () => {
    expect(IngestPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('accepte les six types de capture', () => {
    expect(CAPTURE_KINDS).toEqual([
      'claude_code',
      'codex',
      'cursor',
      'claude_ai',
      'chatgpt',
      'mcp_remember',
    ]);
    for (const kind of CAPTURE_KINDS) {
      const body = { ...payload, source: { ...payload.source, kind } };
      expect(IngestPayloadSchema.safeParse(body).success, kind).toBe(true);
    }
  });

  it("refuse le type d'un connecteur : la route publique ne fabrique pas de source « notion »", () => {
    for (const kind of ['notion', 'github']) {
      const body = { ...payload, source: { ...payload.source, kind } };
      expect(IngestPayloadSchema.safeParse(body).success, kind).toBe(false);
    }
  });

  it('refuse le fil de travail : seul le serveur crée un fil (D21)', () => {
    const body = { ...payload, source: { ...payload.source, kind: 'leon_fil' } };
    expect(IngestPayloadSchema.safeParse(body).success).toBe(false);
  });

  it('refuse un tour de rôle tool', () => {
    expect(IngestPayloadSchema.safeParse(withTurn({ role: 'tool' })).success).toBe(false);
  });

  it('refuse un champ inconnu', () => {
    expect(IngestPayloadSchema.safeParse(withTurn({ extra: 1 })).success).toBe(false);
    expect(IngestPayloadSchema.safeParse({ ...payload, extra: 1 }).success).toBe(false);
  });

  it(`refuse plus de ${TURNS_PER_BATCH_MAX} tours`, () => {
    const turns = Array.from({ length: TURNS_PER_BATCH_MAX + 1 }, (_, i) => ({
      ...turn,
      external_id: `msg-${i}`,
    }));
    expect(IngestPayloadSchema.safeParse({ ...payload, turns }).success).toBe(false);
  });

  it(`refuse un texte de plus de ${TURN_TEXT_MAX} caractères`, () => {
    const text = 'a'.repeat(TURN_TEXT_MAX + 1);
    expect(IngestPayloadSchema.safeParse(withTurn({ text })).success).toBe(false);
  });

  it('refuse une date sans fuseau', () => {
    expect(IngestPayloadSchema.safeParse(withTurn({ ts: '2026-10-13T09:00:00' })).success).toBe(
      false,
    );
  });
});

describe('IngestPayloadSchema : source.project (C8)', () => {
  const withProject = (project: unknown) => ({
    ...payload,
    source: { ...payload.source, project },
  });

  it('accepte une clé de dépôt GitHub ou de dossier', () => {
    for (const project of [
      'github.com/acme/leon',
      'github.com/a/b',
      'github.com/mon-org_2/mon.depot-v2',
      'dossier:0123456789abcdef',
    ]) {
      expect(IngestPayloadSchema.safeParse(withProject(project)).success, project).toBe(true);
    }
  });

  it("reste facultatif : un envoi sans projet est valide, et c'est le cas de l'extension", () => {
    expect(IngestPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('refuse tout ce qui n’est pas une clé exacte', () => {
    for (const project of [
      'evil',
      '',
      'github.com/acme',
      'github.com/acme/leon/extra',
      'github.com//leon',
      'github.com/Acme/Leon',
      'GitHub.com/acme/leon',
      'https://github.com/acme/leon',
      'gitlab.com/acme/leon',
      'github.com/acme/leon\n',
      'github.com/acme/le on',
      'dossier:0123456789ABCDEF',
      'dossier:0123456789abcde',
      'dossier:0123456789abcdef0',
      'dossier:0123456789abcdeg',
      'dossier:0123456789abcdef\n',
      `github.com/acme/${'a'.repeat(200)}`,
      42,
      null,
      { owner: 'acme' },
    ]) {
      expect(IngestPayloadSchema.safeParse(withProject(project)).success, String(project)).toBe(
        false,
      );
    }
  });

  it('PROJECT_KEY_PATTERN est exactement la regex du contrat C8', () => {
    expect(PROJECT_KEY_PATTERN.source).toBe(
      String.raw`^(github\.com\/[a-z0-9._-]+\/[a-z0-9._-]+|dossier:[0-9a-f]{16})$`,
    );
  });
});

// Ce qu'écrit l'assistant pour `projet` (briefing) et `depot` (search) : une clé de projet, ou rien.
describe('projectKeyFromInput', () => {
  it.each([
    ['Acme/Leon/', 'github.com/acme/leon'],
    ['https://github.com/acme/leon.git', 'github.com/acme/leon'],
    ['GITHUB.COM/acme/leon', 'github.com/acme/leon'],
    ['DOSSIER:0123456789ABCDEF', 'dossier:0123456789abcdef'],
    ['acme/..', null],
    ['./leon', null],
    ['https://u:t@github.com/a/b', null],
    ['gitlab.com/a/b', null],
    ['dossier:xyz', null],
  ])('%s → %s', (input, key) => {
    expect(projectKeyFromInput(input)).toBe(key);
  });
});

describe('TurnSchema', () => {
  it('refuse le rôle participant, réservé aux connecteurs', () => {
    expect(TurnSchema.safeParse({ ...turn, role: 'participant' }).success).toBe(false);
    expect(TurnSchema.safeParse({ ...turn, role: 'document' }).success).toBe(false);
  });

  it('refuse le mode de capture connector', () => {
    expect(TurnSchema.safeParse({ ...turn, capture_mode: 'connector' }).success).toBe(false);
  });
});

describe('listes de types', () => {
  it('donne 42 connecteurs, sans doublon ni recouvrement avec la capture', () => {
    expect(PROVIDER_IDS).toHaveLength(42);
    expect(new Set(PROVIDER_IDS).size).toBe(42);
    for (const kind of CAPTURE_KINDS) expect(PROVIDER_IDS).not.toContain(kind);
  });

  it('TOOL_KINDS = les types de capture, le document ajouté à la main, puis les 42 connecteurs, sans doublon', () => {
    expect(TOOL_KINDS).toEqual([...CAPTURE_KINDS, 'document', ...PROVIDER_IDS]);
    expect(new Set(TOOL_KINDS).size).toBe(TOOL_KINDS.length);
  });

  // T18 : Codex rejoint Claude Code parmi les sessions de code, celles dont la CLI relève les gestes.
  it('CODE_SESSION_KINDS = Claude Code, Codex et Cursor, des types de capture ; isCodeSessionKind les reconnaît seuls', () => {
    expect(CODE_SESSION_KINDS).toEqual(['claude_code', 'codex', 'cursor']);
    for (const kind of CODE_SESSION_KINDS) expect(CAPTURE_KINDS).toContain(kind);
    expect(CAPTURE_KINDS.filter(isCodeSessionKind)).toEqual(['claude_code', 'codex', 'cursor']);
    expect(isCodeSessionKind('github')).toBe(false);
  });

  // T39 : le fil de travail est un type de source que seul le serveur crée (D21) ; aucun outil ne le dépose.
  it('SOURCE_KINDS = les types des outils, puis le fil de travail, hors de la capture', () => {
    expect(SOURCE_KINDS).toEqual([...TOOL_KINDS, 'leon_fil']);
    expect(CAPTURE_KINDS).not.toContain('leon_fil');
    expect(TOOL_KINDS).not.toContain('leon_fil');
  });

  it('ITEM_NATURES : les onze natures de source (C4, puis le fil de travail de D21), dans cet ordre, sans doublon', () => {
    expect(ITEM_NATURES).toEqual([
      'conversation',
      'reunion',
      'page',
      'ticket',
      'fil',
      'note',
      'mail',
      'fichier',
      'evenement',
      'commit',
      'fil_de_travail',
    ]);
    expect(new Set(ITEM_NATURES).size).toBe(ITEM_NATURES.length);
  });
});
