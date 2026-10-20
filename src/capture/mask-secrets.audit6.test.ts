import { describe, expect, it } from 'vitest';
import { maskSecrets } from './mask-secrets';

// Audit ciblé du sixième tour : régressions des corrections 5 a et 5 c, formats voisins manqués.
describe('maskSecrets : audit ciblé du sixième tour', () => {
  it.each([
    'SECRET_KEY=Lune#Bleue2026',
    'ADMIN_TOKEN=Bonjour2026!',
    'JWT_SECRET_KEY=supersecretjwtsigningphrase',
    "define('AUTH_KEY', 'k3Y!short');",
    'API_KEY=a8F3kQ9zX2',
    'DB_PASSWORD=Xk9/mP2.qz',
    'req.Header.Set("Authorization", "Basic dXNlcjpTM2NyZXQhUGFzcw==")',
    "xhr.setRequestHeader('Authorization', 'Basic dXNlcjpTM2NyZXQhUGFzcw==')",
    'proxy_set_header Authorization "Basic dXNlcjpTM2NyZXQhUGFzcw==";',
    'Driver={ODBC Driver 18 for SQL Server};Server=db.acme.fr;Uid=sa;Pwd={Str0ngPassw0rd};',
    'Server=db;Password={Hunter2024};',
    'Root Token: hvs.6j4cuewowBGit65rheNoceI7',
    'shpca_0123456789abcdef0123456789abcdef',
    'shppa_0123456789abcdef0123456789abcdef',
    'glptt-0123456789abcdef0123456789abcdef01234567',
  ])('masque %s', (text) => {
    expect(maskSecrets(text)).toContain('[secret masqué]');
  });

  it.each([
    'SORT_KEY=created_at',
    'MAX_TOKEN=4096',
    'export GOOGLE_APPLICATION_CREDENTIALS=/home/paul/keys/leon-sa.json',
    'Server=db;Password={password};',
    'Create a basic UserProfileComponent for the dashboard',
    'Le fichier hvs.conf est dans /etc',
  ])('laisse %s', (text) => {
    expect(maskSecrets(text)).toBe(text);
  });
});
