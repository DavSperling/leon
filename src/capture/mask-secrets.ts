export const SECRET_MASK = '[secret masqué]';

// Ce que ce masquage garantit, et sa limite (décision de David, audit 4) :
// - il masque ce qui se reconnaît à sa FORME : préfixes de clés connus, clés privées, identifiants
//   dans une URL, en-têtes d'authentification, lignes de fichier .env, define() PHP, chaînes de
//   connexion ;
// - il ne touche jamais au texte ordinaire : aucune règle ne se fonde sur un mot-clé (« password: »,
//   « token = », « mot de passe : », options de commande) dans une phrase ou dans du code ;
// - limite assumée : un mot de passe écrit en langage courant (« le mdp c'est Lune#Bleue42 ») ou
//   passé dans du code (« password: 'X' ») peut passer. Les conversations captées restent privées
//   à leur auteur.
//
// Motifs en temps linéaire, même sur une entrée piégée (des milliers de débuts de motif sans fin) :
// les répétitions sont bornées, ou s'arrêtent sur un délimiteur qui ne peut pas réapparaître avant
// le début de motif suivant ; les lookbehinds ne laissent commencer un jeton qu'au début d'une suite.

// Clé privée PEM ou PGP : jusqu'à la ligne END, ou jusqu'à la fin du texte si elle manque.
const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z ]{0,40}PRIVATE KEY(?: BLOCK)?-----(?:[\s\S]*?-----END [A-Z ]{0,40}PRIVATE KEY(?: BLOCK)?-----|[\s\S]*)/g;

// Secrets reconnaissables à leur seule forme : remplacés en entier.
const WHOLE_SECRETS: RegExp[] = [
  PRIVATE_KEY_BLOCK,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
  // Pas au milieu d'un nom composé (« the-sk-learn-… »).
  /(?<![A-Za-z0-9_-])sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  /(?:xox[abprs]|xapp)-[A-Za-z0-9-]{10,}/g,
  /https?:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/-]{10,}/g,
  // Exactement 20 caractères : « ASIAPACIFICHEADQUARTERS » n'en est pas une.
  /(?<![0-9A-Za-z])(?:AKIA|ASIA)[0-9A-Z]{16}(?![0-9A-Za-z])/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  // Secret client OAuth Google.
  /\bGOCSPX-[A-Za-z0-9_-]{24,}/g,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g,
  /leon_[A-Za-z0-9_-]{43}/g,
  /\blin_api_[A-Za-z0-9]{32,}/g,
  /\bntn_[A-Za-z0-9]{40,}/g,
  // Ancien jeton Notion : exactement 43 caractères, pour laisser « secret_santa » et consorts.
  /\bsecret_[A-Za-z0-9]{43}(?![A-Za-z0-9])/g,
  /\bglpat-[A-Za-z0-9_-]{20,}/g,
  /\bwhsec_[A-Za-z0-9+/=]{24,}/g,
  /\bhf_[A-Za-z0-9]{30,}/g,
  /\bnpm_[A-Za-z0-9]{36,}/g,
  /\bsb_secret_[A-Za-z0-9_-]{20,}/g,
  /(?<![A-Za-z0-9_-])ya29\.[A-Za-z0-9_-]{20,}/g,
  /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  // Clé SendGrid : « SG. », 22 caractères, « . », 43 caractères.
  /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g,
  // Clé Mailgun : « key- » et 32 caractères minuscules ou chiffres, d'un seul tenant (pas un nom de fichier).
  /(?<![A-Za-z0-9_-])key-[0-9a-z]{32}(?![A-Za-z0-9_-]|\.[A-Za-z0-9])/g,
  // Jeton de bot Discord : trois segments base64, le premier encode l'identifiant (« M » ou « N ») :
  // des chiffres en base64, donc ni « _ » ni « - ».
  /(?<![A-Za-z0-9_-])[MN][A-Za-z0-9]{23,25}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,38}(?![A-Za-z0-9_-])/g,
  // Jeton de bot Telegram : identifiant, « : », 35 caractères commençant par « AA ».
  /(?<![0-9])[0-9]{6,12}:AA[A-Za-z0-9_-]{33}(?![A-Za-z0-9_-])/g,
  // Empreintes de mot de passe crackables hors ligne : htpasswd (apr1), bcrypt.
  /\$apr1\$[./0-9A-Za-z]{1,8}\$[./0-9A-Za-z]{22}/g,
  /\$2[aby]\$\d{2}\$[./0-9A-Za-z]{53}/g,
  // Jetons des outils que Leon fait coller, et autres préfixes publiés par leur éditeur.
  /\bpat[A-Za-z0-9]{14}\.[0-9a-f]{64}(?![A-Za-z0-9])/g, // Airtable
  /\bATATT3[A-Za-z0-9_=-]{100,}/g, // Atlassian
  /\bpat-[a-z]{2,3}[0-9]-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f])/g, // HubSpot
  /\bpk_[0-9]{1,12}_[A-Z0-9]{32}(?![A-Za-z0-9])/g, // ClickUp
  /\bsntryu_[0-9a-f]{64}(?![A-Za-z0-9])/g, // Sentry, utilisateur
  /\bsntrys_eyJ[A-Za-z0-9+/=_]{40,}/g, // Sentry, organisation
  /\bshp(?:at|ss)_[0-9a-fA-F]{32}(?![A-Za-z0-9])/g, // Shopify
  /\bdop_v1_[0-9a-f]{64}(?![A-Za-z0-9])/g, // DigitalOcean
  /\bdckr_pat_[A-Za-z0-9_-]{27}(?![A-Za-z0-9_-])/g, // Docker
  /\bsbp_[0-9a-f]{40}(?![A-Za-z0-9])/g, // Supabase, jeton d'accès
  /\bfigd_[A-Za-z0-9_-]{36,}/g, // Figma
  /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}/g, // PyPI
  /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/[0-9]{17,20}\/[A-Za-z0-9_-]{60,}/g,
  /(?<=[?&]sig=)[A-Za-z0-9%+/=]{40,}/g, // signature d'une URL SAS Azure
  /\bgsk_[A-Za-z0-9]{52}(?![A-Za-z0-9])/g, // Groq
  /\bhvs\.[A-Za-z0-9_-]{90,}/g, // Vault
  /\bglrt-[A-Za-z0-9_-]{20,}/g, // GitLab, runner
];

