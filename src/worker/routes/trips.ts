import { Hono } from 'hono';
import {
  saveAsTemplate,
  tripBagInput,
  tripBagPatch,
  tripCreate,
  tripItemInput,
  tripItemPatch,
  tripItemsAdd,
  tripPatch,
} from '@shared/schemas';
import {
  calcQty,
  defaultBagCarryOn,
  displayQty,
  planClone,
  planFromTemplate,
  planRows,
  planTemplateFromTrip,
  recalcRows,
  resolveCalc,
  suggestItems,
  tripLength,
  type LengthLike,
  type TripItemDraft,
} from '@shared/logic';
import type { Item, Trip, TripBag, TripDetail } from '@shared/types';
import {
  b,
  existingIds,
  first,
  insertStmt,
  json,
  loadItems,
  loadPeople,
  loadSuitcases,
  loadTemplates,
  loadTrip,
  loadTripBags,
  loadTripItems,
  newId,
  nowIso,
  updateStmt,
} from '../db';
import { ApiError, body, defined, notFound, type AppEnv } from './util';

export const trips = new Hono<AppEnv>();

async function getTrip(db: D1Database, id: string): Promise<Trip> {
  const t = await loadTrip(db, id);
  if (!t) throw notFound('Trip');
  return t;
}

export async function tripDetail(db: D1Database, id: string): Promise<TripDetail> {
  const [trip, bags, items] = await Promise.all([
    getTrip(db, id),
    loadTripBags(db, id),
    loadTripItems(db, id),
  ]);
  return { trip, bags, items };
}

const lenOf = (t: { days: number | null; nights: number | null }): LengthLike | null =>
  t.days === null && t.nights === null ? null : { days: t.days, nights: t.nights };

function tripItemStmt(
  db: D1Database,
  tripId: string,
  d: TripItemDraft,
  sortOrder: number,
  now: string,
) {
  return insertStmt(db, 'trip_items', {
    id: newId(),
    trip_id: tripId,
    item_id: d.item_id,
    name: d.name,
    person_id: d.person_id,
    trip_bag_id: d.trip_bag_id,
    no_bag: b(d.no_bag),
    calc_mode: d.calc_mode,
    calc_unit_qty: d.calc_unit_qty,
    calc_max: d.calc_max,
    qty: d.qty,
    qty_override: d.qty_override,
    packed: 0,
    packed_at: null,
    notes: d.notes,
    sort_order: sortOrder,
    created_at: now,
    updated_at: now,
  });
}

async function nextSortOrder(db: D1Database, tripId: string): Promise<number> {
  const r = await first<{ m: number | null }>(
    db,
    'SELECT MAX(sort_order) AS m FROM trip_items WHERE trip_id = ?',
    tripId,
  );
  return (r?.m ?? -1) + 1;
}

async function personNames(db: D1Database) {
  const people = await loadPeople(db);
  const m = new Map(people.map((p) => [p.id, p.name]));
  return (id: string) => m.get(id) ?? null;
}

// ---------- trips ----------
trips.get('/trips/:id', async (c) => c.json(await tripDetail(c.env.DB, c.req.param('id'))));

