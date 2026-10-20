import { describe, expect, it } from 'vitest';
import { maskSecrets, SECRET_MASK } from './mask-secrets';

// Faux secrets assemblés à l'exécution : aucun jeton réaliste n'est écrit dans le dépôt.
const alnum = (n: number) => 'aB3dE5gH7jK9mN1pQ2sT4vW6xY8zC0fL'.repeat(3).slice(0, n);

describe('maskSecrets : secrets entiers', () => {
  const cases: Array<[string, string]> = [
    [
      'clé privée PEM',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nabcdef\n-----END RSA PRIVATE KEY-----',
    ],
    [
      'clé privée PGP',
      '-----BEGIN PGP PRIVATE KEY BLOCK-----\n\nlQOYBF\nabcdef\n-----END PGP PRIVATE KEY BLOCK-----',
    ],
    ['clé Anthropic', `sk-ant-${alnum(30)}`],
    ['clé OpenAI', `sk-${alnum(30)}`],
    ['clé OpenAI de projet', `sk-proj-${alnum(30)}`],
    ['jeton GitHub', `ghp_${alnum(36)}`],
    ['jeton GitHub fin', `github_pat_${alnum(30)}`],
    ['jeton Slack', `xoxb-${alnum(20)}`],
    ['clé AWS', `AKIA${'ABCDEFGH12345678'}`],
    ['clé Google', `AIza${alnum(35)}`],
    ['clé Stripe', `sk_live_${alnum(24)}`],
    ['jeton Leon', `leon_${alnum(43)}`],
    ['JWT', `eyJ${alnum(12)}.eyJ${alnum(12)}.${alnum(12)}`],
    ['clé Linear', `lin_api_${alnum(40)}`],
    ['jeton Notion', `ntn_${alnum(46)}`],
    ['ancien jeton Notion', `secret_${alnum(43)}`],
    ['jeton GitLab', `glpat-${alnum(20)}`],
    ['webhook Slack', `https://hooks.slack.com/services/T${alnum(8)}/B${alnum(8)}/${alnum(24)}`],
    ['jeton d’application Slack', `xapp-1-A${alnum(10)}-${alnum(13)}-${alnum(30)}`],
    ['secret de webhook', `whsec_${alnum(32)}`],
    ['jeton Hugging Face', `hf_${alnum(34)}`],
    ['jeton npm', `npm_${alnum(36)}`],
    ['clé AWS temporaire', `ASIA${'ABCDEFGH12345678'}`],
    ['secret client Google', `GOCSPX-${alnum(28)}`],
    ['clé SendGrid', `SG.${alnum(22)}.${alnum(43)}`],
    ['clé Mailgun', `key-${alnum(32).toLowerCase()}`],
    ['jeton de bot Discord', `MTA${alnum(21)}.Gx${alnum(4)}.${alnum(38)}`],
    ['empreinte htpasswd', `$apr1$r31.....$${alnum(22)}`],
    ['empreinte bcrypt', `$2b$12$${alnum(53)}`],
  ];

  it.each(cases)('masque : %s', (_name, secret) => {
    expect(maskSecrets(`avant ${secret} après`)).toBe(`avant ${SECRET_MASK} après`);
  });
});

