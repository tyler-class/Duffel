import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { ORIGIN, PASSWORD, session } from './helpers';

const REDIRECT = 'https://client.example/callback';

async function pkce() {
  const verifier = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(
    /[+/=]/g,
    '',
  );
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return { verifier, challenge };
}

function cookies(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function connect(password = PASSWORD) {
  const reg = await SELF.fetch(`${ORIGIN}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Test Assistant',
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: 'none',
    }),
  });
  expect(reg.status).toBe(201);
  const client = (await reg.json()) as { client_id: string };
  const { verifier, challenge } = await pkce();
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'xyz',
    scope: 'packing',
    resource: `${ORIGIN}/mcp`,
  });
  const page = await SELF.fetch(`${ORIGIN}/authorize?${q}`);
  expect(page.status).toBe(200);
  const html = await page.text();
  expect(html).toContain('Let Test Assistant use Duffel?');
  expect(html).toContain('client.example');
  const handle = /name="handle" value="([^"]+)"/.exec(html)![1]!;
  const form = (pw: string) =>
    new URLSearchParams({
      handle,
      decision: 'approve',
      password: pw,
      client_name: 'Test Assistant',
      redirect_host: 'client.example',
    });
  const post = (pw: string) =>
    SELF.fetch(`${ORIGIN}/authorize`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookies(page),
        'CF-Connecting-IP': '198.18.0.9',
      },
      body: form(pw),
    });
  if (password !== PASSWORD) return { res: await post(password) };
  const wrong = await post('nope');
  expect(wrong.status).toBe(401);
  expect(await wrong.text()).toContain('That password is not right.');
  const ok = await post(PASSWORD);
  expect(ok.status).toBe(302);
  const loc = new URL(ok.headers.get('Location')!);
  expect(loc.origin + loc.pathname).toBe(REDIRECT);
  expect(loc.searchParams.get('state')).toBe('xyz');
  const tok = await SELF.fetch(`${ORIGIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: loc.searchParams.get('code')!,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      client_id: client.client_id,
      resource: `${ORIGIN}/mcp`,
    }),
  });
  expect(tok.status).toBe(200);
  return { token: ((await tok.json()) as { access_token: string }).access_token };
}

let rpcId = 0;
async function rpc(token: string, method: string, params: unknown = {}) {
  const res = await SELF.fetch(`${ORIGIN}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  const body = await res.text();
  const json = body.startsWith('{') ? body : (/^data: (.*)$/m.exec(body)?.[1] ?? body);
  return {
    status: res.status,
    data: JSON.parse(json) as {
      result?: { content?: { text: string }[]; tools?: { name: string }[]; isError?: boolean };
      error?: unknown;
    },
  };
}

describe('MCP', () => {
  it('advertises OAuth and rejects requests without a token', async () => {
    const res = await SELF.fetch(`${ORIGIN}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toMatch(/resource_metadata=/);
    const meta = (await (
      await SELF.fetch(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`)
    ).json()) as { resource: string; authorization_servers: string[] };
    expect(meta.resource).toBe(`${ORIGIN}/mcp`);
    expect(meta.authorization_servers).toEqual([ORIGIN]);
  });

  it('connects with the household password and runs tools', async () => {
    const api = await session();
    await api.post('/sample-data');
    const { token } = await connect();

    const init = await rpc(token!, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    expect(init.status).toBe(200);
    const tools = await rpc(token!, 'tools/list');
    expect(tools.data.result!.tools!.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'list_trips',
        'get_packing_list',
        'add_items',
        'update_item',
        'set_packed',
        'create_trip',
        'save_trip_as_template',
        'search_catalog',
      ]),
    );

    const trips = await rpc(token!, 'tools/call', { name: 'list_trips', arguments: {} });
    expect(trips.data.result!.content![0]!.text).toContain('Lisbon');

    const add = await rpc(token!, 'tools/call', {
      name: 'add_items',
      arguments: {
        trip: 'lisbon',
        items: [{ name: 'Beach towel', for: 'Mia', bag: 'Kids’ suitcase', qty: 2 }],
      },
    });
    expect(add.data.result!.isError).toBeFalsy();
    const list = JSON.parse(
      (await rpc(token!, 'tools/call', { name: 'get_packing_list', arguments: { trip: 'Lisbon' } }))
        .data.result!.content![0]!.text,
    ) as {
      items: { id: string; name: string; for: string; bag: string; qty: number; packed: boolean }[];
    };
    const towel = list.items.find((i) => i.name === 'Beach towel')!;
    expect(towel).toMatchObject({ for: 'Mia', bag: 'Kids’ suitcase', qty: 2, packed: false });

    const upd = await rpc(token!, 'tools/call', {
      name: 'update_item',
      arguments: { item_id: towel.id, packed: true, bag: 'no bag' },
    });
    expect(upd.data.result!.content![0]!.text).toContain('packed');

    const bad = await rpc(token!, 'tools/call', {
      name: 'add_items',
      arguments: { items: [{ name: 'X', for: 'Nobody named this' }] },
    });
    expect(bad.data.result!.isError).toBe(true);

    const created = await rpc(token!, 'tools/call', {
      name: 'create_trip',
      arguments: {
        name: 'Lisbon again',
        copy_trip: 'Lisbon',
        start_date: '2027-03-01',
        end_date: '2027-03-04',
      },
    });
    const trip = JSON.parse(created.data.result!.content![0]!.text) as {
      created: { items: { packed: boolean }[] };
    };
    expect(trip.created.items.length).toBeGreaterThan(10);
    expect(trip.created.items.every((i) => !i.packed)).toBe(true);

    // The app lists the connection and can revoke it.
    const conns = (await api.get<{ connections: { name: string }[] }>('/connections')).data;
    expect(conns.connections.map((c) => c.name)).toContain('Test Assistant');
    expect((await api.post('/connections/revoke-all')).status).toBe(200);
    expect((await rpc(token!, 'tools/list')).status).toBe(401);
  });

  it('does not issue a token for a wrong password', async () => {
    const { res } = await connect('wrong');
    expect(res!.status).toBe(401);
  });
});