trips.post('/trips', async (c) => {
  const input = await body(c, tripCreate);
  const db = c.env.DB;
  const id = newId();
  const now = nowIso();
  const fromDates = tripLength(input.start_date, input.end_date);
  const days = input.days ?? fromDates?.days ?? null;
  const nights = input.nights ?? fromDates?.nights ?? null;
  const len = lenOf({ days, nights });
  const travelers = [...(await existingIds(db, 'people', input.travelers))];

  let templateId: string | null = null;
  let clonedFrom: string | null = null;
  let climate = input.climate ?? null;
  let activities = input.activities;
  let tripType = input.trip_type ?? null;
  const stmts: D1PreparedStatement[] = [];
  const bagRows: Pick<TripBag, 'id' | 'label' | 'carry_on'>[] = [];
  let drafts: (TripItemDraft & { sort_order?: number })[] = [];

  const tripStmt = () =>
    insertStmt(db, 'trips', {
      id,
      name: input.name,
      template_id: templateId,
      cloned_from_trip_id: clonedFrom,
      trip_type: tripType,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      days,
      nights,
      destination: input.destination ?? null,
      climate,
      activities: json(activities),
      status: input.status ?? null,
      notes: input.notes ?? null,
      archived_at: input.archived ? now : null,
      created_at: now,
      updated_at: now,
    });

  if (input.source.kind === 'clone') {
    const src = await getTrip(db, input.source.trip_id);
    clonedFrom = src.id;
    templateId = src.template_id;
    climate ??= src.climate;
    if (!activities.length) activities = src.activities;
    tripType ??= src.trip_type;
    const [srcBags, srcItems] = await Promise.all([
      loadTripBags(db, src.id),
      loadTripItems(db, src.id),
    ]);
    const plan = planClone({
      sourceName: src.name,
      newName: input.name,
      bags: srcBags,
      items: srcItems,
      len,
      travelers: travelers.length ? travelers : undefined,
      newId,
    });
    for (const bg of plan.bags) {
      stmts.push(
        insertStmt(db, 'trip_bags', {
          id: bg.id,
          trip_id: id,
          suitcase_id: bg.suitcase_id,
          label: bg.label,
          role: bg.role,
          carry_on: b(bg.carry_on),
          notes: bg.notes,
          sort_order: bg.sort_order,
          created_at: now,
          updated_at: now,
        }),
      );
    }
    drafts = plan.items;
    // Travelers default to the source trip's when none were chosen.
    if (!travelers.length) travelers.push(...src.travelers);
  }

  // Bags passed in the request (template and blank trips, or extra bags on a clone).
  const suitcases = new Map((await loadSuitcases(db)).map((s) => [s.id, s]));
  input.bags.forEach((bg, i) => {
    const suitcase = bg.suitcase_id ? suitcases.get(bg.suitcase_id) : undefined;
    const bagId = newId();
    const carry = bg.carry_on ?? defaultBagCarryOn(suitcase?.type, bg.role);
    bagRows.push({ id: bagId, label: bg.label, carry_on: carry });
    stmts.push(
      insertStmt(db, 'trip_bags', {
        id: bagId,
        trip_id: id,
        suitcase_id: suitcase ? suitcase.id : null,
        label: bg.label,
        role: bg.role ?? null,
        carry_on: b(carry),
        notes: bg.notes ?? null,
        sort_order: bg.sort_order ?? 100 + i,
        created_at: now,
        updated_at: now,
      }),
    );
  });

  if (input.source.kind === 'template') {
    const tpl = (await loadTemplates(db, input.source.template_id))[0];
    if (!tpl) throw notFound('Template');
    templateId = tpl.id;
    climate ??= tpl.climate;
    if (!activities.length) activities = tpl.activities;
    tripType ??= tpl.trip_type;
    const items = new Map((await loadItems(db)).map((i) => [i.id, i]));
    drafts = planFromTemplate(tpl.items, items, {
      len,
      travelers,
      bags: bagRows,
      personName: await personNames(db),
    });
  }

  const all = [
    tripStmt(),
    ...travelers.map((p) =>
      db.prepare('INSERT INTO trip_travelers (trip_id, person_id) VALUES (?, ?)').bind(id, p),
    ),
    ...stmts,
    ...drafts.map((d, i) => tripItemStmt(db, id, d, d.sort_order ?? i, now)),
  ];
  await db.batch(all);
  return c.json(await tripDetail(db, id), 201);
});

