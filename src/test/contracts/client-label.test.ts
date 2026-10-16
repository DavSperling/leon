import { describe, expect, it } from 'vitest';
import { clientLabelFromUserAgent } from '@/server/mcp/client-label';
import { listFiles, readText } from './files';

// read_log.client et task_events.client refusent tout ce que le check de leur colonne n'accepte
// pas : si le nettoyeur de User-Agent dérive, l'écriture entière échoue (tâche et événement).
const CLIENT_CHECK = /check \(client ~ '([^']+)'\)/g;

const USER_AGENTS = [
  'claude-code/2.1.296 (darwin)',
  'Mozilla/5.0 (Macintosh)',
  '',
  '   ',
  undefined,
  '!!!/1.0',
  'Mon_Client+é$/1.0',
  'a'.repeat(100),
  '..',
];

function clientChecks(): string[] {
  return listFiles('src/server/db/migrations/*.sql').flatMap((path) =>
    [...readText(path).matchAll(CLIENT_CHECK)].map((match) => match[1] as string),
  );
}

describe('libellé du client', () => {
  it('trouve le même motif dans les colonnes client des migrations', () => {
    const checks = clientChecks();
    expect(checks.length).toBeGreaterThanOrEqual(2);
    expect(new Set(checks).size).toBe(1);
  });

  it('sort des libellés que les colonnes acceptent', () => {
    const [pattern] = clientChecks();
    const labels = USER_AGENTS.map(clientLabelFromUserAgent);
    expect(labels.filter((label) => !new RegExp(pattern as string).test(label))).toEqual([]);
  });
});
