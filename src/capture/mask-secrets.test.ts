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
    ['password=', `password=${alnum(12)}`, `password=${SECRET_MASK}`],
    ['STRIPE_SECRET_KEY=', `STRIPE_SECRET_KEY=${alnum(20)}`, `STRIPE_SECRET_KEY=${SECRET_MASK}`],
    [
      'AWS_SECRET_ACCESS_KEY=',
      `AWS_SECRET_ACCESS_KEY=${alnum(40)}`,
      `AWS_SECRET_ACCESS_KEY=${SECRET_MASK}`,
    ],
    ['DB_PASSWORD=', `DB_PASSWORD=${alnum(12)}`, `DB_PASSWORD=${SECRET_MASK}`],
    ['API_TOKEN:', `API_TOKEN: ${alnum(20)}`, `API_TOKEN: ${SECRET_MASK}`],
    ['x-api-key:', `x-api-key: ${alnum(20)}`, `x-api-key: ${SECRET_MASK}`],
    ['JSON', `"password": "${alnum(12)}"`, `"password": "${SECRET_MASK}"`],
  ];

  it.each(cases)('masque : %s', (_name, input, expected) => {
    expect(maskSecrets(input)).toBe(expected);
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
      `password=${alnum(12)}`,
      `"api_key": "${alnum(12)}"`,
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
    // Un mot de passe qui commence comme un port : l'exception ne vaut que pour les URL web.
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

  it.each([
    ['password: "correct horse battery staple"', `password: "${SECRET_MASK}"`],
    ['"api_key": "a b c d e f g h"', `"api_key": "${SECRET_MASK}"`],
    ["secret = 'deux mots de passe'", `secret = '${SECRET_MASK}'`],
  ])('masque une valeur entre guillemets avec espaces : %s', (input, expected) => {
    expect(maskSecrets(input)).toBe(expected);
  });

  it('masque une valeur entre guillemets de plus de 1 000 caractères', () => {
    const value = 'mot '.repeat(400);
    expect(maskSecrets(`password: "${value}" fin`)).toBe(`password: "${SECRET_MASK}" fin`);
  });

  it('reste idempotent sur ces formes', () => {
    const text = [
      '-----BEGIN PRIVATE KEY-----\nabc',
      'https://alice:s3cr3t-pass@exemple.fr',
      'password: "correct horse battery staple"',
    ].join('\n');
    const once = maskSecrets(text);
    expect(maskSecrets(once)).toBe(once);
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
  'password=',
  'password: "a',
  'eyJabcdefgh-',
  'a-',
];
const trapText = (unit: string) => unit.repeat(Math.ceil(TWO_MB / unit.length)).slice(0, TWO_MB);

describe('maskSecrets : temps linéaire', () => {
  it.each(TRAPS)('traite 2 Mo de « %s » répété en moins de 2 s', (unit) => {
    const text = trapText(unit);
    const start = performance.now();
    maskSecrets(text);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
