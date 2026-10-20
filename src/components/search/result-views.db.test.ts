import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import type { SourceKind } from '@/capture/turn';
import { SourceChip } from '@/components/source-chip';
import type { TenantContext } from '@/server/auth/tenant-context';
import { fetchPassageContext } from '@/server/search/context';
import { searchPassages } from '@/server/search/search';
import { dropTeams, newTeam, seedIndexed } from '@/test/seed-indexed';
import { toPreviewView, toResultViews } from './view-model';

// De la base à l'écran : ce que la recherche rend d'une source dont l'outil n'est pas dans le code passe par la
// fabrique des vues et par la puce de l'outil sans lever. Depuis 0010, `sources.kind` n'a plus de contrainte en
// base : une ligne écrite par une autre version du code, ou d'un outil retiré, arrive jusqu'à la page.

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

describe('une source d’un outil que le code ne connaît pas', () => {
  it('se cherche, s’affiche et s’ouvre en aperçu sans faire tomber la page', async () => {
    const { tenantId, members } = await newTeam(['Alice'], tenantIds);
    const alice = members[0] as TenantContext;
    await seedIndexed(alice, {
      kind: 'nouvel_outil' as SourceKind,
      acl: [tenantId],
      title: 'Plafond de dépenses',
      turns: [{ text: 'le plafond ouistitiblanc est relevé' }],
    });
    await seedIndexed(alice, {
      kind: 'github',
      acl: [tenantId],
      title: 'Ticket voisin',
      turns: [{ text: 'le ticket parle aussi de ouistitiblanc' }],
    });

    const found = await searchPassages(alice, { query: 'ouistitiblanc', embedder: null });
    const views = toResultViews(found.hits);

    expect(views).toHaveLength(2);
    const unknown = views.find((view) => view.title === 'Plafond de dépenses');
    expect(unknown).toMatchObject({ kind: 'other', kindLabel: 'nouvel_outil' });
    for (const view of views) {
      expect(view.kindLabel).toMatch(/\S/);
      const html = renderToStaticMarkup(
        createElement(SourceChip, { kind: view.kind, label: view.kindLabel }),
      );
      expect(html).toContain(view.kindLabel);
    }

    const hit = found.hits.find((candidate) => candidate.title === 'Plafond de dépenses');
    const context = await fetchPassageContext(alice, hit?.passages[0]?.passageId as string);
    expect(context).not.toBeNull();
    expect(toPreviewView(context as NonNullable<typeof context>).kindLabel).toBe('nouvel_outil');
  });
});
