// Print links: the installed iPhone app can't print, so its Print button opens a short-lived
// link in Safari, which can. The link shows one trip's itinerary, read-only, without signing in,
// for 30 minutes. It's signed with the household password and this instance's salt, so changing
// the password ends every link early.
import { Hono } from 'hono';
import type { TripDetail } from '@shared/types';
import { getSalt } from '../auth';
import { loadItinerary } from '../db';
import { getTrip } from './trips';
import { ApiError, type AppEnv } from './util';

export const print = new Hono<AppEnv>();

const LIFETIME_S = 30 * 60;

async function sign(env: Cloudflare.Env, msg: string): Promise<string> {
  const salt = await getSalt(env.DB);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`duffel-print:${salt}:${env.APP_PASSWORD}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A print link for one trip (signed in). */
print.post('/trips/:id/print-link', async (c) => {
  const id = c.req.param('id');
  await getTrip(c.env.DB, id);
  const exp = Math.floor(Date.now() / 1000) + LIFETIME_S;
  const token = `${id}.${exp}.${await sign(c.env, `print:${id}:${exp}`)}`;
  return c.json({ url: `/print/${token}`, expires_in: LIFETIME_S });
});

/** The trip and its itinerary, from a valid print link (no sign-in). */
print.get('/print/:token', async (c) => {
  const m = /^([\w-]+)\.(\d+)\.([0-9a-f]{64})$/.exec(c.req.param('token'));
  const gone = new ApiError(404, 'expired', 'This print link has expired.');
  if (!m) throw gone;
  const [, id, exp, sig] = m;
  if (Number(exp) * 1000 < Date.now()) throw gone;
  const want = await sign(c.env, `print:${id}:${exp}`);
  const [a, b] = await Promise.all(
    [want, sig!].map((s) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))),
  );
  if (!crypto.subtle.timingSafeEqual(a!, b!)) throw gone;
  const [trip, itinerary] = await Promise.all([
    getTrip(c.env.DB, id!),
    loadItinerary(c.env.DB, id!),
  ]);
  c.header('Cache-Control', 'no-store');
  return c.json<Pick<TripDetail, 'trip' | 'itinerary'>>({ trip, itinerary });
});
