import { z } from 'zod';
import { logError } from '@/server/log';
import {
  ConnectorAuthError,
  type ConnectorHttp,
  ConnectorHttpError,
  type HttpRequest,
} from '../http';

// Les requêtes vers l'API REST de GitHub et la forme des réponses lues (seulement les champs utiles).

const API = 'https://api.github.com';
const ISSUES_PER_PAGE = 50;
const COMMENTS_PER_PAGE = 100; // le maximum de GitHub
const PULL_FILES_MAX = 300; // les fichiers d'une PR lus pour la discussion (3 pages de 100)

const Author = z.object({ login: z.string() }).nullish(); // nul quand le compte a été supprimé
// Le lien de l'auteur avec le dépôt (OWNER, MEMBER, COLLABORATOR, CONTRIBUTOR, NONE…) : GitHub le donne
// pour un ticket, une PR, un commentaire et un avis. Il dit si l'auteur est de l'équipe, pas son nom.
const Association = z.string().nullish();

export const IssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullish(),
  html_url: z.string(),
  user: Author,
  author_association: Association,
  updated_at: z.string(),
  comments: z.number().optional(), // nombre de commentaires : 0 évite une requête
  // L'état (T13) : open ou closed, et pourquoi (completed, not_planned, reopened…) ; GitHub n'en donne pas pour une PR.
  state: z.string(),
  state_reason: z.string().nullish(),
  closed_at: z.string().nullish(),
  assignees: z.array(z.object({ login: z.string() })).nullish(),
  // Présent seulement pour une PR ; `merged_at` nul tant qu'elle n'est pas fusionnée.
  pull_request: z.looseObject({ merged_at: z.string().nullish() }).nullish(),
});
export const CommentSchema = z.object({
  id: z.number(),
  body: z.string().nullish(),
  user: Author,
  author_association: Association,
  created_at: z.string(),
});
export const ReviewSchema = z.object({
  id: z.number(),
  body: z.string().nullish(),
  user: Author,
  author_association: Association,
  state: z.string(),
  submitted_at: z.string().nullish(), // absent tant que l'avis est un brouillon
});
export const ReviewCommentSchema = CommentSchema.extend({ path: z.string() });

// Les lectures en direct de la discussion (lots 5 et 6 de la spec GitHub) : seulement les champs que Leon montre.
const ChangedFileSchema = z.object({
  filename: z.string(),
  status: z.string(),
  additions: z.number(),
  deletions: z.number(),
  patch: z.string().nullish(), // absent pour un fichier binaire ou trop gros
});
const CommitSchema = z.object({
  sha: z.string(),
  commit: z.object({
    message: z.string(),
    author: z.object({ name: z.string().nullish(), date: z.string().nullish() }).nullish(),
  }),
  author: Author, // le compte GitHub ; nul quand l'adresse du commit n'en désigne aucun
  files: z.array(ChangedFileSchema).optional(), // seulement pour un commit lu seul
});
const ContentSchema = z.union([
  z.array(z.looseObject({})), // un dossier
  z.object({
    type: z.string(), // file, symlink, submodule
    size: z.number(),
    encoding: z.string().nullish(), // « none » pour un fichier de plus de 1 Mo
    content: z.string().nullish(),
    sha: z.string().optional(), // le fichier tel qu'il est : ce que l'écriture suivante doit citer
  }),
]);
const PullSchema = z.object({
  title: z.string(),
  state: z.string(),
  merged: z.boolean(),
  draft: z.boolean().optional(),
  user: Author,
  // `repo` : le dépôt de la tête, nul quand le fork a été supprimé ; une PR venue d'un fork le dit (T13).
  head: z.object({
    ref: z.string(),
    sha: z.string().optional(),
    repo: z.object({ full_name: z.string() }).nullish(),
  }),
  // `repo` : le dépôt de la base ; GitHub ne lit « Closes #n » que dans une PR vers sa branche par défaut (T13).
  base: z.object({
    ref: z.string(),
    repo: z.object({ default_branch: z.string() }).nullish(),
  }),
  mergeable_state: z.string().optional(),
  body: z.string().nullish(),
});
// La liste des PR donne la date de fusion au premier niveau, et pas de `pull_request` ; elle donne aussi la
// branche, la tête, le brouillon et la base, que la relève garde sans relire le détail.
const PullListSchema = IssueSchema.extend({
  merged_at: z.string().nullish(),
  draft: PullSchema.shape.draft,
  head: PullSchema.shape.head,
  base: PullSchema.shape.base,
});
const CheckRunsSchema = z.object({
  total_count: z.number(),
  check_runs: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      conclusion: z.string().nullish(), // absent tant que le contrôle n'est pas terminé
      html_url: z.string().nullish(),
    }),
  ),
});
const WorkflowRunsSchema = z.object({
  total_count: z.number(),
  workflow_runs: z.array(
    z.object({
      id: z.number(),
      name: z.string().nullish(),
      status: z.string().nullish(),
      conclusion: z.string().nullish(),
      event: z.string(),
      html_url: z.string(),
    }),
  ),
});
// Ce que les écritures lisent avant de proposer (le titre d'un ticket, l'état d'une exécution) et rendent après.
const TitleSchema = z.object({ title: z.string() });
const RunSchema = z.object({
  name: z.string().nullish(),
  status: z.string().nullish(),
  head_branch: z.string().nullish(),
});
const UrlSchema = z.object({ html_url: z.string() });
const CommitUrlSchema = z.object({ commit: z.object({ html_url: z.string() }) });
const TicketSchema = z.object({
  number: z.number(),
  title: z.string(),
  user: Author,
  updated_at: z.string(),
  labels: z.array(z.object({ name: z.string() })),
  assignees: z.array(z.object({ login: z.string() })).nullish(),
  pull_request: z.looseObject({}).nullish(), // les PR sont dans la liste des tickets
});

