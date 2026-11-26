// Données de test de claude.ai, fabriquées à la demande. Elles reprennent la STRUCTURE relevée le 20/11/2026
// (chemins de champs, valeurs d'énumération, compression, gros objet 1.1.2 devant les enregistrements, battements
// entre les autres enveloppes) ; textes et identifiants inventés.

type Value = number | string | Uint8Array;
export type Field = [number, Value];

const encoder = new TextEncoder();

export function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function varint(value: number): number[] {
  const bytes: number[] = [];
  let rest = value;
  while (rest > 0x7f) {
    bytes.push((rest % 128) | 0x80);
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
  return bytes;
}

// Un message protobuf : un nombre s'écrit en VARINT, un texte ou des octets (un sous-message) en LEN.
export function proto(...fields: Field[]): Uint8Array<ArrayBuffer> {
  return concat(
    fields.map(([field, value]) => {
      if (typeof value === 'number')
        return new Uint8Array([...varint(field * 8), ...varint(value)]);
      const bytes = typeof value === 'string' ? encoder.encode(value) : value;
      return concat([new Uint8Array([...varint(field * 8 + 2), ...varint(bytes.length)]), bytes]);
    }),
  );
}

// Une enveloppe Connect : drapeaux, longueur sur 4 octets gros-boutiste, message.
export function envelope(message: Uint8Array, flags = 0): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(5);
  header[0] = flags;
  new DataView(header.buffer).setUint32(1, message.length);
  return concat([header, message]);
}

export async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export const gzipEnvelope = async (message: Uint8Array<ArrayBuffer>) =>
  envelope(await gzip(message), 1);

export const endOfStream = () => envelope(encoder.encode('{"metadata":{}}'), 2);

export const CONV = '3f2a9c10-7b1e-4d2a-9c5f-0000000c0de1';
export const RPC = 'https://claude.ai/claudeai-rpc/anthropic.bard.api.v1alpha.ConversationService';

// --- Les appels PerformAction ---

// L'envoi d'un message : 1.1.1, 1.1.2 = rang, 1.2 = conversation, 1.15 ; 2.1 = message de la personne,
// 2.2 = réponse attendue, 2.3 = texte, 2.12, 2.13, 2.57.2. list : la liste 2.8 (39 entrées) du premier message
// d'une conversation neuve.
export function sendBody(send: {
  userId: string;
  replyId: string;
  text: string;
  rank?: number;
  list?: boolean;
}): Uint8Array<ArrayBuffer> {
  const list: Field[] = send.list
    ? Array.from({ length: 39 }, (_, i) => [8, proto([1, `outil_invente_${i}`], [2, 1])])
    : [];
  return proto(
    [
      1,
      proto(
        [1, proto([1, 'modele_invente_000001'], [2, send.rank ?? 1])],
        [2, CONV],
        [15, new Uint8Array(32).fill(7)],
      ),
    ],
    [
      2,
      proto(
        [1, send.userId],
        [2, send.replyId],
        [3, send.text],
        ...list,
        [12, 'Zone/Inventee'],
        [13, 'fr-FR'],
        [57, proto([2, 'reglage_invente'])],
      ),
    ],
  );
}

// La préparation du premier message (15.1, une liste de 39 entrées, aucun texte), et le petit appel de 106 octets
// qui précède chaque envoi.
export const prepareBody = () =>
  proto([
    15,
    proto(...Array.from({ length: 39 }, (_, i): Field => [1, proto([1, `entree_${i}`], [2, i])])),
  ]);
export const smallActionBody = () => proto([15, proto([1, proto([1, 'action_inventee'], [2, 3])])]);

// --- Les événements de StreamTimeline ---

let cursor = 0;
// Un événement : tout est sous 1 ; 1.10.1 = curseur, 1.11, puis son contenu.
export function event(content: Field): Uint8Array<ArrayBuffer> {
  cursor += 1;
  return proto([
    1,
    proto(content, [10, proto([1, `curseur${String(cursor).padStart(8, '0')}`])], [11, cursor]),
  ]);
}

// 1.1 : une mise à jour et ses enregistrements.
export const update = (...records: Field[]) => event([1, proto(...records)]);
// 1.6.1 : un battement de 6 octets.
export const heartbeat = (count: number) => proto([1, proto([6, proto([1, count % 100])])]);

// 1.1.2 : la conversation et ses réglages, un gros objet (plus de 260 feuilles) renvoyé souvent.
export const conversationObject = (): Field => [
  2,
  proto(
    [1, CONV],
    ...Array.from(
      { length: 270 },
      (_, i): Field => [3, proto([1, `reglage_${i}`], [2, i % 3], [3, 'valeur inventee'])],
    ),
  ),
];

// 1.1.3 : un message. author : 1 la personne, 2 l'assistant ; done : 6=1 (et 7=1 pour une réponse) ;
// replyTo : 11, le message auquel il répond.
export function messageRecord(message: {
  id: string;
  author: 1 | 2;
  rank?: number;
  done?: boolean;
  replyTo?: string;
}): Field {
  const fields: Field[] = [
    [1, message.id],
    [2, CONV],
    [3, message.author],
  ];
  if (message.rank) fields.push([4, message.rank]);
  if (message.done) fields.push([6, 1]);
  if (message.done && message.author === 2) fields.push([7, 1]);
  if (message.replyTo) fields.push([11, message.replyTo]);
  return [3, proto(...fields)];
}

