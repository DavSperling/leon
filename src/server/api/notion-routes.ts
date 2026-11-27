import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { enqueueDueSyncs } from '@/server/connectors/sync';
import { db } from '@/server/db/client';
import { logError } from '@/server/log';

// Le point d'entrée des alertes de Notion (webhooks) : public, ni session ni jeton. Seule la signature d'une alerte la
// fait compter ; elle rend alors dues les connexions Notion de son espace (notifications_notion, 0100) et leur relève
// est mise en file. Rien du contenu n'est lu ici : la relève, par la recherche des pages modifiées, lit le nouveau. La
// relève du quart d'heure reste le filet.
//
// Doc lue le 27/11/2026 :
//   https://developers.notion.com/reference/webhooks : l'abonnement se déclare dans l'onglet Webhooks de la connexion,
//     vers une adresse publique en https ; à sa création, Notion envoie un seul POST dont le corps porte
//     `verification_token`, que l'on recopie dans la connexion (Verify ; « Resend token » le renvoie) ; chaque requête
//     porte ensuite X-Notion-Signature = « sha256= » suivi du HMAC-SHA256 du corps brut, en hexadécimal, avec ce jeton
//     pour clé, à comparer en temps constant (un JSON réécrit ne donne pas les mêmes octets) ; un événement n'arrive
//     que pour un objet auquel la connexion a accès, et comment.created demande la capacité « lire les commentaires ».
//   https://developers.notion.com/reference/webhooks-events-delivery : un événement porte id, timestamp, workspace_id,
//     subscription_id, integration_id, type (page.created, page.content_updated, page.properties_updated,
//     page.deleted, comment.created…), entity { id, type } et attempt_number ; livré en moins de 5 minutes, souvent
//     moins d'une, dans un ordre non garanti, jusqu'à 8 tentatives ; page.content_updated est regroupé sur une minute.
//
// Non vérifié (aucun essai réel) : qu'un seul abonnement couvre tous les espaces qui installent la connexion publique
// (la doc n'en dit rien) ; le code de réponse attendu (la doc n'en donne pas) ; que la demande de vérification soit
// signée (la doc ne le dit pas clairement : elle n'est jamais crue ici, seulement journalisée) ; le délai réel.
//
// shortcut: page.deleted ne fait que réveiller la relève, qui ne retire pas une page supprimée (le connecteur Notion
// ne rend jamais `removed`), à reprendre quand il lira les suppressions.

// Un événement de Notion pèse quelques Kio ; page.content_updated liste les blocs touchés.
const EVENT_MAX_BYTES = 1024 * 1024;

const VerificationSchema = z.object({ verification_token: z.string().min(1).max(500) });
// Seul l'espace sert : la relève lit le reste.
const EventSchema = z.object({ workspace_id: z.string().max(200).nullish() });

// Lue à chaque appel, comme les applis OAuth (oauth-env.ts), pour que les tests la simulent ; vide vaut absente.
const webhookToken = () => process.env.LEON_NOTION_WEBHOOK_TOKEN || undefined;

function parsed(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function signedWith(token: string, raw: string, signature: string | undefined): boolean {
  const expected = Buffer.from(`sha256=${createHmac('sha256', token).update(raw).digest('hex')}`);
  const given = Buffer.from(signature ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const notionRoutes = new Hono().post(
  '/webhooks',
  bodyLimit({ maxSize: EVENT_MAX_BYTES, onError: (c) => c.text('Request too large', 413) }),
  async (c) => {
    const raw = await c.req.text();
    const token = webhookToken();
    // La mise en place : le jeton n'est écrit qu'aux journaux de Railway. console.warn ne part pas chez Sentry : seul
    // logError lui envoie quelque chose (log.ts), et les fils d'Ariane de la console sont retirés (sentry-scrub.ts).
    const verification = VerificationSchema.safeParse(parsed(raw));
    if (verification.success) {
      if (token === undefined) {
        console.warn(
          '[leon]',
          'notion.webhook_verification',
          JSON.stringify({
            verification_token: verification.data.verification_token,
            a_faire:
              'à poser sur Railway sous LEON_NOTION_WEBHOOK_TOKEN, redéployer, puis seulement cliquer Notion › Verify',
          }),
        );
      } else {
        console.info(
          '[leon]',
          'notion.webhook_verification',
          'Vérification reçue ; LEON_NOTION_WEBHOOK_TOKEN est déjà posée, le jeton n’est pas journalisé. Pour un nouvel abonnement : vider la variable, redéployer, puis « Resend token » dans Notion.',
        );
      }
      return c.body(null, 200);
    }
    if (token === undefined || !signedWith(token, raw, c.req.header('x-notion-signature')))
      return c.json({ error: 'Unauthorized' }, 401);
    const event = EventSchema.safeParse(parsed(raw));
    if (!event.success) return c.json({ error: 'Invalid request' }, 400);
    const workspace = event.data.workspace_id;
    if (!workspace) return c.body(null, 200);
    const { rows } = await db.execute<{ connection_id: string }>(
      sql`select connection_id from notifications_notion(${workspace})`,
    );
    // La file ratée n'est pas une alerte perdue : la connexion est due, le tic de la minute la prendra.
    if (rows.length > 0)
      await enqueueDueSyncs().catch((error) => logError('notion.enqueue_failed', error));
    return c.body(null, 200);
  },
);