describe('maskSecrets : le nom reste, la valeur est masquée', () => {
  const cases: Array<[string, string, string]> = [
    [
      'URL de connexion',
      `postgres://leon:${alnum(12)}@hôte`,
      `postgres://leon:${SECRET_MASK}@hôte`,
    ],
    [
      'en-tête Bearer',
      `Authorization: Bearer ${alnum(30)}`,
      `Authorization: Bearer ${SECRET_MASK}`,
    ],
    ['en-tête Basic', `Authorization: Basic ${alnum(24)}==`, `Authorization: Basic ${SECRET_MASK}`],
    ['STRIPE_SECRET_KEY=', `STRIPE_SECRET_KEY=${alnum(20)}`, `STRIPE_SECRET_KEY=${SECRET_MASK}`],
    [
      'AWS_SECRET_ACCESS_KEY=',
      `AWS_SECRET_ACCESS_KEY=${alnum(40)}`,
      `AWS_SECRET_ACCESS_KEY=${SECRET_MASK}`,
    ],
    ['DB_PASSWORD=', `DB_PASSWORD=${alnum(12)}`, `DB_PASSWORD=${SECRET_MASK}`],
    ['x-api-key:', `x-api-key: ${alnum(20)}`, `x-api-key: ${SECRET_MASK}`],
    ['"x-api-key": "…"', `"x-api-key": "${alnum(20)}"`, `"x-api-key": "${SECRET_MASK}"`],
    ['en-tête Token', `Authorization: Token ${alnum(22)}`, `Authorization: Token ${SECRET_MASK}`],
    [
      'URL dont le mot de passe contient « @ »',
      'postgres://u:p@ss@db.host/x',
      `postgres://u:${SECRET_MASK}@db.host/x`,
    ],
    [
      'URL suivie d’une adresse e-mail',
      'postgres://app:pwd123456@db/x?email=paul@acme.fr',
      `postgres://app:${SECRET_MASK}@db/x?email=paul@acme.fr`,
    ],
  ];

  it.each(cases)('masque : %s', (_name, input, expected) => {
    expect(maskSecrets(input)).toBe(expected);
  });

  // Formats manqués relevés par le second audit.
  it.each([
    ['redis://:hunter2secret@cache:6379', `redis://:${SECRET_MASK}@cache:6379`],
    [`"Authorization": "Token ${alnum(22)}"`, `"Authorization": "Token ${SECRET_MASK}"`],
    [`authorization: bearer ${alnum(30)}`, `authorization: bearer ${SECRET_MASK}`],
    [`clé sb_secret_${alnum(31)} ici`, `clé ${SECRET_MASK} ici`],
    [`jeton ya29.${alnum(40)} ici`, `jeton ${SECRET_MASK} ici`],
  ])('masque : %s', (input, expected) => {
    expect(maskSecrets(input)).toBe(expected);
    expect(maskSecrets(expected)).toBe(expected);
  });
});

