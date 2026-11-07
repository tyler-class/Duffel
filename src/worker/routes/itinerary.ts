// A trip's itinerary: sections in order, each with transport, lodging, plans and notes.
import { Hono } from 'hono';
import airportData from '@shared/airports.json';
import { endInstant, findAirport, type AirportData } from '@shared/logic';
import {
  entryInput,
  entryPatch,
  reorderSections,
  sectionInput,
  sectionPatch,
} from '@shared/schemas';
import type { EntryEnd } from '@shared/types';
import { endCols, first, insertStmt, newId, nowIso, toEntry, updateStmt } from '../db';
import { tripDetail } from './trips';
import { ApiError, body, defined, notFound, type AppEnv } from './util';

export const itinerary = new Hono<AppEnv>();

const AIRPORTS = airportData as AirportData;

type EndIn = Partial<EntryEnd> | undefined;

/** An airport code fills in the city and time zone when they're left out. */
function withAirport(e: EndIn): EndIn {
  if (!e?.code) return e;
  const a = findAirport(AIRPORTS, e.code);
  if (!a) return e;
  return { ...e, place: e.place ?? a.city, tz: e.tz ?? a.tz };
}

function checkOrder(start: EndIn, end: EndIn) {
  const a = start
    ? endInstant({ place: null, code: null, date: null, time: null, tz: null, ...start })
    : null;
  const b = end
    ? endInstant({ place: null, code: null, date: null, time: null, tz: null, ...end })
    : null;
  if (a !== null && b !== null && b < a)
    throw new ApiError(
      400,
      'invalid',
      'The end is before the start. Check the dates, times and time zones.',
    );
}

async function sectionTrip(db: D1Database, id: string): Promise<string> {
  const r = await first<{ trip_id: string }>(
    db,
    'SELECT trip_id FROM itinerary_sections WHERE id = ?',
    id,
  );
  if (!r) throw notFound('Section');
  return r.trip_id;
}

async function nextOrder(db: D1Database, sql: string, id: string) {
  const r = await first<{ m: number | null }>(db, sql, id);
  return (r?.m ?? -1) + 1;
}

// ---------- sections ----------
itinerary.post('/trips/:id/itinerary', async (c) => {
  const tripId = c.req.param('id');
  const db = c.env.DB;
  if (!(await first(db, 'SELECT id FROM trips WHERE id = ?', tripId))) throw notFound('Trip');
  const input = await body(c, sectionInput);
  const now = nowIso();
  await insertStmt(db, 'itinerary_sections', {
    id: newId(),
    trip_id: tripId,
    kind: input.kind,
    title: input.title,
    notes: input.notes ?? null,
    sort_order:
      input.sort_order ??
      (await nextOrder(
        db,
        'SELECT MAX(sort_order) AS m FROM itinerary_sections WHERE trip_id = ?',
        tripId,
      )),
    created_at: now,
    updated_at: now,
  }).run();
  return c.json(await tripDetail(db, tripId), 201);
});

itinerary.post('/trips/:id/itinerary/order', async (c) => {
  const tripId = c.req.param('id');
  const db = c.env.DB;
  const { ids } = await body(c, reorderSections);
  await db.batch(
    ids.map((id, i) =>
      db
        .prepare(
          'UPDATE itinerary_sections SET sort_order = ?, updated_at = ? WHERE id = ? AND trip_id = ?',
        )
        .bind(i, nowIso(), id, tripId),
    ),
  );
  return c.json(await tripDetail(db, tripId));
});

itinerary.patch('/itinerary-sections/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const tripId = await sectionTrip(db, id);
  const input = await body(c, sectionPatch);
  const f = defined({
    kind: input.kind,
    title: input.title,
    notes: input.notes,
    sort_order: input.sort_order,
  });
  if (Object.keys(f).length) await updateStmt(db, 'itinerary_sections', id, f).run();
  return c.json(await tripDetail(db, tripId));
});

itinerary.delete('/itinerary-sections/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const tripId = await sectionTrip(db, id);
  await db.batch([
    db.prepare('DELETE FROM itinerary_entries WHERE section_id = ?').bind(id),
    db.prepare('DELETE FROM itinerary_sections WHERE id = ?').bind(id),
  ]);
  return c.json(await tripDetail(db, tripId));
});

// ---------- entries ----------
itinerary.post('/itinerary-sections/:id/entries', async (c) => {
  const sectionId = c.req.param('id');
  const db = c.env.DB;
  const tripId = await sectionTrip(db, sectionId);
  const input = await body(c, entryInput);
  const start = withAirport(input.start);
  const end = withAirport(input.end);
  checkOrder(start, end);
  const now = nowIso();
  await insertStmt(db, 'itinerary_entries', {
    id: newId(),
    section_id: sectionId,
    kind: input.kind,
    mode: input.kind === 'transport' ? (input.mode ?? 'plane') : null,
    title: input.title ?? null,
    carrier: input.carrier ?? null,
    number: input.number ?? null,
    ...endCols('start', start),
    ...endCols('end', end),
    address: input.address ?? null,
    confirmation: input.confirmation ?? null,
    details: input.details ?? null,
    notes: input.notes ?? null,
    sort_order:
      input.sort_order ??
      (await nextOrder(
        db,
        'SELECT MAX(sort_order) AS m FROM itinerary_entries WHERE section_id = ?',
        sectionId,
      )),
    created_at: now,
    updated_at: now,
  }).run();
  return c.json(await tripDetail(db, tripId), 201);
});

itinerary.patch('/itinerary-entries/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const row = await first(db, 'SELECT * FROM itinerary_entries WHERE id = ?', id);
  if (!row) throw notFound('Entry');
  const old = toEntry(row);
  const tripId = await sectionTrip(db, old.section_id);
  const input = await body(c, entryPatch);
  if (input.section_id && input.section_id !== old.section_id) {
    if ((await sectionTrip(db, input.section_id)) !== tripId)
      throw new ApiError(400, 'invalid', 'That section is on another trip.');
  }
  const start = withAirport(input.start);
  const end = withAirport(input.end);
  checkOrder({ ...old.start, ...start }, { ...old.end, ...end });
  const f: Record<string, unknown> = defined({
    section_id: input.section_id,
    kind: input.kind,
    mode: input.mode,
    title: input.title,
    carrier: input.carrier,
    number: input.number,
    address: input.address,
    confirmation: input.confirmation,
    details: input.details,
    notes: input.notes,
    sort_order: input.sort_order,
  });
  Object.assign(f, endCols('start', start), endCols('end', end));
  if (input.kind && input.kind !== 'transport') f.mode = null;
  if (input.kind === 'transport' && !old.mode && !input.mode) f.mode = 'plane';
  if (Object.keys(f).length) await updateStmt(db, 'itinerary_entries', id, f).run();
  return c.json(await tripDetail(db, tripId));
});

itinerary.delete('/itinerary-entries/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const row = await first<{ section_id: string }>(
    db,
    'SELECT section_id FROM itinerary_entries WHERE id = ?',
    id,
  );
  if (!row) return c.json({ ok: true });
  const tripId = await sectionTrip(db, row.section_id);
  await db.prepare('DELETE FROM itinerary_entries WHERE id = ?').bind(id).run();
  return c.json(await tripDetail(db, tripId));
});
