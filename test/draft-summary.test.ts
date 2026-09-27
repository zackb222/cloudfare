import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../index.js';

test('draft summary preserves distinct drafts and makes no remaining-pick claim', async t => {
  const first = { draft_id: '1', league_id: '123', season: '2026', status: 'complete', type: 'linear', settings: { rounds: 3 } };
  let drafts: unknown = [first, { ...first, draft_id: '2', type: 'auction', settings: { rounds: 1 } }];
  let fail = false;
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: unknown) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.sleeper.app');
    requests.push(url.pathname);
    if (fail) return new Response('offline', { status: 503 });
    if (url.pathname === '/v1/league/123') return Response.json({ league_id: '123', season: '2026' });
    if (url.pathname === '/v1/league/123/drafts') return Response.json(drafts);
    throw new Error(`Unexpected request ${url.pathname}`);
  });
  const noKV = new Proxy({}, { get() { throw new Error('Draft summary must not access KV'); } });
  const call = () => worker.fetch(new Request('https://worker.invalid/league/123/drafts/summary'), noKV);
  let response = await call();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.scope, 'draft_metadata_only');
  assert.equal(data.inventory_complete, false);
  assert.equal(data.count, 2);
  assert.deepEqual(data.drafts.map((draft: any) => draft.draft_id), ['1', '2']);
  assert.deepEqual(data.drafts.map((draft: any) => draft.rounds), [3, 1]);
  assert.equal('remaining' in data.drafts[0], false);
  assert.deepEqual(new Set(requests), new Set(['/v1/league/123', '/v1/league/123/drafts']));
  for (const bad of [[first, first], [{ ...first, settings: { rounds: 0 } }], [{ ...first, league_id: '456' }], { error: true }]) {
    drafts = bad;
    response = await call();
    assert.equal(response.status, 500);
  }
  drafts = [];
  response = await call();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).count, 0);
  fail = true;
  response = await call();
  assert.equal(response.status, 500);
});

