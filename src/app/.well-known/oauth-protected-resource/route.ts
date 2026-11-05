import { metadataResponse, PROTECTED_RESOURCE_METADATA } from '@/server/oauth/metadata';

// Calculé à chaque requête : l'adresse vient de BETTER_AUTH_URL au démarrage du serveur, pas du build.
export const dynamic = 'force-dynamic';

export const GET = () => metadataResponse(PROTECTED_RESOURCE_METADATA);
