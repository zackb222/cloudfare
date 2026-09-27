import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../index.js';

test('Worker routes preserve league, roster, waiver, transaction and matchup behavior offline', async t => {
  const players = {
    p1: { player_id: 'p1', full_name: 'Fixture Quarterback', position: 'QB', fantasy_positions: ['QB'], active: true, status: 'Active', search_rank: 1 },
    p2: { player_id: 'p2', full_name: 'Fixture Receiver', position: 'WR', fantasy_positions: ['WR'], active: true, status: 'Active', search_rank: 2 },
    p3: { player_id: 'p3', full_name: 'Fixture Free Agent', position: 'RB', fantasy_positions: ['RB'], active: true, status: 'Active', search_rank: 3 },
  };
  const upstream = new Map<string, any>([
    ['/v1/league/123', { league_id: '123', name: 'Fixture League', season: '2026', status: 'pre_draft', total_rosters: 2, roster_positions: ['QB', 'WR', 'SUPER_FLEX', 'BN'], scoring_settings: {} }],
    ['/v1/league/123/users', [{ user_id: 'a', display_name: 'Manager A' }, { user_id: 'b', metadata: { team_name: 'Team B' } }]],
    ['/v1/league/123/rosters', [
      { roster_id: 1, owner_id: 'a', players: ['p1'], starters: ['p1', '0'], reserve: [], taxi: [], settings: { fpts: 20, fpts_decimal: 50, waiver_position: 1 } },
      { roster_id: 2, owner_id: 'b', players: ['p2'], starters: ['p2'], settings: {} },
    ]],
    ['/v1/league/123/matchups/1', [
      { roster_id: 1, matchup_id: 1, players: ['p1'], starters: ['p1'], points: 20, players_points: { p1: 20 } },
      { roster_id: 2, matchup_id: 1, players: ['p2'], starters: ['p2'], points: 10, players_points: { p2: 10 } },
    ]],
    ['/v1/league/123/transactions/1', [{ transaction_id: 'tx', type: 'trade', status: 'complete', roster_ids: [1, 2], draft_picks: [{ season: '2027', round: 1, roster_id: 1, previous_owner_id: 1, owner_id: 2 }] }]],
    ['/v1/players/nfl/trending/add', [{ player_id: 'p1', count: 5 }, { player_id: 'p3', count: 4 }]],
    ['/v1/players/nfl', players],
  ]);
  let fail = false;
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: any) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.sleeper.app');
    requests.push(url.pathname);
    if (fail) return new Response('offline', { status: 503 });
    assert.ok(upstream.has(url.pathname), `Unexpected route: ${url.pathname}`);
    return Response.json(upstream.get(url.pathname));
  });
  const cache = new Map<string, string>([['players_nfl_cached_at', String(Date.now())], ['players_nfl_compact', JSON.stringify(players)]]);
  let writes = 0;
  const env = { SLEEPER_CACHE: {
    async get(key: string, options?: any) { const value = cache.get(key) ?? null; return value && options?.type === 'json' ? JSON.parse(value) : value; },
    async put(key: string, value: string) { writes++; cache.set(key, value); },
  } };
  async function get(path: string) {
    const response = await worker.fetch(new Request(`https://worker.invalid${path}`), env);
    assert.equal(response.status, 200, path);
    return response.json();
  }
  assert.equal((await get('/health')).ok, true);
  assert.equal((await get('/cache/status')).players_cache_fresh, true);
  assert.equal((await get('/league/123/dashboard')).dashboard.team_count, 2);
  assert.equal((await get('/league/123/preseason_rankings')).mode, 'preseason_rankings');
  const team = (await get('/league/123/team/1')).team;
  assert.equal(team.starters[0].full_name, 'Fixture Quarterback');
  assert.equal(team.points_for, 20.5);
  assert.equal((await get('/league/123/enriched_rosters')).teams.length, 2);
  assert.equal((await get('/league/123/trade_partners/1')).team.roster_id, 1);
  const available = await get('/league/123/available_players?positions=RB&limit=10');
  assert.deepEqual(available.candidates.map((p: any) => p.player_id), ['p3']);
  assert.equal((await get('/league/123/matchups/1/enriched')).matchup_count, 1);
  const transaction = (await get('/league/123/transactions/1/enriched')).transactions[0];
  assert.equal(transaction.draft_picks[0].current_owner_team.team_name, 'Team B');
  const trending = await get('/players/trending/add/enriched?league_id=123');
  assert.equal(trending.players[0].ownership.roster_id, 1);
  assert.equal(trending.players[1].ownership.owned, false);
  assert.equal((await get('/players/lookup?ids=p1')).players[0].full_name, 'Fixture Quarterback');
  assert.equal(writes, 0);
  assert.ok(!requests.includes('/v1/players/nfl'));
  // Real legacy cache semantics: stale reads refresh, then fall back if upstream fails.
  cache.set('players_nfl_cached_at', '1');
  await get('/players/lookup?ids=p1');
  assert.equal(writes, 2);
  cache.set('players_nfl_cached_at', '1');
  fail = true;
  assert.equal((await get('/players/lookup?ids=p1')).players[0].full_name, 'Fixture Quarterback');
  assert.equal(writes, 2);
  cache.clear();
  assert.equal((await worker.fetch(new Request('https://worker.invalid/players/lookup?ids=p1'), env)).status, 500);
  fail = false;
  await get('/players/lookup?ids=p1');
  assert.equal(writes, 4);
  assert.equal((await worker.fetch(new Request('https://worker.invalid/cache/refresh'), env)).status, 400);
  assert.equal(writes, 4);
});

