'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { PROVIDER_IDS, type ProviderId } from '@/capture/turn';
import {
  type ActionResult,
  fieldsFromForm,
  invalidFieldsMessage,
  SINCE_VALUES,
} from '@/lib/connection-form';
import { PROVIDER_LABELS } from '@/lib/providers';
import { requireUserContext } from '@/server/auth/session';
import type { TenantContext } from '@/server/auth/tenant-context';
import { type CatalogField, listCatalog } from '@/server/connectors/catalog';
import {
  createConnection,
  deleteConnection,
  listConnections,
  replaceConnectionSecret,
  requestSyncNow,
  setConnectionPaused,
} from '@/server/connectors/connections';
import { connectorsKey } from '@/server/connectors/crypto';
import {
  ConnectorAuthError,
  ConnectorHttpError,
  createConnectorHttp,
} from '@/server/connectors/http';
import { getConnector } from '@/server/connectors/registry';
import type { AnyConnector } from '@/server/connectors/types';
import { logError } from '@/server/log';
import { oneLine } from '@/server/memory/labels';

// Toutes les actions passent par requireUserContext et valident leurs entrées avec zod. Aucune ne
// laisse remonter d'exception à l'interface (sauf la redirection vers la connexion), et aucune ne
// répète une clé saisie dans un message ou dans un journal. Seuls les messages écrits par les
// connecteurs peuvent nommer un champ non secret déjà validé par leur schéma (un dépôt, un site).

const NOT_CONFIGURED =
  'Les connecteurs ne sont pas configurés sur ce serveur (LEON_CONNECTORS_KEY).';
const BAD_REQUEST = 'Demande illisible : rechargez la page.';
const GONE = "Cette connexion n'existe plus.";
// La clé est celle du compte du créateur : un administrateur y mettrait la sienne.
const NOT_CREATOR = 'Seule la personne qui a branché cet outil peut remplacer sa clé.';
const FIELD_MAX = 5_000;
const ACCOUNT_MAX = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

const FieldsSchema = z.record(z.string(), z.string().max(FIELD_MAX));
const ConnectSchema = z.object({
  provider: z.string(),
  fields: FieldsSchema,
  since: z.enum(SINCE_VALUES),
});
const ReplaceSchema = z.object({ id: z.uuid(), fields: FieldsSchema });

type Checked = { connector: AnyConnector; config: Record<string, unknown>; account: string };

const catalogFields = (provider: ProviderId): CatalogField[] =>
  listCatalog().find((entry) => entry.id === provider)?.fields ?? [];

// Le compte vient de l'outil : une seule ligne, coupée, avant de devenir l'intitulé de la connexion.
const accountLabel = (account: string, fallback: string): string =>
  Array.from(oneLine(account)).slice(0, ACCOUNT_MAX).join('') || fallback;

// Valide la configuration avec le schéma du connecteur puis appelle `verify` avec un vrai client
// HTTP (hôtes du connecteur). `base` porte la configuration déjà enregistrée, `fields` les champs
// lus dans le formulaire.
async function checkConnection(
  provider: ProviderId,
  fields: CatalogField[],
  values: Record<string, string>,
  base: Record<string, unknown>,
): Promise<Checked | { error: string }> {
  const label = PROVIDER_LABELS[provider];
  const connector = getConnector(provider);
  if (!connector) return { error: `${label} n'est pas encore disponible.` };
  const parsed = connector.configSchema.safeParse({ ...base, ...fieldsFromForm(fields, values) });
  if (!parsed.success) {
    return {
      error: invalidFieldsMessage(
        fields,
        parsed.error.issues.map((i) => String(i.path[0])),
      ),
    };
  }
  const http = createConnectorHttp({
    provider,
    hosts: connector.hosts(parsed.data),
    minIntervalMs: connector.minIntervalMs,
  });
  try {
    const { account } = await connector.verify(parsed.data, http);
    return { connector, config: parsed.data, account: accountLabel(account, label) };
  } catch (error) {
    if (error instanceof ConnectorAuthError) return { error: `Clé refusée par ${label}.` };
    logError('connector.verify_failed', error, { provider });
    // Le message d'une ConnectorHttpError est écrit par nous (http.ts et les connecteurs), jamais
    // celui de l'outil, et il ne porte ni clé ni adresse : « Dépôt inaccessible : acme/leon » dit
    // quoi corriger. Toute autre erreur est inconnue : on n'en montre rien.
    if (error instanceof ConnectorHttpError) return { error: error.message };
    return { error: `${label} ne répond pas, réessayez dans un moment.` };
  }
}

