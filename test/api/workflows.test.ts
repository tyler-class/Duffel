import { describe, expect, it } from 'vitest';
import type {
  AppState,
  Item,
  Person,
  Template,
  TripDetail,
  TripItem,
} from '../../src/shared/types';
import { session, type Api } from './helpers';

async function household(api: Api) {
  const sam = (await api.post<Person>('/people', { name: 'Sam', role: 'Adult' })).data;
  const mia = (await api.post<Person>('/people', { name: 'Mia', role: 'Child' })).data;
  const shirt = (
    await api.post<Item>('/items', {
      name: 'T-shirt',
      category: 'Clothing',
      qty_mode: 'per_day',
      qty: 1,
      max_qty: 5,
      default_people: [sam.id, mia.id],
    })
  ).data;
  const kindle = (
    await api.post<Item>('/items', {
      name: 'Kindle',
      usually_carry_on: true,
      default_people: [sam.id],
    })
  ).data;
  const seat = (
    await api.post<Item>('/items', {
      name: 'Car seat',
      not_in_suitcase: true,
      default_people: [mia.id],
    })
  ).data;
  const sun = (await api.post<Item>('/items', { name: 'Sunscreen', climate_tags: ['Hot'] })).data;
  return { sam, mia, shirt, kindle, seat, sun };
}

describe('people and catalog', () => {
  it('auto-assigns distinct colors and validates input', async () => {
    const api = await session();
    const a = (await api.post<Person>('/people', { name: 'A' })).data;
    const b = (await api.post<Person>('/people', { name: 'B' })).data;
    expect(a.color).not.toBe(b.color);
    const bad = await api.post<{ error: string; message: string }>('/people', { name: '  ' });
    expect(bad.status).toBe(400);
    expect(bad.data.message).toMatch(/Name is required/);
  });

  it('state includes lookups merged with values in use', async () => {
    const api = await session();
    await api.post('/items', { name: 'Kite', category: 'Toys' });
    const { data } = await api.get<AppState>('/state');
    expect(data.lookups.category).toContain('Clothing');
    expect(data.lookups.category).toContain('Toys');
    expect(data.settings.instance_name).toBe('Duffel');
  });
});

