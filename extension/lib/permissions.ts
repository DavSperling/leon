export const CAPTURE_HOSTS = ['https://claude.ai/*', 'https://chatgpt.com/*'] as const;
export const DEFAULT_SERVER_URL = 'http://localhost:3000';

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1'];

// On compare l'origine calculée par URL, jamais un préfixe de chaîne :
// « http://localhost:3000@evil.example » a pour origine http://evil.example.
export function serverUrlFromEnv(value: string | undefined): string {
  if (!value) return DEFAULT_SERVER_URL;
  const url = new URL(value);
  const isHttps = url.protocol === 'https:';
  const isLocalHttp = url.protocol === 'http:' && LOCAL_HOSTNAMES.includes(url.hostname);
  if (!isHttps && !isLocalHttp) {
    throw new Error('URL du serveur Leon invalide : https, ou http sur localhost et 127.0.0.1.');
  }
  return url.origin;
}

export function hostPermissionsFor(serverUrl: string): string[] {
  return [...CAPTURE_HOSTS, `${serverUrl}/*`];
}
