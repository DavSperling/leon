import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ConnectorAuthError, createConnectorHttp } from '@/server/connectors/http';
import { members, users } from '@/server/db/schema/auth';
import { reportingLines } from '@/server/db/schema/organisation';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';
import { auth, socialProviders } from './auth';
import { canInvite } from './members';
import { lockOrganigramme } from './organisation';
import { requestHeaders } from './session';
import type { TenantContext } from './tenant-context';

// L'organigramme importé de l'annuaire de Google Workspace ou de Microsoft 365, à la demande d'un propriétaire ou d'un
// administrateur : qui est le manager de qui, rien d'autre (le service et le poste se choisissent à l'invitation).
// Les gens de l'annuaire absents de Leon sont ignorés ; un rattachement fait ou retiré à la main dans Leon n'est
// jamais touché (0058). L'accès passe par la connexion Google ou Microsoft de la personne (Better Auth), élargie au
// droit de lire l'annuaire.

export const DIRECTORY_SCOPES = {
  google: 'https://www.googleapis.com/auth/admin.directory.user.readonly',
  microsoft: 'User.Read.All',
} as const;
export type DirectoryProvider = keyof typeof DIRECTORY_SCOPES;
export type DirectoryError = 'droits' | 'injoignable';

// Proposé seulement si la connexion par ce fournisseur est réglée sur le serveur (auth.ts).
export const directoryProviders = (): DirectoryProvider[] =>
  (['google', 'microsoft'] as const).filter((provider) => Object.hasOwn(socialProviders, provider));

// Une personne de l'annuaire : ses adresses et celle de son manager, en minuscules.
export type Person = { emails: string[]; manager: string | null };

const lower = (value: string | null | undefined): string | null =>
  value?.trim().toLowerCase() || null;

// Admin SDK, users.list (doc lue le 09/11/2026,
// https://developers.google.com/workspace/admin/directory/reference/rest/v1/users/list) : customer=my_customer = tout
// le compte, 100 personnes par page, nextPageToken ; vue administrateur par défaut, réservée à un administrateur de
// l'annuaire. Le manager est une relation de type « manager », son adresse en valeur.
const GoogleUsersSchema = z.object({
  users: z
    .array(
      z.object({
        primaryEmail: z.string(),
        relations: z
          .array(z.object({ type: z.string().nullish(), value: z.string().nullish() }))
          .nullish(),
      }),
    )
    .nullish(),
  nextPageToken: z.string().nullish(),
});

// Graph, GET /users?$expand=manager (doc lue le 09/11/2026,
// https://learn.microsoft.com/en-us/graph/api/user-list-manager) : droit délégué User.Read.All, que seul un
// administrateur Microsoft accorde ; le manager direct de chacun ; pages suivantes par @odata.nextLink. L'adresse
// d'une personne : mail, ou son nom de connexion (userPrincipalName), souvent différent.
const GraphAddressSchema = z.object({
  mail: z.string().nullish(),
  userPrincipalName: z.string().nullish(),
});
const GraphUsersSchema = z.object({
  value: z.array(GraphAddressSchema.extend({ manager: GraphAddressSchema.nullish() })),
  '@odata.nextLink': z.string().nullish(),
});
const GRAPH_USERS =
  'https://graph.microsoft.com/v1.0/users?$select=mail,userPrincipalName&$expand=manager($select=mail,userPrincipalName)';

// Lève ConnectorAuthError si l'annuaire refuse (pas administrateur, droit non accordé), ConnectorHttpError sinon.
export async function readPeople(
  provider: DirectoryProvider,
  token: string,
  fetchImpl?: typeof fetch,
): Promise<Person[]> {
  const headers = { authorization: `Bearer ${token}` };
  const people: Person[] = [];
  if (provider === 'google') {
    const http = createConnectorHttp({
      provider: 'drive',
      hosts: ['admin.googleapis.com'],
      fetchImpl,
    });
    let pageToken: string | undefined;
    do {
      const page = await http.json(
        {
          url: 'https://admin.googleapis.com/admin/directory/v1/users',
          headers,
          query: { customer: 'my_customer', pageToken },
        },
        GoogleUsersSchema,
      );
      for (const user of page.users ?? []) {
        const manager = user.relations?.find((relation) => relation.type === 'manager');
        people.push({ emails: [user.primaryEmail.toLowerCase()], manager: lower(manager?.value) });
      }
      pageToken = page.nextPageToken ?? undefined;
    } while (pageToken);
    return people;
  }
  const http = createConnectorHttp({
    provider: 'outlook',
    hosts: ['graph.microsoft.com'],
    fetchImpl,
  });
  for (let url: string | null | undefined = GRAPH_USERS; url; ) {
    const page: z.infer<typeof GraphUsersSchema> = await http.json(
      { url, headers },
      GraphUsersSchema,
    );
    for (const user of page.value) {
      const emails = [lower(user.mail), lower(user.userPrincipalName)];
      people.push({
        emails: emails.filter(
          (email, at): email is string => email !== null && emails.indexOf(email) === at,
        ),
        manager: lower(user.manager?.mail) ?? lower(user.manager?.userPrincipalName),
      });
    }
    url = page['@odata.nextLink'];
  }
  return people;
}

