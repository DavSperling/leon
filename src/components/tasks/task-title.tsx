import { Fragment } from 'react';

const INLINE_CODE = /`([^`]+)`/g;

type Segment = { start: number; text: string; code: boolean };

// Découpe un titre sur ses accents graves : `code` devient un segment à part, un accent seul reste du texte.
export function splitInlineCode(title: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of title.matchAll(INLINE_CODE)) {
    if (match.index > last) {
      segments.push({ start: last, text: title.slice(last, match.index), code: false });
    }
    segments.push({ start: match.index, text: match[1] as string, code: true });
    last = match.index + match[0].length;
  }
  if (last < title.length) segments.push({ start: last, text: title.slice(last), code: false });
  return segments;
}

// Le titre d'une tâche, avec le code entre accents graves en mono.
export function TaskTitle({ title }: { title: string }) {
  return splitInlineCode(title).map(({ start, text, code }) =>
    code ? (
      <code key={start} className="rounded-sm bg-muted px-1 font-mono text-[0.85em]">
        {text}
      </code>
    ) : (
      <Fragment key={start}>{text}</Fragment>
    ),
  );
}
