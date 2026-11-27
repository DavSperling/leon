import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { enqueueDueSyncs } from '@/server/connectors/sync';
import { db } from '@/server/db/client';
import { logError } from '@/server/log';

// Le point d'entrée des alertes de Linear (webhooks) : public, ni session ni jeton. Seule la signature du corps brut,
// faite avec le secret de l'appli OAuth « Leon », fait compter une alerte. Elle rend dues les connexions Linear de son
// organisation (notifications_linear, 0099) et met leur relève en file, rien de plus : la relève lit le nouveau comme
// d'habitude, le contenu de l'alerte n'est jamais lu. Une connexion par clé personnelle n'a pas d'alerte.
//
// Doc lue le 27/11/2026 :
//   https://linear.app/developers/webhooks : une appli OAuth règle ses webhooks dans sa configuration, et Linear en
//     crée un pour chaque organisation qui l'autorise ; Linear-Signature = HMAC-SHA256 en hexadécimal du corps brut,
//     fait avec le secret de signature, à vérifier sur ce corps et non sur un JSON réécrit ; puis Linear-Delivery,
//     Linear-Event et Linear-Timestamp ; la charge porte action, type, data, url et webhookTimestamp (en
//     millisecondes ; la doc conseille d'écarter une alerte de plus d'une minute, contre le rejeu), et organizationId
//     dans l'exemple (absent du tableau des champs) ; Linear attend un 200 en moins de 5 secondes, sinon il réessaie
//     trois fois (après 1 min, 1 h et 6 h) et peut désactiver une adresse qui ne répond plus.
//   https://linear.app/developers/oauth-2-0-authentication : le secret de signature des webhooks a son propre « Rotate
//     secret », effectif tout de suite.
//
// Non vérifié (aucun essai réel) : que chaque alerte porte organizationId (sans lui, rien n'est réveillé et la relève
// du quart d'heure reste le filet) ; que webhookTimestamp soit refait à chaque nouvel essai (sinon ces essais sont
// ignorés, et la relève du quart d'heure les rattrape) ; qu'un membre sans droit d'administrateur qui autorise l'appli crée bien le webhook de son
// organisation ; la taille maximale d'une alerte.

// Une alerte porte l'élément entier, et ses valeurs d'avant pour une modification (data, updatedFrom).
const WEBHOOK_MAX_BYTES = 1024 * 1024;
const MAX_AGE_MS = 60_000;

// Seuls l'horodatage et l'organisation servent.
const AlertSchema = z.object({
  webhookTimestamp: z.number(),
  organizationId: z.string().nullish(),
});

// Dit une fois par processus : chaque alerte refusée le répéterait sinon.
let missingSecretSaid = false;

// En temps constant. L'en-tête est l'empreinte en hexadécimal.
function signedWith(secret: string, body: string, signature: string | undefined): boolean {
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(signature ?? '', 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function readJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export const linearRoutes = new Hono().post(
  '/webhooks',
  bodyLimit({
    maxSize: WEBHOOK_MAX_BYTES,
    onError: (c) => c.text('Request too large', 413),
  }),
  async (c) => {
    // Lu à chaque alerte, pour que les tests le simulent.
    const secret = process.env.LEON_LINEAR_WEBHOOK_SECRET;
    if (!secret) {
      if (!missingSecretSaid) console.warn('[leon]', 'linear.webhook_secret_missing');
      missingSecretSaid = true;
      return c.json({ error: 'Not configured' }, 503);
    }
    const body = await c.req.text();
    if (!signedWith(secret, body, c.req.header('linear-signature')))
      return c.json({ error: 'Invalid signature' }, 401);
    const parsed = AlertSchema.safeParse(readJson(body));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    const { webhookTimestamp, organizationId } = parsed.data;
    // Plus d'une minute (un rejeu, ou un nouvel essai qui garde l'horodatage du premier envoi), ou sans organisation :
    // 200 sans rien faire, car des refus répétés peuvent faire désactiver le webhook. La relève du quart d'heure
    // rattrape l'alerte perdue.
    if (Math.abs(Date.now() - webhookTimestamp) > MAX_AGE_MS || !organizationId)
      return c.body(null, 200);
    const { rows } = await db.execute<{ connection_id: string }>(
      sql`select connection_id from notifications_linear(${organizationId})`,
    );
    // La file ratée n'est pas une alerte perdue : la connexion est due, le tic de la minute la prendra.
    if (rows.length > 0)
      await enqueueDueSyncs().catch((error) => logError('linear.enqueue_failed', error));
    return c.body(null, 200);
  },
);
