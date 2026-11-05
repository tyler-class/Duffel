import { describe, expect, it } from 'vitest';
import {
  planTemplateTodos,
  planTodosClone,
  planTodosFromTemplate,
  sortTemplateTodos,
  sortTripTodos,
  todoDate,
  todoDays,
  tripStage,
} from '../../src/shared/logic/todos';
import type { TemplateTodo, TripTodo } from '../../src/shared/types';

const trip = { start_date: '2026-12-17', end_date: '2026-12-21' };
const none = { start_date: null, end_date: null };

const tt = (p: Partial<TemplateTodo>): TemplateTodo => ({
  id: 'x',
  template_id: 't',
  title: 'Do it',
  phase: 'pre',
  due_days: null,
  notes: null,
  sort_order: 0,
  ...p,
});
const td = (p: Partial<TripTodo>): TripTodo => ({
  id: 'x',
  trip_id: 'trip',
  title: 'Do it',
  phase: 'pre',
  due_date: null,
  notes: null,
  done: false,
  done_at: null,
  sort_order: 0,
  ...p,
});

describe('todoDate / todoDays', () => {
  it('counts back from the start, through the trip from day 1, and on from the end', () => {
    expect(todoDate('pre', 14, trip)).toBe('2026-12-03');
    expect(todoDate('pre', 0, trip)).toBe('2026-12-17');
    expect(todoDate('during', 1, trip)).toBe('2026-12-17');
    expect(todoDate('during', 3, trip)).toBe('2026-12-19');
    expect(todoDate('after', 1, trip)).toBe('2026-12-22');
    expect(todoDate('after', 30, trip)).toBe('2027-01-20');
  });
  it('round-trips', () => {
    for (const phase of ['pre', 'during', 'after'] as const)
      for (const n of [1, 2, 10]) expect(todoDays(phase, todoDate(phase, n, trip), trip)).toBe(n);
  });
  it('is null without the dates it needs', () => {
    expect(todoDate('pre', 3, none)).toBeNull();
    expect(todoDate('pre', null, trip)).toBeNull();
    expect(todoDays('after', '2026-12-30', none)).toBeNull();
    // A trip with only a start ends on its start day.
    expect(todoDate('after', 1, { start_date: '2026-12-17', end_date: null })).toBe('2026-12-18');
  });
});

describe('moving to-dos between templates and trips', () => {
  it('dates template to-dos from the trip', () => {
    const d = planTodosFromTemplate(
      [tt({ title: 'Kennel', due_days: 7 }), tt({ title: 'Mail', phase: 'after' })],
      trip,
    );
    expect(d.map((x) => [x.title, x.phase, x.due_date])).toEqual([
      ['Kennel', 'pre', '2026-12-10'],
      ['Mail', 'after', null],
    ]);
  });
  it('copies to a new trip keeping dates relative, never done', () => {
    const next = { start_date: '2027-03-01', end_date: '2027-03-03' };
    const d = planTodosClone(
      [
        td({ title: 'Kennel', due_date: '2026-12-10', done: true }),
        td({ title: 'Hike', phase: 'during', due_date: '2026-12-18' }),
        td({ title: 'Undated' }),
      ],
      trip,
      next,
    );
    expect(d.map((x) => [x.title, x.due_date])).toEqual([
      ['Kennel', '2027-02-22'],
      ['Hike', '2027-03-02'],
      ['Undated', null],
    ]);
    expect(d.every((x) => !('done' in x))).toBe(true);
  });
  it('keeps fixed dates when the old trip had no dates', () => {
    expect(planTodosClone([td({ due_date: '2026-05-01' })], none, trip)[0]!.due_date).toBe(
      '2026-05-01',
    );
  });
  it('turns trip dates into relative days for a template', () => {
    const t = planTemplateTodos(
      [td({ due_date: '2026-12-03' }), td({ phase: 'after', due_date: '2026-12-23' })],
      trip,
    );
    expect(t.map((x) => x.due_days)).toEqual([14, 2]);
    expect(t.some((x) => 'done' in x)).toBe(false);
  });
});

describe('sorting', () => {
  it('sorts trip to-dos by phase, then date, undated last', () => {
    const s = sortTripTodos([
      td({ title: 'c', phase: 'after', due_date: '2026-12-22' }),
      td({ title: 'b', due_date: null }),
      td({ title: 'a', due_date: '2026-12-10' }),
      td({ title: 'a0', due_date: '2026-12-01' }),
    ]);
    expect(s.map((x) => x.title)).toEqual(['a0', 'a', 'b', 'c']);
  });
  it('sorts template to-dos in trip order', () => {
    const s = sortTemplateTodos([
      tt({ title: 'week before', due_days: 7 }),
      tt({ title: 'month before', due_days: 30 }),
      tt({ title: 'day 2', phase: 'during', due_days: 2 }),
      tt({ title: 'day 1', phase: 'during', due_days: 1 }),
      tt({ title: 'no date' }),
    ]);
    expect(s.map((x) => x.title)).toEqual([
      'month before',
      'week before',
      'no date',
      'day 1',
      'day 2',
    ]);
  });
});

describe('tripStage', () => {
  it('knows before, during and after', () => {
    expect(tripStage(trip, '2026-12-16')).toBe('before');
    expect(tripStage(trip, '2026-12-17')).toBe('during');
    expect(tripStage(trip, '2026-12-21')).toBe('during');
    expect(tripStage(trip, '2026-12-22')).toBe('after');
    expect(tripStage(none, '2026-12-22')).toBe('before');
  });
});
