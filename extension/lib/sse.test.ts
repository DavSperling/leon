import { describe, expect, it } from 'vitest';
import { parseSseText } from './sse';

describe('parseSseText', () => {
  it('sépare les événements par une ligne vide', () => {
    const text = 'event: a\ndata: 1\n\nevent: b\ndata: 2\n\n';
    expect(parseSseText(text)).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ]);
  });

  it('donne event null quand le champ manque', () => {
    expect(parseSseText('data: {"x":1}\n\n')).toEqual([{ event: null, data: '{"x":1}' }]);
  });

  it('concatène les lignes data par \\n', () => {
    expect(parseSseText('data: un\ndata: deux\n\n')).toEqual([{ event: null, data: 'un\ndeux' }]);
  });

  it('ignore les commentaires', () => {
    expect(parseSseText(': ping\n\ndata: 1\n: encore\n\n')).toEqual([{ event: null, data: '1' }]);
  });

  it('accepte les fins de ligne CRLF', () => {
    expect(parseSseText('event: a\r\ndata: 1\r\n\r\ndata: 2\r\n\r\n')).toEqual([
      { event: 'a', data: '1' },
      { event: null, data: '2' },
    ]);
  });

  it('garde le dernier événement sans ligne vide finale', () => {
    expect(parseSseText('data: 1\n\ndata: 2')).toEqual([
      { event: null, data: '1' },
      { event: null, data: '2' },
    ]);
  });

  it("n'enlève qu'une espace après les deux-points", () => {
    expect(parseSseText('data:sans\n\ndata:  deux\n\n')).toEqual([
      { event: null, data: 'sans' },
      { event: null, data: ' deux' },
    ]);
  });

  it('ignore un événement sans data', () => {
    expect(parseSseText('event: seul\n\n')).toEqual([]);
  });
});
