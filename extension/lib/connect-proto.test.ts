import { describe, expect, it } from 'vitest';
import { decompress, envelopeReader, intOf, messageOf, readFields, textOf } from './connect-proto';
import { concat, envelope, gzip, proto } from './parsers/fixtures/claude-ai-frames';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('envelopeReader', () => {
  const three = [
    envelope(proto([1, 'un'])),
    envelope(new Uint8Array(0), 2),
    envelope(proto([2, 7]), 1),
  ];
  const expected = [
    { flags: 0, message: proto([1, 'un']) },
    { flags: 2, message: new Uint8Array(0) },
    { flags: 1, message: proto([2, 7]) },
  ];

  it('rend toutes les enveloppes d’un morceau qui en porte plusieurs', () => {
    expect(envelopeReader()(concat(three))).toEqual(expected);
  });

  it('recolle des enveloppes livrées octet par octet', () => {
    const read = envelopeReader();
    const all = concat(three);
    const got = Array.from(all, (_, i) => read(all.subarray(i, i + 1)) ?? []).flat();
    expect(got).toEqual(expected);
  });

  it('rend null pour une enveloppe plus grosse que la borne, même coupée avant son message', () => {
    const read = envelopeReader(10);
    expect(read(envelope(new Uint8Array(10)))).toHaveLength(1);
    expect(read(envelope(new Uint8Array(11)).subarray(0, 5))).toBeNull();
  });
});

describe('decompress', () => {
  it('ouvre un message gzip', async () => {
    const message = proto([1, 'Texte inventé '.repeat(50)]);
    expect(await decompress(await gzip(message), 'gzip')).toEqual(message);
  });

  it.each([
    ['un encodage inconnu', async () => decompress(await gzip(proto([1, 2])), 'br')],
    ['aucun encodage annoncé', async () => decompress(await gzip(proto([1, 2])), null)],
    ['des données corrompues', async () => decompress(bytes(0x1f, 0x8b, 9, 9, 9), 'gzip')],
    [
      'des données tronquées',
      async () => {
        const whole = await gzip(proto([1, 'Texte inventé '.repeat(50)]));
        return decompress(whole.subarray(0, whole.length - 6), 'gzip');
      },
    ],
    [
      'plus que la borne une fois ouvert',
      async () => decompress(await gzip(new Uint8Array(2000)), 'gzip', 1000),
    ],
  ])('rend null pour %s', async (_label, run) => {
    expect(await run()).toBeNull();
  });
});

describe('readFields', () => {
  it('lit varint, LEN, et saute I64 et I32', () => {
    const message = concat([
      proto([1, 300]),
      bytes(0x11, 1, 2, 3, 4, 5, 6, 7, 8), // champ 2, I64
      bytes(0x1d, 1, 2, 3, 4), // champ 3, I32
      proto([4, 'é']),
    ]);
    expect(readFields(message)).toEqual([
      { field: 1, value: 300 },
      { field: 4, value: new TextEncoder().encode('é') },
    ]);
  });

  it('lit une varint de 10 octets', () => {
    expect(readFields(bytes(0x08, ...Array(9).fill(0xff), 0x01))).toHaveLength(1);
  });

  it.each([
    ['une varint de 11 octets', bytes(0x08, ...Array(10).fill(0xff), 0x01)],
    ['une varint coupée', bytes(0x08, 0x80)],
    ['une longueur qui dépasse le message', bytes(0x0a, 0x05, 0x61)],
    ['un I64 coupé', bytes(0x09, 1, 2, 3)],
    ['un I32 coupé', bytes(0x0d, 1)],
    ['un groupe', bytes(0x0b, 0x0c)],
    ['un type de fil inconnu', bytes(0x0e)],
    ['le numéro de champ 0', bytes(0x00, 0x01)],
  ])('rend null pour %s', (_label, message) => {
    expect(readFields(message)).toBeNull();
  });
});

describe('intOf, messageOf, textOf', () => {
  const fields = readFields(
    proto(
      [1, 1],
      [1, 2],
      [2, proto([3, 'dedans'])],
      [4, new Uint8Array([0xc3, 0x28])],
      [5, bytes(0x0e)],
    ),
  );
  if (fields === null) throw new Error('message illisible');

  it('prennent la dernière valeur, comme protobuf', () => {
    expect(intOf(fields, 1)).toBe(2);
  });

  it('lisent un sous-message ; absent, il vaut un message vide ; illisible, null', () => {
    expect(textOf(messageOf(fields, 2) ?? [], 3)).toBe('dedans');
    expect(messageOf(fields, 9)).toEqual([]);
    expect(messageOf(fields, 5)).toBeNull();
  });

  it("ne font une chaîne que de l'UTF-8 valide, et un entier que d'un varint", () => {
    expect(textOf(fields, 4)).toBeNull();
    expect(textOf(fields, 1)).toBeNull();
    expect(intOf(fields, 2)).toBeNull();
  });
});
