// Le lien vers l'original d'une source, ou null. Il vient d'un outil tiers et finit dans un `href` : seuls http et
// https passent (jamais `javascript:`). Une seule règle pour la recherche, la page Sources et les citations.
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
}
