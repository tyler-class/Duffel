import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { TripDetail } from '../../src/shared/types';
import { ORIGIN, session } from './helpers';

describe('print links', () => {
  it('show one trip’s itinerary without signing in, and nothing else', async () => {
    const api = await session();
    const t = (
      await api.post<TripDetail>('/trips', { name: 'Print me', source: { kind: 'blank' } })
    ).data;
    await api.post(`/trips/${t.trip.id}/itinerary`, { kind: 'stay', title: 'Porto' });
    const { url } = (await api.post<{ url: string }>(`/trips/${t.trip.id}/print-link`, {})).data;
    expect(url).toMatch(/^\/print\//);

    // No cookie: still works.
    const res = await SELF.fetch(`${ORIGIN}/api${url}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Pick<TripDetail, 'trip' | 'itinerary'>;
    expect(body.trip.name).toBe('Print me');
    expect(body.itinerary[0]!.title).toBe('Porto');
    expect(Object.keys(body).sort()).toEqual(['itinerary', 'trip']);

    // Tampered, garbled, or a link for another trip: refused.
    const token = url.slice('/print/'.length);
    const [id, exp, sig] = token.split('.');
    const flipped = sig!.slice(0, -1) + (sig!.endsWith('0') ? '1' : '0');
    for (const bad of [`${id}.${exp}.${flipped}`, `${id}.${Number(exp) + 999}.${sig}`, 'nonsense'])
      expect((await SELF.fetch(`${ORIGIN}/api/print/${bad}`)).status).toBe(404);

    // Making a link needs a session.
    const anon = await SELF.fetch(`${ORIGIN}/api/trips/${t.trip.id}/print-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: '{}',
    });
    expect(anon.status).toBe(401);
  });
});
