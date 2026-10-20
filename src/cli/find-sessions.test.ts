import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findSessionFiles } from './find-sessions';

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
