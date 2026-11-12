import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CoulisseBlocSchema } from './api-contract';
import { SECRET_MASK } from './mask-secrets';
import { extractBackstage } from './session-backstage';
import { TURN_TEXT_MAX } from './turn';

const RACINE = '/Users/demo/projets/leon';
const DOSSIER = './fixtures/claude-code-sous-agents/55555555-5555-4555-8555-555555555555';
const lire = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SESSION = lire(`${DOSSIER}.jsonl`);
const SOUS_AGENTS = new Map([
  ['toolu_01Depot', lire(`${DOSSIER}/subagents/agent-a1b2c3d4e5f6a7b8c.jsonl`)],
  ['toolu_01Petit', lire(`${DOSSIER}/subagents/agent-b9c8d7e6f5a4b3c2d.jsonl`)],
]);
const FAUX_SECRET = `ghp_${'a'.repeat(36)}`;

// Des lignes inventées dans la forme de l'annexe 08 (Claude Code 2.1.322).
const TS = '2026-11-12T10:00:00.000Z';
const ligne = (type: string, uuid: string, content: unknown, extra = {}) =>
  JSON.stringify({ type, uuid, timestamp: TS, message: { content }, ...extra });
const appel = (id: string, name: string, input: unknown, extra = {}) =>
  ligne('assistant', `l-${id}`, [{ type: 'tool_use', id, name, input }], extra);
const resultat = (id: string, content: unknown, extra = {}, bloc = {}) =>
  ligne('user', `r-${id}`, [{ type: 'tool_result', tool_use_id: id, content, ...bloc }], extra);
const pensee = (uuid: string, thinking: string, extra = {}) =>
  ligne('assistant', uuid, [{ type: 'thinking', thinking, signature: 'c2lnbmF0dXJl' }], extra);
const SA = { isSidechain: true };
// Le rapport final d'un sous-agent : un message assistant fini par end_turn.
const fini = (texte: string) =>
  JSON.stringify({
    type: 'assistant',
    uuid: 'fin',
    timestamp: TS,
    isSidechain: true,
    message: { content: [{ type: 'text', text: texte }], stop_reason: 'end_turn' },
  });
const extraire = (lignes: string[], subagents: Map<string, string> = new Map()) =>
  extractBackstage(lignes.join('\n'), RACINE, subagents);
const appelSeul = (name: string, input: unknown) =>
  extraire([appel('t1', name, input), resultat('t1', 'sortie')]);

