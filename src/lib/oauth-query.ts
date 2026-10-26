export function serializeOAuthQuery(params: Record<string, string | string[] | undefined>): string {
  if (typeof params.oauth_query === 'string') return params.oauth_query;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') query.set(key, value);
    else if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    }
  }
  return query.toString();
}
