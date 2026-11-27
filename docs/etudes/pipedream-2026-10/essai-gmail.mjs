// Essai Pipedream Connect + Gmail (et Slack), en mode développement : gratuit, 10 comptes de test.
//
// Identifiants dans ~/.config/leon/pipedream.env, hors du dépôt :
//   PIPEDREAM_PROJECT_ID=proj_…   (pipedream.com/projects > Settings)
//   PIPEDREAM_CLIENT_ID=…         (pipedream.com/settings/api > New OAuth Client)
//   PIPEDREAM_CLIENT_SECRET=…
//
// node --env-file=$HOME/.config/leon/pipedream.env essai-gmail.mjs <commande>
//   link [gmail|slack_v2]  lien de connexion à ouvrir dans le navigateur (valable 4 h)
//   read [n]               lit n mails complets, un par requête
//   batch [n]              lit n mails en une requête (FORMAT=full pour le corps, metadata par défaut)
//   slack                  droits accordés, historique de 3 canaux, recherche
//   delete                 supprime les comptes connectés de l'utilisateur d'essai
//
// N'affiche jamais le contenu des messages : seulement identifiants, dates, tailles et comptes.

const API = 'https://api.pipedream.com';
const GMAIL = 'https://gmail.googleapis.com';
const USER = 'david-essai';
const {
  PIPEDREAM_PROJECT_ID: PROJECT,
  PIPEDREAM_CLIENT_ID: ID,
  PIPEDREAM_CLIENT_SECRET: SECRET,
} = process.env;
if (!PROJECT || !ID || !SECRET) throw new Error('Identifiants manquants dans ~/.config/leon/pipedream.env');

async function pdToken() {
  const res = await fetch(`${API}/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: ID, client_secret: SECRET }),
  });
  if (!res.ok) throw new Error(`jeton Pipedream : ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

const token = await pdToken();
const pd = (path, init = {}) =>
  fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'x-pd-environment': 'development', ...init.headers },
  });

async function accounts(app) {
  const q = new URLSearchParams({ external_user_id: USER, ...(app && { app }) });
  const res = await pd(`/v1/connect/${PROJECT}/accounts?${q}`);
  if (!res.ok) throw new Error(`comptes : ${res.status} ${await res.text()}`);
  return (await res.json()).data ?? [];
}

async function account(app) {
  const [first] = await accounts(app);
  if (!first) throw new Error(`Aucun compte ${app} connecté : lancer « link ${app} » et suivre le lien`);
  return first.id;
}

async function proxy(accountId, method, url, { headers = {}, body } = {}) {
  const q = new URLSearchParams({ external_user_id: USER, account_id: accountId });
  const target = Buffer.from(url).toString('base64url');
  const started = Date.now();
  const res = await pd(`/v1/connect/${PROJECT}/proxy/${target}?${q}`, { method, headers, body });
  const text = await res.text();
  return {
    status: res.status,
    type: res.headers.get('content-type'),
    // Droits réellement accordés par Slack, si le proxy renvoie l'en-tête.
    scopes: res.headers.get('x-oauth-scopes'),
    text,
    ms: Date.now() - started,
  };
}

async function listIds(accountId, n) {
  const r = await proxy(accountId, 'GET', `${GMAIL}/gmail/v1/users/me/messages?maxResults=${n}`);
  if (r.status !== 200) throw new Error(`liste : ${r.status} ${r.text.slice(0, 300)}`);
  return JSON.parse(r.text).messages.map((m) => m.id);
}

const [cmd = 'read', arg] = process.argv.slice(2);