describe('extractBackstage', () => {
  it('relève la fixture dans l’ordre du temps : le raisonnement, les sous-agents et leurs appels', () => {
    expect(extractBackstage(SESSION, RACINE, SOUS_AGENTS)).toEqual([
      {
        role: 'raisonnement',
        id: 'u-2:0',
        ts: '2026-11-12T10:00:02.500Z',
        texte: 'Il faut trouver la route des faits, puis ses tests.',
      },
      {
        role: 'appel_outil',
        id: 'toolu_01Depot',
        ts: '2026-11-12T10:00:04.000Z',
        outil: 'Agent',
        statut: 'ok',
      },
      {
        role: 'sous_agent',
        id: 'toolu_01Depot:consigne',
        ts: '2026-11-12T10:00:04.000Z',
        partie: 'consigne',
        texte: 'Trouve les tests de la route des faits.',
      },
      {
        role: 'appel_outil',
        id: 'toolu_01Lire',
        ts: '2026-11-12T10:00:09.000Z',
        outil: 'Read',
        cible: 'src/server/api/faits-routes.ts',
        statut: 'ok',
      },
      {
        role: 'appel_outil',
        id: 'toolu_01Chercher',
        ts: '2026-11-12T10:00:11.000Z',
        outil: 'Grep',
        cible: 'src',
        statut: 'ok',
      },
      {
        role: 'appel_outil',
        id: 'toolu_01Tester',
        ts: '2026-11-12T10:00:13.000Z',
        outil: 'Bash',
        cible: 'pnpm test',
        statut: 'ok',
      },
      {
        role: 'appel_outil',
        id: 'toolu_01Petit',
        ts: '2026-11-12T10:00:15.000Z',
        outil: 'Agent',
        statut: 'ok',
      },
      {
        role: 'sous_agent',
        id: 'toolu_01Petit:consigne',
        ts: '2026-11-12T10:00:15.000Z',
        partie: 'consigne',
        texte: 'Relis faits-routes.db.test.ts.',
      },
      {
        role: 'sous_agent',
        id: 'toolu_01Depot:rapport',
        ts: '2026-11-12T10:00:17.000Z',
        partie: 'rapport',
        texte: 'Les tests sont dans faits-routes.db.test.ts.',
      },
      {
        role: 'appel_outil',
        id: 'toolu_01Relire',
        ts: '2026-11-12T10:00:19.000Z',
        outil: 'Read',
        cible: 'src/server/api/faits-routes.db.test.ts',
        statut: 'ok',
      },
      {
        role: 'sous_agent',
        id: 'toolu_01Petit:rapport',
        ts: '2026-11-12T10:00:21.000Z',
        partie: 'rapport',
        texte: 'Le test couvre 202 et 400.',
      },
    ]);
  });

  it('sans les fichiers des sous-agents, la consigne part seule, sans leurs appels ni leur rapport', () => {
    const roles = extractBackstage(SESSION, RACINE, new Map()).map(({ id }) => id);

    expect(roles).toEqual(['u-2:0', 'toolu_01Depot', 'toolu_01Depot:consigne']);
  });

  describe('la préparation des textes', () => {
    it('masque un faux secret et retire un bloc de Leon', () => {
      const [bloc] = extraire([
        pensee('p1', `<contexte-leon>Le sommaire.</contexte-leon>Je garde ${FAUX_SECRET}.`),
      ]);

      expect(bloc).toEqual({
        role: 'raisonnement',
        id: 'p1:0',
        ts: TS,
        texte: `Je garde ${SECRET_MASK}.`,
      });
    });

    it('coupe à 20 000 caractères', () => {
      const [bloc] = extraire([pensee('p1', 'x'.repeat(30_000))]);

      expect(bloc?.role === 'raisonnement' && bloc.texte.length).toBe(TURN_TEXT_MAX);
    });

    it('prépare aussi la consigne et le rapport d’un sous-agent', () => {
      const blocs = extraire(
        [appel('a1', 'Agent', { prompt: `Cherche ${FAUX_SECRET}.` })],
        new Map([['a1', fini(`<rappel-leon>Rappel.</rappel-leon>Trouvé ${FAUX_SECRET}.`)]]),
      );

      expect(blocs.filter((bloc) => bloc.role === 'sous_agent')).toMatchObject([
        { id: 'a1:consigne', texte: `Cherche ${SECRET_MASK}.` },
        { id: 'a1:rapport', texte: `Trouvé ${SECRET_MASK}.` },
      ]);
    });

    it.each([
      ['vide (claude -p)', ''],
      ['blanc', '  \n'],
      ['un rappel système seul', '<system-reminder>Rappel.</system-reminder>'],
      ['un bloc de Leon seul', '<contexte-leon>Le sommaire.</contexte-leon>'],
    ])('un raisonnement %s n’est pas relevé', (_cas, texte) => {
      expect(extraire([pensee('p1', texte)])).toEqual([]);
    });

    it('le raisonnement d’un sous-agent ne part pas, ni celui d’une ligne isSidechain de la session', () => {
      const blocs = extraire(
        [
          pensee('p1', 'Pensée de l’ancienne forme.', SA),
          appel('a1', 'Agent', { prompt: 'Cherche.' }),
        ],
        new Map([['a1', [pensee('p2', 'Pensée du sous-agent.', SA), fini('Fini.')].join('\n')]]),
      );

      expect(blocs.some((bloc) => bloc.role === 'raisonnement')).toBe(false);
    });
  });

  describe('les sous-agents', () => {
    it('un sous-agent coupé avant son rapport : la consigne sans rapport, l’appel sans résultat', () => {
      const coupe = [
        ligne('user', 's0', 'Cherche.', SA),
        appel('s1', 'Bash', { command: 'perl long.pl' }, SA),
      ].join('\n');

      expect(
        extraire([appel('a1', 'Agent', { prompt: 'Cherche.' })], new Map([['a1', coupe]])),
      ).toEqual([
        { role: 'appel_outil', id: 'a1', ts: TS, outil: 'Agent', statut: 'sans_resultat' },
        { role: 'sous_agent', id: 'a1:consigne', ts: TS, partie: 'consigne', texte: 'Cherche.' },
        {
          role: 'appel_outil',
          id: 's1',
          ts: TS,
          outil: 'Bash',
          cible: 'perl',
          statut: 'sans_resultat',
        },
      ]);
    });

    it('un rapport suivi d’une autre ligne de conversation n’est pas un rapport final', () => {
      const blocs = extraire(
        [appel('a1', 'Task', { prompt: 'Cherche.' })],
        new Map([['a1', [fini('Pas fini.'), ligne('user', 's0', 'Encore.', SA)].join('\n')]]),
      );

      expect(blocs.map(({ id }) => id)).toEqual(['a1', 'a1:consigne']);
    });

    it('un appel d’un sous-agent et d’un sous-agent de sous-agent est relevé dans la même forme', () => {
      const petit = [
        appel('s2', 'Edit', { file_path: `${RACINE}/b.ts` }, SA),
        resultat('s2', 'ok', SA),
        fini('B.'),
      ];
      const grand = [
        appel('s1', 'Edit', { file_path: `${RACINE}/a.ts` }, SA),
        resultat('s1', 'ok', SA),
        appel('a2', 'Agent', { prompt: 'Va plus loin.' }, SA),
        resultat('a2', 'B.', SA),
        fini('A.'),
      ];
      const blocs = extraire(
        [appel('a1', 'Agent', { prompt: 'Va.' })],
        new Map([
          ['a1', grand.join('\n')],
          ['a2', petit.join('\n')],
        ]),
      );

      expect(blocs.filter((bloc) => bloc.role === 'appel_outil' && bloc.outil === 'Edit')).toEqual([
        { role: 'appel_outil', id: 's1', ts: TS, outil: 'Edit', cible: 'a.ts', statut: 'ok' },
        { role: 'appel_outil', id: 's2', ts: TS, outil: 'Edit', cible: 'b.ts', statut: 'ok' },
      ]);
    });
  });

  describe('les appels d’outils', () => {
    it.each([
      ['curl -u a:X https://exemple.test', 'curl'],
      ['PGPASSWORD=X psql -h base', 'psql'],
    ])('Bash « %s » donne %s', (command, cible) => {
      expect(appelSeul('Bash', { command })).toMatchObject([{ outil: 'Bash', cible }]);
    });

    it('un Bash sans exécutable n’a pas de cible', () => {
      expect(appelSeul('Bash', { command: 'A=1' })[0]).not.toHaveProperty('cible');
    });

    it.each([
      [
        'un Edit hors du dépôt',
        'Edit',
        { file_path: '/Users/demo/ailleurs/x.ts', old_string: 'a' },
      ],
      ['un Grep sans path', 'Grep', { pattern: 'motif-cherche' }],
      ['un WebFetch', 'WebFetch', { url: 'https://exemple.test/page', prompt: 'Résume.' }],
      ['un outil inconnu', 'Inconnu', { path: `${RACINE}/src` }],
    ])('%s n’a pas de cible', (_cas, name, input) => {
      const [bloc] = appelSeul(name, input);

      expect(bloc).toEqual({ role: 'appel_outil', id: 't1', ts: TS, outil: name, statut: 'ok' });
    });

    it('un Grep ne garde que son path, jamais son motif ; NotebookEdit garde notebook_path', () => {
      expect(appelSeul('Grep', { pattern: 'motif-cherche', path: `${RACINE}/src` })).toMatchObject([
        { cible: 'src' },
      ]);
      expect(appelSeul('NotebookEdit', { notebook_path: `${RACINE}/n.ipynb` })).toMatchObject([
        { cible: 'n.ipynb' },
      ]);
    });

    it.each([
      ['mcp__x__y', 'mcp:x'],
      ['mcp__x', '[outil]'],
    ])('%s donne %s', (name, outil) => {
      expect(appelSeul(name, {})).toEqual([
        { role: 'appel_outil', id: 't1', ts: TS, outil, statut: 'ok' },
      ]);
    });

    it('le statut : sans tool_result, sans_resultat ; is_error, erreur ; un refus, erreur', () => {
      const blocs = extraire([
        appel('t1', 'Read', {}),
        appel('t2', 'Read', {}),
        resultat('t2', 'File does not exist.', {}, { is_error: true }),
        appel('t3', 'Write', {}),
        resultat(
          't3',
          'Permission denied.',
          { permissionDecision: { decision: 'reject' } },
          { is_error: true },
        ),
      ]);

      expect(blocs.map((bloc) => bloc.role === 'appel_outil' && bloc.statut)).toEqual([
        'sans_resultat',
        'erreur',
        'erreur',
      ]);
    });

    it('un bloc recopié dans une ligne api-request-blob, ou sur deux lignes, n’est relevé qu’une fois', () => {
      const copie = JSON.stringify({
        type: 'api-request-blob',
        hash: 'f',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 't1', name: 'Read', input: {} },
            { type: 'tool_use', id: 'copie', name: 'Read', input: {} },
            { type: 'tool_result', tool_use_id: 't1', content: 'x', is_error: true },
            { type: 'thinking', thinking: 'Pensée recopiée.', signature: 's' },
          ],
        },
      });

      const blocs = extraire([
        appel('t1', 'Read', {}),
        copie,
        appel('t1', 'Read', {}),
        resultat('t1', 'ok'),
      ]);

      expect(blocs).toEqual([
        { role: 'appel_outil', id: 't1', ts: TS, outil: 'Read', statut: 'ok' },
      ]);
    });
  });

  it('une chaîne témoin dans la sortie d’un outil, l’argument d’un autre et un champ de l’appel Agent autre que prompt n’apparaît nulle part', () => {
    const TEMOIN = 'temoin-7f3a9c';
    const blocs = extraire(
      [
        appel('t1', 'Read', { file_path: `${RACINE}/a.ts` }),
        resultat('t1', `contenu ${TEMOIN}`),
        appel('t2', 'Grep', { pattern: TEMOIN, path: `${RACINE}/src`, glob: TEMOIN }),
        resultat('t2', [{ type: 'text', text: TEMOIN }]),
        appel('t3', 'Bash', { command: `echo ${TEMOIN}`, description: TEMOIN }),
        appel('a1', 'Agent', { prompt: 'Cherche.', description: TEMOIN, subagent_type: TEMOIN }),
        resultat('a1', TEMOIN, {
          toolUseResult: {
            status: 'completed',
            prompt: TEMOIN,
            content: [{ type: 'text', text: TEMOIN }],
          },
        }),
      ],
      new Map([['a1', fini('Fini.')]]),
    );

    expect(blocs.length).toBe(6);
    expect(JSON.stringify(blocs)).not.toContain(TEMOIN);
  });

  it('chaque bloc passe le schéma de C10', () => {
    const blocs = [
      ...extractBackstage(SESSION, RACINE, SOUS_AGENTS),
      ...appelSeul('mcp__linear__get_issue', {}),
      ...extraire([pensee('p1', 'x'.repeat(30_000))]),
    ];

    for (const bloc of blocs) expect(CoulisseBlocSchema.parse(bloc)).toEqual(bloc);
  });
});
