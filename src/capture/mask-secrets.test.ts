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

  it('traite 200 000 caractères répétitifs en moins de 200 ms', () => {
    const text = 'token_'.repeat(Math.ceil(200_000 / 6)).slice(0, 200_000);
    const start = performance.now();
    maskSecrets(text);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
