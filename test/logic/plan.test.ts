import { describe, expect, it } from 'vitest';
import {
  defaultBagCarryOn,
  pickCarryBag,
  planClone,
  planFromTemplate,
  planTemplateFromTrip,
  rewriteLabelPrefix,
  shortBagLabel,
  suggestItems,
} from '../../src/shared/logic';
import { bag, item, row, seqIds, tItem } from './fixtures';

const names: Record<string, string> = { p1: 'Sam', p2: 'Alex', p3: 'Mia' };
const ctx = (over: Partial<Parameters<typeof planFromTemplate>[2]> = {}) => ({
  len: { days: 8, nights: 7 },
  travelers: [],
  bags: [],
  personName: (id: string) => names[id] ?? null,
  ...over,
});

describe('planFromTemplate', () => {
  const shirts = item({
    id: 'shirt',
    name: 'T-shirt',
    qty_mode: 'per_day',
    qty: 1,
    max_qty: 5,
    default_people: ['p1', 'p2'],
  });
  const sunscreen = item({ id: 'sun', name: 'Sunscreen' });
  const carseat = item({
    id: 'seat',
    name: 'Car seat',
    not_in_suitcase: true,
    default_people: ['p3'],
  });
  const kindle = item({
    id: 'kindle',
    name: 'Kindle',
    usually_carry_on: true,
    default_people: ['p1'],
  });
  const items = new Map([shirts, sunscreen, carseat, kindle].map((i) => [i.id, i]));

  it('fans out one row per default person with per-person qty', () => {
    const rows = planFromTemplate([tItem({ id: 'a', item_id: 'shirt' })], items, ctx());
    expect(rows.map((r) => [r.person_id, r.qty, r.name])).toEqual([
      ['p1', 5, 'T-shirt'],
      ['p2', 5, 'T-shirt'],
    ]);
    expect(rows[0]).toMatchObject({
      calc_mode: 'per_day',
      calc_unit_qty: 1,
      calc_max: 5,
      qty_override: null,
    });
  });

  it('template assignees override the item defaults', () => {
    const rows = planFromTemplate(
      [tItem({ id: 'a', item_id: 'shirt', assignees: ['p3'] })],
      items,
      ctx(),
    );
    expect(rows.map((r) => r.person_id)).toEqual(['p3']);
  });

  it('restricts to travelers and skips items for people staying home', () => {
    const rows = planFromTemplate(
      [tItem({ id: 'a', item_id: 'shirt' }), tItem({ id: 'b', item_id: 'seat', sort_order: 1 })],
      items,
      ctx({ travelers: ['p1'] }),
    );
    expect(rows.map((r) => [r.item_id, r.person_id])).toEqual([['shirt', 'p1']]);
  });

  it('makes one shared row when nobody is assigned', () => {
    const rows = planFromTemplate(
      [tItem({ id: 'a', item_id: 'sun' })],
      items,
      ctx({ travelers: ['p1'] }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.person_id).toBeNull();
  });

  it('applies template overrides and notes', () => {
    const rows = planFromTemplate(
      [
        tItem({
          id: 'a',
          item_id: 'shirt',
          qty_mode_override: 'fixed',
          qty_override: 3,
          notes: 'linen',
          assignees: ['p1'],
        }),
      ],
      items,
      ctx(),
    );
    expect(rows[0]).toMatchObject({ qty: 3, calc_mode: 'fixed', notes: 'linen' });
  });

  it('marks not-in-suitcase items as no bag', () => {
    const rows = planFromTemplate([tItem({ id: 'a', item_id: 'seat' })], items, ctx());
    expect(rows[0]).toMatchObject({ no_bag: true, trip_bag_id: null });
  });

  it('places carry-on hints in the right carry-on bag', () => {
    const bags = [
      bag({ id: 'b1', label: 'Lisbon - Big checked' }),
      bag({ id: 'b2', label: 'Lisbon - Sam carry-on', carry_on: true }),
      bag({ id: 'b3', label: 'Lisbon - Alex backpack', carry_on: true }),
    ];
    const rows = planFromTemplate(
      [
        tItem({ id: 'a', item_id: 'kindle' }),
        tItem({ id: 'b', item_id: 'sun', carry_on: true, sort_order: 1 }),
      ],
      items,
      ctx({ bags }),
    );
    expect(rows.map((r) => r.trip_bag_id)).toEqual(['b2', null]);
  });

  it('uses the only carry-on bag when there is one', () => {
    const rows = planFromTemplate(
      [tItem({ id: 'b', item_id: 'sun', carry_on: true })],
      items,
      ctx({ bags: [bag({ id: 'b9', label: 'Backpack', carry_on: true })] }),
    );
    expect(rows[0]!.trip_bag_id).toBe('b9');
  });

  it('leaves per-day qty empty when the trip has no dates', () => {
    const rows = planFromTemplate(
      [tItem({ id: 'a', item_id: 'shirt', assignees: ['p1'] })],
      items,
      ctx({ len: null }),
    );
    expect(rows[0]!.qty).toBeNull();
  });

  it('skips template items whose catalog item is gone', () => {
    expect(planFromTemplate([tItem({ id: 'a', item_id: 'nope' })], items, ctx())).toEqual([]);
  });
});

describe('pickCarryBag / defaultBagCarryOn / labels', () => {
  it('matches the person name as a whole word', () => {
    const bags = [
      bag({ id: 'x', label: 'Samantha carry-on', carry_on: true }),
      bag({ id: 'y', label: 'Alex backpack', carry_on: true }),
    ];
    expect(pickCarryBag(bags, 'Sam')).toBeNull();
    expect(pickCarryBag(bags, 'alex')?.id).toBe('y');
  });
  it('defaults carry-on from suitcase type or role', () => {
    expect(defaultBagCarryOn('Carry-on', null)).toBe(true);
    expect(defaultBagCarryOn('Backpack', 'Checked')).toBe(true);
    expect(defaultBagCarryOn('Checked', 'Personal item')).toBe(true);
    expect(defaultBagCarryOn('Checked', 'Checked')).toBe(false);
    expect(defaultBagCarryOn(null, null)).toBe(false);
  });
  it('rewrites only a matching trip-name prefix', () => {
    expect(
      rewriteLabelPrefix('Mexico Dec 2026 - Big checked bag', 'Mexico Dec 2026', 'Lisbon'),
    ).toBe('Lisbon - Big checked bag');
    expect(rewriteLabelPrefix('Kids – suitcase', 'Mexico', 'Lisbon')).toBe('Kids – suitcase');
    expect(shortBagLabel('Lisbon - Big checked', 'lisbon')).toBe('Big checked');
    expect(shortBagLabel('Big checked', 'Lisbon')).toBe('Big checked');
  });
});

describe('planClone', () => {
  const bags = [
    bag({ id: 'b1', label: 'Mexico - Big', carry_on: false }),
    bag({ id: 'b2', label: 'Carry', carry_on: true, sort_order: 1 }),
  ];
  const rows = [
    row({
      id: 'r1',
      person_id: 'p1',
      trip_bag_id: 'b1',
      packed: true,
      packed_at: '2026-01-01T00:00:00Z',
      calc_mode: 'per_day',
      calc_unit_qty: 1,
      calc_max: null,
      qty: 8,
    }),
    row({
      id: 'r2',
      person_id: 'p2',
      trip_bag_id: 'b2',
      packed: true,
      qty: 3,
      qty_override: 2,
      sort_order: 1,
    }),
    row({ id: 'r3', person_id: null, no_bag: true, packed: false, sort_order: 2 }),
  ];
  const plan = planClone({
    sourceName: 'Mexico',
    newName: 'Lisbon',
    bags,
    items: rows,
    len: { days: 4, nights: 3 },
    newId: seqIds(),
  });

  it('copies bags with new ids and rewritten labels', () => {
    expect(plan.bags.map((b) => [b.id, b.source_id, b.label, b.carry_on])).toEqual([
      ['n1', 'b1', 'Lisbon - Big', false],
      ['n2', 'b2', 'Carry', true],
    ]);
  });
  it('maps rows to the new bags and keeps no-bag', () => {
    expect(plan.items.map((r) => [r.trip_bag_id, r.no_bag])).toEqual([
      ['n1', false],
      ['n2', false],
      [null, true],
    ]);
  });
  it('never carries over packed state', () => {
    for (const r of plan.items) {
      expect(r).not.toHaveProperty('packed');
      expect(r).not.toHaveProperty('packed_at');
    }
  });
  it('recomputes calculated qty for the new length and keeps overrides', () => {
    expect(plan.items.map((r) => [r.qty, r.qty_override])).toEqual([
      [4, null],
      [3, 2],
      [1, null],
    ]);
  });
  it('drops rows for people not traveling, keeps shared rows', () => {
    const p = planClone({
      sourceName: 'Mexico',
      newName: 'Lisbon',
      bags,
      items: rows,
      len: null,
      travelers: ['p2'],
      newId: seqIds(),
    });
    expect(p.items.map((r) => r.person_id)).toEqual(['p2', null]);
  });
});

describe('planTemplateFromTrip', () => {
  const items = new Map([
    ['shirt', { id: 'shirt', qty_mode: 'per_day' as const, qty: 1 }],
    ['sun', { id: 'sun', qty_mode: 'fixed' as const, qty: 1 }],
  ]);
  const bags = new Map([
    ['carry', { carry_on: true }],
    ['big', { carry_on: false }],
  ]);
  const rows = [
    row({
      id: '1',
      item_id: 'shirt',
      person_id: 'p1',
      calc_mode: 'per_day',
      calc_unit_qty: 1,
      packed: true,
      trip_bag_id: 'big',
    }),
    row({
      id: '2',
      item_id: 'shirt',
      person_id: 'p2',
      calc_mode: 'per_day',
      calc_unit_qty: 1,
      packed: false,
      trip_bag_id: 'big',
      sort_order: 1,
    }),
    row({
      id: '3',
      item_id: 'sun',
      person_id: null,
      calc_mode: 'fixed',
      calc_unit_qty: 2,
      qty_override: 5,
      trip_bag_id: 'carry',
      sort_order: 2,
    }),
    row({ id: '4', item_id: null, name: 'Snacks ', person_id: 'p1', qty: 3, sort_order: 3 }),
    row({ id: '5', item_id: null, name: 'snacks', person_id: 'p2', qty: 3, sort_order: 4 }),
  ];
  const plan = planTemplateFromTrip({ rows, bags, items, newId: seqIds('new') });

  it('merges rows that differ only by person', () => {
    expect(plan.templateItems[0]).toMatchObject({
      item_id: 'shirt',
      assignees: ['p1', 'p2'],
      qty_mode_override: null,
      qty_override: null,
      carry_on: false,
    });
  });
  it('keeps unit overrides, takes carry-on from the bag, drops manual totals', () => {
    expect(plan.templateItems[1]).toMatchObject({
      item_id: 'sun',
      assignees: [],
      qty_override: 2,
      carry_on: true,
    });
  });
  it('adds ad-hoc rows to the catalog once', () => {
    expect(plan.newCatalogItems).toEqual([
      { id: 'new1', name: 'Snacks', qty: 3, not_in_suitcase: false },
    ]);
    expect(plan.templateItems[2]).toMatchObject({ item_id: 'new1', assignees: ['p1', 'p2'] });
  });
  it('has no packed state anywhere', () => {
    expect(JSON.stringify(plan)).not.toMatch(/packed/);
  });
});

describe('suggestItems', () => {
  const all = [
    item({ id: 'any' }),
    item({ id: 'hot', climate_tags: ['Hot'] }),
    item({ id: 'beach', activity_tags: ['Beach', 'Pool'] }),
    item({ id: 'ski', climate_tags: ['Cold'], activity_tags: ['Skiing'] }),
    item({ id: 'old', archived: true }),
  ];
  it('matches climate and activities, excluding items already on the trip', () => {
    const ids = suggestItems(all, 'hot', ['pool'], new Set(['any'])).map((i) => i.id);
    expect(ids).toEqual(['hot', 'beach']);
  });
  it('climate-tagged items need a trip climate', () => {
    expect(suggestItems(all, null, [], new Set()).map((i) => i.id)).toEqual(['any']);
  });
});
