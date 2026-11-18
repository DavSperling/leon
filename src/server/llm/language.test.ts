import { describe, expect, it } from 'vitest';
import { detectLanguage, languageLine } from './language';

describe('detectLanguage', () => {
  it('reconnaît les langues d’un texte de travail', () => {
    expect(
      detectLanguage(['how do I turn on the new dashboards locally? it should be behind a flag']),
    ).toBe('anglais');
    expect(
      detectLanguage(["c'est bon, je fusionne la PR et on passe à la synchro des stocks"]),
    ).toBe('français');
    expect(
      detectLanguage([
        'Kannst du bitte die Tests noch einmal laufen lassen? Ich habe das Schema geändert',
      ]),
    ).toBe('allemand');
    expect(
      detectLanguage([
        'necesito que revises la migración, está fallando en producción y no sé por qué',
      ]),
    ).toBe('espagnol');
    expect(detectLanguage(['תוכל לבדוק את המיגרציה? היא נכשלת בפרודקשן'])).toBe('hébreu');
  });

  it('tient compte de tous les messages, pas du premier seul', () => {
    expect(
      detectLanguage([
        'ok',
        'merge it',
        'can you check the logs and tell me what is failing in the job?',
      ]),
    ).toBe('anglais');
  });

  it('ne devine pas sur des mots-clés, des noms ou un mélange sans langue dominante', () => {
    expect(detectLanguage(['SSO Fernhill statut'])).toBeNull();
    expect(detectLanguage(['PG17 migration'])).toBeNull();
    expect(detectLanguage([''])).toBeNull();
    expect(detectLanguage(['is the PR ok', "c'est la PR"])).toBeNull();
  });

  it('lit l’apostrophe typographique comme l’autre', () => {
    expect(detectLanguage(['c’est fait, il y a juste la PR à relire pour que ça passe'])).toBe(
      'français',
    );
  });
});

describe('languageLine', () => {
  it('dit la langue en clair, ou rien quand elle n’est pas reconnue', () => {
    expect(languageLine('anglais', 'ses messages')).toBe(
      "Écris ta réponse en anglais : c'est la langue de ses messages.",
    );
    expect(languageLine(null, 'ses messages')).toBeNull();
    expect(languageLine('anglais')).toBe('Écris ta réponse en anglais.');
  });
});
