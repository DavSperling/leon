// ACL = liste de principals (ids d'utilisateurs, ou id du tenant pour « l'équipe »).

export function teamAcl(tenantId: string): string[] {
  return [tenantId];
}

export function authorAcl(userId: string): string[] {
  return [userId];
}

export function isTeamAcl(acl: readonly string[], tenantId: string): boolean {
  return acl.includes(tenantId);
}

export function unionAcl(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])].sort();
}

// Intersection des publics : toutes d'équipe → [tenantId] ; sinon intersection des utilisateurs
// des ACL non-équipe (une ACL d'équipe ne restreint personne dans le tenant).
export function mostRestrictiveAcl(
  acls: ReadonlyArray<readonly string[]>,
  tenantId: string,
): string[] {
  const restricted = acls.filter((acl) => !isTeamAcl(acl, tenantId));
  const [first, ...others] = restricted;
  if (!first) return teamAcl(tenantId);
  return [...new Set(first)].filter((id) => others.every((acl) => acl.includes(id))).sort();
}
