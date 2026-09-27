# Sleeper League Worker

`index.js` is the canonical Worker entrypoint, confirmed by the owner. `index` is
retained unchanged for compatibility/history; it is not updated by this feature.

Architecture: Sleeper League Assistant plugin → MCP adapter → this Worker → Sleeper.

Run `npm run check` with Node 24.16.0. No npm dependencies or credentials are needed.
Tests exercise the actual entrypoint with mocked Sleeper responses and in-memory
KV, covering old routes/cache behavior and the new ownership route. CI never deploys.

## Traded-pick ownership

`GET /league/{league_id}/traded_picks/enriched` returns schema version `1`,
original/previous/current owners with team labels, observation time, count and
warnings. It uses Sleeper league traded picks, users and rosters; no player cache.
Duplicate identities and malformed upstream records fail rather than guessing.

This is a traded-picks-only view (`inventory_complete: false`). It excludes untraded
entitlements and does not establish exercised-pick status, future slots or values.
The matching optional MCP tool is already available in `zackb222/sleeper-mcp` and
requires an explicit staging origin plus the staging enablement flags.

## Staging and rollback

`wrangler.staging.jsonc` targets `sleeper-league-worker-staging` and binds only
the separate staging KV namespace as `SLEEPER_CACHE`. It uses a workers.dev URL;
no production route or KV binding is shared. Deploy the reviewed source with
`npx wrangler deploy --config wrangler.staging.jsonc` after authenticating to the
confirmed account. The production Worker is manually deployed in Cloudflare, so
merging this repository change does not deploy production.

The staging Worker is at
`https://sleeper-league-worker-staging.sleeper-test.workers.dev`. The staging MCP
is a separate free Render service at `https://sleeper-league-mcp-staging.onrender.com`
with `SLEEPER_ENVIRONMENT=staging`, `SLEEPER_ENABLE_TRADED_PICKS=true`, and
`SLEEPER_WORKER_BASE_URL` set to that staging Worker origin. Health, old routes,
and the new route were exercised directly and through the MCP tool. Ordinary
legacy reads can populate staging KV. The new pick route does not access KV.

CI is test-only; no GitHub-to-Cloudflare deployment trigger is configured. Record
Worker versions on each staging deploy. To roll back, disable the staging MCP
feature flag first, then restore the previous staging Worker version if needed.
Full draft-pick inventory is a later change.