// Un membre de Leon tel que l'import le voit (adresse en minuscules), et ce que l'import changerait.
export type ImportMember = {
  id: string;
  name: string;
  email: string;
  managerId: string | null;
  byHand: boolean;
  locked?: boolean; // un propriétaire ou l'un de ses managers, et l'import n'est pas d'un propriétaire : jamais déplacé
};
export type ImportChange = {
  memberId: string;
  name: string;
  managerId: string | null;
  managerName: string | null;
  beforeName: string | null;
};
// kept : rattachements faits à la main que l'annuaire contredit, laissés tels quels ; outside : gens de l'annuaire
// absents de Leon, ignorés.
export type ImportPlan = { changes: ImportChange[]; kept: number; outside: number };

export function planImport(people: readonly Person[], inLeon: readonly ImportMember[]): ImportPlan {
  const person = new Map<string, Person>();
  for (const one of people) for (const email of one.emails) person.set(email, one);
  const byEmail = new Map(inLeon.map((member) => [member.email, member]));
  const byId = new Map(inLeon.map((member) => [member.id, member]));

  // Le manager d'après l'annuaire, parmi les membres de Leon : quand le manager n'est pas dans Leon, celui au-dessus
  // de lui, et ainsi de suite (sinon les gens sous un absent n'apparaîtraient chez personne). Une personne se
  // reconnaît à n'importe laquelle de ses adresses : Microsoft désigne souvent le manager par son nom de connexion.
  const bossOf = (member: ImportMember): string | null => {
    const seen = new Set<string>();
    let at = person.get(member.email)?.manager ?? null;
    while (at !== null && !seen.has(at)) {
      seen.add(at);
      const boss = person.get(at);
      const found =
        byEmail.get(at) ?? boss?.emails.map((email) => byEmail.get(email)).find(Boolean);
      if (found) return found.id === member.id ? null : found.id;
      at = boss?.manager ?? null;
    }
    return null;
  };

  const wanted = new Map<string, string | null>();
  let kept = 0;
  for (const member of inLeon) {
    if (member.locked || !person.has(member.email)) continue; // verrouillé, ou absent de l'annuaire : rien ne change
    const boss = bossOf(member);
    if (boss === member.managerId) continue;
    if (member.byHand) kept += 1;
    else wanted.set(member.id, boss);
  }

  // Jamais de boucle : l'organigramme actuel n'en a pas, donc toute boucle passe par un changement ; on retire les
  // changements pris dans une boucle (annuaire mal rempli, ou rattachement fait à la main) jusqu'à n'en plus voir.
  const managerOf = (id: string) =>
    (wanted.has(id) ? wanted.get(id) : byId.get(id)?.managerId) ?? null;
  const inLoop = (id: string) => {
    let at = managerOf(id);
    for (let step = 0; at !== null && step < inLeon.length; step += 1) {
      if (at === id) return true;
      at = managerOf(at);
    }
    return false;
  };
  for (let id = [...wanted.keys()].find(inLoop); id; id = [...wanted.keys()].find(inLoop)) {
    wanted.delete(id);
  }

  const nameOf = (id: string | null | undefined) => (id ? (byId.get(id)?.name ?? null) : null);
  return {
    changes: [...wanted]
      .map(([memberId, managerId]) => ({
        memberId,
        name: nameOf(memberId) ?? '',
        managerId,
        managerName: nameOf(managerId),
        beforeName: nameOf(byId.get(memberId)?.managerId),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    kept,
    outside: people.filter((one) => !one.emails.some((email) => byEmail.has(email))).length,
  };
}

// Les membres, anciens compris : un compte supprimé garde sa place dans l'organigramme, et la garde contre les boucles
// doit la voir ; son adresse (ancien-…@leon.invalid) n'est dans aucun annuaire, l'import ne le déplace jamais. Comme
// setManager, seul un propriétaire change qui est au-dessus d'un propriétaire : pour un autre lecteur, chaque
// propriétaire et ses managers, directs et indirects, sont verrouillés.
async function membersIn(tx: Tx, ctx: TenantContext): Promise<ImportMember[]> {
  const rows = await tx
    .select({
      id: members.id,
      name: users.name,
      email: sql<string>`lower(${users.email})`,
      managerId: reportingLines.managerId,
      byHand: members.rattachementManuel,
      owner: sql<boolean>`string_to_array(${members.role}, ',') && array['owner']`,
      reader: sql<boolean>`${members.userId} = ${ctx.userId}`,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .leftJoin(reportingLines, eq(reportingLines.memberId, members.id))
    .where(eq(members.organizationId, ctx.tenantId));
  const managerOf = new Map(rows.map((row) => [row.id, row.managerId]));
  const locked = new Set<string>();
  if (!rows.some((row) => row.reader && row.owner)) {
    for (const owner of rows.filter((row) => row.owner)) {
      for (let at: string | null = owner.id; at && !locked.has(at); at = managerOf.get(at) ?? null)
        locked.add(at);
    }
  }
  return rows.map(({ owner, reader, ...member }) => ({ ...member, locked: locked.has(member.id) }));
}

export async function previewImport(
  ctx: TenantContext,
  people: readonly Person[],
): Promise<ImportPlan> {
  return withTenant(ctx, async (tx) => planImport(people, await membersIn(tx, ctx)));
}

// L'aperçu, refait sous le verrou de l'organigramme puis écrit ; null si le lecteur n'est ni propriétaire ni
// administrateur (la RLS le redit, 0057).
// shortcut: l'annuaire est relu ici ; un changement survenu depuis l'aperçu s'applique sans y avoir figuré. Passer
// la liste montrée et n'écrire que ce qu'elle contient si un client le signale.
export async function applyImport(
  ctx: TenantContext,
  people: readonly Person[],
): Promise<number | null> {
  if (!(await canInvite(ctx))) return null;
  return withTenant(ctx, async (tx) => {
    await lockOrganigramme(tx, ctx);
    const { changes } = planImport(people, await membersIn(tx, ctx));
    for (const { memberId, managerId } of changes) {
      if (managerId === null) {
        await tx.delete(reportingLines).where(eq(reportingLines.memberId, memberId));
      } else {
        await tx
          .insert(reportingLines)
          .values({ tenantId: ctx.tenantId, memberId, managerId })
          .onConflictDoUpdate({ target: reportingLines.memberId, set: { managerId } });
      }
    }
    return changes.length;
  });
}

// L'adresse où part un propriétaire ou un administrateur pour ouvrir l'annuaire à Leon : sa connexion Google ou
// Microsoft, avec en plus le droit de lire l'annuaire (Better Auth la relie à son compte s'il ne l'était pas, à la même
// adresse seulement). null : refusé.
export async function directoryLinkUrl(
  ctx: TenantContext,
  provider: string,
): Promise<string | null> {
  const chosen = directoryProviders().find((one) => one === provider);
  if (!chosen || !(await canInvite(ctx))) return null;
  const { url } = await auth.api.linkSocialAccount({
    body: {
      provider: chosen,
      scopes: [DIRECTORY_SCOPES[chosen]],
      callbackURL: `/reglages?annuaire=${chosen}#equipe`,
      errorCallbackURL: '/reglages?annuaire=refus#equipe',
      disableRedirect: true,
    },
    headers: await requestHeaders(),
  });
  return url ?? null;
}

// L'import tel que l'écran des réglages le montre, d'après l'adresse de retour : ?annuaire=google|microsoft (l'aperçu),
// ou ?annuaire=refus et le code d'erreur de Better Auth.
export type DirectoryState = {
  providers: DirectoryProvider[];
  provider?: DirectoryProvider;
  plan?: ImportPlan;
  error?: DirectoryError | 'adresse' | 'refus';
};

export async function directoryState(
  ctx: TenantContext,
  annuaire: string | undefined,
  error: string | undefined,
): Promise<DirectoryState> {
  const providers = directoryProviders();
  if (annuaire === 'refus') {
    return { providers, error: error === 'email_does_not_match' ? 'adresse' : 'refus' };
  }
  const provider = providers.find((one) => one === annuaire);
  if (!provider) return { providers };
  const people = await readDirectory(provider);
  if (typeof people === 'string') return { providers, provider, error: people };
  return { providers, provider, plan: await previewImport(ctx, people) };
}

// Les gens de l'annuaire, lus avec la connexion de la personne. Le jeton vit environ une heure : passé ce délai (ou
// sans le droit de lire l'annuaire), 'droits', et l'import se relance.
export async function readDirectory(
  provider: DirectoryProvider,
  fetchImpl?: typeof fetch,
): Promise<Person[] | DirectoryError> {
  let token: string | undefined;
  try {
    const headers = await requestHeaders();
    const accounts = await auth.api.listUserAccounts({ headers });
    const account = accounts.find((one) => one.providerId === provider);
    if (!account) return 'droits';
    ({ accessToken: token } = await auth.api.getAccessToken({
      body: { accountId: account.id },
      headers,
    }));
  } catch {
    return 'droits';
  }
  if (!token) return 'droits';
  try {
    return await readPeople(provider, token, fetchImpl);
  } catch (error) {
    if (error instanceof ConnectorAuthError) return 'droits';
    logError('annuaire.lecture', error, { provider });
    return 'injoignable';
  }
}
