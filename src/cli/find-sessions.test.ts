import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findAntigravitySessionFiles,
  findCodexSessionFiles,
  findCursorSessionFiles,
  findSessionFiles,
} from './find-sessions';

let baseDir: string;
let projectDir: string;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'leon-find-'));
  projectDir = join(baseDir, 'projects', 'demo');
  await mkdir(projectDir, { recursive: true });
});
afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

const line = (fields: Record<string, unknown>) => JSON.stringify(fields);
const turn = (uuid: string, timestamp: string) =>
  line({ type: 'user', uuid, timestamp, message: { content: 'Bonjour' } });

async function session(name: string, lines: string[], modified: Date): Promise<string> {
  const path = join(projectDir, name);
  await writeFile(path, `${lines.join('\n')}\n`);
  await utimes(path, modified, modified);
  return path;
}

describe('findSessionFiles', () => {
  it('range les sessions par l’heure de leur premier tour, pas par date de modification', async () => {
    // L'ancienne session a été touchée après la récente (reprise, copie, sauvegarde restaurée).
    const old = await session(
      'b.jsonl',
      [line({ type: 'mode' }), turn('a1', '2026-10-13T08:00:00.000Z')],
      new Date(2026, 9, 20),
    );
    const recent = await session(
      'a.jsonl',
      [turn('b1', '2026-10-14T10:00:00.000Z')],
      new Date(2026, 9, 15),
    );
    expect(await findSessionFiles(baseDir)).toEqual([old, recent]);
  });

  it('à premier tour égal (session reprise), la première ligne datée départage', async () => {
    const history = [
      line({ type: 'attachment', uuid: 'x0', timestamp: '2026-10-14T07:59:28.000Z' }),
      turn('x1', '2026-10-14T07:59:38.000Z'),
    ];
    const original = await session('b.jsonl', history, new Date(2026, 9, 20));
    // La reprise écrit d'abord une ligne à l'heure de la reprise, puis recopie l'historique.
    const resumed = await session(
      'a.jsonl',
      [line({ type: 'queue-operation', timestamp: '2026-10-14T14:11:53.000Z' }), ...history],
      new Date(2026, 9, 15),
    );
    expect(await findSessionFiles(baseDir)).toEqual([original, resumed]);
  });
});

describe('findCodexSessionFiles', () => {
  const rollout = async (relative: string, modified: Date) => {
    const path = join(baseDir, 'sessions', relative);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '{}\n');
    await utimes(path, modified, modified);
    return path;
  };

  it('rend les rollouts de sessions/AAAA/MM/JJ, du moins récemment modifié au plus récent', async () => {
    const recent = await rollout(
      '2026/11/06/rollout-2026-11-06T09-00-00-b.jsonl',
      new Date('2026-11-06T10:00:00Z'),
    );
    const ancien = await rollout(
      '2026/10/30/rollout-2026-10-30T09-00-00-a.jsonl',
      new Date('2026-11-01T10:00:00Z'),
    );

    const found = await findCodexSessionFiles(baseDir);

    expect(found.map((file) => file.path)).toEqual([ancien, recent]);
    expect(found[1]?.mtimeMs).toBe(new Date('2026-11-06T10:00:00Z').getTime());
    expect(found[1]?.size).toBe(3);
  });

  it('ignore un rollout compressé, un autre fichier, un dossier trop profond, un dossier absent', async () => {
    await rollout('2026/11/06/rollout-2026-11-06T09-00-00-c.jsonl.zst', new Date());
    await rollout('2026/11/06/notes.jsonl', new Date());
    await rollout('2026/11/06/x/rollout-2026-11-06T09-00-00-d.jsonl', new Date());

    expect(await findCodexSessionFiles(baseDir)).toEqual([]);
    expect(await findCodexSessionFiles(join(baseDir, 'absent'))).toEqual([]);
  });
});

describe('findCursorSessionFiles', () => {
  const transcript = async (relative: string) => {
    const path = join(baseDir, 'projects', relative);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '{}\n');
    return path;
  };

  it('rend les transcripts des conversations, pas ceux des sous-agents ni la base de Cursor', async () => {
    const own = await transcript('Users-demo-leon/agent-transcripts/c1/c1.jsonl');
    const flat = await transcript('Users-demo-leon/agent-transcripts/c2.jsonl');
    await transcript('Users-demo-leon/agent-transcripts/c1/subagents/s1.jsonl');
    await transcript('Users-demo-leon/agent-transcripts/c3/autre.jsonl');
    await transcript('Users-demo-leon/state.vscdb');

    const found = (await findCursorSessionFiles(baseDir)).map((file) => file.path).sort();

    expect(found).toEqual([own, flat].sort());
  });
});

describe('findAntigravitySessionFiles', () => {
  const transcript = async (relative: string) => {
    const path = join(baseDir, relative);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '{}\n');
    return path;
  };

  it('un transcript par conversation, transcript_full.jsonl d’abord, dans l’app, l’IDE et la CLI', async () => {
    const full = await transcript(
      'antigravity/brain/c1/.system_generated/logs/transcript_full.jsonl',
    );
    await transcript('antigravity/brain/c1/.system_generated/logs/transcript.jsonl');
    const cli = await transcript(
      'antigravity-cli/brain/c2/.system_generated/logs/transcript.jsonl',
    );
    await transcript('antigravity/conversations/c1.pb');
    await transcript('antigravity/brain/c3/task.md');

    const found = (await findAntigravitySessionFiles(baseDir)).map((file) => file.path).sort();

    expect(found).toEqual([full, cli].sort());
  });
});
