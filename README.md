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

## Roster decision context

The existing `team` and `enriched_rosters` responses now include the league's
Sleeper `settings` object and each roster's `waiver_budget_used` when Sleeper
provides it. These additive fields support FAAB, taxi, reserve and roster-rule
analysis without another route or a second source of truth. A missing budget
field remains `null`; callers must not invent a balance or IR eligibility.
Existing player and roster fields are unchanged. The fields are covered by
the legacy route regression fixture.

## Draft metadata summary

`GET /league/{league_id}/drafts/summary` is an additive read-only route that
returns Sleeper's draft IDs, seasons, statuses, types and configured round counts.
It preserves multiple drafts in the same season and makes no claim that a traded
pick remains unexercised. It uses only the league and league-drafts Sleeper
endpoints; no player cache or KV binding is involved. The response is marked
`draft_metadata_only` with `inventory_complete: false`. Use it to check draft
status before describing traded-pick records as future assets. Full remaining
capital still requires draft-pick reconciliation and coverage rules.
