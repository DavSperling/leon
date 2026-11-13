import { Hono, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import {
  API_TOKEN_PATTERN,
  USAGES_BODY_MAX_BYTES,
  UsagesRequestSchema,
} from '@/capture/api-contract';
import {
  COMPUTER_TOKEN_PREFIX,
  hashApiToken,
  registerApiToken,
  revokeApiToken,
} from '@/server/auth/api-tokens';
import { verifyComputerCode } from '@/server/auth/computer-code';
import { setNotesRefused } from '@/server/auth/members';
import { resolveTenantContext } from '@/server/auth/tenant-context';
import { getViewerProfile } from '@/server/auth/viewer';
import { logError } from '@/server/log';
import { type ApiEnv, BEARER, requireApiToken, unauthorized } from './require-api-token';

// K5 et K6 du plan « CLI sans clone » : la CLI enregistre le jeton qu'elle a tiré en échangeant le code signé que la
// page d'autorisation (S03) lui a rendu ; un jeton se révoque lui-même.

const BODY_MAX_BYTES = 2 * 1024;
const NAME_MAX_CHARS = 60;
const NAME_FALLBACK = 'ordinateur';

const BodySchema = z.strictObject({ code: z.string(), nom: z.string() });

// Sans caractères de contrôle, 1 à 60 caractères (des points de code, pas des unités UTF-16) ; sinon « ordinateur ».
function cleanName(raw: string): string {
  const name = raw.replace(/\p{Cc}/gu, '').trim();
  const length = [...name].length;
  return length >= 1 && length <= NAME_MAX_CHARS ? name : NAME_FALLBACK;
}

type ComputerEnv = { Variables: ApiEnv['Variables'] & { token: string } };

// Le jeton de la CLI n'est pas encore en base : requireApiToken ne peut pas le vérifier. Ce garde en contrôle la
// forme, avant de lire le corps (comme les routes voisines), et le passe à la route.
const requireTokenShape: MiddlewareHandler<ComputerEnv> = async (c, next) => {
  const token = BEARER.exec(c.req.header('Authorization') ?? '')?.[1];
  if (!token || !API_TOKEN_PATTERN.test(token)) return unauthorized(c);
  c.set('token', token);
  await next();
};

export const computerRoutes = new Hono<ComputerEnv>()
  .post(
    '/ordinateurs',
    requireTokenShape,
    bodyLimit({
      maxSize: BODY_MAX_BYTES,
      onError: (c) => c.json({ error: 'Invalid request' }, 400),
    }),
    async (c) => {
      // 400 sans les valeurs reçues : elles portent un code signé.
      const parsed = BodySchema.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
      const { code, nom } = parsed.data;

      // Un seul 401, qui ne dit pas lequel des contrôles a échoué : code faux ou expiré, jeton d'une autre
      // empreinte, membre parti.
      const claims = verifyComputerCode(code);
      if (!claims || claims.e !== hashApiToken(c.var.token)) return unauthorized(c);
      const ctx = await resolveTenantContext(claims.u, claims.t);
      if (!ctx) return unauthorized(c);

      const ordinateur = cleanName(nom);
      const { organizationName, email } = await getViewerProfile(ctx);
      let registered: Awaited<ReturnType<typeof registerApiToken>>;
      try {
        registered = await registerApiToken(
          ctx,
          `${COMPUTER_TOKEN_PREFIX}${ordinateur}`,
          c.var.token,
        );
      } catch {
        // L'erreur d'insertion porte dans son message l'empreinte, l'indice et le nom : on ne la journalise pas.
        logError('computer.register_failed', new Error('registerApiToken a échoué'));
        return c.json({ error: 'Internal error' }, 500);
      }
      if (!registered) return c.json({ error: 'Token already registered' }, 409);
      // Les cases de la page (T64, C16) : cochées (`usages`) et décochées (`refus`), recalculées depuis la charge signée.
      const shown = claims.m ?? [];
      const ticked = claims.g ?? [];
      // Le réglage `noter` du compte suit la case (T65, C16) : cochée, nul ; décochée, daté ; absente, inchangé. Après
      // l'enregistrement seulement : un 401 ou un 409 n'y touche pas. Un échec ne défait pas la connexion, déjà faite :
      // l'accord du poste garde le refus, et la section Mémoire du site montre le réglage.
      if (shown.includes('noter')) {
        await setNotesRefused(ctx, !ticked.includes('noter')).catch((error: unknown) =>
          logError('computer.noter_failed', error, { tenantId: ctx.tenantId, userId: ctx.userId }),
        );
      }
      return c.json(
        {
          espace: organizationName,
          ordinateur,
          compte: email,
          usages: shown.filter((usage) => ticked.includes(usage)),
          refus: shown.filter((usage) => !ticked.includes(usage)),
        },
        201,
      );
    },
  )
  // `leon logout` : le jeton qui fait la requête, et lui seul. Déjà révoqué entre-temps (deux appels à la fois) :
  // le but est atteint, 204 quand même.
  .delete('/jeton', requireApiToken, async (c) => {
    await revokeApiToken(c.var.ctx, c.var.tokenId);
    return c.body(null, 204);
  })
  // Un « non » à `noter` dans le terminal (T65, C16) : le jeton d'un ordinateur ou manuel date le réglage `noter` du
  // compte, et `remember` refuse d'écrire. Un refus seulement (`{ noter: true }` rend 400) : ce jeton est lisible de
  // tout agent du poste, rouvrir passe par la section Mémoire du site. Un jeton d'assistant reçoit le 401 commun (F9).
  .post(
    '/usages',
    requireApiToken,
    bodyLimit({
      maxSize: USAGES_BODY_MAX_BYTES,
      onError: (c) => c.json({ error: 'Request too large' }, 413),
    }),
    async (c) => {
      const parsed = UsagesRequestSchema.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
      await setNotesRefused(c.var.ctx, true);
      return c.body(null, 204);
    },
  );
