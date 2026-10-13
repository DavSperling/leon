export const SECRET_MASK = '[secret masqué]';

// Secrets reconnaissables à leur seule forme : remplacés en entier.
const WHOLE_SECRETS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g,
  /leon_[A-Za-z0-9_-]{43}/g,
  /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
];

// Le nom reste lisible, seule la valeur est masquée ; les répétitions sont bornées pour rester linéaire.
const URL_PASSWORD =
  /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/([^:\s/@]+):([^@\s]+)@/g;
const AUTH_SCHEME = /\b(Bearer|Basic)\s+([A-Za-z0-9._~+/=-]{16,})/g;
const ASSIGNMENT =
  /\b([A-Za-z0-9_]{0,40}?(?:password|passwd|pwd|secret|api[_-]?key|token|access[_-]?key|private[_-]?key)[A-Za-z0-9_]{0,40})(["']?\s*[:=]\s*)(["']?)([^\s"']{8,})\3/gi;

export function maskSecrets(text: string): string {
  let masked = text;
  for (const pattern of WHOLE_SECRETS) masked = masked.replace(pattern, SECRET_MASK);
  return masked
    .replace(URL_PASSWORD, `$1://$2:${SECRET_MASK}@`)
    .replace(AUTH_SCHEME, `$1 ${SECRET_MASK}`)
    .replace(ASSIGNMENT, `$1$2$3${SECRET_MASK}$3`);
}
