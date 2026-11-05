import { describe, expect, it } from 'vitest';
import type { Template, TripDetail } from '../../src/shared/types';
import { session } from './helpers';

const summary = (d: { todos: { title: string; phase: string; due_date: string | null }[] }) =>
  d.todos.map((t) => [t.title, t.phase, t.due_date]);

describe('to-dos', () => {
  it('move from templates to trips, between trips and back to templates', async () => {
    const api = await session();
    let tpl = (await api.post<Template>('/templates', { name: 'Ski' })).data;
    tpl = (
      await api.post<Template>(`/templates/${tpl.id}/todos`, {
        title: 'Book the kennel',
        due_days: 14,
        notes: 'Ask about the dog’s pills',
      })
    ).data;
    tpl = (
      await api.post<Template>(`/templates/${tpl.id}/todos`, {
        title: 'Rent skis',
        phase: 'during',
        due_days: 1,
      })
    ).data;
    tpl = (
      await api.post<Template>(`/templates/${tpl.id}/todos`, {
        title: 'Return skis',
        phase: 'after',
      })
    ).data;
    expect(tpl.todos).toHaveLength(3);
    const kennel = tpl.todos.find((t) => t.title === 'Book the kennel')!;
    tpl = (await api.patch<Template>(`/template-todos/${kennel.id}`, { due_days: 10 })).data;
    expect(tpl.todos.find((t) => t.id === kennel.id)?.due_days).toBe(10);

    const trip = (
      await api.post<TripDetail>('/trips', {
        name: 'Ski week',
        start_date: '2027-02-10',
        end_date: '2027-02-14',
        source: { kind: 'template', template_id: tpl.id },
      })
    ).data;
    expect(summary(trip)).toEqual([
      ['Book the kennel', 'pre', '2027-01-31'],
      ['Rent skis', 'during', '2027-02-10'],
      ['Return skis', 'after', null],
    ]);
    expect(trip.todos[0]!.notes).toBe('Ask about the dog’s pills');

    // Check one off, add one, and edit one.
    const t0 = trip.todos[0]!;
    let d = (await api.patch<TripDetail>(`/trip-todos/${t0.id}`, { done: true })).data;
    expect(d.todos[0]!.done).toBe(true);
    expect(d.todos[0]!.done_at).not.toBeNull();
    d = (
      await api.post<TripDetail>(`/trips/${trip.trip.id}/todos`, {
        title: 'Hold the mail',
        due_date: '2027-02-08',
      })
    ).data;
    expect(d.todos).toHaveLength(4);
    const bad = await api.post(`/trips/${trip.trip.id}/todos`, { title: 'x', phase: 'soon' });
    expect(bad.status).toBe(400);

    const copy = (
      await api.post<TripDetail>('/trips', {
        name: 'Ski again',
        start_date: '2028-01-10',
        end_date: '2028-01-12',
        source: { kind: 'clone', trip_id: trip.trip.id },
      })
    ).data;
    expect(summary(copy)).toEqual([
      ['Book the kennel', 'pre', '2027-12-31'],
      ['Rent skis', 'during', '2028-01-10'],
      ['Return skis', 'after', null],
      ['Hold the mail', 'pre', '2028-01-08'],
    ]);
    expect(copy.todos.every((t) => !t.done)).toBe(true);

    const saved = (
      await api.post<Template>(`/trips/${trip.trip.id}/save-as-template`, { name: 'Saved' })
    ).data;
    expect(saved.todos.map((t) => [t.title, t.phase, t.due_days])).toEqual([
      ['Book the kennel', 'pre', 10],
      ['Rent skis', 'during', 1],
      ['Return skis', 'after', null],
      ['Hold the mail', 'pre', 2],
    ]);

    await api.del(`/trip-todos/${t0.id}`);
    expect((await api.get<TripDetail>(`/trips/${trip.trip.id}`)).data.todos).toHaveLength(3);
    await api.del(`/template-todos/${kennel.id}`);
    expect(
      (await api.get<{ templates: Template[] }>('/state')).data.templates.find(
        (t) => t.id === tpl.id,
      )?.todos,
    ).toHaveLength(2);
  });
});
