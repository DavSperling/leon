export const SECRET_MASK = '[secret masqué]';

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
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  /(?:xox[abprs]|xapp)-[A-Za-z0-9-]{10,}/g,
  /https?:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/-]{10,}/g,
  /(?:AKIA|ASIA)[0-9A-Z]{16}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
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
  /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
];

// Le nom reste lisible, seule la valeur est masquée.
// URL de tout schéma. Un mot de passe collé n'est pas encodé : il peut contenir « / ? # ».
// Il peut aussi contenir « @ » : il s'arrête au dernier « @ » avant l'hôte (un « @ » suivi d'un autre
// sans « / ? # » entre eux fait partie du mot de passe). Ses bornes à 128 caractères gardent le temps linéaire.
const URL_PASSWORD =
  /(?<![A-Za-z0-9+.-])([A-Za-z][A-Za-z0-9+.-]{0,30}):\/\/([^:\s/?#@]{1,256}):((?:[^@\s]|@(?=[^@\s/?#]{0,128}@)){1,128})@/g;
// Dans une URL web, un port suivi d'un chemin, d'une requête ou d'une ancre
// (« localhost:3000/…?email=paul@… ») n'est pas un mot de passe ; un « @ » y est courant.
const WEB_SCHEMES = new Set(['http', 'https', 'ws', 'wss']);
const PORT_THEN_PATH = /^\d{1,5}[/?#]/;
// « Token » seul est un mot courant : il ne compte qu'après « Authorization: ».
const AUTH_SCHEME =
  /\b(Bearer|Basic|(?<=[Aa]uthorization:\s{0,10})Token)\s{1,10}([A-Za-z0-9._~+/=-]{16,})/g;
// Valeur entre guillemets (espaces permis) jusqu'au guillemet fermant ou à la fin de la ligne,
// ou valeur nue jusqu'au premier blanc. Sans borne haute : ce qui est lu est consommé.
const ASSIGNMENT =
  /(?<![A-Za-z0-9_])([A-Za-z0-9_]{0,40}?(?:password|passwd|pwd|secret|api[_-]?key|token|access[_-]?key|private[_-]?key)[A-Za-z0-9_]{0,40})(\\?["']?\s{0,10}[:=]\s{0,10}\\?)(?:"([^"\n]{8,})"?|'([^'\n]{8,})'?|([^\s"']{8,}))/gi;

function maskAssignment(
  _match: string,
  name: string,
  separator: string,
  doubleQuoted: string | undefined,
  singleQuoted: string | undefined,
): string {
  const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
  // JSON échappé (« \"password\":\"…\" ») : la valeur lue garde la barre du guillemet fermant.
  const closing = doubleQuoted?.endsWith('\\') ? '\\"' : quote;
  return `${name}${separator}${quote}${SECRET_MASK}${closing}`;
}

function maskUrlPassword(_match: string, scheme: string, user: string, password: string): string {
  if (WEB_SCHEMES.has(scheme.toLowerCase()) && PORT_THEN_PATH.test(password)) {
    // Le texte jusqu'au « @ » reste tel quel, mais une URL à identifiants peut s'y nicher : on la réexamine.
    return `${scheme}://${user}:${`${password}@`.replace(URL_PASSWORD, maskUrlPassword)}`;
  }
  return `${scheme}://${user}:${SECRET_MASK}@`;
}

export function maskSecrets(text: string): string {
  let masked = text;
  for (const pattern of WHOLE_SECRETS) masked = masked.replace(pattern, SECRET_MASK);
  return masked
    .replace(URL_PASSWORD, maskUrlPassword)
    .replace(AUTH_SCHEME, `$1 ${SECRET_MASK}`)
    .replace(ASSIGNMENT, maskAssignment);
}