describe('maskSecrets : troisième audit', () => {
  // Régression du second tour : une valeur à point était prise pour du code.
  it.each([
    ['PASSWORD=Summer.Time2026!', `PASSWORD=${SECRET_MASK}`],
    ['DB_PASSWORD=correct.horse.battery.staple', `DB_PASSWORD=${SECRET_MASK}`],
    [`SENDGRID_API_KEY=SG.${alnum(22)}.${alnum(43)}`, `SENDGRID_API_KEY=${SECRET_MASK}`],
  ])('masque une valeur à point : %s', (input, expected) => {
    expect(maskSecrets(input)).toBe(expected);
    expect(maskSecrets(expected)).toBe(expected);
  });

  // Formats manqués.
  it.each([
    ['DB_PASS=Hunter2Secret!', `DB_PASS=${SECRET_MASK}`],
    [
      `https://api.telegram.org/bot123456789:AA${alnum(33)}/sendMessage`,
      `https://api.telegram.org/bot${SECRET_MASK}/sendMessage`,
    ],
  ])('masque : %s', (input, expected) => {
    expect(maskSecrets(input)).toBe(expected);
    expect(maskSecrets(expected)).toBe(expected);
  });

  it.each([
    ['DB_PASSWORD={Hunter2Secret!}', `DB_PASSWORD=${SECRET_MASK}`],
    ['DB_PASSWORD=$ecret2026Pass!', `DB_PASSWORD=${SECRET_MASK}`],
  ])('masque une valeur qui ressemble à un modèle sans en être un : %s', (input, expected) => {
    expect(maskSecrets(input)).toBe(expected);
  });

  // Décision de David (audit 4) : seuls les formats reconnaissables sont masqués ; un mot de passe en
  // langage courant ou passé dans du code reste tel quel (voir l'en-tête de mask-secrets.ts).
  it.each([
    'mot de passe : Hunter2Secret!',
    'mdp: Hunter2Secret!',
    'Mot de passe du compte admin : Tr0ub4dor&3xyz (à changer)',
    'Le mot de passe est « Tr0ub4dor&3xyz », je te le donne.',
    `password=${alnum(12)}`,
    `"password": "${alnum(12)}"`,
    `{\\"password\\":\\"${alnum(10)}\\"}`,
    `API_TOKEN: ${alnum(20)}`,
    'password: Hunter2.Secret',
    'password: "correct horse battery staple"',
    "const pool = new Pool({ password: 'p4ss-W0rd-2026' });",
    'curl -u admin:pw https://api.acme.fr',
    'mysql -u root -phunter2 app',
    'redis-cli -a pw ping',
    'docker login -u paul -p Hunter2Secret registry.acme.fr',
    "sshpass -p 'Hunter2Secret' ssh root@10.0.0.4",
  ])('laisse tel quel (langage courant ou code) : %s', (text) => {
    expect(maskSecrets(text)).toBe(text);
  });

  // Les mêmes mots dans une phrase ordinaire.
  it.each([
    "Mot de passe oublié : l'utilisateur reçoit un lien par e-mail.",
    'Mot de passe oublié : Réinitialisez-le depuis la console.',
    "mot de passe : à demander à Paul (il est en congés jusqu'au 3).",
    'Le mot de passe est généralement trop court.',
    'Le mot de passe doit faire au moins 12 caractères.',
    'bypass: temporairement',
    'docker run -e POSTGRES_PASSWORD -p 5432:5432 postgres:17',
    'docker login --password-stdin registry.acme.fr',
  ])('laisse intact : %s', (text) => {
    expect(maskSecrets(text)).toBe(text);
  });

  // Du code évident reste intact.
  it.each([
    'const accessToken = session?.access_token;',
    'const secretKeyRef = useRef<HTMLInputElement>(null);',
    'password_reset_url = f"{base_url}/reset?token={reset_token}"',
    '  "password": "$' + '{DB_PASSWORD}",',
    'password: {{ db_password }}',
    'DB_PASSWORD=$POSTGRES_PASSWORD',
    "const token = req.headers.authorization?.split(' ')[1];",
    'accessKeyId: credentials.accessKeyId,',
    'const key = import.meta.env.VITE_API_KEY;',
    'api_key = os.environ.get("OPENAI_API_KEY")',
  ])('laisse intact : %s', (text) => {
    expect(maskSecrets(text)).toBe(text);
  });
});

describe('maskSecrets : texte ordinaire', () => {
  it.each([
    'le sk-8 de la cuisine',
    'le fichier risk-assessment-for-the-project.md',
    'la branche amos/task-management-dashboard',
    'npm run disk-usage-report-generator',
    'token de bus',
    'max_tokens: 16000',
    'Basic setup',
    'écrire à paul.martin@example.com',
    '0b9f2c7e-2d4c-4f6a-9a51-6a1e2f3b4c5d',
    'le secret_santa du bureau',
    'npm_config_registry',
    'hf_hub_download',
    'Token de session expiré, reconnecte-toi',
  ])('laisse intact : %s', (text) => {
    expect(maskSecrets(text)).toBe(text);
  });

  // Faux positifs relevés par le second audit.
  it.each([
    'Secretary: Marie-Claire Dupont',
    'les tokens: lexèmes',
    'tokenizer: sentencepiece',
    'Le pwd: /home/paul/projets/leon',
    'Basic internationalization',
    'ASIAPACIFICHEADQUARTERS',
    'const token = getToken(request);',
    'apiKey: process.env.ANTHROPIC_API_KEY',
    'password: z.string().min(8)',
    'PWD=/Users/david/Downloads/leon',
    'the-sk-learn-classification-model',
    'jdbc:postgresql://db.acme.fr:5432/prod?user=paul@acme.fr',
    'git+https://github.com:443/org/repo@main',
  ])('laisse intact : %s', (text) => {
    expect(maskSecrets(text)).toBe(text);
  });
});

