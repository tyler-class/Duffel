import { describe, expect, it } from 'vitest';
import airportData from '../../src/shared/airports.json';
import {
  dayShift,
  findAirport,
  formatMinutes,
  nextEntry,
  searchAirports,
  zonedInstant,
  type AirportData,
} from '../../src/shared/logic';
import type { ItineraryEntry } from '../../src/shared/types';

const AIR = airportData as AirportData;
const end = (date: string | null, time: string | null, tz: string | null = null) => ({
  place: null,
  code: null,
  date,
  time,
  tz,
});
const entry = (p: Partial<ItineraryEntry>): ItineraryEntry => ({
  id: 'e',
  section_id: 's',
  kind: 'plan',
  mode: null,
  title: null,
  carrier: null,
  number: null,
  start: end(null, null),
  end: end(null, null),
  address: null,
  confirmation: null,
  details: null,
  notes: null,
  sort_order: 0,
  ...p,
});

describe('zonedInstant', () => {
  it('handles zones and DST', () => {
    expect(new Date(zonedInstant('2027-01-15', '09:00', 'America/New_York')!).toISOString()).toBe(
      '2027-01-15T14:00:00.000Z',
    );
    expect(new Date(zonedInstant('2027-07-15', '09:00', 'America/New_York')!).toISOString()).toBe(
      '2027-07-15T13:00:00.000Z',
    );
    // The morning US clocks spring forward (2027-03-14): 01:30 EST, 03:30 EDT.
    expect(new Date(zonedInstant('2027-03-14', '01:30', 'America/New_York')!).toISOString()).toBe(
      '2027-03-14T06:30:00.000Z',
    );
    expect(new Date(zonedInstant('2027-03-14', '03:30', 'America/New_York')!).toISOString()).toBe(
      '2027-03-14T07:30:00.000Z',
    );
    expect(new Date(zonedInstant('2027-06-01', '23:30', 'Asia/Kolkata')!).toISOString()).toBe(
      '2027-06-01T18:00:00.000Z',
    );
    expect(zonedInstant('2027-06-01', '23:30', null)).toBe(Date.UTC(2027, 5, 1, 23, 30));
    expect(zonedInstant('2027-02-30', '10:00', 'UTC')).toBeNull();
  });

  it('formats durations and day shifts', () => {
    expect(formatMinutes(55)).toBe('55m');
    expect(formatMinutes(385)).toBe('6h 25m');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(1440 + 180)).toBe('1d 3h');
    expect(
      dayShift(entry({ start: end('2027-06-02', '21:40'), end: end('2027-06-03', '09:05') })),
    ).toBe(1);
  });

  it('finds what is next', () => {
    const s = {
      id: 's',
      trip_id: 't',
      kind: 'stay' as const,
      title: 'x',
      notes: null,
      sort_order: 0,
      entries: [
        entry({
          id: 'a',
          start: end('2027-06-03', '10:00', 'UTC'),
          end: end('2027-06-03', '11:00', 'UTC'),
        }),
        entry({ id: 'b', start: end('2027-06-04', null) }),
      ],
    };
    expect(nextEntry([s], Date.UTC(2027, 5, 3, 10, 30))).toBe('a');
    expect(nextEntry([s], Date.UTC(2027, 5, 3, 12))).toBe('b');
    expect(nextEntry([s], Date.UTC(2027, 5, 5))).toBeNull();
  });
});

describe('airports', () => {
  it('looks up codes and searches', () => {
    expect(findAirport(AIR, 'lhr')).toMatchObject({ city: 'London', tz: 'Europe/London' });
    expect(findAirport(AIR, 'ZZZ')).toBeNull();
    expect(searchAirports(AIR, 'BOS')[0]!.code).toBe('BOS');
    expect(searchAirports(AIR, 'lisb').map((a) => a.code)).toContain('LIS');
    const gr = searchAirports(AIR, 'GR').map((a) => a.code);
    expect(gr.slice(0, 10)).toContain('GRR');
    expect(gr.every((c, i) => i === 0 || !c.startsWith('GR') || gr[i - 1]!.startsWith('GR'))).toBe(
      true,
    );
  });
});