trips.patch('/trips/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const old = await getTrip(db, id);
  const input = await body(c, tripPatch);
  const f: Record<string, unknown> = defined({
    name: input.name,
    trip_type: input.trip_type,
    start_date: input.start_date,
    end_date: input.end_date,
    days: input.days,
    nights: input.nights,
    destination: input.destination,
    climate: input.climate,
    status: input.status,
    notes: input.notes,
  });
  if (input.activities !== undefined) f.activities = json(input.activities);
  if (input.archived !== undefined)
    f.archived_at = input.archived ? (old.archived_at ?? nowIso()) : null;

  // New dates recompute the length unless days/nights were set in the same request.
  const datesChanged = input.start_date !== undefined || input.end_date !== undefined;
  if (datesChanged && input.days === undefined && input.nights === undefined) {
    const len = tripLength(
      input.start_date !== undefined ? input.start_date : old.start_date,
      input.end_date !== undefined ? input.end_date : old.end_date,
    );
    if (len) {
      f.days = len.days;
      f.nights = len.nights;
    }
  }
  const newLen = {
    days: (f.days !== undefined ? f.days : old.days) as number | null,
    nights: (f.nights !== undefined ? f.nights : old.nights) as number | null,
  };
  const stmts: D1PreparedStatement[] = [];
  if (Object.keys(f).length) stmts.push(updateStmt(db, 'trips', id, f));
  if (newLen.days !== old.days || newLen.nights !== old.nights) {
    const now = nowIso();
    for (const r of recalcRows(await loadTripItems(db, id), lenOf(newLen))) {
      stmts.push(
        db
          .prepare('UPDATE trip_items SET qty = ?, updated_at = ? WHERE id = ?')
          .bind(r.qty, now, r.id),
      );
    }
  }
  if (input.travelers) {
    const valid = await existingIds(db, 'people', input.travelers);
    stmts.push(db.prepare('DELETE FROM trip_travelers WHERE trip_id = ?').bind(id));
    for (const p of valid)
      stmts.push(
        db.prepare('INSERT INTO trip_travelers (trip_id, person_id) VALUES (?, ?)').bind(id, p),
      );
  }
  if (stmts.length) await db.batch(stmts);
  return c.json(await tripDetail(db, id));
});

trips.delete('/trips/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM trips WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

trips.post('/trips/:id/reset-packed', async (c) => {
  const id = c.req.param('id');
  await getTrip(c.env.DB, id);
  await c.env.DB.prepare(
    'UPDATE trip_items SET packed = 0, packed_at = NULL, updated_at = ? WHERE trip_id = ? AND packed = 1',
  )
    .bind(nowIso(), id)
    .run();
  return c.json(await tripDetail(c.env.DB, id));
});

trips.get('/trips/:id/suggestions', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const [trip, rows, items] = await Promise.all([
    getTrip(db, id),
    loadTripItems(db, id),
    loadItems(db),
  ]);
  const onTrip = new Set(rows.map((r) => r.item_id).filter((x): x is string => !!x));
  return c.json(suggestItems(items, trip.climate, trip.activities, onTrip));
});

/** Adds catalog items to a trip (from suggestions or the catalog picker). */
trips.post('/trips/:id/items/from-catalog', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const input = await body(c, tripItemsAdd);
  const [trip, bags, items] = await Promise.all([
    getTrip(db, id),
    loadTripBags(db, id),
    loadItems(db),
  ]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const person = input.person_id
    ? (await existingIds(db, 'people', [input.person_id])).has(input.person_id)
    : false;
  const entries = [...new Set(input.item_ids)]
    .map((i) => byId.get(i))
    .filter((i): i is Item => !!i)
    .map((item) => ({
      item,
      assignees: person ? [input.person_id!] : [],
      carryHint: item.usually_carry_on,
      notes: null,
    }));
  const drafts = planRows(entries, {
    len: lenOf(trip),
    travelers: trip.travelers,
    bags,
    personName: await personNames(db),
  });
  const start = await nextSortOrder(db, id);
  const now = nowIso();
  if (drafts.length) await db.batch(drafts.map((d, i) => tripItemStmt(db, id, d, start + i, now)));
  return c.json(await tripDetail(db, id), 201);
});