if (cmd === 'link') {
  const res = await pd(`/v1/connect/${PROJECT}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ external_user_id: USER }),
  });
  if (!res.ok) throw new Error(`jeton Connect : ${res.status} ${await res.text()}`);
  const link = new URL((await res.json()).connect_link_url);
  link.searchParams.set('app', arg ?? 'gmail');
  console.log(link.href);
}

if (cmd === 'read') {
  const accountId = await account('gmail');
  for (const id of await listIds(accountId, Number(arg ?? 3))) {
    const r = await proxy(accountId, 'GET', `${GMAIL}/gmail/v1/users/me/messages/${id}?format=full`);
    const m = JSON.parse(r.text);
    const parts = JSON.stringify(m.payload ?? {}).match(/"data":"[^"]*"/g) ?? [];
    const bodyBytes = parts.reduce((sum, p) => sum + Buffer.from(p.slice(8, -1), 'base64url').length, 0);
    const date = new Date(Number(m.internalDate)).toISOString();
    console.log({ status: r.status, ms: r.ms, id, date, sizeEstimate: m.sizeEstimate, bodyBytes });
  }
}

if (cmd === 'batch') {
  const accountId = await account('gmail');
  const ids = await listIds(accountId, Number(arg ?? 20));
  const format = process.env.FORMAT ?? 'metadata';
  const boundary = 'batch_leon_essai';
  const part = (id, i) =>
    [
      `--${boundary}`,
      'Content-Type: application/http',
      `Content-ID: <item${i}>`,
      '',
      `GET /gmail/v1/users/me/messages/${id}?format=${format}`,
      '',
      '',
    ].join('\r\n');
  const body = `${ids.map(part).join('')}--${boundary}--\r\n`;
  const type = `multipart/mixed; boundary=${boundary}`;
  // La doc du proxy ne parle que de JSON : on essaie l'en-tête tel quel, puis préfixé.
  const variants = {
    'Content-Type': { 'Content-Type': type },
    'x-pd-proxy-content-type': { 'x-pd-proxy-content-type': type },
    'les deux': { 'Content-Type': type, 'x-pd-proxy-content-type': type },
  };
  for (const [variante, headers] of Object.entries(variants)) {
    const r = await proxy(accountId, 'POST', `${GMAIL}/batch/gmail/v1`, { headers, body });
    const codes = {};
    for (const [, code] of r.text.matchAll(/HTTP\/1\.1 (\d{3})/g)) codes[code] = (codes[code] ?? 0) + 1;
    const ok = codes['200'] ?? 0;
    console.log({ variante, status: r.status, ms: r.ms, type: r.type, demandes: ids.length, codes, octets: r.text.length });
    if (!ok) console.log(r.text.slice(0, 300)); // une erreur du proxy, pas un mail
    if (ok === ids.length) break;
  }
}

if (cmd === 'slack') {
  const accountId = await account('slack_v2');
  const get = async (method, params) => {
    const r = await proxy(accountId, 'GET', `https://slack.com/api/${method}?${new URLSearchParams(params)}`);
    return { r, j: JSON.parse(r.text) };
  };
  const auth = await get('auth.test', {});
  console.log({ auth: auth.j.ok, erreur: auth.j.error, droits: auth.r.scopes ?? 'en-tête non renvoyé' });
  const list = await get('conversations.list', {
    limit: '20',
    types: 'public_channel,private_channel',
    exclude_archived: 'true',
  });
  if (!list.j.ok) throw new Error(`conversations.list : ${list.j.error} (droits manquants : ${list.j.needed ?? '?'})`);
  const channels = list.j.channels.filter((c) => c.is_member).slice(0, 3);
  console.log({ canaux: list.j.channels.length, dontMembre: channels.length });
  for (const c of channels) {
    // limit=100 : une appli que Slack bride n'en renvoie que 15.
    const h = await get('conversations.history', { channel: c.id, limit: '100' });
    const { ok, error, needed } = h.j;
    console.log({ canal: c.id, ok, error, needed, messages: h.j.messages?.length, has_more: h.j.has_more });
  }
  const search = await get('search.messages', { query: 'a', count: '5' });
  console.log({ recherche: search.j.ok, erreur: search.j.error, needed: search.j.needed });
}

if (cmd === 'delete') {
  for (const a of await accounts()) {
    const r = await pd(`/v1/connect/${PROJECT}/accounts/${a.id}`, { method: 'DELETE' });
    console.log({ supprime: a.id, app: a.app?.name_slug, status: r.status });
  }
  console.log({ restants: (await accounts()).length });
}
