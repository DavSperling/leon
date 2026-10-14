import { type Catalog, predicatesForType } from '@/server/memory/catalog';
import { oneLine } from '@/server/memory/labels';
import type { PlacementOutput } from '../prompts/placement';
import type { PlacementCandidate, PlacementContext } from './context';

export type TypeChoice =
  | { kind: 'existing'; slug: string }
  | { kind: 'proposed'; slug: string; label: string; parentSlug: string };
type Target =
  | { kind: 'existing'; cardId: string }
  | { kind: 'new'; title: string; type: TypeChoice; unconfirmedMatchCardId: string | null };
type Relation =
  | { kind: 'new' }
  | { kind: 'duplicate' | 'supersedes' | 'contradicts'; factId: string };
type Alias = { alias: string; kind: 'name' | 'email' | 'domain' };
export type PlacementAction =
  | { kind: 'reject'; candidateId: string; reason: string }
  | {
      kind: 'place';
      candidateId: string;
      target: Target;
      predicate: string;
      relation: Relation;
      aliases: Alias[];
    };

type Decision = PlacementOutput['decisions'][number];
type CardOption = PlacementCandidate['cardOptions'][number];
type Rejection = string; // raison du rejet

const TITLE_MAX_CHARS = 120;
const TYPE_LABEL_MAX_CHARS = 60;
const TYPE_SLUG_PATTERN = /^[a-z][a-z0-9-]{1,40}$/; // même règle que card_types.slug

// Seuls les ids du contexte sont acceptés : un id inventé par le modèle ne correspond à aucune option.
function findOption(candidate: PlacementCandidate, cardId: string | null): CardOption | undefined {
  return candidate.cardOptions.find((option) => option.id === cardId);
}

function cleanTitle(title: string | null): string | null {
  const clean = oneLine(title ?? '');
  return clean.length >= 1 && clean.length <= TITLE_MAX_CHARS ? clean : null;
}

function validProposedType(
  catalog: Catalog,
  proposed: Decision['proposedType'],
): TypeChoice | null {
  if (!proposed) return null;
  const label = oneLine(proposed.label);
  const valid =
    TYPE_SLUG_PATTERN.test(proposed.slug) &&
    !catalog.types.some((type) => type.slug === proposed.slug) &&
    catalog.types.some((type) => type.slug === proposed.parentSlug && type.isBase) &&
    label.length >= 1 &&
    label.length <= TYPE_LABEL_MAX_CHARS;
  return valid
    ? { kind: 'proposed', slug: proposed.slug, label, parentSlug: proposed.parentSlug }
    : null;
}

// Un type proposé valide d'abord, sinon un type visible du catalogue.
function chooseType(catalog: Catalog, decision: Decision): TypeChoice | null {
  const proposed = validProposedType(catalog, decision.proposedType);
  if (proposed) return proposed;
  const known = catalog.types.find((type) => type.slug === decision.typeSlug);
  return known ? { kind: 'existing', slug: known.slug } : null;
}

// Fiche nouvelle ; une décision ambiguë la lie à l'option qu'elle cite, si cette option existe.
function newTarget(
  catalog: Catalog,
  candidate: PlacementCandidate,
  decision: Decision,
): Target | Rejection {
  const title = cleanTitle(decision.newCardTitle);
  if (!title) return 'titre invalide';
  const type = chooseType(catalog, decision);
  if (!type) return 'type inconnu';
  const match =
    decision.decision === 'ambiguous' ? findOption(candidate, decision.cardId) : undefined;
  return { kind: 'new', title, type, unconfirmedMatchCardId: match?.id ?? null };
}

// La fiche d'une clé dure l'emporte sur toute décision (fusion automatique sur clé dure seulement).
function chooseTarget(
  catalog: Catalog,
  candidate: PlacementCandidate,
  decision: Decision,
): Target | Rejection {
  if (candidate.fixedCardId === null && decision.decision !== 'existing') {
    return newTarget(catalog, candidate, decision);
  }
  const option = findOption(candidate, candidate.fixedCardId ?? decision.cardId);
  return option ? { kind: 'existing', cardId: option.id } : 'fiche inconnue';
}

// Type dont la fiche tient ses prédicats : un type proposé n'en a pas encore, il prend ceux de son parent.
function targetTypeSlug(target: Target, option: CardOption | undefined): string {
  if (target.kind === 'existing') return option?.typeSlug ?? '';
  return target.type.kind === 'proposed' ? target.type.parentSlug : target.type.slug;
}

