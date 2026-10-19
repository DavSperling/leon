import { describe, expect, it } from 'vitest';
import { requiredExtensions } from './migrate';

describe('requiredExtensions', () => {
  it('rend les extensions que le SQL crée, dans l’ordre', () => {
    const sql = [
      'create extension if not exists vector;',
      'CREATE EXTENSION pg_trgm;',
      'create extension if not exists "uuid-ossp";',
    ].join('\n');

    expect(requiredExtensions(sql)).toEqual(['vector', 'pg_trgm', 'uuid-ossp']);
  });

  it('ignore les commentaires et le reste du SQL', () => {
    const sql = [
      '-- create extension if not exists commentee;',
      "select 'create extension' as texte;",
      'create table extensions (id int);',
    ].join('\n');

    expect(requiredExtensions(sql)).toEqual([]);
  });

  it('ne rend chaque extension qu’une fois', () => {
    expect(
      requiredExtensions('create extension if not exists vector; create extension vector;'),
    ).toEqual(['vector']);
  });
});
