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

Use a separately named Worker such as `sleeper-league-worker-staging` and a new
staging KV namespace bound as `SLEEPER_CACHE`. Never copy production KV bindings or
custom routes. Verify the Cloudflare account and existing runtime settings before
deployment. The user has approved deployment in the staging workflow; approval
does not establish authenticated access or which account is available.

Deploy the reviewed branch's `index.js` to that staging Worker. Confirm health,
all old routes and the new route directly, then repeat through a staging MCP
service. Ordinary legacy reads can populate/update staging KV. The new pick route
must not access player KV. Compare source ownership with the returned records.

Keep deployment automation separate from this test-only workflow. Do not merge
until existing GitHub-to-Cloudflare triggers are known. The production service,
routes, environment and backend behavior must remain intact. Record the deployed
staging version and prior version; rollback the staging MCP feature flag first,
then restore a prior Worker version if required. Full inventory is a later change.