trips.post('/trips/:id/save-as-template', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const { name } = await body(c, saveAsTemplate);
  const [trip, bags, rows, items] = await Promise.all([
    getTrip(db, id),
    loadTripBags(db, id),
    loadTripItems(db, id),
    loadItems(db),
  ]);
  const plan = planTemplateFromTrip({
    rows,
    bags: new Map(bags.map((bg) => [bg.id, bg])),
    items: new Map(items.map((i) => [i.id, i])),
    newId,
  });
  const templateId = newId();
  const now = nowIso();
  const stmts: D1PreparedStatement[] = [
    insertStmt(db, 'templates', {
      id: templateId,
      name,
      trip_type: trip.trip_type,
      climate: trip.climate,
      activities: json(trip.activities),
      notes: null,
      created_at: now,
      updated_at: now,
    }),
  ];
  for (const ni of plan.newCatalogItems) {
    stmts.push(
      insertStmt(db, 'items', {
        id: ni.id,
        name: ni.name,
        qty_mode: 'fixed',
        qty: ni.qty,
        not_in_suitcase: b(ni.not_in_suitcase),
        created_at: now,
        updated_at: now,
      }),
    );
  }
  for (const ti of plan.templateItems) {
    const tiId = newId();
    stmts.push(
      insertStmt(db, 'template_items', {
        id: tiId,
        template_id: templateId,
        item_id: ti.item_id,
        qty_mode_override: ti.qty_mode_override,
        qty_override: ti.qty_override,
        carry_on: b(ti.carry_on),
        notes: ti.notes,
        sort_order: ti.sort_order,
        created_at: now,
        updated_at: now,
      }),
    );
    for (const p of ti.assignees) {
      stmts.push(
        db
          .prepare(
            'INSERT INTO template_item_assignees (template_item_id, person_id) VALUES (?, ?)',
          )
          .bind(tiId, p),
      );
    }
  }
  await db.batch(stmts);
  return c.json((await loadTemplates(db, templateId))[0], 201);
});

trips.get('/trips/:id/export.csv', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const [{ trip, bags, items }, people] = await Promise.all([tripDetail(db, id), loadPeople(db)]);
  const pName = new Map(people.map((p) => [p.id, p.name]));
  const bag = new Map(bags.map((bg) => [bg.id, bg]));
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [['Item', 'Person', 'Bag', 'Carry-on', 'Qty', 'Packed', 'Notes'].join(',')];
  for (const r of items) {
    const bg = r.trip_bag_id ? bag.get(r.trip_bag_id) : undefined;
    lines.push(
      [
        r.name,
        r.person_id ? (pName.get(r.person_id) ?? '') : 'Shared',
        bg ? bg.label : r.no_bag ? 'No bag' : '',
        bg?.carry_on ? 'yes' : '',
        displayQty(r) ?? '',
        r.packed ? 'yes' : '',
        r.notes ?? '',
      ]
        .map(esc)
        .join(','),
    );
  }
  const file = trip.name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'trip';
  return c.body(lines.join('\n') + '\n', 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${file}.csv"`,
  });
});

// ---------- trip bags ----------
trips.post('/trips/:id/bags', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  await getTrip(db, id);
  const input = await body(c, tripBagInput);
  const suitcase = input.suitcase_id
    ? (await loadSuitcases(db)).find((s) => s.id === input.suitcase_id)
    : undefined;
  const max = await first<{ m: number | null }>(
    db,
    'SELECT MAX(sort_order) AS m FROM trip_bags WHERE trip_id = ?',
    id,
  );
  const now = nowIso();
  await insertStmt(db, 'trip_bags', {
    id: newId(),
    trip_id: id,
    suitcase_id: suitcase?.id ?? null,
    label: input.label,
    role: input.role ?? null,
    carry_on: b(input.carry_on ?? defaultBagCarryOn(suitcase?.type, input.role)),
    notes: input.notes ?? null,
    sort_order: input.sort_order ?? (max?.m ?? -1) + 1,
    created_at: now,
    updated_at: now,
  }).run();
  return c.json(await tripDetail(db, id), 201);
});

trips.patch('/trip-bags/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const row = await first<{ trip_id: string }>(
    db,
    'SELECT trip_id FROM trip_bags WHERE id = ?',
    id,
  );
  if (!row) throw notFound('Bag');
  const input = await body(c, tripBagPatch);
  const f: Record<string, unknown> = defined({
    label: input.label,
    role: input.role,
    notes: input.notes,
    sort_order: input.sort_order,
  });
  if (input.suitcase_id !== undefined) {
    f.suitcase_id =
      input.suitcase_id && (await existingIds(db, 'suitcases', [input.suitcase_id])).size
        ? input.suitcase_id
        : null;
  }
  if (input.carry_on !== undefined) f.carry_on = b(input.carry_on);
  if (Object.keys(f).length) await updateStmt(db, 'trip_bags', id, f).run();
  return c.json(await tripDetail(db, row.trip_id));
});

