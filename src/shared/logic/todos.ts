// To-dos before, during and after a trip, and moving them between templates and trips.
import { TODO_PHASES, type TodoPhase } from '../lookups';
import type { TemplateTodo, TripTodo } from '../types';
import { dayNumber } from './dates';

const DAY_MS = 86_400_000;
const isoOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

interface TripDates {
  start_date: string | null;
  end_date: string | null;
}

/**
 * A template to-do's real date on a trip: `days` before the start (pre), day
 * `days` of the trip counting from 1 (during), or `days` after the end (after).
 * Null when the trip doesn't have the dates it needs.
 */
export function todoDate(phase: TodoPhase, days: number | null, trip: TripDates): string | null {
  if (days === null) return null;
  const start = dayNumber(trip.start_date);
  const end = dayNumber(trip.end_date) ?? start;
  if (phase === 'pre') return start === null ? null : isoOf(start - days);
  if (phase === 'during') return start === null ? null : isoOf(start + Math.max(1, days) - 1);
  return end === null ? null : isoOf(end + days);
}

/** The reverse of todoDate: a trip to-do's date relative to its trip. */
export function todoDays(phase: TodoPhase, date: string | null, trip: TripDates): number | null {
  const d = dayNumber(date);
  if (d === null) return null;
  const start = dayNumber(trip.start_date);
  const end = dayNumber(trip.end_date) ?? start;
  if (phase === 'pre') return start === null ? null : start - d;
  if (phase === 'during') return start === null ? null : d - start + 1;
  return end === null ? null : d - end;
}

/** A to-do row before it has an id, trip and timestamps. */
export interface TodoDraft {
  title: string;
  phase: TodoPhase;
  due_date: string | null;
  notes: string | null;
  sort_order: number;
}

/** Template to-dos as trip to-dos, dated from the trip's dates. */
export function planTodosFromTemplate(todos: TemplateTodo[], trip: TripDates): TodoDraft[] {
  return todos.map((t) => ({
    title: t.title,
    phase: t.phase,
    due_date: todoDate(t.phase, t.due_days, trip),
    notes: t.notes,
    sort_order: t.sort_order,
  }));
}

/**
 * A past trip's to-dos for a new trip, all not done. Dates keep their place relative
 * to the trip (two weeks before, day 2, the day after). A date that can't be moved
 * (the old trip had no dates) is kept; one that needs dates the new trip lacks is dropped.
 */
export function planTodosClone(todos: TripTodo[], from: TripDates, to: TripDates): TodoDraft[] {
  return todos.map((t) => {
    const days = todoDays(t.phase, t.due_date, from);
    const due_date =
      days !== null
        ? todoDate(t.phase, days, to)
        : dayNumber(from.start_date) === null
          ? t.due_date
          : null;
    return { title: t.title, phase: t.phase, due_date, notes: t.notes, sort_order: t.sort_order };
  });
}

/** A trip's to-dos for a new template, with dates made relative to the trip. */
export function planTemplateTodos(
  todos: TripTodo[],
  trip: TripDates,
): Omit<TemplateTodo, 'id' | 'template_id'>[] {
  return todos.map((t) => ({
    title: t.title,
    phase: t.phase,
    due_days: todoDays(t.phase, t.due_date, trip),
    notes: t.notes,
    sort_order: t.sort_order,
  }));
}

const phaseRank = (p: TodoPhase) => TODO_PHASES.indexOf(p);

/** Trip to-dos by phase, then date (undated last), then the order they were added. */
export function sortTripTodos<T extends Pick<TripTodo, 'phase' | 'due_date' | 'sort_order'>>(
  todos: readonly T[],
): T[] {
  return [...todos].sort(
    (a, b) =>
      phaseRank(a.phase) - phaseRank(b.phase) ||
      (a.due_date ?? '￿').localeCompare(b.due_date ?? '￿') ||
      a.sort_order - b.sort_order,
  );
}

/** Template to-dos in the order they'd fall on a trip: by phase, then when, undated last. */
export function sortTemplateTodos<
  T extends Pick<TemplateTodo, 'phase' | 'due_days' | 'sort_order'>,
>(todos: readonly T[]): T[] {
  // Earlier first: more days before the trip, then lower day numbers, then fewer days after.
  const when = (t: T) =>
    t.due_days === null ? Infinity : t.phase === 'pre' ? -t.due_days : t.due_days;
  return [...todos].sort(
    (a, b) =>
      phaseRank(a.phase) - phaseRank(b.phase) || when(a) - when(b) || a.sort_order - b.sort_order,
  );
}

/** Where a trip is relative to today: before it starts, under way, or over. */
export function tripStage(trip: TripDates, today: string): 'before' | 'during' | 'after' {
  const t = dayNumber(today);
  const start = dayNumber(trip.start_date);
  const end = dayNumber(trip.end_date) ?? start;
  if (t === null || start === null || end === null || t < start) return 'before';
  return t <= end ? 'during' : 'after';
}
