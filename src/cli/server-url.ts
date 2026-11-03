const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1'];

// L'adresse d'un serveur de Leon, pour LEON_URL comme pour connexion.json (K2) : https, ou http sur la machine seule.
// On compare le nom d'hôte calculé par URL, jamais un préfixe de chaîne :
// « http://localhost:3000@evil.example » a pour hôte evil.example.
export function isAllowedServerUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && LOCAL_HOSTNAMES.includes(url.hostname))
  );
}
