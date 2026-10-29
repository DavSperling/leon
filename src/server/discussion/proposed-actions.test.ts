import { describe, expect, it } from 'vitest';
import { ACTION_RUNNING_MS } from '@/lib/actions';
import { type ActionRow, toView } from './proposed-actions';

// La vue d'une ligne d'action, telle que la page la reçoit.

const ago = (ms: number) => new Date(Date.now() - ms);
const row = (extra: Partial<ActionRow>) =>
  ({
    id: 'a1',
    kind: 'github.ecrire_fichier',
    params: {
      repo: 'acme/leon',
      branch: 'x',
      path: 'a.md',
      message: 'm',
      content: 'tout le fichier',
      diff: '+ a',
    },
    status: 'proposee',
    result: null,
    createdAt: ago(0),
    decidedAt: null,
    ...extra,
  }) as ActionRow;

describe('toView', () => {
  it('n’envoie pas le contenu entier du fichier écrit à la page', () => {
    const view = toView(row({}));

    expect(view?.params).not.toHaveProperty('content');
    expect(view?.params.diff).toBe('+ a');
  });

  it('montre « echouee, incertain » une action restée en cours plus de cinq minutes', () => {
    const stuck = toView(row({ status: 'en-cours', decidedAt: ago(ACTION_RUNNING_MS + 1000) }));
    const running = toView(row({ status: 'en-cours', decidedAt: ago(1000) }));

    expect(stuck).toMatchObject({ status: 'echouee', result: { url: null, error: 'incertain' } });
    expect(running).toMatchObject({ status: 'en-cours', result: { error: null } });
  });
});
