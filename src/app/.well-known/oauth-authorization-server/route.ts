import { AUTHORIZATION_SERVER_METADATA, metadataResponse } from '@/server/oauth/metadata';

export const dynamic = 'force-dynamic';

export const GET = () => metadataResponse(AUTHORIZATION_SERVER_METADATA);
