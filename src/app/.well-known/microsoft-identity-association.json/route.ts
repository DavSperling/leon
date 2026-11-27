import { oauthClient } from '@/server/connectors/oauth-env';
import { env } from '@/server/env';

// Le domaine d'éditeur des applis Microsoft de Leon (Entra ID › Branding & properties › Publisher domain) : Microsoft
// lit ce fichier pour vérifier que leonmemory.com est à nous, puis affiche ce domaine sur son écran d'accord au lieu
// de « non vérifié ». Doc lue le 27/11/2026 :
// https://learn.microsoft.com/en-us/entra/identity-platform/howto-configure-publisher-domain (`associatedApplications`,
// un `applicationId` par appli, servi en application/json). Les deux applis : la connexion à Leon
// (MICROSOFT_CLIENT_ID) et les outils (LEON_OAUTH_MICROSOFT_ID).
export const dynamic = 'force-dynamic';

export function GET(): Response {
  const ids = [env.MICROSOFT_CLIENT_ID, oauthClient('MICROSOFT')?.id].filter((id): id is string =>
    Boolean(id),
  );
  return Response.json({ associatedApplications: ids.map((applicationId) => ({ applicationId })) });
}