// Le nom reste lisible, seule la valeur est masquée.
// URL de tout schéma. Un mot de passe collé n'est pas encodé : il peut contenir « / ? # ».
// Il peut aussi contenir « @ » : il s'arrête au dernier « @ » avant l'hôte (un « @ » suivi d'un autre
// sans « / ? # » entre eux fait partie du mot de passe). Ses bornes à 128 caractères gardent le temps linéaire.
const URL_PASSWORD =
  /(?<![A-Za-z0-9+.-])([A-Za-z][A-Za-z0-9+.-]{0,30}):\/\/([^:\s/?#@]{0,256}):((?:[^@\s]|@(?=[^@\s/?#]{0,128}@)){1,128})@/g;
// Dans une URL web, un port suivi d'un chemin, d'une requête ou d'une ancre
// (« localhost:3000/…?email=paul@… ») n'est pas un mot de passe ; un « @ » y est courant.
// De même quand l'« utilisateur » est un nom d'hôte (« jdbc:postgresql://db.acme.fr:5432/…?user=paul@… »,
// « git+https://github.com:443/org/repo@main »), ou « localhost », hôte sans point
// (« docker://localhost:5000/leon@sha256:… »). Un autre nom sans point (« app ») reste un utilisateur.
const WEB_SCHEMES = new Set(['http', 'https', 'ws', 'wss']);
const looksLikeHost = (user: string) => user.includes('.') || user.toLowerCase() === 'localhost';
const PORT_THEN_PATH = /^\d{1,5}[/?#]/;

// Un jeton est aléatoire : chiffre, symbole ou casse mêlée. « Basic internationalization » n'en est pas un.
const looksRandom = (value: string) =>
  /[0-9+/=]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value));
// « Basic » et « Token » seuls sont des mots courants : ils ne comptent qu'après « Authorization: »
// (ou « "Authorization": " »).
const AUTH_SCHEME =
  /\b(Bearer|(?<=authorization["']?\s{0,10}:\s{0,10}["']?)(?:Basic|Token))\s{1,10}([A-Za-z0-9._~+/=-]{16,})/gi;
// En-têtes de clé d'API (« X-API-Key: … », « "x-api-key": "…" »), valeur aléatoire de 16 caractères ou plus.
const API_KEY_HEADER =
  /(?<![A-Za-z0-9_-])(x-api-key|api-key|x-auth-token|x-access-token)(["']?\s{0,10}:\s{0,10}["']?)([A-Za-z0-9._~+/=-]{16,})/gi;
// Paramètre de requête d'URL (« ?apikey=… », « &access_token=… »), valeur aléatoire de 8 caractères ou plus.
// Un modèle (« ?token={reset_token} », « ${…} », « <…> ») ne commence pas par un caractère accepté.
const QUERY_SECRET =
  /([?&](?:api_?key|access_token|refresh_token|client_secret|auth_token)=)([A-Za-z0-9._~+/=-]{8,})/gi;
// Chaîne de connexion « Clé=Valeur; » : .NET, SQL Server, Azure Storage. Le « ; » qui précède en fait la forme.
const CONNECTION_STRING_SECRET =
  /(;\s?(?:Password|Pwd|AccountKey|SharedAccessKey)=)(?!\[secret masqué\])([^;\s"']+)/gi;
// Fichier d'identifiants AWS (« aws_secret_access_key = … ») : le nom est propre à AWS.
const AWS_CREDENTIALS_FILE =
  /(\baws_secret_access_key["']?\s{0,10}[:=]\s{0,10}["']?)([A-Za-z0-9/+=]{30,})(?![A-Za-z0-9/+=])/gi;
// .npmrc : « //registry.npmjs.org/:_authToken=… ».
const NPMRC_TOKEN = /(:_authToken=)(?!\$)(?!\[secret masqué\])([^\s"']+)/g;

// Ligne de fichier .env, stricte : en début de ligne (éventuellement « export » ou « - » de liste YAML),
// un nom EN_MAJUSCULES qui finit par un suffixe de secret, « = » collé, une valeur sans espace.
// « SECRET_KEY = env(…) » (espaces), « PWD=/Users/… » (dossier courant) et « TOKEN_TTL=3600 » ne sont pas visés.
// KEY, PASS et PWD doivent suivre un « _ » (« MONKEY », « OLDPWD ») ; KEY et PASS peuvent être le nom entier.
const ENV_LINE =
  /^([ \t]{0,40}(?:export[ \t]{1,10}|-[ \t]{1,10})?)([A-Z][A-Z0-9_]{0,80})(=)(?:"([^"\s]+)"|'([^'\s]+)'|([^\s"']+))/gm;
const ENV_NAME =
  /(?:PASSWORD|PASSWD|PASSPHRASE|SECRET|TOKEN|(?:^|_)(?:KEY|PASS)|_PWD|_CREDENTIALS?)$/;
// PowerShell : « $env:AZURE_CLIENT_SECRET = "…" ».
const POWERSHELL_ENV =
  /(\$env:)([A-Z][A-Z0-9_]{0,80})(\s{0,10}=\s{0,10})(?:"([^"\s]+)"|'([^'\s]+)')()/g;
// PHP : « define('DB_PASSWORD', '…'); ».
const PHP_DEFINE =
  /(\bdefine\(\s{0,10}(['"])([A-Z][A-Z0-9_]{0,80})\2\s{0,10},\s{0,10})(['"])([^'"\n]+)\4/g;
// Une valeur qui n'en est pas une : renvoi à une variable, modèle (« {password} »), booléen, masque déjà
// posé, valeur élidée (« sk-... », « … »), chemin de fichier (« ~/.ssh/id_ed25519 », « ./certs/a.key »,
// « /home/paul/sa.json », « exports/2026/rapport.pdf »). Un chemin sans « ~/ » ni « ./ » doit finir par une
// extension : une clé base64 peut contenir « / », jamais « . ».
const NOT_A_VALUE =
  /^(?:\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|<.*>|\{[A-Za-z0-9_.]*\}|true|false|null|none|yes|no|\[secret.*|.*(?:\.\.\.|…)|(?:~|\.{1,2})\/\S*)$/i;
const FILE_PATH = /^[\w.@/-]*\.[A-Za-z0-9]{1,5}$/;
// Un nom en KEY ou TOKEN désigne aussi des réglages (« SORT_KEY=created_at », « MAX_TOKEN=4096 ») :
// sa valeur ne compte que si elle a la forme d'une clé, 16 caractères ou plus et aléatoire.
const KEY_NAME = /(?:KEY|TOKEN)$/;
const isSecretValue = (name: string, value: string) =>
  ENV_NAME.test(name) &&
  !NOT_A_VALUE.test(value) &&
  !(value.includes('/') && FILE_PATH.test(value)) &&
  (!KEY_NAME.test(name) || (value.length >= 16 && looksRandom(value)));

function maskNamedValue(
  match: string,
  lead: string,
  name: string,
  separator: string,
  doubleQuoted: string | undefined,
  singleQuoted: string | undefined,
  bare: string | undefined,
): string {
  const value = doubleQuoted ?? singleQuoted ?? bare ?? '';
  if (!isSecretValue(name, value)) return match;
  const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
  return `${lead}${name}${separator}${quote}${SECRET_MASK}${quote}`;
}

function maskUrlPassword(_match: string, scheme: string, user: string, password: string): string {
  if (
    (WEB_SCHEMES.has(scheme.toLowerCase()) || looksLikeHost(user)) &&
    PORT_THEN_PATH.test(password)
  ) {
    // Le texte jusqu'au « @ » reste tel quel, mais une URL à identifiants peut s'y nicher : on la réexamine.
    return `${scheme}://${user}:${`${password}@`.replace(URL_PASSWORD, maskUrlPassword)}`;
  }
  return `${scheme}://${user}:${SECRET_MASK}@`;
}

// Un chemin de fichier (« api-key: docs/configuration/api.md ») n'est pas une clé.
const maskIfRandom = (match: string, lead: string, value: string) =>
  looksRandom(value) && !(value.includes('/') && FILE_PATH.test(value))
    ? `${lead}${SECRET_MASK}`
    : match;

export function maskSecrets(text: string): string {
  let masked = text;
  for (const pattern of WHOLE_SECRETS) masked = masked.replace(pattern, SECRET_MASK);
  return masked
    .replace(URL_PASSWORD, maskUrlPassword)
    .replace(AUTH_SCHEME, (match, scheme: string, value: string) =>
      maskIfRandom(match, `${scheme} `, value),
    )
    .replace(API_KEY_HEADER, (match, name: string, separator: string, value: string) =>
      maskIfRandom(match, `${name}${separator}`, value),
    )
    .replace(QUERY_SECRET, (match, lead: string, value: string) => maskIfRandom(match, lead, value))
    .replace(CONNECTION_STRING_SECRET, (match, lead: string, value: string) =>
      NOT_A_VALUE.test(value) ? match : `${lead}${SECRET_MASK}`,
    )
    .replace(AWS_CREDENTIALS_FILE, `$1${SECRET_MASK}`)
    .replace(NPMRC_TOKEN, `$1${SECRET_MASK}`)
    .replace(ENV_LINE, maskNamedValue)
    .replace(POWERSHELL_ENV, maskNamedValue)
    .replace(
      PHP_DEFINE,
      (match, lead: string, _q: string, name: string, quote: string, value: string) =>
        isSecretValue(name, value) ? `${lead}${quote}${SECRET_MASK}${quote}` : match,
    );
}
