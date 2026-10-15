import { describe, expect, it, vi } from 'vitest';
import { createRegistry } from './use-task-shortcuts';

describe('registre des raccourcis', () => {
  it('ne répond à rien tant que personne ne s’est inscrit', () => {
    const registry = createRegistry();
    expect(registry.has('create')).toBe(false);
    expect(registry.run('create')).toBe(false);
  });

  it('lance le gestionnaire inscrit', () => {
    const registry = createRegistry();
    const create = vi.fn();
    registry.register({ create });
    expect(registry.has('create')).toBe(true);
    expect(registry.run('create')).toBe(true);
    expect(create).toHaveBeenCalledOnce();
  });

  it('laisse le dernier inscrit répondre, puis rend la main à l’autre quand il part', () => {
    const registry = createRegistry();
    const first = vi.fn();
    const second = vi.fn();
    registry.register({ status: first });
    const unregister = registry.register({ status: second });
    registry.run('status');
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    unregister();
    registry.run('status');
    expect(first).toHaveBeenCalledOnce();
  });

  it('garde les touches de chacun : une inscription n’en cache pas une autre', () => {
    const registry = createRegistry();
    const create = vi.fn();
    registry.register({ create });
    registry.register({ filter: vi.fn() });
    expect(registry.run('create')).toBe(true);
    expect(create).toHaveBeenCalledOnce();
  });

  it('rend faux quand le gestionnaire décline la touche', () => {
    const registry = createRegistry();
    registry.register({ open: () => false });
    expect(registry.run('open')).toBe(false);
  });

  it('retire les gestionnaires d’un composant démonté', () => {
    const registry = createRegistry();
    const unregister = registry.register({ create: vi.fn() });
    unregister();
    expect(registry.has('create')).toBe(false);
  });
});