type FileWrite = { message: string; branch: string; content?: string; sha?: string };
type IssueWrite = { title?: string; body?: string; labels?: string[]; assignees?: string[] };

export type ChangedFile = z.infer<typeof ChangedFileSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type Pull = z.infer<typeof PullSchema>;
// Ce que la relève lit d'une PR au-delà de la liste des tickets (T13) ; `Listed` le porte quand la liste des PR l'a donné.
export type PullFacts = Pick<Pull, 'head' | 'draft' | 'base'>;
export type Listed = Issue & { pull?: PullFacts };
export type Comment = z.infer<typeof CommentSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type ReviewComment = z.infer<typeof ReviewCommentSchema>;

export function githubClient(token: string, http: ConnectorHttp) {
  // GitHub exige un User-Agent : sans lui, la requête est refusée.
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Leon',
  };
  const write = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
    ({ url: `${API}${path}`, method, headers, body, once: true }) satisfies HttpRequest;

  // Une page à la fois ; la suivante par l'adresse que GitHub donne dans l'en-tête Link.
  async function* pages<T>(first: HttpRequest, schema: z.ZodType<T[]>): AsyncGenerator<T[]> {
    let request: HttpRequest | null = first;
    while (request) {
      const { data, nextUrl }: { data: T[]; nextUrl: string | null } = await http.page(
        request,
        schema,
      );
      yield data;
      request = nextUrl ? { url: nextUrl, headers } : null;
    }
  }

  async function all<T>(path: string, schema: z.ZodType<T[]>): Promise<T[]> {
    const request = { url: `${API}${path}`, headers, query: { per_page: COMMENTS_PER_PAGE } };
    const rows: T[] = [];
    for await (const page of pages(request, schema)) rows.push(...page);
    return rows;
  }

  // La première page seulement, et s'il y en a d'autres derrière : pour dire qu'une liste est partielle.
  async function firstPage<T>(path: string, query: HttpRequest['query'], schema: z.ZodType<T[]>) {
    const { data, nextUrl } = await http.page({ url: `${API}${path}`, headers, query }, schema);
    return { rows: data, more: nextUrl !== null };
  }

  return {
    account: () =>
      http.json({ url: `${API}/user`, headers }, z.object({ id: z.number(), login: z.string() })),

    // Bouton seulement : les dépôts où l'utilisateur a installé l'appli (choisis sur l'écran
    // d'installation de GitHub), dans l'ordre de GitHub, toutes les pages lues. `max` arrête la lecture
    // plus tôt (« au moins un dépôt ? ») ; sans lui, la liste est complète.
    // https://docs.github.com/en/rest/apps/installations#list-app-installations-accessible-to-the-user-access-token
    async installedRepos(max = Number.POSITIVE_INFINITY): Promise<string[]> {
      const repos: string[] = [];
      const installations = all(
        '/user/installations',
        z
          .object({ installations: z.array(z.object({ id: z.number() })) })
          .transform((r) => r.installations),
      );
      for (const { id } of await installations) {
        const listed = all(
          `/user/installations/${id}/repositories`,
          z
            .object({ repositories: z.array(z.object({ full_name: z.string() })) })
            .transform((r) => r.repositories),
        );
        for (const { full_name } of await listed) {
          if (repos.length === max) return repos;
          repos.push(full_name);
        }
      }
      return repos;
    },

    // GitHub répond 404 à un dépôt privé hors de portée du jeton, et 403 à un jeton sans accès.
    async checkRepo(repo: string): Promise<void> {
      try {
        await http.json({ url: `${API}/repos/${repo}`, headers }, z.looseObject({}));
      } catch (error) {
        const denied = error instanceof ConnectorAuthError && error.status === 403;
        const missing = error instanceof ConnectorHttpError && error.status === 404;
        if (denied || missing) {
          throw new ConnectorHttpError(denied ? 403 : 404, `Repository not accessible: ${repo}`);
        }
        throw error;
      }
    },

    // Décision D : le membre a-t-il une permission sur le dépôt ? Lue dans les permissions du dépôt, avec le jeton
    // de la connexion, pour les dépôts saisis, à clé comme par le bouton (pull vaut pour tout rôle ; installedRepos
    // ne rend que des dépôts où il en a une), et pour le dépôt qu'un administrateur coche (depots-equipe.ts). Un 404
    // ou un 403, comme pour checkRepo : non.
    // https://docs.github.com/en/rest/repos/repos#get-a-repository
    // shortcut: pull est vrai pour tout compte sur un dépôt public, membre ou non, passer à l'appartenance au
    // dépôt si QD6 le demande.
    async canRead(repo: string): Promise<boolean> {
      try {
        const { permissions } = await http.json(
          { url: `${API}/repos/${repo}`, headers },
          z.object({ permissions: z.object({ pull: z.boolean().optional() }).optional() }),
        );
        // Non vérifié pour un jeton d'appli ou à grain fin (connector.ts) : sans le champ, la relève de ce dépôt
        // s'arrêterait sans rien dire ; le journal le montre, sans le nom du dépôt.
        if (permissions === undefined) {
          logError(
            'github.permissions_missing',
            new Error('GET /repos/{repo} without permissions'),
          );
        }
        return permissions?.pull === true;
      } catch (error) {
        const denied = error instanceof ConnectorAuthError && error.status === 403;
        const missing = error instanceof ConnectorHttpError && error.status === 404;
        if (denied || missing) return false;
        throw error;
      }
    },

    // Tickets et PR modifiés depuis `since` (format AAAA-MM-JJTHH:MM:SSZ), du plus ancien au plus récent.
    issues: (repo: string, since: string) =>
      pages(
        {
          url: `${API}/repos/${repo}/issues`,
          headers,
          query: {
            state: 'all',
            sort: 'updated',
            direction: 'asc',
            since,
            per_page: ISSUES_PER_PAGE,
          },
        },
        z.array(IssueSchema),
      ),

    // Les PR seules, avec le même contrat que `issues` (modifiées depuis `since`, de la plus ancienne à
    // la plus récente) : pour un dépôt dont les tickets sont désactivés. La liste des PR n'a pas de
    // paramètre `since` : on la lit de la plus récente à la plus ancienne, on s'arrête à la première
    // plus ancienne que `since`, puis on remet l'ordre. Elle n'a ni `comments` ni `pull_request` :
    // le second est ajouté, avec la date de fusion, le premier reste absent (les commentaires sont
    // alors toujours demandés). Ses faits de PR vont dans `pull`.
    async *pullRequests(repo: string, since: string): AsyncGenerator<Listed[]> {
      const limit = Date.parse(since);
      const request = {
        url: `${API}/repos/${repo}/pulls`,
        headers,
        query: { state: 'all', sort: 'updated', direction: 'desc', per_page: ISSUES_PER_PAGE },
      };
      const recent: Listed[] = [];
      read: for await (const page of pages(request, z.array(PullListSchema))) {
        for (const { merged_at, draft, head, base, ...issue } of page) {
          if (Date.parse(issue.updated_at) < limit) break read;
          recent.push({ ...issue, pull_request: { merged_at }, pull: { draft, head, base } });
        }
      }
      recent.reverse();
      for (let start = 0; start < recent.length; start += ISSUES_PER_PAGE) {
        yield recent.slice(start, start + ISSUES_PER_PAGE);
      }
    },

    issueComments: (repo: string, number: number) =>
      all(`/repos/${repo}/issues/${number}/comments`, z.array(CommentSchema)),
    reviews: (repo: string, number: number) =>
      all(`/repos/${repo}/pulls/${number}/reviews`, z.array(ReviewSchema)),
    reviewComments: (repo: string, number: number) =>
      all(`/repos/${repo}/pulls/${number}/comments`, z.array(ReviewCommentSchema)),

    // Lectures et écriture des branches (lot 7 de la spec GitHub) : `Contents` en lecture, puis en écriture.
    // https://docs.github.com/en/rest/git/refs
    defaultBranch: async (repo: string) =>
      (
        await http.json(
          { url: `${API}/repos/${repo}`, headers },
          z.object({ default_branch: z.string() }),
        )
      ).default_branch,
    branchSha: async (repo: string, branch: string) =>
      (
        await http.json(
          { url: `${API}/repos/${repo}/git/ref/heads/${refPath(branch)}`, headers },
          z.object({ object: z.object({ sha: z.string() }) }),
        )
      ).object.sha,
    createBranch: (repo: string, branch: string, sha: string) =>
      http.json(
        {
          url: `${API}/repos/${repo}/git/refs`,
          method: 'POST',
          headers,
          body: { ref: `refs/heads/${branch}`, sha },
        },
        z.looseObject({}),
      ),

    // Lectures en direct : code, commits, PR, CI et tickets (permissions Contents, Pull requests, Checks, Actions et Issues).
    // https://docs.github.com/en/rest/branches/branches#list-branches
    branches: (repo: string) =>
      firstPage(
        `/repos/${repo}/branches`,
        { per_page: 100 },
        z.array(z.object({ name: z.string(), protected: z.boolean().optional() })),
      ),
    commits: (repo: string, ref: string) =>
      firstPage(
        `/repos/${repo}/commits`,
        { sha: ref, per_page: 20 },
        z.array(CommitSchema.omit({ files: true })),
      ),
    commit: (repo: string, ref: string) =>
      http.json({ url: `${API}/repos/${repo}/commits/${refPath(ref)}`, headers }, CommitSchema),
    tree: (repo: string, ref: string) =>
      http.json(
        {
          url: `${API}/repos/${repo}/git/trees/${refPath(ref)}`,
          headers,
          query: { recursive: 1 },
        },
        z.object({
          truncated: z.boolean(), // GitHub coupe un arbre de plus de 100 000 entrées
          tree: z.array(z.object({ path: z.string(), type: z.string() })),
        }),
      ),
    file: (repo: string, path: string, ref?: string) =>
      http.json(
        { url: `${API}/repos/${repo}/contents/${refPath(path)}`, headers, query: { ref } },
        ContentSchema,
      ),
    pull: (repo: string, number: number) =>
      http.json({ url: `${API}/repos/${repo}/pulls/${number}`, headers }, PullSchema),
    // Les PULL_FILES_MAX premiers fichiers ; une page de plus est lue pour savoir s'il y en a d'autres.
    async pullFiles(repo: string, number: number) {
      const request = {
        url: `${API}/repos/${repo}/pulls/${number}/files`,
        headers,
        query: { per_page: 100 },
      };
      const rows: ChangedFile[] = [];
      for await (const page of pages(request, z.array(ChangedFileSchema))) {
        rows.push(...page);
        if (rows.length > PULL_FILES_MAX) break;
      }
      return { rows: rows.slice(0, PULL_FILES_MAX), more: rows.length > PULL_FILES_MAX };
    },
    checkRuns: (repo: string, ref: string) =>
      http.json(
        {
          url: `${API}/repos/${repo}/commits/${refPath(ref)}/check-runs`,
          headers,
          query: { per_page: 100 },
        },
        CheckRunsSchema,
      ),
    // Une branche, ou un commit entier (head_sha) : `branch` ne trouve rien avec un sha.
    workflowRuns: (repo: string, by: { branch: string } | { head_sha: string }) =>
      http.json(
        { url: `${API}/repos/${repo}/actions/runs`, headers, query: { ...by, per_page: 10 } },
        WorkflowRunsSchema,
      ),
    openIssues: (repo: string) =>
      firstPage(`/repos/${repo}/issues`, { state: 'open', per_page: 30 }, z.array(TicketSchema)),
    issue: (repo: string, number: number) =>
      http.json({ url: `${API}/repos/${repo}/issues/${number}`, headers }, TitleSchema),
    run: (repo: string, id: number) =>
      http.json({ url: `${API}/repos/${repo}/actions/runs/${id}`, headers }, RunSchema),

    // Les écritures que l'utilisateur confirme d'un clic (lots 7 à 10), jamais reprises (`once`) : une réponse
    // perdue ne doit pas doubler un commentaire, une fusion ou une revue. Seul le jeton de l'utilisateur les signe.
    // https://docs.github.com/en/rest/repos/contents, /pulls, /issues, /actions/workflow-runs
    deleteBranch: (repo: string, branch: string) =>
      http.text(write('DELETE', `/repos/${repo}/git/refs/heads/${refPath(branch)}`)),
    writeFile: (repo: string, path: string, body: FileWrite) =>
      http.json(write('PUT', `/repos/${repo}/contents/${refPath(path)}`, body), CommitUrlSchema),
    deleteFile: (repo: string, path: string, body: Required<Omit<FileWrite, 'content'>>) =>
      http.json(write('DELETE', `/repos/${repo}/contents/${refPath(path)}`, body), CommitUrlSchema),
    openPull: (repo: string, body: Record<string, string | boolean>) =>
      http.json(write('POST', `/repos/${repo}/pulls`, body), UrlSchema),
    editPull: (repo: string, number: number, body: Record<string, string>) =>
      http.json(write('PATCH', `/repos/${repo}/pulls/${number}`, body), UrlSchema),
    mergePull: (repo: string, number: number, body: { merge_method: string; sha: string }) =>
      http.json(write('PUT', `/repos/${repo}/pulls/${number}/merge`, body), z.looseObject({})),
    comment: (repo: string, number: number, body: string) =>
      http.json(write('POST', `/repos/${repo}/issues/${number}/comments`, { body }), UrlSchema),
    requestReviewers: (repo: string, number: number, reviewers: string[]) =>
      http.json(
        write('POST', `/repos/${repo}/pulls/${number}/requested_reviewers`, { reviewers }),
        UrlSchema,
      ),
    submitReview: (repo: string, number: number, body: Record<string, string>) =>
      http.json(write('POST', `/repos/${repo}/pulls/${number}/reviews`, body), UrlSchema),
    openIssue: (repo: string, body: IssueWrite) =>
      http.json(write('POST', `/repos/${repo}/issues`, body), UrlSchema),
    editIssue: (repo: string, number: number, body: IssueWrite & { state?: string }) =>
      http.json(write('PATCH', `/repos/${repo}/issues/${number}`, body), UrlSchema),
    rerun: (repo: string, id: number, failedOnly: boolean) =>
      http.text(
        write(
          'POST',
          `/repos/${repo}/actions/runs/${id}/${failedOnly ? 'rerun-failed-jobs' : 'rerun'}`,
        ),
      ),
    cancelRun: (repo: string, id: number) =>
      http.text(write('POST', `/repos/${repo}/actions/runs/${id}/cancel`)),
  };
}

// Une branche dans une adresse : chaque morceau encodé, les « / » gardés (feature/x).
export const refPath = (branch: string) => branch.split('/').map(encodeURIComponent).join('/');

export type GithubClient = ReturnType<typeof githubClient>;
