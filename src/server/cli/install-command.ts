import { env } from '@/server/env';
import { serverOrigin } from './installer-script';

// La commande que l'onboarding (S13) et Réglages (S14) donnent à copier : `curl -fsSL <leon>/install | sh`. L'adresse
// passe par la règle du script d'installation (`serverOrigin`) : elle sera collée dans un terminal, rien d'autre que
// l'origine du serveur ne peut y entrer. Une adresse refusée ne donne rien à copier (null), plutôt qu'une commande fausse.
export function installCommand(url: string = env.BETTER_AUTH_URL): string | null {
  try {
    return `curl -fsSL ${serverOrigin(url)}/install | sh`;
  } catch {
    return null;
  }
}
