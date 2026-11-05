import { metadataResponse, PROTECTED_RESOURCE_METADATA } from '@/server/oauth/metadata';

// Le même document que /.well-known/oauth-protected-resource, à l'adresse que RFC 9728 donne à la ressource /api/mcp.
export const dynamic = 'force-dynamic';

export const GET = () => metadataResponse(PROTECTED_RESOURCE_METADATA);