function choosePredicate(catalog: Catalog, typeSlug: string, predicate: string): string {
  const known = predicatesForType(catalog, typeSlug).some((p) => p.slug === predicate);
  return known ? predicate : 'note';
}

// Comparaison d'énoncés insensible aux accents, à la casse et à la ponctuation.
export function normalizeStatement(statement: string): string {
  return statement
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Un énoncé identique à un fait actif de la fiche est un doublon, quoi qu'en dise le modèle. Sinon,
// un doublon vise n'importe quel fait actif de la fiche ; un remplacement ou une contradiction, un fait
// du prédicat retenu seulement. Une relation hors de ces faits devient un fait nouveau.
function chooseRelation(
  option: CardOption | undefined,
  predicate: string,
  candidate: PlacementCandidate,
  decision: Decision,
): Relation {
  if (!option) return { kind: 'new' };
  const statement = normalizeStatement(candidate.statement);
  const same = option.activeFacts.find((fact) => normalizeStatement(fact.statement) === statement);
  if (same) return { kind: 'duplicate', factId: same.id };
  if (decision.relation === 'new') return { kind: 'new' };
  const related = option.activeFacts.find(
    (fact) =>
      fact.id === decision.relatedFactId &&
      (decision.relation === 'duplicate' || fact.predicate === predicate),
  );
  return related ? { kind: decision.relation, factId: related.id } : { kind: 'new' };
}

function subjectAliases(subject: PlacementCandidate['subject']): Alias[] {
  const name = oneLine(subject.name);
  const email = subject.email?.trim().toLowerCase();
  const domain = subject.domain?.trim().toLowerCase();
  const aliases: Alias[] = [];
  if (name) aliases.push({ alias: name, kind: 'name' });
  if (email) aliases.push({ alias: email, kind: 'email' });
  if (domain) aliases.push({ alias: domain, kind: 'domain' });
  return aliases;
}

function planCandidate(
  catalog: Catalog,
  candidate: PlacementCandidate,
  decision: Decision | undefined,
): PlacementAction {
  const { candidateId } = candidate;
  if (!decision) return { kind: 'reject', candidateId, reason: 'pas de décision' };
  const target = chooseTarget(catalog, candidate, decision);
  if (typeof target === 'string') return { kind: 'reject', candidateId, reason: target };
  const option = target.kind === 'existing' ? findOption(candidate, target.cardId) : undefined;
  const predicate = choosePredicate(catalog, targetTypeSlug(target, option), candidate.predicate);
  return {
    kind: 'place',
    candidateId,
    target,
    predicate,
    relation: chooseRelation(option, predicate, candidate, decision),
    aliases: subjectAliases(candidate.subject),
  };
}

// Fonction pure : valide la sortie du modèle et ne garde que des références du contexte.
// Une décision sur un candidat inconnu est ignorée ; pour un candidat décidé deux fois, la première compte.
export function planPlacement(
  context: PlacementContext,
  output: PlacementOutput,
): PlacementAction[] {
  const decisions = new Map<string, Decision>();
  for (const decision of output.decisions) {
    if (!decisions.has(decision.candidateId)) decisions.set(decision.candidateId, decision);
  }
  return context.candidates.map((candidate) =>
    planCandidate(context.catalog, candidate, decisions.get(candidate.candidateId)),
  );
}

// Deux candidats d'un même rangement qui disent la même chose, avec la même sensibilité, ne font qu'un
// fait : le premier est rangé, les suivants sont rejetés. Un fait privé ne masque jamais un fait d'équipe.
export function dropRepeatedStatements(
  context: PlacementContext,
  actions: PlacementAction[],
): PlacementAction[] {
  const candidates = new Map(context.candidates.map((c) => [c.candidateId, c]));
  const seen = new Set<string>();
  return actions.map((action) => {
    const candidate = candidates.get(action.candidateId);
    if (action.kind === 'reject' || !candidate) return action;
    const key = `${candidate.sensitive}|${normalizeStatement(candidate.statement)}`;
    if (!seen.has(key)) {
      seen.add(key);
      return action;
    }
    return {
      kind: 'reject',
      candidateId: action.candidateId,
      reason: 'doublon d’un autre candidat',
    };
  });
}
