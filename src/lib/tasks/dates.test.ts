import { describe, expect, it } from 'vitest';
import { dueFilterRange, dueSuggestions, formatDue, isOverdue, todayInParis } from './dates';

describe('todayInParis', () => {
  it('bascule à minuit heure de Paris en été (UTC+2)', () => {
    expect(todayInParis(new Date('2026-10-14T21:59:59Z'))).toBe('2026-10-14');
    expect(todayInParis(new Date('2026-10-14T22:00:00Z'))).toBe('2026-10-15');
  });

  it("bascule à minuit heure de Paris en hiver (UTC+1), y compris au changement d'année", () => {
    expect(todayInParis(new Date('2026-12-31T22:59:59Z'))).toBe('2026-12-31');
    expect(todayInParis(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01');
  });

  it("suit le passage à l'heure d'hiver du 25 octobre 2026", () => {
    expect(todayInParis(new Date('2026-10-24T22:00:00Z'))).toBe('2026-10-25');
    expect(todayInParis(new Date('2026-10-25T22:59:59Z'))).toBe('2026-10-25');
    expect(todayInParis(new Date('2026-10-25T23:00:00Z'))).toBe('2026-10-26');
  });
});

describe('dueFilterRange', () => {
  it("« en retard » s'arrête à la veille, sans borne basse", () => {
    expect(dueFilterRange('overdue', new Date('2026-10-14T21:59:59Z'))).toEqual({
      from: null,
      to: '2026-10-13',
    });
    expect(dueFilterRange('overdue', new Date('2026-10-14T22:00:00Z'))).toEqual({
      from: null,
      to: '2026-10-14',
    });
  });

  it('« cette semaine » va du lundi au dimanche (jeudi 15 octobre 2026)', () => {
    expect(dueFilterRange('week', new Date('2026-10-15T10:00:00Z'))).toEqual({
      from: '2026-10-12',
      to: '2026-10-18',
    });
  });

  it('change de semaine le dimanche à minuit heure de Paris', () => {
    expect(dueFilterRange('week', new Date('2026-10-18T21:59:59Z'))).toEqual({
      from: '2026-10-12',
      to: '2026-10-18',
    });
    expect(dueFilterRange('week', new Date('2026-10-18T22:00:00Z'))).toEqual({
      from: '2026-10-19',
      to: '2026-10-25',
    });
  });

  it('une semaine peut chevaucher deux années', () => {
    expect(dueFilterRange('week', new Date('2026-12-31T10:00:00Z'))).toEqual({
      from: '2026-12-28',
      to: '2027-01-03',
    });
  });
});

describe('formatDue', () => {
  const now = new Date('2026-10-15T10:00:00Z');

  it("dit « Aujourd'hui » et « Demain »", () => {
    expect(formatDue('2026-10-15', now)).toBe("Aujourd'hui");
    expect(formatDue('2026-10-16', now)).toBe('Demain');
  });

  it("compte les jours à l'heure de Paris, pas en UTC", () => {
    const justAfterMidnight = new Date('2026-10-14T22:30:00Z');
    expect(formatDue('2026-10-15', justAfterMidnight)).toBe("Aujourd'hui");
    expect(formatDue('2026-10-16', justAfterMidnight)).toBe('Demain');
  });

  it('écrit les autres jours avec leur jour de la semaine', () => {
    expect(formatDue('2026-10-17', now)).toBe('sam. 17 oct.');
    expect(formatDue('2026-10-14', now)).toBe('mer. 14 oct.');
    expect(formatDue('2027-03-01', now)).toBe('lun. 1 mars');
  });
});

describe('isOverdue', () => {
  const now = new Date('2026-10-15T10:00:00Z');

  it("est vrai dès le lendemain de l'échéance, pas le jour même", () => {
    expect(isOverdue({ dueDate: '2026-10-14', statusCategory: 'todo' }, now)).toBe(true);
    expect(isOverdue({ dueDate: '2026-10-15', statusCategory: 'todo' }, now)).toBe(false);
    expect(isOverdue({ dueDate: '2026-10-16', statusCategory: 'started' }, now)).toBe(false);
  });

  it("n'est jamais vrai sans échéance ni pour une tâche terminée ou annulée", () => {
    expect(isOverdue({ dueDate: null, statusCategory: 'todo' }, now)).toBe(false);
    expect(isOverdue({ dueDate: '2026-10-01', statusCategory: 'done' }, now)).toBe(false);
    expect(isOverdue({ dueDate: '2026-10-01', statusCategory: 'canceled' }, now)).toBe(false);
  });

  it('suit le jour de Paris, pas celui de UTC', () => {
    const lateEvening = new Date('2026-10-14T22:30:00Z'); // 00 h 30 le 15 à Paris
    expect(isOverdue({ dueDate: '2026-10-14', statusCategory: 'todo' }, lateEvening)).toBe(true);
  });
});

describe('dueSuggestions', () => {
  const dates = (iso: string) =>
    dueSuggestions(new Date(iso)).map(({ label, date }) => [label, date]);

  it('propose aujourd’hui, demain, vendredi et lundi prochain (lundi 12 octobre 2026)', () => {
    expect(dates('2026-10-12T10:00:00Z')).toEqual([
      ["Aujourd'hui", '2026-10-12'],
      ['Demain', '2026-10-13'],
      ['Vendredi', '2026-10-16'],
      ['Semaine prochaine', '2026-10-19'],
    ]);
  });

  it('n’offre pas un vendredi qui est demain ou déjà passé', () => {
    const labels = (iso: string) => dueSuggestions(new Date(iso)).map(({ label }) => label);
    expect(labels('2026-10-15T10:00:00Z')).not.toContain('Vendredi'); // jeudi : demain
    expect(labels('2026-10-16T10:00:00Z')).not.toContain('Vendredi'); // vendredi
    expect(labels('2026-10-17T10:00:00Z')).not.toContain('Vendredi'); // samedi
  });

  it('le dimanche, la semaine prochaine commence demain', () => {
    expect(dates('2026-10-18T10:00:00Z')).toEqual([
      ["Aujourd'hui", '2026-10-18'],
      ['Demain', '2026-10-19'],
      ['Semaine prochaine', '2026-10-19'],
    ]);
  });

  it('compte à l’heure de Paris : après minuit à Paris, c’est déjà le jour suivant', () => {
    expect(dates('2026-10-14T22:30:00Z')[0]).toEqual(["Aujourd'hui", '2026-10-15']);
  });
});
