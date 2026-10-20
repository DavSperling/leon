import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TEST_ENV } from '@/test/test-env';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('accepte un jeu valide', () => {
    const env = parseEnv(TEST_ENV);
    expect(env.DATABASE_URL).toBe(TEST_ENV.DATABASE_URL);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('rejette un secret Better Auth de 31 caractères', () => {
    expect(() => parseEnv({ ...TEST_ENV, BETTER_AUTH_SECRET: 'x'.repeat(31) })).toThrow();
  });

  it('rejette une DATABASE_URL absente', () => {
    const { DATABASE_URL: _, ...sansUrl } = TEST_ENV;
    expect(() => parseEnv(sansUrl)).toThrow();
  });

  it('rejette une DATABASE_URL qui ne vise pas Postgres', () => {
    expect(() => parseEnv({ ...TEST_ENV, DATABASE_URL: 'mysql://u:p@h/db' })).toThrow();
  });

  it("accepte l'absence de clé Anthropic", () => {
    expect(parseEnv(TEST_ENV).ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('traite une clé Anthropic vide comme une absence', () => {
    expect(parseEnv({ ...TEST_ENV, ANTHROPIC_API_KEY: '' }).ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('garde une clé Anthropic renseignée', () => {
    expect(parseEnv({ ...TEST_ENV, ANTHROPIC_API_KEY: 'cle-de-test' }).ANTHROPIC_API_KEY).toBe(
      'cle-de-test',
    );
  });

  // Audit 3 n° 11.
  it('lit LEON_IP_HEADER comme un nom d’en-tête, en minuscules ; vide vaut absent', () => {
    expect(parseEnv({ ...TEST_ENV, LEON_IP_HEADER: 'X-Real-IP' }).LEON_IP_HEADER).toBe('x-real-ip');
    expect(parseEnv({ ...TEST_ENV, LEON_IP_HEADER: '' }).LEON_IP_HEADER).toBeUndefined();
    expect(() => parseEnv({ ...TEST_ENV, LEON_IP_HEADER: 'x-real-ip: 1.2.3.4' })).toThrow();
  });

  it('accepte une clé des connecteurs de 32 octets en base64', () => {
    const key = randomBytes(32).toString('base64');
    expect(parseEnv({ ...TEST_ENV, LEON_CONNECTORS_KEY: key }).LEON_CONNECTORS_KEY).toBe(key);
  });

  it('rejette une clé des connecteurs de 16 octets', () => {
    const key = randomBytes(16).toString('base64');
    expect(() => parseEnv({ ...TEST_ENV, LEON_CONNECTORS_KEY: key })).toThrow(
      /LEON_CONNECTORS_KEY/,
    );
  });

  it('rejette une clé des connecteurs de 33 octets', () => {
    const key = randomBytes(33).toString('base64');
    expect(() => parseEnv({ ...TEST_ENV, LEON_CONNECTORS_KEY: key })).toThrow();
  });

  it("accepte l'absence de clé des connecteurs", () => {
    const { LEON_CONNECTORS_KEY: _, ...sansCle } = TEST_ENV;
    expect(parseEnv(sansCle).LEON_CONNECTORS_KEY).toBeUndefined();
  });

  it('traite une clé des connecteurs vide comme une absence', () => {
    expect(parseEnv({ ...TEST_ENV, LEON_CONNECTORS_KEY: '' }).LEON_CONNECTORS_KEY).toBeUndefined();
  });

  it('traite LEON_EMBEDDINGS absent ou vide comme une absence de fournisseur', () => {
    expect(parseEnv(TEST_ENV).LEON_EMBEDDINGS).toBeUndefined();
    expect(parseEnv({ ...TEST_ENV, LEON_EMBEDDINGS: '' }).LEON_EMBEDDINGS).toBeUndefined();
  });

  it('accepte le fournisseur factice sans autre réglage', () => {
    expect(parseEnv({ ...TEST_ENV, LEON_EMBEDDINGS: 'factice' }).LEON_EMBEDDINGS).toBe('factice');
  });

  it('rejette un fournisseur de vecteurs inconnu', () => {
    expect(() => parseEnv({ ...TEST_ENV, LEON_EMBEDDINGS: 'inconnu' })).toThrow(/LEON_EMBEDDINGS/);
  });

  it.each([
    ['voyage', 'VOYAGE_API_KEY', 'cle-de-test'],
    ['mistral', 'MISTRAL_API_KEY', 'cle-de-test'],
    ['bge-m3', 'LEON_BGE_URL', 'http://127.0.0.1:8080'],
  ])('exige le réglage du fournisseur %s : %s', (id, variable, valeur) => {
    expect(() => parseEnv({ ...TEST_ENV, LEON_EMBEDDINGS: id })).toThrow(new RegExp(variable));
    expect(() => parseEnv({ ...TEST_ENV, LEON_EMBEDDINGS: id, [variable]: '' })).toThrow(
      new RegExp(variable),
    );
    expect(parseEnv({ ...TEST_ENV, LEON_EMBEDDINGS: id, [variable]: valeur }).LEON_EMBEDDINGS).toBe(
      id,
    );
  });

  // Une adresse sans http:// (nom de service docker, « localhost:8080 ») ou d'un autre schéma passerait
  // zod seul, et le fournisseur échouerait en silence à la première indexation : on la refuse au démarrage.
  it.each([
    'localhost:8080',
    'bge-service:8080',
    'ftp://bge-service:8080',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'pas une adresse',
  ])('refuse l’adresse « %s » pour LEON_BGE_URL avec LEON_EMBEDDINGS=bge-m3', (adresse) => {
    expect(() =>
      parseEnv({ ...TEST_ENV, LEON_EMBEDDINGS: 'bge-m3', LEON_BGE_URL: adresse }),
    ).toThrow(/LEON_BGE_URL/);
  });

  it.each(['http://127.0.0.1:8080', 'http://bge-service:8080', 'https://bge.example.org/vecteurs'])(
    'accepte l’adresse « %s » pour LEON_BGE_URL',
    (adresse) => {
      expect(
        parseEnv({ ...TEST_ENV, LEON_EMBEDDINGS: 'bge-m3', LEON_BGE_URL: adresse }).LEON_BGE_URL,
      ).toBe(adresse);
    },
  );

  it('refuse une adresse mal écrite même quand un autre fournisseur est choisi', () => {
    expect(() => parseEnv({ ...TEST_ENV, LEON_BGE_URL: 'bge-service:8080' })).toThrow(
      /LEON_BGE_URL/,
    );
  });

  it('n’exige aucun réglage de fournisseur quand LEON_EMBEDDINGS est absent', () => {
    expect(() => parseEnv({ ...TEST_ENV, VOYAGE_API_KEY: '' })).not.toThrow();
  });

  it('traite les modèles par étape absents ou vides comme une absence', () => {
    const env = parseEnv({ ...TEST_ENV, LEON_MODEL_DISCUSSION: '' });
    expect(env.LEON_MODEL_REPONSE).toBeUndefined();
    expect(env.LEON_MODEL_DISCUSSION).toBeUndefined();
    expect(env.LEON_MODEL_POINT).toBeUndefined();
  });

  it('garde les modèles réglés pour chaque étape', () => {
    const env = parseEnv({
      ...TEST_ENV,
      LEON_MODEL_REPONSE: 'claude-haiku-5-5',
      LEON_MODEL_DISCUSSION: 'claude-opus-5-5',
      LEON_MODEL_POINT: 'claude-sonnet-5-5',
    });
    expect([env.LEON_MODEL_REPONSE, env.LEON_MODEL_DISCUSSION, env.LEON_MODEL_POINT]).toEqual([
      'claude-haiku-5-5',
      'claude-opus-5-5',
      'claude-sonnet-5-5',
    ]);
  });

  it('traite LEON_LLM absent ou vide comme une absence de faux modèle', () => {
    expect(parseEnv(TEST_ENV).LEON_LLM).toBeUndefined();
    expect(parseEnv({ ...TEST_ENV, LEON_LLM: '' }).LEON_LLM).toBeUndefined();
  });

  it('accepte le faux modèle hors production', () => {
    expect(parseEnv({ ...TEST_ENV, LEON_LLM: 'factice' }).LEON_LLM).toBe('factice');
    expect(parseEnv({ ...TEST_ENV, LEON_LLM: 'factice', NODE_ENV: 'development' }).LEON_LLM).toBe(
      'factice',
    );
  });

  it('rejette un LEON_LLM inconnu', () => {
    expect(() => parseEnv({ ...TEST_ENV, LEON_LLM: 'autre' })).toThrow(/LEON_LLM/);
  });

  it('refuse le faux modèle en production, avec un message en français qui nomme la variable', () => {
    expect(() => parseEnv({ ...TEST_ENV, LEON_LLM: 'factice', NODE_ENV: 'production' })).toThrow(
      /LEON_LLM.*production/s,
    );
  });

  it('accepte la production sans faux modèle', () => {
    expect(() => parseEnv({ ...TEST_ENV, NODE_ENV: 'production' })).not.toThrow();
    expect(() =>
      parseEnv({ ...TEST_ENV, NODE_ENV: 'production', ANTHROPIC_API_KEY: 'cle-de-test' }),
    ).not.toThrow();
  });
  describe.each(['LEON_MODEL_REPONSE', 'LEON_MODEL_DISCUSSION', 'LEON_MODEL_POINT'])(
    'modèle réglé par %s',
    (variable) => {
      it.each(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'])(
        'accepte %s',
        (model) => {
          expect(() => parseEnv({ ...TEST_ENV, [variable]: model })).not.toThrow();
        },
      );

      // Haiku 4.5 refuse l'effort, d'autres modèles ne reçoivent pas le repli serveur que le code enverrait :
      // chaque appel échouerait en 400, la réponse tomberait en « indisponible » sans que l'app refuse de démarrer.
      it.each([
        'claude-haiku-4-5',
        'claude-sonnet-4-6',
        'claude-opus-4-8',
        'claude-sonnet-5',
        'gpt',
      ])('refuse %s au démarrage, avec un message en français qui nomme la variable', (model) => {
        expect(() => parseEnv({ ...TEST_ENV, [variable]: model })).toThrow(
          new RegExp(`${variable}.*modèle pris en charge.*claude-haiku-5-5`, 's'),
        );
      });

      it('traite la valeur vide comme une absence, pas comme un modèle inconnu', () => {
        expect(() => parseEnv({ ...TEST_ENV, [variable]: '' })).not.toThrow();
      });
    },
  );
});
