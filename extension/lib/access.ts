import type { RejectReason, Site } from './exchange';
import type { DropReason } from './outbox';
import type { CAPTURE_HOSTS } from './permissions';
import { type CaptureStatus, hasConsent, rejectionToShow, type Settings } from './settings';

// Les accès aux origines du manifeste que la personne a laissés. Firefox (127 et plus) et Chrome lui permettent
// d'en retirer : sans le serveur, rien ne part (il n'a pas de CORS) ; sans un site capté, rien n'y est capté.
export type Access = Record<'server' | Site, boolean>;

// Le motif du manifeste de chaque site capté : le type le tient parmi CAPTURE_HOSTS.
const SITE_HOSTS: Record<Site, (typeof CAPTURE_HOSTS)[number]> = {
  claude_ai: 'https://claude.ai/*',
  chatgpt: 'https://chatgpt.com/*',
};

// browser.permissions.contains, appelé avec une origine à la fois pour savoir laquelle manque.
type Contains = (permissions: { origins: string[] }) => unknown;

// Seul un false franc vaut un accès retiré : une API absente, une erreur ou une réponse inattendue valent un accès
// présent, et la petite fenêtre se tait plutôt que d'accuser à tort.
export async function checkAccess(serverUrl: string, contains: Contains): Promise<Access> {
  const granted = async (origin: string): Promise<boolean> => {
    try {
      return (await contains({ origins: [origin] })) !== false;
    } catch {
      return true;
    }
  };
  // Les mêmes motifs que hostPermissionsFor(serverUrl) (permissions.ts), que le test compare.
  const [server, claude_ai, chatgpt] = await Promise.all([
    granted(`${serverUrl}/*`),
    granted(SITE_HOSTS.claude_ai),
    granted(SITE_HOSTS.chatgpt),
  ]);
  return { server, claude_ai, chatgpt };
}

export type ConnectionToShow = CaptureStatus['connection'] | 'paused' | 'access_removed';

// L'état du badge. L'accès au serveur retiré passe après la pause, la configuration et le jeton refusé, et avant ce
// que l'arrière-plan a noté de la connexion (sans l'accès, l'envoi échoue et il note « injoignable »).
export function connectionToShow(
  settings: Settings,
  status: CaptureStatus,
  access: Access,
): ConnectionToShow {
  if (settings.paused) return 'paused';
  if (!hasConsent(settings) || settings.token === null) return 'not_configured';
  const { connection } = status;
  if (!access.server && connection !== 'unauthorized' && connection !== 'not_configured') {
    return 'access_removed';
  }
  return connection;
}

export type SiteNotice = RejectReason | 'access_removed';

// La ligne sous un site : l'accès retiré, sinon son dernier rejet (rejectionToShow).
export function siteNoticeToShow(
  status: CaptureStatus,
  site: Site,
  access: Access,
): SiteNotice | null {
  return access[site] ? rejectionToShow(status, site) : 'access_removed';
}

export type DropCause = DropReason | 'full_access_removed';

// La cause d'une perte affichée : sans l'accès au serveur, le tampon plein vient de l'accès retiré, pas d'un
// serveur injoignable.
export function dropCauseToShow(reason: DropReason, access: Access): DropCause {
  return reason === 'full' && !access.server ? 'full_access_removed' : reason;
}