describe('key workflows', () => {
  it('builds a trip from a template, clones it unpacked, and saves it as a template', async () => {
    const api = await session();
    const h = await household(api);

    // 1. A template made by hand. Template items have no packed field.
    const tpl = (await api.post<Template>('/templates', { name: 'Beach', climate: 'Hot' })).data;
    const withItems = (
      await api.post<Template>(`/templates/${tpl.id}/items`, {
        item_ids: [h.shirt.id, h.kindle.id, h.seat.id, h.shirt.id],
      })
    ).data;
    expect(withItems.items).toHaveLength(3);
    expect(Object.keys(withItems.items[0]!)).not.toContain('packed');
    await api.patch(`/template-items/${withItems.items[0]!.id}`, { notes: 'light ones' });

    // 2. Trip from the template.
    const trip = (
      await api.post<TripDetail>('/trips', {
        name: 'Lisbon',
        start_date: '2026-12-12',
        end_date: '2026-12-19',
        travelers: [h.sam.id, h.mia.id],
        source: { kind: 'template', template_id: tpl.id },
        bags: [
          { label: 'Lisbon - Big checked', role: 'Checked' },
          { label: 'Lisbon - Sam carry-on', role: 'Carry-on' },
        ],
      })
    ).data;
    expect(trip.trip).toMatchObject({ days: 8, nights: 7, climate: 'Hot', template_id: tpl.id });
    expect(trip.bags.map((b) => b.carry_on)).toEqual([false, true]);
    const shirts = trip.items.filter((r) => r.item_id === h.shirt.id);
    expect(shirts.map((r) => r.person_id).sort()).toEqual([h.sam.id, h.mia.id].sort());
    expect(shirts.every((r) => r.qty === 5 && r.notes === 'light ones')).toBe(true);
    const kindleRow = trip.items.find((r) => r.item_id === h.kindle.id)!;
    expect(kindleRow.trip_bag_id).toBe(trip.bags[1]!.id);
    expect(trip.items.find((r) => r.item_id === h.seat.id)).toMatchObject({
      no_bag: true,
      trip_bag_id: null,
    });
    expect(trip.items.every((r) => !r.packed)).toBe(true);

    // Pack everything, then clone: the new list starts fully unpacked.
    for (const r of trip.items) await api.patch(`/trip-items/${r.id}`, { packed: true });
    const packed = (await api.get<TripDetail>(`/trips/${trip.trip.id}`)).data;
    expect(packed.items.every((r) => r.packed && r.packed_at)).toBe(true);
    expect(packed.trip.packed_count).toBe(packed.trip.item_count);

    const clone = (
      await api.post<TripDetail>('/trips', {
        name: 'Lisbon again',
        start_date: '2027-06-01',
        end_date: '2027-06-03',
        source: { kind: 'clone', trip_id: trip.trip.id },
      })
    ).data;
    expect(clone.trip.cloned_from_trip_id).toBe(trip.trip.id);
    expect(clone.trip.travelers.sort()).toEqual([h.sam.id, h.mia.id].sort());
    expect(clone.items).toHaveLength(trip.items.length);
    expect(clone.items.every((r) => !r.packed && r.packed_at === null)).toBe(true);
    expect(clone.bags.map((b) => b.label)).toEqual([
      'Lisbon again - Big checked',
      'Lisbon again - Sam carry-on',
    ]);
    const cloneBagIds = new Set(clone.bags.map((b) => b.id));
    expect(
      clone.items.filter((r) => r.trip_bag_id).every((r) => cloneBagIds.has(r.trip_bag_id!)),
    ).toBe(true);
    expect(clone.items.filter((r) => r.item_id === h.shirt.id).every((r) => r.qty === 3)).toBe(
      true,
    );

    // 3. Template from an existing list.
    const saved = (
      await api.post<Template>(`/trips/${trip.trip.id}/save-as-template`, { name: 'Beach v2' })
    ).data;
    expect(saved.name).toBe('Beach v2');
    const savedShirt = saved.items.find((i) => i.item_id === h.shirt.id)!;
    expect(savedShirt.assignees.sort()).toEqual([h.sam.id, h.mia.id].sort());
    expect(saved.items.find((i) => i.item_id === h.kindle.id)!.carry_on).toBe(true);
    expect(JSON.stringify(saved)).not.toMatch(/packed/);
  });

  it('recalculates quantities when dates change, keeping overrides', async () => {
    const api = await session();
    const h = await household(api);
    const t = (
      await api.post<TripDetail>('/trips', {
        name: 'Short',
        start_date: '2026-05-01',
        end_date: '2026-05-03',
        travelers: [h.sam.id],
      })
    ).data;
    await api.post(`/trips/${t.trip.id}/items/from-catalog`, { item_ids: [h.shirt.id, h.sun.id] });
    let d = (await api.get<TripDetail>(`/trips/${t.trip.id}`)).data;
    const shirt = d.items.find((r) => r.item_id === h.shirt.id)!;
    expect(shirt.qty).toBe(3);
    expect(d.items.find((r) => r.item_id === h.sun.id)!.person_id).toBeNull();
    await api.patch(`/trip-items/${d.items.find((r) => r.item_id === h.sun.id)!.id}`, {
      qty_override: 2,
    });
    d = (await api.patch<TripDetail>(`/trips/${t.trip.id}`, { end_date: '2026-05-04' })).data;
    expect(d.trip).toMatchObject({ days: 4, nights: 3 });
    expect(d.items.find((r) => r.item_id === h.shirt.id)!.qty).toBe(4);
    expect(d.items.find((r) => r.item_id === h.sun.id)!.qty_override).toBe(2);
    d = (
      await api.patch<TripDetail>(`/trips/${t.trip.id}`, {
        start_date: null,
        end_date: null,
        days: null,
        nights: null,
      })
    ).data;
    expect(d.items.find((r) => r.item_id === h.shirt.id)!.qty).toBeNull();
  });

  it('enforces bag placement rules', async () => {
    const api = await session();
    const a = (await api.post<TripDetail>('/trips', { name: 'A', bags: [{ label: 'Duffel' }] }))
      .data;
    const b = (await api.post<TripDetail>('/trips', { name: 'B', bags: [{ label: 'Other' }] }))
      .data;
    const row = (
      await api.post<TripItem>(`/trips/${a.trip.id}/items`, {
        name: 'Snacks',
        trip_bag_id: a.bags[0]!.id,
      })
    ).data;
    expect(row).toMatchObject({ trip_bag_id: a.bags[0]!.id, no_bag: false, qty: 1 });
    const wrong = await api.patch(`/trip-items/${row.id}`, { trip_bag_id: b.bags[0]!.id });
    expect(wrong.status).toBe(400);
    const nobag = (await api.patch<TripItem>(`/trip-items/${row.id}`, { no_bag: true })).data;
    expect(nobag).toMatchObject({ no_bag: true, trip_bag_id: null });
    const back = (
      await api.patch<TripItem>(`/trip-items/${row.id}`, { trip_bag_id: a.bags[0]!.id })
    ).data;
    expect(back).toMatchObject({ no_bag: false, trip_bag_id: a.bags[0]!.id });
    // carry-on comes from the bag
    await api.patch(`/trip-bags/${a.bags[0]!.id}`, { carry_on: true });
    const d = (await api.get<TripDetail>(`/trips/${a.trip.id}`)).data;
    expect(d.bags[0]!.carry_on).toBe(true);
  });

  it('deletes and restores a row with the same id (undo)', async () => {
    const api = await session();
    const t = (await api.post<TripDetail>('/trips', { name: 'Undo' })).data;
    const row = (
      await api.post<TripItem>(`/trips/${t.trip.id}/items`, { name: 'Hat', notes: 'blue' })
    ).data;
    await api.del(`/trip-items/${row.id}`);
    const restored = (
      await api.post<TripItem>(`/trips/${t.trip.id}/items`, {
        id: row.id,
        name: row.name,
        notes: row.notes,
        sort_order: row.sort_order,
      })
    ).data;
    expect(restored.id).toBe(row.id);
  });

  it('resets packed, suggests by tags, and exports CSV', async () => {
    const api = await session();
    const h = await household(api);
    const t = (
      await api.post<TripDetail>('/trips', { name: 'Sunny', climate: 'Hot', travelers: [h.sam.id] })
    ).data;
    const sugg = (await api.get<Item[]>(`/trips/${t.trip.id}/suggestions`)).data.map((i) => i.id);
    expect(sugg).toContain(h.sun.id);
    await api.post(`/trips/${t.trip.id}/items/from-catalog`, { item_ids: [h.sun.id] });
    const after = (await api.get<Item[]>(`/trips/${t.trip.id}/suggestions`)).data.map((i) => i.id);
    expect(after).not.toContain(h.sun.id);
    let d = (await api.get<TripDetail>(`/trips/${t.trip.id}`)).data;
    await api.patch(`/trip-items/${d.items[0]!.id}`, { packed: true });
    d = (await api.post<TripDetail>(`/trips/${t.trip.id}/reset-packed`)).data;
    expect(d.items.every((r) => !r.packed)).toBe(true);
    const csv = await api.get<string>(`/trips/${t.trip.id}/export.csv`);
    expect(csv.data).toMatch(/^Item,Person,Bag,Carry-on,Qty,Packed,Notes\nSunscreen,Shared,/);
  });
});