describe('maskSecrets : propriétés', () => {
  it('est idempotent', () => {
    const text = [
      `sk-ant-${alnum(30)}`,
      `postgres://leon:${alnum(12)}@hôte`,
      `Authorization: Bearer ${alnum(30)}`,
      `DB_PASSWORD=${alnum(12)}`,
      `define('DB_PASSWORD', '${alnum(12)}');`,
      `Server=sql01;Password=${alnum(12)};`,
    ].join('\n');
    const once = maskSecrets(text);
    expect(maskSecrets(once)).toBe(once);
  });

  it('traite 200 000 caractères répétitifs en moins de 1 s', () => {
    const text = 'token_'.repeat(Math.ceil(200_000 / 6)).slice(0, 200_000);
    const start = performance.now();
    maskSecrets(text);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('maskSecrets : contournements', () => {
  it('masque une clé PEM sans ligne END jusqu’à la fin du texte', () => {
    const text = 'Ma clé :\n-----BEGIN PRIVATE KEY-----\nMIIEvQ\nabcdef\nencore';
    expect(maskSecrets(text)).toBe(`Ma clé :\n${SECRET_MASK}`);
  });

  it('masque une clé PGP sans ligne END jusqu’à la fin du texte', () => {
    const text = 'Ma clé :\n-----BEGIN PGP PRIVATE KEY BLOCK-----\n\nlQOYBF\nencore';
    expect(maskSecrets(text)).toBe(`Ma clé :\n${SECRET_MASK}`);
  });

  it.each(['https', 'ftp', 'redis', 'mongodb+srv', 'smtp'])(
    'masque le mot de passe d’une URL %s://utilisateur:mot@',
    (scheme) => {
      expect(maskSecrets(`voir ${scheme}://alice:s3cr3t-pass@exemple.fr/x`)).toBe(
        `voir ${scheme}://alice:${SECRET_MASK}@exemple.fr/x`,
      );
    },
  );

  it.each([
    [
      'postgres://admin:Ab3/xyz+Q==@db.example.com:5432/app',
      `postgres://admin:${SECRET_MASK}@db.example.com:5432/app`,
    ],
    ['postgres://admin:Pa#ss123word@db.local/app', `postgres://admin:${SECRET_MASK}@db.local/app`],
    [
      'mongodb+srv://app:p#ssw0rd!x@cluster0.mongodb.net/db',
      `mongodb+srv://app:${SECRET_MASK}@cluster0.mongodb.net/db`,
    ],
    ['redis://default:abc?def123@redis:6379', `redis://default:${SECRET_MASK}@redis:6379`],
    ['mysql://root:abc?def12@localhost', `mysql://root:${SECRET_MASK}@localhost`],
    // Un mot de passe qui commence comme un port : l'exception ne vaut que pour les URL web ou un hôte.
    [
      'postgres://app:2024#Paris@db.acme.fr:5432/prod',
      `postgres://app:${SECRET_MASK}@db.acme.fr:5432/prod`,
    ],
    ['postgres://app:1234/abcd@db.acme.fr', `postgres://app:${SECRET_MASK}@db.acme.fr`],
    ['redis://default:42?xY@cache:6379', `redis://default:${SECRET_MASK}@cache:6379`],
    // Une URL à identifiants imbriquée dans une URL web dont le « mot de passe » ressemble à un port.
    [
      'http://localhost:8081/?url=postgres://app:Sup3rS3cret@db:5432/prod',
      `http://localhost:8081/?url=postgres://app:${SECRET_MASK}@db:5432/prod`,
    ],
    [
      'https://proxy.acme.fr:443/fwd?to=https://admin:hunter2xyz@api.acme.fr/v1',
      `https://proxy.acme.fr:443/fwd?to=https://admin:${SECRET_MASK}@api.acme.fr/v1`,
    ],
  ])('masque un mot de passe d’URL contenant « / », « # » ou « ? » : %s', (input, expected) => {
    expect(maskSecrets(input)).toBe(expected);
  });

  it.each([
    'http://localhost:3000/api/users?email=paul@acme.fr',
    'http://localhost:3000/api/users/paul@acme.fr',
    'https://example.com:8080/@alice',
    'voir http://127.0.0.1:8080#paul@acme.fr',
    'ws://localhost:3000/socket?u=a@b',
    'wss://localhost:3000/socket?u=a@b',
    'HTTP://localhost:3000/api/users?email=paul@acme.fr',
  ])('ne prend pas un port pour un mot de passe : %s', (url) => {
    expect(maskSecrets(url)).toBe(url);
  });

  it('reste idempotent sur ces formes', () => {
    const text = [
      '-----BEGIN PRIVATE KEY-----\nabc',
      'https://alice:s3cr3t-pass@exemple.fr',
      'DB_PASSWORD="correct-horse-battery-staple"',
    ].join('\n');
    const once = maskSecrets(text);
    expect(maskSecrets(once)).toBe(once);
  });
});

describe('maskSecrets : formats nommés (audit 4)', () => {
  it.each([
    [`JWT_SECRET=${alnum(20)}`, `JWT_SECRET=${SECRET_MASK}`],
    [`NEXTAUTH_SECRET="${alnum(32)}"`, `NEXTAUTH_SECRET="${SECRET_MASK}"`],
    [`export GITHUB_TOKEN=${alnum(20)}`, `export GITHUB_TOKEN=${SECRET_MASK}`],
    ['      - POSTGRES_PASSWORD=Compose2026x', `      - POSTGRES_PASSWORD=${SECRET_MASK}`],
    ['GPG_PASSPHRASE=correct-horse-battery-42', `GPG_PASSPHRASE=${SECRET_MASK}`],
    ['PGPASSWORD=PgEnv2026! psql -h db -U leon', `PGPASSWORD=${SECRET_MASK} psql -h db -U leon`],
    ['MYSQL_PWD=Hunter2Secret', `MYSQL_PWD=${SECRET_MASK}`],
    ['GOOGLE_APPLICATION_CREDENTIALS=b64abc123', `GOOGLE_APPLICATION_CREDENTIALS=${SECRET_MASK}`],
    ['A=1\nDB_PASSWORD=Hunter2Secret\nB=2', `A=1\nDB_PASSWORD=${SECRET_MASK}\nB=2`],
    ["define('DB_PASSWORD', 'Wp!Prod2026x');", `define('DB_PASSWORD', '${SECRET_MASK}');`],
    [
      "define( 'AUTH_KEY', 'k#8Lm!2pQ@x7Zr$9vT&3wY*5' );",
      `define( 'AUTH_KEY', '${SECRET_MASK}' );`,
    ],
    [
      '$env:AZURE_CLIENT_SECRET = "abc~DEF.123_ghiJKL"',
      `$env:AZURE_CLIENT_SECRET = "${SECRET_MASK}"`,
    ],
    [
      'Server=sql01;Database=Compta;User Id=sa;Password=Sql$erver2026;',
      `Server=sql01;Database=Compta;User Id=sa;Password=${SECRET_MASK};`,
    ],
    [
      `DefaultEndpointsProtocol=https;AccountName=acme;AccountKey=${alnum(40)}==;EndpointSuffix=x`,
      `DefaultEndpointsProtocol=https;AccountName=acme;AccountKey=${SECRET_MASK};EndpointSuffix=x`,
    ],
    [`aws_secret_access_key = ${alnum(40)}`, `aws_secret_access_key = ${SECRET_MASK}`],
    [
      `//registry.npmjs.org/:_authToken=${alnum(36)}`,
      `//registry.npmjs.org/:_authToken=${SECRET_MASK}`,
    ],
    [
      'https://api.meteo.fr/v1/data?apikey=8d7f6e5c4b3a2918&format=json',
      `https://api.meteo.fr/v1/data?apikey=${SECRET_MASK}&format=json`,
    ],
    [
      `grant_type=refresh_token&refresh_token=1//0g${alnum(40)}`,
      `grant_type=refresh_token&refresh_token=${SECRET_MASK}`,
    ],
  ])('masque : %s', (input, expected) => {
    expect(maskSecrets(input)).toBe(expected);
    expect(maskSecrets(expected)).toBe(expected);
  });

  // Ce qui ressemble à ces formats sans en être : aucun caractère ne doit changer.
  it.each([
    'SECRET_KEY = env("DJANGO_SECRET_KEY")',
    "SECRET_KEY = config('DJANGO_SECRET_KEY')",
    'TOKEN_EXPIRATION=86400\nACCESS_TOKEN_TTL=3600000',
    'SECRET_MANAGER_PROJECT=acme-prod-123',
    'DB_PASSWORD=$POSTGRES_PASSWORD',
    'DB_PASSWORD=$' + '{POSTGRES_PASSWORD}',
    'OPENAI_API_KEY=<votre-clé>',
    'USE_API_KEY=true',
    'ANTHROPIC_API_KEY=',
    'MONKEY=banana',
    'OLDPWD=/Users/david',
    'db_password=Hunter2Secret',
    'Voir DB_PASSWORD=Hunter2Secret plus haut.',
    'PASSWORD="deux mots"',
    "define('WP_DEBUG', true);",
    "define('DB_PASSWORD', getenv('DB_PASSWORD'));",
    'password_reset_url = f"{base_url}/reset?token={reset_token}"',
    'https://app.acme.fr/reset?access_token={token}',
    'https://app.acme.fr/callback?api_key=YOUR_KEY_HERE',
    'Le ;Password= se met à la fin de la chaîne.',
  ])('laisse intact : %s', (text) => {
    expect(maskSecrets(text)).toBe(text);
  });

  // Faux positifs du corpus de l'audit 4 : du texte ordinaire que les règles par mot-clé abîmaient.
  it.each([
    'Haiku coûte cher ? Prix par token: 0.000001 dollar en entrée.',
    'Coût par token : 0,0000008 $, soit 0,80 $ par million.',
    'Le secret : persévérance.',
    'Token : identifiant temporaire délivré après connexion.',
    'Mot de passe : réinitialisé par le support ce matin.',
    'token: this.tokenService.current,',
    'password: values.newPassword,',
    'secret: config.jwtSecret,',
    'token: data.session.access_token,',
    'pub struct Config {\n    pub api_key: Option<String>,\n}',
    'token: CancellationToken,',
    'token: Optional[str] = None',
    'accessToken: AccessTokenResponse;',
    '  password: "Mot de passe"',
    '  password_confirmation: "Confirmation du mot de passe"',
    '"token_endpoint": "https://oauth2.googleapis.com/token"',
    'password_reset_url: https://app.acme.fr/reset',
    'Authorization: Bearer <votre_jeton>',
    'headers = {"Authorization": f"Bearer {token}"}',
    `ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ${alnum(40)} paul@laptop`,
  ])('laisse intact : %s', (text) => {
    expect(maskSecrets(text)).toBe(text);
  });
});

// Entrées piégées : des milliers de débuts de motif sans fin. Le masquage doit rester linéaire.
const TWO_MB = 2 * 1024 * 1024;
const TRAPS = [
  '-----BEGIN PRIVATE KEY-----',
  '-----BEGIN PGP PRIVATE KEY BLOCK-----',
  'postgres://a:',
  'https://a:b',
  'x://a:',
  'http://a:1/x://b:',
  'http://a:1/x://b:c@',
  'x://a:b@c',
  '\\"password\\":\\"a',
  'password=',
  'password: "a',
  'eyJabcdefgh-',
  'a-',
  'Basic aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'Secretary: ',
  'token = a.',
  'redis://:',
  '"Authorization": "Token ',
  'curl -u a:',
  'curl -u a:b ',
  'mysql -pa ',
  'redis-cli -a ',
  'mot de passe: ',
  'Mot de passe du compte ',
  'Le mot de passe est « ',
  'DB_PASS=',
  'docker login -p ',
  'sshpass -p ',
  '123456789:AA',
  "define('A_KEY', '",
  "define('A_KEY', 'a",
  '$env:A_KEY = "',
  ';Password=',
  '?apikey=a1',
  'X-API-Key: ',
  'aws_secret_access_key = ',
  ':_authToken=',
  'A_KEY=a\n',
  'MNaaaaaaaaaaaaaaaaaaaaaaaa.',
  '$apr1$',
  'pataaaaaaaaaaaaaa.',
  'pat-eu1-',
  '?sig=a',
  'sntrys_eyJ',
  'https://discord.com/api/webhooks/12345678901234567/',
];
const trapText = (unit: string) => unit.repeat(Math.ceil(TWO_MB / unit.length)).slice(0, TWO_MB);

describe('maskSecrets : temps linéaire', () => {
  it.each(TRAPS)('traite 2 Mo de « %s » répété en moins de 2 s', (unit) => {
    const text = trapText(unit);
    const start = performance.now();
    maskSecrets(text);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it.each([`password=${trapText('a.')}!`, `password=${trapText('a?.')}`])(
    'traite une valeur nue de 2 Mo en chemin d’objet en moins de 2 s',
    (text) => {
      const start = performance.now();
      maskSecrets(text);
      expect(performance.now() - start).toBeLessThan(2000);
    },
  );
});

describe('maskSecrets : préfixes des outils (audit 5)', () => {
  const hex = (n: number) => '9f3a7c1e5b2d8f40a6c3e9b1d7f2a5c8'.repeat(4).slice(0, n);
  const upper = (n: number) => 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'.repeat(2).slice(0, n);
  const uuid = 'b7e2c9a1-4f3d-4e8a-9c2b-1d6f8e3a5c7b';
  it.each([
    ['Airtable', `pat${alnum(14)}.${hex(64)}`],
    ['Atlassian', `ATATT3xFfGF0${alnum(90)}${alnum(90)}=${hex(8).toUpperCase()}`],
    ['HubSpot', `pat-eu1-${uuid}`],
    ['ClickUp', `pk_81234567_${upper(32)}`],
    ['Sentry utilisateur', `sntryu_${hex(64)}`],
    ['Sentry organisation', `sntrys_eyJpYXQiOjE3MjU${alnum(60)}_${alnum(43)}`],
    ['Shopify', `shpat_${hex(32)}`],
    ['Shopify secret partagé', `shpss_${hex(32)}`],
    ['DigitalOcean', `dop_v1_${hex(64)}`],
    ['Docker', `dckr_pat_${alnum(27)}`],
    ['Supabase', `sbp_${hex(40)}`],
    ['Figma', `figd_${alnum(40)}`],
    ['PyPI', `pypi-AgEIcHlwaS5vcmc${alnum(90)}${alnum(30)}`],
    ['webhook Discord', `https://discord.com/api/webhooks/1234567890123456789/${alnum(68)}`],
    ['Groq', `gsk_${alnum(52)}`],
    ['Vault', `hvs.${alnum(90)}`],
    ['GitLab runner', `glrt-${alnum(20)}`],
  ])('masque : %s', (_name, secret) => {
    expect(maskSecrets(`avant ${secret} après`)).toBe(`avant ${SECRET_MASK} après`);
  });

  it('masque la signature d’une URL SAS Azure', () => {
    const url = `https://acme.blob.core.windows.net/a.pdf?sv=2022-11-02&sp=r&sig=${alnum(40)}%2B${alnum(2)}%3D`;
    expect(maskSecrets(url)).toBe(
      `https://acme.blob.core.windows.net/a.pdf?sv=2022-11-02&sp=r&sig=${SECRET_MASK}`,
    );
  });

  it.each([
    'patch.diff et pattern.json',
    'pat-eu1-ticket',
    'pk_42_court',
    'sntryu_court',
    'shpat_court',
    'dckr_pat_court',
    'sbp_test',
    'figd_court',
    'pypi-AgEIcHlwaS5vcmc',
    'gsk_court',
    'hvs.court',
    'glrt-court',
    'https://discord.com/api/webhooks',
    'https://acme.fr/?sig=court',
  ])('laisse intact : %s', (text) => {
    expect(maskSecrets(text)).toBe(text);
  });
});

describe('maskSecrets : faux positifs (audit 5)', () => {
  // « Basic » est un mot courant : comme « Token », il ne compte qu'après « Authorization: ».
  it.each([
    'Abonnement Basic 9.99/mois/utilisateur, Pro à 19,99 €.',
    'Regarde le basic examples/basic-auth/server.js du dépôt.',
    'Setting up basic 2-factor-authentication for admins',
  ])('laisse intact : %s', (text) => {
    expect(maskSecrets(text)).toBe(text);
  });
});
