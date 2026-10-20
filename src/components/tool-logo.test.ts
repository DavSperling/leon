import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROVIDER_IDS } from '@/capture/turn';

describe('logos des outils', () => {
  it('chaque outil du catalogue a son logo dans public/logos', () => {
    const missing = PROVIDER_IDS.filter(
      (id) => !existsSync(join(process.cwd(), 'public', 'logos', `${id}.svg`)),
    );
    expect(missing).toEqual([]);
  });
});
