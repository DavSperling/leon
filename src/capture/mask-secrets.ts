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
  // Pas au milieu d'un nom composé (« the-sk-learn-… »).
  /(?<![A-Za-z0-9_-])sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  /(?:xox[abprs]|xapp)-[A-Za-z0-9-]{10,}/g,
  /https?:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/-]{10,}/g,
  // Exactement 20 caractères : « ASIAPACIFICHEADQUARTERS » n'en est pas une.
  /(?<![0-9A-Za-z])(?:AKIA|ASIA)[0-9A-Z]{16}(?![0-9A-Za-z])/g,
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
  /\bsb_secret_[A-Za-z0-9_-]{20,}/g,
  /(?<![A-Za-z0-9_-])ya29\.[A-Za-z0-9_-]{20,}/g,
  /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  // Jeton de bot Telegram : identifiant, « : », 35 caractères commençant par « AA ».
  /(?<![0-9])[0-9]{6,12}:AA[A-Za-z0-9_-]{33}(?![A-Za-z0-9_-])/g,
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
// « git+https://github.com:443/org/repo@main »).
const WEB_SCHEMES = new Set(['http', 'https', 'ws', 'wss']);
const PORT_THEN_PATH = /^\d{1,5}[/?#]/;
// « Token » seul est un mot courant : il ne compte qu'après « Authorization: » (ou « "Authorization": " »).
const AUTH_SCHEME =
  /\b(Bearer|Basic|(?<=authorization["']?\s{0,10}:\s{0,10}["']?)Token)\s{1,10}([A-Za-z0-9._~+/=-]{16,})/gi;
// Un jeton est aléatoire : chiffre, symbole ou casse mêlée. « Basic internationalization » n'en est pas un.
const looksRandom = (value: string) =>
  /[0-9+/=]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value));
// Valeur entre guillemets (espaces permis) jusqu'au guillemet fermant ou à la fin de la ligne,
// ou valeur nue jusqu'au premier blanc. Sans borne haute : ce qui est lu est consommé.
const ASSIGNMENT =
  /(?<![A-Za-z0-9_])([A-Za-z0-9_]{0,40}?(?:password|passwd|pass|pwd|secret|api[_-]?key|token|access[_-]?key|private[_-]?key|mdp|mot[ _-]de[ _-]passe)[A-Za-z0-9_]{0,40})(\\?["']?\s{0,10}[:=]\s{0,10}\\?)(?:"([^"\n]{8,})"?|'([^'\n]{8,})'?|([^\s"']{8,}))/gi;

// Le mot-clé doit finir le nom ou une de ses parties : « SECRET_KEY », « apiKey », « secretKey »,
// mais pas « Secretary », « tokens » ni « tokenizer ».
const KEYWORD_THEN_BOUNDARY =
  /(?:password|passwd|pwd|secret|api[_-]?key|token|access[_-]?key|private[_-]?key|mdp|mot[ _-]de[ _-]passe)(?:$|_)/i;
// « pass » seul est un mot courant (« bypass », « compass ») : il ne compte que comme partie entière
// d'un nom (« DB_PASS », « PASS », « pass_admin »).
const PASS_PART = /(?:^|_)pass(?:$|_)/i;
// camelCase : la casse compte, « secretKey » oui, « SECRETARY » non.
const KEYWORD_THEN_CAMEL =
  /(?:[Pp]assword|[Pp]asswd|[Pp]wd|[Ss]ecret|[Aa]pi[_-]?[Kk]ey|[Tt]oken|[Aa]ccess[_-]?[Kk]ey|[Pp]rivate[_-]?[Kk]ey)[A-Z]/;
// Valeur nue qui est du code évident et non un secret : un appel (« getToken(request); »,
// « z.string().min(8) », « req.headers.authorization?.split(' ') ») ou une variable d'environnement.
// Une valeur à point sans appel (« Summer.Time2026! », « SG.xxx.yyy ») reste un secret.
const CODE_VALUE =
  /^(?:[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\(|process\.env\.|import\.meta\.env\.|os\.environ\b)/;
// Chemin d'objet qui finit par le nom lui-même (« accessKeyId: credentials.accessKeyId, »).
const SAME_NAME_PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.([A-Za-z_$][\w$]*)[;,]?$/;
const normalizeName = (name: string) => name.replace(/[_-]/g, '').toLowerCase();
// « pwd » est aussi le dossier courant (« PWD=/Users/… », « Le pwd: /home/… »).
const PATH_VALUE = /^[/~]/;

// Mot de passe en option d'une commande, sur une ligne qui nomme la commande, sans longueur minimale :
// « curl -u admin:pw », « mysql -phunter2 », « redis-cli -a pw ». Le masque déjà posé n'est pas relu.
const CLI_PASSWORDS: Array<[line: RegExp, option: RegExp]> = [
  [
    /^.*\bcurl\b.*$/gm,
    /(\s(?:-u|--user)(?:\s{1,10}|=)["']?[^\s:"']{1,128}:)(?!\[secret masqué\])[^\s"']+/g,
  ],
  [/^.*\b(?:mysql|mysqldump|mariadb)\b.*$/gm, /(\s-p)(?!\[secret masqué\])[^\s"']+/g],
  [/^.*\bredis-cli\b.*$/gm, /(\s(?:-a|--pass)\s{1,10}["']?)(?!\[secret masqué\])[^\s"']+/g],
  [
    /^.*\bdocker\s{1,10}login\b.*$/gm,
    /(\s(?:-p|--password)(?:\s{1,10}|=)["']?)(?!\[secret masqué\])[^\s"']+/g,
  ],
  [/^.*\bsshpass\b.*$/gm, /(\s-p\s{0,10}["']?)(?!\[secret masqué\])[^\s"']+/g],
];

// Mot de passe donné dans une phrase : « Mot de passe du compte admin : X », « Le mot de passe est « X » ».
// Jusqu'à 60 caractères entre « mot de passe » et « : » ou « est », sans franchir de fin de phrase.
// La valeur doit avoir l'air aléatoire, pour laisser « Mot de passe oublié : Réinitialisez-le ».
const PHRASE_PASSWORD =
  /\b(mot de passe[^\n:=.;!?«»"]{0,60}?(?:\s?:|\sest)\s{0,10})(«\s?)?(?!\[secret masqué\])([^\s"'«»]*[^\s"'«».,;:)])/gi;
const looksLikePassword = (value: string) =>
  /[0-9!#$%&*+/=?@^_~]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value.slice(1)));

function maskAssignment(
  match: string,
  name: string,
  separator: string,
  doubleQuoted: string | undefined,
  singleQuoted: string | undefined,
  bare: string | undefined,
): string {
  if (!KEYWORD_THEN_BOUNDARY.test(name) && !KEYWORD_THEN_CAMEL.test(name) && !PASS_PART.test(name))
    return match;
  if (bare !== undefined) {
    if (CODE_VALUE.test(bare)) return match;
    const last = SAME_NAME_PATH.exec(bare)?.[1];
    if (last !== undefined && normalizeName(last) === normalizeName(name)) return match;
    if (/pwd$/i.test(name) && PATH_VALUE.test(bare)) return match;
  }
  const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
  // JSON échappé (« \"password\":\"…\" ») : la valeur lue garde la barre du guillemet fermant.
  const closing = doubleQuoted?.endsWith('\\') ? '\\"' : quote;
  return `${name}${separator}${quote}${SECRET_MASK}${closing}`;
}

function maskUrlPassword(_match: string, scheme: string, user: string, password: string): string {
  if (
    (WEB_SCHEMES.has(scheme.toLowerCase()) || user.includes('.')) &&
    PORT_THEN_PATH.test(password)
  ) {
    // Le texte jusqu'au « @ » reste tel quel, mais une URL à identifiants peut s'y nicher : on la réexamine.
    return `${scheme}://${user}:${`${password}@`.replace(URL_PASSWORD, maskUrlPassword)}`;
  }
  return `${scheme}://${user}:${SECRET_MASK}@`;
}

export function maskSecrets(text: string): string {
  let masked = text;
  for (const pattern of WHOLE_SECRETS) masked = masked.replace(pattern, SECRET_MASK);
  masked = masked
    .replace(URL_PASSWORD, maskUrlPassword)
    .replace(AUTH_SCHEME, (match, scheme: string, value: string) =>
      looksRandom(value) ? `${scheme} ${SECRET_MASK}` : match,
    )
    .replace(ASSIGNMENT, maskAssignment);
  masked = masked.replace(PHRASE_PASSWORD, (match, lead: string, quote = '', value: string) =>
    value.length >= 6 && looksLikePassword(value) ? `${lead}${quote}${SECRET_MASK}` : match,
  );
  for (const [line, option] of CLI_PASSWORDS) {
    masked = masked.replace(line, (text) => text.replace(option, `$1${SECRET_MASK}`));
  }
  return masked;
}
