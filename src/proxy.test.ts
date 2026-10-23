import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { config, proxy } from './proxy';

const request = (init: { method?: string; cookie?: string } = {}) =>
  new NextRequest('http://localhost:3000/', {
    method: init.method ?? 'GET',
    headers: init.cookie ? { cookie: init.cookie } : {},
  });

// En-tête que Next pose sur une réécriture (NextResponse.rewrite).
const rewrittenTo = (response: Response) => response.headers.get('x-middleware-rewrite');

describe('proxy de « / »', () => {
  it('ne vise que la racine', () => {
    expect(config.matcher).toBe('/');
  });

  it('sans session, sert la page d’accueil publique à la même adresse', () => {
    expect(rewrittenTo(proxy(request()))).toBe('http://localhost:3000/accueil');
  });

  it('avec un cookie de session, laisse passer vers la recherche', () => {
    expect(rewrittenTo(proxy(request({ cookie: 'better-auth.session_token=abc' })))).toBeNull();
    expect(
      rewrittenTo(proxy(request({ cookie: '__Secure-better-auth.session_token=abc' }))),
    ).toBeNull();
  });

  it('laisse les server actions (POST) à l’appli', () => {
    expect(rewrittenTo(proxy(request({ method: 'POST' })))).toBeNull();
  });
});
