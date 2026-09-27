import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../index.js';

test('current traded-pick ownership preserves identities and avoids KV', async t => {
  const original = { season: '2027', round: 1, roster_id: 1, previous_owner_id: 2, owner_id: 3 };
  let picks: unknown = [original, { ...original, season: '2028', owner_id: 1 }];
  let fail = false;
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: unknown) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.sleeper.app');
    requests.push(url.pathname);
    if (url.pathname === '/v1/league/123/traded_picks') return fail ? new Response('Unavailable', { status: 503 }) : Response.json(picks);
    if (url.pathname === '/v1/league/123/users') return Response.json([{ user_id: 'a', display_name: 'Manager A' }]);
    if (url.pathname === '/v1/league/123/rosters') return Response.json([{ roster_id: 1, owner_id: 'a' }, { roster_id: 3, owner_id: null }]);
    throw new Error(`Unexpected network request: ${url.pathname}`);
  });
  const noKV = new Proxy({}, { get() { throw new Error('Unexpected KV access'); } });
  const call = () => worker.fetch(new Request('https://worker.invalid/league/123/traded_picks/enriched'), noKV);
  let response = await call();
  assert.equal(response.status, 200);
  let data = await response.json();
  assert.equal(data.schema_version, '1');
  assert.equal(data.league_id, '123');
  assert.equal(data.scope, 'traded_picks_only');
  assert.equal(data.inventory_complete, false);
  assert.equal(data.count, 2);
  assert.ok(Number.isFinite(Date.parse(data.as_of)));
  assert.equal(data.picks[0].roster_id, 1);
  assert.equal(data.picks[0].previous_owner_id, 2);
  assert.equal(data.picks[0].owner_id, 3);
  assert.equal(data.picks[0].original_owner_team.manager, 'Manager A');
  assert.equal(data.picks[0].current_owner_team.manager, null);
  assert.equal(data.picks[0].current_owner_team.team_name, 'Roster 3');
  assert.equal(data.picks[1].owner_id, 1);
  assert.equal('slot' in data.picks[0], false);
  assert.equal('value' in data.picks[0], false);
  assert.deepEqual(new Set(requests), new Set(['/v1/league/123/traded_picks', '/v1/league/123/users', '/v1/league/123/rosters']));

  for (const invalid of [[original, original], [original, { ...original, owner_id: 1 }], [{ ...original, round: 0 }], [{ ...original, owner_id: -1 }], [{ ...original, season: 2027 }], [null], {}]) {
    picks = invalid;
    response = await call();
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, 'Proxy error');
  }
  picks = [];
  data = await (await call()).json();
  assert.equal(data.count, 0);
  assert.equal(data.inventory_complete, false);
  assert.ok(data.warnings.length);
  fail = true;
  assert.equal((await call()).status, 500);
});

test('new route matches only valid GET requests and preflight never fetches data', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('No upstream request expected'); });
  for (const [path, method, status] of [
    ['/league/not-a-number/traded_picks/enriched', 'GET', 404],
    ['/league/123/traded_picks/enriched/extra', 'GET', 404],
    ['/league/123/traded_picks/enriched', 'POST', 404],
    ['/league/123/traded_picks/enriched', 'OPTIONS', 200],
  ] as const) {
    const response = await worker.fetch(new Request(`https://worker.invalid${path}`, { method }), {});
    assert.equal(response.status, status);
  }
});
