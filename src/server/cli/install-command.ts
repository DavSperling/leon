import { env } from '@/server/env';
import { serverOrigin } from './installer-script';

// L'adresse du serveur (BETTER_AUTH_URL) telle que le script d'installation la veut : son origine, rien d'autre. Elle
// sera collée dans un terminal, ou citée à Claude Code. Une adresse refusée ne donne rien (null), plutôt qu'une commande fausse.
export function serverAddress(url: string = env.BETTER_AUTH_URL): string | null {
  try {
    return serverOrigin(url);
  } catch {
    return null;
  }
}

// La commande que l'onboarding (S13) et Réglages (S14) donnent à copier : `curl -fsSL <leon>/install | sh`.
export function installCommand(url: string = env.BETTER_AUTH_URL): string | null {
  const origin = serverAddress(url);
  return origin === null ? null : `curl -fsSL ${origin}/install | sh`;
}

// « Je demande à Claude » : la consigne à coller dans Claude Code, qui fait l'installation à la place de la personne.
// Elle est dans la langue de l'interface (`t` : getTranslations('claudeCode')) et ne porte que deux valeurs, la
// commande et l'adresse de la documentation en Markdown (/documentation.md, que lit Claude Code ; le message nomme la
// section « Ce qui part »), toutes deux sur l'adresse du serveur. Jamais de jeton.
export function claudeCodeInstructions(
  t: (key: 'instructions', values: { command: string; docs: string }) => string,
  url: string = env.BETTER_AUTH_URL,
): string | null {
  const origin = serverAddress(url);
  return origin === null
    ? null
    : t('instructions', {
        command: `curl -fsSL ${origin}/install | sh`,
        docs: `${origin}/documentation.md`,
      });
}
