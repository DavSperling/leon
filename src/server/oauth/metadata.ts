import { API_PATHS } from '@/capture/api-contract';
import { env } from '@/server/env';

// Les adresses du serveur d'autorisation de Leon et de sa ressource MCP (L1 à L3 du plan « MCP distant »), en un
// seul endroit : les métadonnées, le défi du 401, et plus tard la page, l'inscription et la route des jetons les lisent ici.
// Écrites à la main, pas par les aides du SDK MCP : `buildOAuthProtectedResourceMetadata` n'écrit pas
// bearer_methods_supported, `bearerAuthChallengeResponse` ajoute error et error_description au défi, et
// `oauthMetadataResponse` ne pose pas Cache-Control.

// L'émetteur est l'origine de BETTER_AUTH_URL, comme les clients la normalisent (hôte en minuscules, ni « :443 » ni
// barre finale) ; la ressource, exactement <émetteur>/api/mcp : Claude compare `resource` à l'adresse que
// l'utilisateur a collée.
export const ISSUER = new URL(env.BETTER_AUTH_URL).origin;
export const RESOURCE = `${ISSUER}${API_PATHS.mcp}`;
export const OAUTH_SCOPE = 'leon';

export const AUTHORIZE_PATH = '/oauth/autoriser';
export const RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource';
export const SERVER_METADATA_PATH = '/.well-known/oauth-authorization-server';

// L1 (RFC 9728), servi à /.well-known/oauth-protected-resource et à celui qui porte le chemin de la ressource.
export const PROTECTED_RESOURCE_METADATA = {
  resource: RESOURCE,
  authorization_servers: [ISSUER],
  scopes_supported: [OAUTH_SCOPE],
  bearer_methods_supported: ['header'],
  resource_name: 'Leon',
};

// L3 (RFC 8414). Clients publics seulement (`none`) : Claude ne passe par CIMD qu'avec les deux annonces.
export const AUTHORIZATION_SERVER_METADATA = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}${AUTHORIZE_PATH}`,
  token_endpoint: `${ISSUER}${API_PATHS.oauthJeton}`,
  registration_endpoint: `${ISSUER}${API_PATHS.oauthClients}`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: [OAUTH_SCOPE],
  authorization_response_iss_parameter_supported: true,
  client_id_metadata_document_supported: true,
};

// L2 : le WWW-Authenticate du 401 de /api/mcp, d'où un client apprend où lire les métadonnées de la ressource.
export const MCP_CHALLENGE = `Bearer resource_metadata="${ISSUER}${RESOURCE_METADATA_PATH}${API_PATHS.mcp}", scope="${OAUTH_SCOPE}"`;

// Publics par nature (découverte OAuth, sans session) : une heure de cache suffit, les adresses ne changent qu'au déploiement.
export const metadataResponse = (document: object): Response =>
  Response.json(document, { headers: { 'Cache-Control': 'public, max-age=3600' } });