// 1.1.4 : une étape d'un message ; kind : 1 du texte, 2 une réflexion (alors 5 = un court libellé).
export function stepRecord(step: {
  id: string;
  message: string;
  rank: number;
  kind: 1 | 2;
  done?: boolean;
}): Field {
  const fields: Field[] = [
    [1, step.id],
    [2, step.message],
    [3, step.rank],
    [4, step.kind],
  ];
  if (step.kind === 2) fields.push([5, 'Libellé inventé']);
  if (step.done) fields.push([6, 1]);
  return [4, proto(...fields)];
}

// 1.1.5 : un bloc de texte (10.1=2), son texte cumulé en 9, 4=1 quand il est terminé.
export function textBlock(block: {
  id: string;
  step: string;
  text: string;
  done?: boolean;
}): Field {
  const fields: Field[] = [
    [1, block.id],
    [2, block.step],
  ];
  if (block.done) fields.push([4, 1]);
  fields.push([9, block.text], [10, proto([1, 2])]);
  return [5, proto(...fields)];
}

// Un bloc de réflexion (10.1=1) : un libellé en 5, son contenu en 12.1, jamais de 9.
export function thinkingBlock(block: {
  id: string;
  step: string;
  thought: string;
  done?: boolean;
}) {
  const fields: Field[] = [
    [1, block.id],
    [2, block.step],
  ];
  if (block.done) fields.push([4, 1]);
  fields.push([5, 'Libellé inventé'], [10, proto([1, 1])], [12, proto([1, block.thought])]);
  return [5, proto(...fields)] as Field;
}

// 1.2 : un morceau, du texte en 2 ou de la réflexion en 6.1.
export const piece = (block: string, text: string) => event([2, proto([1, block], [2, text])]);
export const thoughtPiece = (block: string, thought: string) =>
  event([2, proto([1, block], [6, proto([1, thought])])]);

export const THOUGHT = 'PENSEE-CACHEE : texte de réflexion inventé';

// Un échange enveloppe par enveloppe, dans l'ordre relevé : la personne, la réponse en cours avec sa réflexion, les
// morceaux, le bloc terminé (compressé s'il est gros), la réponse terminée. Un bloc de texte par élément de reply.
export async function exchangeEnvelopes(exchange: {
  userId: string;
  replyId: string;
  userText: string;
  reply: string[];
  rank?: number;
}): Promise<Uint8Array<ArrayBuffer>[]> {
  const { userId, replyId, userText, reply } = exchange;
  const rank = exchange.rank ?? 1;
  const tag = replyId.slice(0, 8);
  const envelopes = [
    await gzipEnvelope(update(conversationObject())),
    await gzipEnvelope(
      update(
        conversationObject(),
        messageRecord({ id: userId, author: 1, rank: rank - 1, done: true }),
        stepRecord({ id: `etape_personne_${tag}`, message: userId, rank: 0, kind: 1, done: true }),
        textBlock({
          id: `bloc_personne_${tag}`,
          step: `etape_personne_${tag}`,
          text: userText,
          done: true,
        }),
      ),
    ),
    envelope(heartbeat(1)),
    await gzipEnvelope(
      update(
        conversationObject(),
        messageRecord({ id: replyId, author: 2, rank, replyTo: userId }),
        stepRecord({ id: `etape_reflexion_${tag}`, message: replyId, rank: 0, kind: 2 }),
        thinkingBlock({ id: `bloc_reflexion_${tag}`, step: `etape_reflexion_${tag}`, thought: '' }),
      ),
    ),
    envelope(thoughtPiece(`bloc_reflexion_${tag}`, THOUGHT)),
    envelope(
      update(
        thinkingBlock({
          id: `bloc_reflexion_${tag}`,
          step: `etape_reflexion_${tag}`,
          thought: THOUGHT,
          done: true,
        }),
      ),
    ),
  ];
  for (const [index, text] of reply.entries()) {
    const step = `etape_texte_${index}_${tag}`;
    const block = `bloc_texte_${index}_${tag}`;
    envelopes.push(
      envelope(
        update(
          stepRecord({ id: step, message: replyId, rank: index + 1, kind: 1 }),
          textBlock({ id: block, step, text: text.slice(0, 2) }),
        ),
      ),
      envelope(piece(block, text.slice(2, 40))),
      envelope(heartbeat(2)),
      envelope(piece(block, text.slice(40))),
    );
    const finished = update(textBlock({ id: block, step, text, done: true }));
    envelopes.push(finished.length > 1000 ? await gzipEnvelope(finished) : envelope(finished));
  }
  envelopes.push(
    await gzipEnvelope(
      update(
        conversationObject(),
        messageRecord({ id: replyId, author: 2, rank, done: true, replyTo: userId }),
      ),
    ),
  );
  return envelopes;
}

// L'historique d'une conversation rouverte : une enveloppe où tous les messages arrivent déjà terminés, avec leurs
// étapes et leurs blocs terminés.
export async function historyEnvelope(messages: number): Promise<Uint8Array<ArrayBuffer>> {
  const records: Field[] = [conversationObject()];
  for (let i = 0; i < messages; i++) {
    const id = `0a1b2c3d-0000-4000-8000-00000000${String(100 + i).padStart(4, '0')}`;
    const author = i % 2 === 0 ? 1 : 2;
    records.push(
      messageRecord({ id, author, rank: i, done: true }),
      stepRecord({ id: `etape_historique_${i}`, message: id, rank: 0, kind: 1, done: true }),
      textBlock({
        id: `bloc_historique_${i}`,
        step: `etape_historique_${i}`,
        text: `Message ancien inventé ${i}`,
        done: true,
      }),
    );
  }
  return gzipEnvelope(update(...records));
}
