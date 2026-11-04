import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';

it('reports healthy', async () => {
  const res = await SELF.fetch('https://duffel.test/api/health');
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