export async function connectAction(input: {
  provider: string;
  fields: Record<string, string>;
  since: '7' | '30' | '90' | '365';
}): Promise<ActionResult> {
  const ctx = await requireUserContext();
  const request = ConnectSchema.safeParse(input);
  if (!request.success) return { error: BAD_REQUEST };
  const provider = z.enum(PROVIDER_IDS).safeParse(request.data.provider);
  if (!provider.success) return { error: 'Outil inconnu.' };
  if (!connectorsKey()) return { error: NOT_CONFIGURED };

  const checked = await checkConnection(
    provider.data,
    catalogFields(provider.data),
    request.data.fields,
    {},
  );
  if ('error' in checked) return checked;
  try {
    await createConnection(ctx, {
      provider: provider.data,
      label: checked.account,
      config: checked.config,
      secretFields: checked.connector.secretFields,
      since: new Date(Date.now() - Number(request.data.since) * DAY_MS),
    });
  } catch (error) {
    logError('connector.create_failed', error, { provider: provider.data });
    return { error: "Impossible d'enregistrer la connexion. Réessayez." };
  }
  revalidatePath('/connexions');
  return { ok: true, account: checked.account };
}

// Seuls les champs secrets changent ; le reste de la configuration est celui déjà enregistré.
export async function replaceKeyAction(input: {
  id: string;
  fields: Record<string, string>;
}): Promise<ActionResult> {
  const ctx = await requireUserContext();
  const request = ReplaceSchema.safeParse(input);
  if (!request.success) return { error: BAD_REQUEST };
  if (!connectorsKey()) return { error: NOT_CONFIGURED };
  const stored = (await listConnections(ctx)).find((view) => view.id === request.data.id);
  if (!stored) return { error: GONE };
  if (!stored.isCreator) return { error: NOT_CREATOR };

  const secrets = catalogFields(stored.provider).filter((field) => field.kind === 'secret');
  const checked = await checkConnection(
    stored.provider,
    secrets,
    request.data.fields,
    stored.config,
  );
  if ('error' in checked) return checked;
  try {
    const saved = await replaceConnectionSecret(
      ctx,
      stored.id,
      checked.config,
      checked.connector.secretFields,
    );
    if (!saved) return { error: GONE };
  } catch (error) {
    logError('connector.replace_failed', error, { connectionId: stored.id });
    return { error: 'Impossible de remplacer la clé. Réessayez.' };
  }
  revalidatePath('/connexions');
  return { ok: true, account: checked.account };
}

async function manage(
  id: string,
  write: (ctx: TenantContext, id: string) => Promise<boolean>,
): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  if (!z.uuid().safeParse(id).success) return { ok: false };
  try {
    const ok = await write(ctx, id);
    revalidatePath('/connexions');
    return { ok };
  } catch (error) {
    logError('connector.manage_failed', error, { connectionId: id });
    return { ok: false };
  }
}

export async function syncNowAction(id: string): Promise<{ ok: boolean }> {
  return manage(id, requestSyncNow);
}

export async function setPausedAction(id: string, paused: boolean): Promise<{ ok: boolean }> {
  return manage(id, (ctx, uuid) => setConnectionPaused(ctx, uuid, paused === true));
}

export async function deleteConnectionAction(id: string): Promise<{ ok: boolean }> {
  return manage(id, deleteConnection);
}
