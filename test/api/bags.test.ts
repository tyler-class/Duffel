import { describe, expect, it } from 'vitest';
import type {
  Item,
  Person,
  Suitcase,
  Template,
  TripDetail,
  TripItem,
} from '../../src/shared/types';
import { session } from './helpers';

describe('bag ownership', () => {
  it('builds a trip from a template’s bags and places items by person and carry-on', async () => {
    const api = await session();
    const sam = (await api.post<Person>('/people', { name: 'Sam' })).data;
    const mia = (await api.post<Person>('/people', { name: 'Mia' })).data;
    const leo = (await api.post<Person>('/people', { name: 'Leo' })).data;
    const samCarry = (
      await api.post<Suitcase>('/suitcases', {
        name: 'Sam carry-on',
        type: 'Suitcase',
        carry_on: true,
        people: [sam.id],
      })
    ).data;
    const samCase = (
      await api.post<Suitcase>('/suitcases', {
        name: 'Sam suitcase',
        type: 'Suitcase',
        people: [sam.id],
      })
    ).data;
    const kids = (
      await api.post<Suitcase>('/suitcases', { name: 'Kids', type: 'Suitcase', people: [mia.id] })
    ).data;
    expect(samCarry.people).toEqual([sam.id]);

    const book = (
      await api.post<Item>('/items', {
        name: 'Book',
        usually_carry_on: true,
        default_people: [sam.id, mia.id],
      })
    ).data;
    const shirt = (
      await api.post<Item>('/items', { name: 'Shirt', default_people: [sam.id, mia.id, leo.id] })
    ).data;
    const seat = (
      await api.post<Item>('/items', {
        name: 'Car seat',
        not_in_suitcase: true,
        default_people: [leo.id],
      })
    ).data;

    let tpl = (await api.post<Template>('/templates', { name: 'Beach' })).data;
    for (const s of [samCarry, samCase, kids])
      tpl = (
        await api.post<Template>(`/templates/${tpl.id}/bags`, { suitcase_id: s.id, label: s.name })
      ).data;
    tpl = (
      await api.post<Template>(`/templates/${tpl.id}/items`, {
        item_ids: [book.id, shirt.id, seat.id],
      })
    ).data;
    expect(tpl.bags.map((b) => [b.label, b.carry_on, b.people])).toEqual([
      ['Sam carry-on', true, [sam.id]],
      ['Sam suitcase', false, [sam.id]],
      ['Kids', false, [mia.id]],
    ]);

    // Preview first: Mia's book (carry-on) and Leo's shirt have no bag.
    const body = {
      name: 'Trip',
      travelers: [sam.id, mia.id, leo.id],
      source: { kind: 'template', template_id: tpl.id },
    };
    const preview = (
      await api.post<{
        rows: number;
        unplaced: { person_id: string; carry: boolean; count: number }[];
      }>('/trips/preview', body)
    ).data;
    expect(preview.rows).toBe(6);
    expect(preview.unplaced).toEqual(
      expect.arrayContaining([
        { person_id: mia.id, carry: true, count: 1 },
        { person_id: leo.id, carry: false, count: 1 },
      ]),
    );

    const t = (await api.post<TripDetail>('/trips', body)).data;
    const bagOf = (r: TripItem) =>
      t.bags.find((b) => b.id === r.trip_bag_id)?.label ?? (r.no_bag ? 'NO BAG' : 'WAITING');
    const where = Object.fromEntries(
      t.items.map((r) => [
        `${r.name}/${[sam, mia, leo].find((p) => p.id === r.person_id)!.name}`,
        bagOf(r),
      ]),
    );
    expect(where).toEqual({
      'Book/Sam': 'Sam carry-on',
      'Book/Mia': 'WAITING',
      'Shirt/Sam': 'Sam suitcase',
      'Shirt/Mia': 'Kids',
      'Shirt/Leo': 'WAITING',
      'Car seat/Leo': 'NO BAG',
    });
    expect(t.bags.every((b) => b.people.length === 1)).toBe(true);

    // Adding Mia a carry-on and putting Leo on Kids makes homes for the waiting rows.
    const d = (
      await api.post<TripDetail>(`/trips/${t.trip.id}/bags`, {
        label: 'Mia backpack',
        role: 'Carry-on',
        people: [mia.id],
      })
    ).data;
    const kidsBag = d.bags.find((b) => b.label === 'Kids')!;
    await api.patch<TripDetail>(`/trip-bags/${kidsBag.id}`, { people: [mia.id, leo.id] });
    const moves = (await api.get<{ moves: unknown[] }>(`/trips/${t.trip.id}/placements`)).data
      .moves;
    expect(moves).toHaveLength(2);
    const applied = (
      await api.post<TripDetail & { moved: number }>(`/trips/${t.trip.id}/placements/apply`)
    ).data;
    expect(applied.moved).toBe(2);
    expect(applied.items.filter((r) => !r.trip_bag_id && !r.no_bag)).toHaveLength(0);

    // Deleting a bag sends its items back to waiting and says how many.
    const del = (await api.del<TripDetail & { moved: number }>(`/trip-bags/${kidsBag.id}`)).data;
    expect(del.moved).toBe(2);

    // Moving a row into a carry-on bag records the carry-on intent.
    const shirtMia = del.items.find((r) => r.name === 'Shirt' && r.person_id === mia.id)!;
    const miaPack = del.bags.find((b) => b.label === 'Mia backpack')!;
    const moved = (
      await api.patch<TripItem>(`/trip-items/${shirtMia.id}`, { trip_bag_id: miaPack.id })
    ).data;
    expect(moved.carry_hint).toBe(true);
  });

  it('copying a trip keeps its bags, owners and placements', async () => {
    const api = await session();
    const sam = (await api.post<Person>('/people', { name: 'Sam' })).data;
    const t = (
      await api.post<TripDetail>('/trips', {
        name: 'A',
        travelers: [sam.id],
        bags: [{ label: 'Sam bag', people: [sam.id] }],
      })
    ).data;
    await api.post(`/trips/${t.trip.id}/items`, {
      name: 'Hat',
      person_id: sam.id,
      trip_bag_id: t.bags[0]!.id,
    });
    const copy = (
      await api.post<TripDetail>('/trips', {
        name: 'B',
        source: { kind: 'clone', trip_id: t.trip.id },
      })
    ).data;
    expect(copy.bags[0]!.people).toEqual([sam.id]);
    expect(copy.items[0]!.trip_bag_id).toBe(copy.bags[0]!.id);
  });
});
