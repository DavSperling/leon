// Lire les trames de claude.ai (protocole Connect, messages protobuf) sans schéma ni dépendance. Tout vient du
// site : rien ici ne lève, ce qui ne se lit pas rend null, et rien n'est gardé au-delà de l'enveloppe en cours.

// Au-delà, une enveloppe (ou un message une fois ouvert) est illisible. Les plus grosses vues le 20/11/2026
// faisaient 15 ko compressées.
export const ENVELOPE_MAX_BYTES = 8 * 1024 * 1024;

// Les drapeaux d'une enveloppe : bit 0, message compressé ; bit 1, fin de flux (du JSON, pas du protobuf).
export const COMPRESSED = 1;
export const END_STREAM = 2;

export type Envelope = { flags: number; message: Uint8Array<ArrayBuffer> };

// Une enveloppe : 1 octet de drapeaux, 4 octets de longueur (gros-boutiste), puis le message. Les morceaux du
// réseau coupent n'importe où : la fonction rendue reçoit chaque morceau et rend les enveloppes qu'il complète, ou
// null quand une enveloppe annonce plus que la borne (le flux n'est plus lisible).
export function envelopeReader(
  maxBytes = ENVELOPE_MAX_BYTES,
): (chunk: Uint8Array) => Envelope[] | null {
  const header = new Uint8Array(5);
  let headerFill = 0;
  let message: Uint8Array<ArrayBuffer> | null = null;
  let messageFill = 0;
  return (chunk) => {
    const envelopes: Envelope[] = [];
    let offset = 0;
    for (;;) {
      if (message === null) {
        const take = Math.min(5 - headerFill, chunk.length - offset);
        header.set(chunk.subarray(offset, offset + take), headerFill);
        headerFill += take;
        offset += take;
        if (headerFill < 5) return envelopes;
        const length = new DataView(header.buffer).getUint32(1);
        if (length > maxBytes) return null;
        message = new Uint8Array(length);
        messageFill = 0;
      }
      const take = Math.min(message.length - messageFill, chunk.length - offset);
      message.set(chunk.subarray(offset, offset + take), messageFill);
      messageFill += take;
      offset += take;
      if (messageFill < message.length) return envelopes;
      envelopes.push({ flags: header[0] ?? 0, message });
      message = null;
      headerFill = 0;
    }
  };
}

// Ouvre un message compressé ; seul gzip est connu. null : autre encodage, données corrompues ou tronquées, ou plus
// grosses que la borne une fois ouvertes.
export async function decompress(
  bytes: Uint8Array<ArrayBuffer>,
  encoding: string | null,
  maxBytes = ENVELOPE_MAX_BYTES,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (encoding !== 'gzip') return null;
  try {
    const stream = new DecompressionStream('gzip');
    const writer = stream.writable.getWriter();
    writer.write(bytes).catch(() => {});
    writer.close().catch(() => {});
    const reader = stream.readable.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    for (let part = await reader.read(); !part.done; part = await reader.read()) {
      size += part.value.length;
      if (size > maxBytes) {
        reader.cancel().catch(() => {});
        return null;
      }
      parts.push(part.value);
    }
    const opened = new Uint8Array(size);
    let at = 0;
    for (const part of parts) {
      opened.set(part, at);
      at += part.length;
    }
    return opened;
  } catch {
    return null;
  }
}

// Un champ d'un message : son numéro et sa valeur, un entier (VARINT) ou des octets (LEN). I64 et I32 ne servent
// pas : ils sont sautés.
export type ProtoField = { field: number; value: number | Uint8Array<ArrayBuffer> };

// Jusqu'à 10 octets de 7 bits. Au-delà de 2^53 la valeur perd sa précision : seuls de petits entiers servent.
function readVarint(bytes: Uint8Array, offset: number): { value: number; next: number } | null {
  let value = 0;
  for (let i = 0; i < 10; i++) {
    const byte = bytes[offset + i];
    if (byte === undefined) return null;
    value += (byte & 0x7f) * 2 ** (7 * i);
    if (byte < 0x80) return { value, next: offset + i + 1 };
  }
  return null;
}

// Les champs d'un message, dans l'ordre. null s'il ne se lit pas : varint trop longue ou coupée, longueur qui
// dépasse, numéro 0, groupe ou type de fil inconnu.
export function readFields(bytes: Uint8Array<ArrayBuffer>): ProtoField[] | null {
  const fields: ProtoField[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    if (tag === null) return null;
    const field = Math.floor(tag.value / 8);
    const wire = tag.value % 8;
    offset = tag.next;
    if (field === 0) return null;
    if (wire === 0 || wire === 2) {
      const varint = readVarint(bytes, offset);
      if (varint === null) return null;
      offset = varint.next;
      if (wire === 0) {
        fields.push({ field, value: varint.value });
        continue;
      }
      if (varint.value > bytes.length - offset) return null;
      fields.push({ field, value: bytes.subarray(offset, offset + varint.value) });
      offset += varint.value;
    } else if (wire === 1 || wire === 5) {
      offset += wire === 1 ? 8 : 4;
      if (offset > bytes.length) return null;
    } else {
      return null;
    }
  }
  return fields;
}

// La dernière valeur d'un champ (en protobuf, la dernière l'emporte).
const lastValue = (fields: ProtoField[], field: number) =>
  fields.findLast((candidate) => candidate.field === field)?.value;

export function intOf(fields: ProtoField[], field: number): number | null {
  const value = lastValue(fields, field);
  return typeof value === 'number' ? value : null;
}

// Le sous-message d'un champ : absent, il vaut un message vide (comme en protobuf) ; null s'il ne se lit pas.
export function messageOf(fields: ProtoField[], field: number): ProtoField[] | null {
  const value = lastValue(fields, field);
  return value instanceof Uint8Array ? readFields(value) : [];
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

// Un champ LEN ne devient une chaîne que par un décodage UTF-8 strict.
export function textOf(fields: ProtoField[], field: number): string | null {
  const value = lastValue(fields, field);
  if (!(value instanceof Uint8Array)) return null;
  try {
    return utf8.decode(value);
  } catch {
    return null;
  }
}