trips.delete('/trip-bags/:id', async (c) => {
  const id = c.req.param('id');
  const row = await first<{ trip_id: string }>(
    c.env.DB,
    'SELECT trip_id FROM trip_bags WHERE id = ?',
    id,
  );
  if (!row) return c.json({ ok: true });
  await c.env.DB.prepare('DELETE FROM trip_bags WHERE id = ?').bind(id).run();
  return c.json(await tripDetail(c.env.DB, row.trip_id));
});

// ---------- trip items ----------
async function checkPlacement(
  db: D1Database,
  tripId: string,
  input: { person_id?: string | null; trip_bag_id?: string | null },
) {
  if (input.trip_bag_id) {
    const bg = await first(
      db,
      'SELECT id FROM trip_bags WHERE id = ? AND trip_id = ?',
      input.trip_bag_id,
      tripId,
    );
    if (!bg) throw new ApiError(400, 'invalid', 'That bag is not on this trip.');
  }
  if (input.person_id) {
    if (!(await existingIds(db, 'people', [input.person_id])).size)
      throw new ApiError(400, 'invalid', 'That person does not exist.');
  }
}

trips.post('/trips/:id/items', async (c) => {
  const tripId = c.req.param('id');
  const db = c.env.DB;
  const trip = await getTrip(db, tripId);
  const input = await body(c, tripItemInput);
  await checkPlacement(db, tripId, input);
  const item = input.item_id
    ? (await loadItems(db)).find((i) => i.id === input.item_id)
    : undefined;
  const calc = item ? resolveCalc(item) : null;
  const now = nowIso();
  const id = input.id ?? newId();
  const bagId = input.no_bag ? null : (input.trip_bag_id ?? null);
  await insertStmt(db, 'trip_items', {
    id,
    trip_id: tripId,
    item_id: item?.id ?? null,
    name: input.name,
    person_id: input.person_id ?? null,
    trip_bag_id: bagId,
    no_bag: b(input.no_bag),
    calc_mode: calc?.mode ?? null,
    calc_unit_qty: calc?.unitQty ?? null,
    calc_max: calc?.max ?? null,
    qty: calc ? calcQty(calc, lenOf(trip)) : (input.qty ?? 1),
    qty_override: input.qty_override ?? null,
    packed: b(input.packed),
    packed_at: input.packed ? now : null,
    notes: input.notes ?? null,
    sort_order: input.sort_order ?? (await nextSortOrder(db, tripId)),
    created_at: now,
    updated_at: now,
  }).run();
  return c.json(
    (await loadTripItems(db, tripId)).find((r) => r.id === id),
    201,
  );
});

trips.patch('/trip-items/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const row = await first<{ trip_id: string; packed: number }>(
    db,
    'SELECT trip_id, packed FROM trip_items WHERE id = ?',
    id,
  );
  if (!row) throw notFound('Item');
  const input = await body(c, tripItemPatch);
  await checkPlacement(db, row.trip_id, input);
  const f: Record<string, unknown> = defined({
    name: input.name,
    person_id: input.person_id,
    trip_bag_id: input.trip_bag_id,
    qty: input.qty,
    qty_override: input.qty_override,
    notes: input.notes,
    sort_order: input.sort_order,
  });
  if (input.no_bag !== undefined) {
    f.no_bag = b(input.no_bag);
    if (input.no_bag) f.trip_bag_id = null;
  } else if (input.trip_bag_id) {
    f.no_bag = 0;
  }
  if (input.packed !== undefined) {
    f.packed = b(input.packed);
    if (input.packed !== (row.packed === 1)) f.packed_at = input.packed ? nowIso() : null;
  }
  if (Object.keys(f).length) await updateStmt(db, 'trip_items', id, f).run();
  return c.json((await loadTripItems(db, row.trip_id)).find((r) => r.id === id));
});

trips.delete('/trip-items/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM trip_items WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});
