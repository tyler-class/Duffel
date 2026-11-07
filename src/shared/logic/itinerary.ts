// Itinerary times: local dates and times in each place's time zone, turned into real instants
// so flight lengths and layovers come out right across zones and DST changes.
import type { EntryEnd, ItineraryEntry, ItinerarySection } from '../types';
import { dayNumber } from './dates';

const MIN_MS = 60_000;

const offsetCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = offsetCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    offsetCache.set(tz, f);
  }
  return f;
}

/** Minutes the zone is ahead of UTC at an instant. */
export function zoneOffset(ms: number, tz: string): number {
  const p = Object.fromEntries(
    fmt(tz)
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!);
  return Math.round((asUtc - Math.floor(ms / MIN_MS) * MIN_MS) / MIN_MS);
}

export function isTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    fmt(tz);
    return true;
  } catch {
    return false;
  }
}

/** The instant a local date and time happens in a time zone (UTC when there's none). */
export function zonedInstant(date: string, time: string, tz: string | null): number | null {
  const day = dayNumber(date);
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (day === null || !m) return null;
  const local = day * 86_400_000 + (+m[1]! * 60 + +m[2]!) * MIN_MS;
  if (!isTimeZone(tz)) return local;
  // Guess with the offset at the local time, then correct once for a DST change in between.
  let t = local - zoneOffset(local, tz) * MIN_MS;
  t = local - zoneOffset(t, tz) * MIN_MS;
  return t;
}

/** When an end happens, if it has a date and a time. */
export const endInstant = (e: EntryEnd): number | null =>
  e.date && e.time ? zonedInstant(e.date, e.time, e.tz) : null;

/** Sort key: the real instant when there's a time, else noon on the date. Undated last. */
function sortKey(e: ItineraryEntry): number {
  const at = endInstant(e.start);
  if (at !== null) return at;
  const day = dayNumber(e.start.date);
  return day === null ? Infinity : day * 86_400_000 + 12 * 3_600_000;
}

/** A section's entries by when they start; undated ones last, in the order they were added. */
export function sortEntries<T extends ItineraryEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    const x = sortKey(a);
    const y = sortKey(b);
    if (x !== y) return x === Infinity ? 1 : y === Infinity ? -1 : x - y;
    return a.sort_order - b.sort_order;
  });
}

export const sortSections = <T extends ItinerarySection>(s: readonly T[]): T[] =>
  [...s].sort((a, b) => a.sort_order - b.sort_order);

/** Minutes from start to end, across time zones. Null without both dates and times. */
export function entryMinutes(e: ItineraryEntry): number | null {
  const a = endInstant(e.start);
  const b = endInstant(e.end);
  return a === null || b === null || b < a ? null : Math.round((b - a) / MIN_MS);
}

/** How many local calendar days later the end is: the "+1" on an overnight flight. */
export function dayShift(e: ItineraryEntry): number {
  const a = dayNumber(e.start.date);
  const b = dayNumber(e.end.date);
  return a === null || b === null ? 0 : b - a;
}

/** "6h 25m", "55m", "2d 3h". */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d) return `${d}d${h ? ` ${h}h` : ''}`;
  return `${h}h${m ? ` ${m}m` : ''}`;
}

export interface Connection {
  /** The entry the layover comes after. */
  after: string;
  minutes: number;
  /** Where you wait: the arrival's code or place. */
  at: string | null;
  /** Arrive at one airport or station and leave from another. */
  change: { from: string; to: string } | null;
}

/** Layovers between back-to-back transport entries in a section (a gap of up to a day). */
export function connections(sorted: readonly ItineraryEntry[]): Connection[] {
  const out: Connection[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const next = sorted[i]!;
    if (prev.kind !== 'transport' || next.kind !== 'transport') continue;
    const a = endInstant(prev.end);
    const b = endInstant(next.start);
    if (a === null || b === null || b < a || b - a > 24 * 60 * MIN_MS) continue;
    const from = prev.end.code ?? prev.end.place;
    const to = next.start.code ?? next.start.place;
    out.push({
      after: prev.id,
      minutes: Math.round((b - a) / MIN_MS),
      at: prev.end.place ?? prev.end.code,
      change: from && to && from.toLowerCase() !== to.toLowerCase() ? { from, to } : null,
    });
  }
  return out;
}

/** The first entry that hasn't finished yet: what's next on the trip. */
export function nextEntry(sections: readonly ItinerarySection[], now: number): string | null {
  for (const s of sortSections(sections))
    for (const e of sortEntries(s.entries)) {
      const end = endInstant(e.end) ?? endInstant(e.start);
      const day = dayNumber(e.end.date ?? e.start.date);
      if (end !== null ? end >= now : day !== null && (day + 1) * 86_400_000 > now) return e.id;
    }
  return null;
}

/** "TAP 204", or "Boston → Lisbon", or the entry's title. */
export function entryName(e: ItineraryEntry): string {
  if (e.kind === 'transport') {
    const num = [e.carrier, e.number].filter(Boolean).join(' ');
    if (e.title) return e.title;
    if (num) return num;
    const route = [e.start.code ?? e.start.place, e.end.code ?? e.end.place].filter(Boolean);
    return route.length ? route.join(' → ') : 'Transport';
  }
  return e.title ?? (e.kind === 'lodging' ? 'Lodging' : e.kind === 'note' ? 'Note' : 'Plan');
}
