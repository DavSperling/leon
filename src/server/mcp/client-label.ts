const CLIENT_MAX_CHARS = 40;

// D9 : le client d'une lecture MCP est le premier mot du User-Agent, nettoyé pour tenir
// dans le motif de read_log.client ; `mcp` quand il n'en reste rien.
export function clientLabelFromUserAgent(userAgent: string | undefined): string {
  const product = (userAgent ?? '').trim().split(/[\s/]/)[0] ?? '';
  const label = product
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, CLIENT_MAX_CHARS);
  return label === '' ? 'mcp' : label;
}
