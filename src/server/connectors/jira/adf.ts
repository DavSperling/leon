// Le texte d'un champ au format de document d'Atlassian (ADF), tel que Jira le rend pour une
// description ou un commentaire. On garde le texte et la structure utile (titres, listes, tableaux) ;
// les blocs de code, les règles et les médias sont ignorés. Un nœud inconnu garde son texte et son
// contenu : le format évolue, et un nœud nouveau ne doit ni planter ni faire disparaître le reste.

type Node = Record<string, unknown>;

const MAX_DEPTH = 20; // une description n'a jamais autant de niveaux ; la borne protège la pile
const IGNORED = new Set(['codeBlock', 'rule', 'media', 'mediaSingle', 'mediaGroup', 'mediaInline']);
const INLINE = new Set(['text', 'mention', 'emoji', 'hardBreak', 'inlineCard', 'status', 'date']);

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const children = (node: Node): Node[] =>
  Array.isArray(node.content) ? node.content.filter(isNode) : [];
const isInline = (node: Node): boolean => typeof node.type === 'string' && INLINE.has(node.type);
const nonEmpty = (text: string): boolean => text !== '';

function attr(node: Node, name: string): unknown {
  return isNode(node.attrs) ? node.attrs[name] : undefined;
}
function attrText(node: Node, name: string): string {
  const value = attr(node, name);
  return typeof value === 'string' ? value : '';
}

// L'horodatage d'une date est en millisecondes depuis 1970.
function dateText(timestamp: unknown): string {
  const date = new Date(Number(timestamp));
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

function inlineText(node: Node, depth: number): string {
  if (depth > MAX_DEPTH || IGNORED.has(String(node.type))) return '';
  switch (node.type) {
    case 'text':
      return typeof node.text === 'string' ? node.text : '';
    case 'hardBreak':
      return '\n';
    case 'emoji':
      return attrText(node, 'text') || attrText(node, 'shortName');
    case 'inlineCard':
      return attrText(node, 'url');
    case 'date':
      return dateText(attr(node, 'timestamp'));
    default: // mention, status, nœud inconnu : le texte est dans les attributs
      return attrText(node, 'text') || inlineChildren(node, depth);
  }
}

const inlineChildren = (node: Node, depth: number): string =>
  children(node)
    .map((child) => inlineText(child, depth + 1))
    .join('');

const blocks = (node: Node, depth: number, separator = '\n\n'): string =>
  children(node)
    .map((child) => blockText(child, depth + 1))
    .filter(nonEmpty)
    .join(separator);

// Un conteneur dont tous les enfants sont des éléments de ligne se lit à la suite ; sinon, bloc par bloc.
function containerText(node: Node, depth: number): string {
  const kids = children(node);
  if (kids.length === 0) return attrText(node, 'text');
  return kids.every(isInline) ? inlineChildren(node, depth) : blocks(node, depth);
}

const indent = (text: string): string => text.replace(/^/gm, '  ');

// Le contenu d'un élément de liste : son premier bloc, puis les suivants (listes imbriquées) décalés.
function itemText(item: Node, depth: number): string {
  if (children(item).every(isInline)) return inlineChildren(item, depth);
  const [first = '', ...rest] = children(item)
    .map((child) => blockText(child, depth + 1))
    .filter(nonEmpty);
  return [first, ...rest.map(indent)].join('\n');
}

function listText(list: Node, depth: number, marker: (item: Node, index: number) => string) {
  return children(list)
    .map((item, index) => [marker(item, index), itemText(item, depth)] as const)
    .filter(([, text]) => nonEmpty(text))
    .map(([mark, text]) => mark + text)
    .join('\n');
}

function tableText(table: Node, depth: number): string {
  return children(table)
    .map((row) =>
      children(row)
        .map((cell) => blocks(cell, depth + 1, ' '))
        .filter(nonEmpty)
        .join(' | '),
    )
    .filter(nonEmpty)
    .join('\n');
}

function blockText(node: Node, depth: number): string {
  if (depth > MAX_DEPTH || IGNORED.has(String(node.type))) return '';
  if (isInline(node)) return inlineText(node, depth);
  switch (node.type) {
    case 'paragraph':
      return inlineChildren(node, depth);
    case 'heading': {
      const level = Math.min(Math.max(Number(attr(node, 'level')) || 1, 1), 6);
      return `${'#'.repeat(level)} ${inlineChildren(node, depth)}`;
    }
    case 'bulletList':
      return listText(node, depth, () => '- ');
    case 'orderedList': {
      const first = Number(attr(node, 'order')) || 1;
      return listText(node, depth, (_item, index) => `${first + index}. `);
    }
    case 'taskList':
      return listText(node, depth, (item) =>
        attr(item, 'state') === 'DONE' ? '- [x] ' : '- [ ] ',
      );
    case 'table':
      return tableText(node, depth);
    case 'expand':
    case 'nestedExpand':
      return [attrText(node, 'title'), blocks(node, depth)].filter(nonEmpty).join('\n\n');
    default:
      return containerText(node, depth);
  }
}

export function adfToText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!isNode(value)) return '';
  return blockText(value, 0)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
