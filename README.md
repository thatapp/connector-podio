# podio-component

The Podio integration component for the AVA / thatapp.io iPaaS platform.

This component is an `elasticio-sailor-nodejs` connector exposing ~100 actions
and 5 triggers against Podio's REST API at `https://api.podio.com`. It is
hardened against the platform-side reliability classes documented below —
the most important being safe-retry semantics for transient errors, an
lookup-before-create item pattern, and rate-limit-aware backoff.

## Setup

### Podio OAuth app

1. In Podio (https://podio.com/settings/api), create a new API client. Name
   it after your customer-facing brand; pick "Server-side flow" type.
2. Set the OAuth redirect URI to your platform's credential-exchange endpoint
   (typically `https://your-tenant.io/callback/oauth2`).
3. Record the **Client ID** and **Client Secret**. These map to the
   component's environment variables:

   - `PODIO_APP_ID` → the OAuth client id
   - `PODIO_APP_SECRET` → the OAuth client secret

More information at https://developers.podio.com/authentication.

### Local development

```bash
git clone https://github.com/thatapp/podio-component.git
cd podio-component
npm install

# Create test/.env from the example, populate OAuth client + a test account
cp test/.env.example test/.env

# Run any single action against the live API using the local test runner
node test/run.js lib/actions/items/getItem getItem
node test/run.js lib/actions/items/createItem createItem
```

The local runner reads fixtures from `test/fixtures/<actionName>.json` and
falls back to `test/fixture.json` for shared inputs.

### Deploying

This component is built and published by the AVA platform's CI pipeline
(`buildType: docker` in `component.json`). Pushing to the `master` branch
triggers an internal build; the component appears in customer flow editors
once the build publishes. There is no manual `docker build` step required
of contributors.

## Architecture

```
[customer flow editor]
        |
        v
[platform: instantiates trigger / action]
        |
        v
[sailor]    -- invokes process(msg, cfg)
        |   -- handles startup/shutdown lifecycle for triggers
        |   -- preserves msg.passthrough automatically (since sailor 2.1.x)
        |   -- auto-retries failed messages 10x with exp backoff (when err.retry=true)
        v
[component action / trigger]
        |
        v
[podio.js (HTTP wrapper)]
        |   -- central response handler:
        |        - 401  -> concurrent-refresh-locked OAuth refresh, re-run request
        |        - 420  -> err.retry=true, lets sailor auto-retry
        |        - 5xx  -> err.retry=true, lets sailor auto-retry
        |        - 4xx  -> normalized error with kind / errorParameters / errorPropagate
        |   -- rate-limit headroom WARN when < 500 remaining
        v
[api.podio.com]
```

Key files:

- `podio.js` — HTTP wrapper. Owns the response handler, token refresh lock,
  and the central error-normalizer integration.
- `helpers/errors.js` — central Podio error normalizer with diagnostic
  classification (ROUTE_GONE / RESOURCE_MISSING / FORBIDDEN /
  INVALID_REFERENCE / RATE_LIMIT / SERVER_ERROR / PROVIDER_ERROR / OTHER)
  and the `err.retry=true` signal that drives sailor's auto-retry.
- `helpers/refTypes.js` — Podio's 69-member `ref_type` registry classified
  into 33 resolvable, 28 reserved, 8 resolver-crashers.
- `helpers/podioEnums.js` — centralized enum constants harvested from the
  live API (view layouts, hook event types, grant actions, task grouping,
  etc.). Single source of truth for these values across the connector.
- `helpers/redact.js` — masks credentials in logged Podio responses
  (mailbox, calendar_code, push.signature, access_token, refresh_token).
- `lib/actions/` — ~100 action files grouped by Podio area (items, apps,
  comments, files, hooks, etc.).
- `lib/triggers/` — 5 polling/webhook-receiver triggers.

## Operational notes

### OAuth token lifetime

Podio access tokens have an **8-hour TTL** and refresh tokens roll on each
refresh. The component refreshes reactively on `401`. Concurrent 401s
during a large batch are serialized in-process via a refresh-lock so the
second-place caller doesn't race the first.

### Rate limit

Partner-tier accounts are budgeted at **75,000 calls/hour** by Podio. When
the remaining-budget header drops below `500`, the component logs a WARN
to the platform's executions panel. When you hit a 420 (rate-limit) or any
5xx (server error), the response is marked `err.retry=true` and the
sailor's built-in **10-retry exponential backoff** takes over automatically.
You do not need to write a custom backoff loop.

### Reliable batch creation (the canonical pattern)

The default `createItem` action reports failures through the iPaaS error
channel. A failed response does not always mean that Podio rejected the write.
For batches, reconcile the results against Podio before deciding what to retry:

1. Make each upstream record carry a **stable upstream id** as `external_id`
   (source-system row id, UUID — anything unique per record).
2. Use **`Item: Create (Lookup by external_id)`** instead of `Item: Create`.
   It looks up by `external_id` first and returns the existing item if a
   prior attempt already landed it. This does not prevent concurrent duplicates.
   Podio leaves external-ID uniqueness to the caller; a durable coordinator is
   required across workers. The output's
   `_idempotent_status` field is `"existing"` or `"created"`.
3. At the end of the batch, route the list of `external_ids` you tried to
   write into **`Item: Reconcile Batch (by external_id)`**. It returns
   `{found, missing, errors, *_count}` — `missing` lists exactly which
   upstream records did not make it to Podio.
4. Resolve lookup errors and uncertain writes, then retry confirmed missing
   records under the same caller coordination.

Reconciliation checks observed state; it is not a lock or an exactly-once
guarantee. The historical action key `createItemIdempotent` is retained for
existing flows. See [Podio's external-ID contract](https://developers.podio.com/doc/items/get-item-by-external-id-19556702).

### Webhooks: the calculation-field trap

Podio does **not** fire `item.update` events for calculation-field
recomputes. The recompute is asynchronous and continuous; firing webhooks
on every cascade step would create webhook storms with ambiguous timing,
so Podio deliberately suppresses them. This means:

- A field-level webhook (`app_field` scope) on a calculation field is
  **registerable** but **never fires**.
- The connector's `Hooks: Create` action will detect and refuse this when
  you set the optional `appId` config — see the action description.

The canonical bridge: use a Podio Workflow Automation flow to copy the
calculated value into a regular *stored* field (text/date/number), and
subscribe the webhook to that stored field instead. The stored-field write
triggers a real `item.update` event.

### Error vocabulary

The central error normalizer produces an `Error` carrying:

| Property | Description |
|---|---|
| `err.statusCode` | HTTP status code from Podio |
| `err.podioError` | Podio's `error` keyword (e.g. `not_found`, `forbidden`, `rate_limit`) |
| `err.errorParameters` | Podio's `error_parameters` object — carries the "Must be one of {...}" allowed set for enum-constrained params |
| `err.errorPropagate` | true = error came from an upstream/provider integration; surface verbatim, do not retry |
| `err.kind` | Diagnostic class (see helpers/errors.js) |
| `err.retry` | `true` for 420 and 5xx — drives sailor's auto-retry |

When the API rejects a value as out-of-set (e.g. an invalid view layout),
`errorParameters` carries the allowed values — the user-visible error string
should surface them. The `formatUserError(err)` helper in `helpers/errors.js`
handles this.

### Logging + redaction

Use `this.logger.info/.warn/.error` (Bunyan via the sailor) for all
operational logging — `info` and above appear on the platform's executions
page. For any Podio response body that goes into a log line, wrap it via
`helpers/redact.js`'s `safeStringify(body)` so sensitive fields
(`mailbox`, `calendar_code`, `push.signature`, OAuth tokens) are masked.

### Search v1 vs v2

For scoped searches (`searchOrg`, `searchSpace`), both v1 and v2 are live —
exposed as sibling actions:

- `Search: Organization (v1)` / `Search: Space (v1)` → bare array result.
  Compact, no facet counts. Use when you just want matches.
- `Search: Organization (v2 with counts)` / `Search: Space (v2 with counts)`
  → `{counts, results}` envelope. Pass `counts=true` to populate
  per-`ref_type` aggregate counts. Use for faceted UIs.

Both return the same 13-key result-row schema. For unscoped global search,
only v2 exists (the v1 unscoped global route is dead).

## Triggers

The component exposes 5 triggers:

- `getApplications` — polling: lists the active apps of one space (`GET /app/space/{space_id}/`; the space comes from the message, else the step configuration's `space_id` / `spaceId`); emits the `{app_id: name}` map per cycle. (Until 1.2.0 it read one app by id and could never emit.)
- `getItems` — polling: fetches one item by id; emits per cycle.
- `getOrganisations` — polling: lists the organisations the connected user belongs to (`GET /org/`; takes no input); emits the `{org_id: name}` map per cycle. (Until 1.2.0 it read one org by id and could never emit.)
- `getSpaces` — polling: fetches spaces for an org.
- `verifyHook` (file `lib/triggers/verifyHooks.js`) — webhook receiver: handles Podio's hook-verification handshake.

**Note (in-progress):** A dedicated `podio-webhook` component is being
designed to subsume the current two-flow webhook-install ceremony into a
single lifecycle-aware trigger (install/verify on `startup`, emit events
on `process`, optional cleanup on `shutdown`). Until that ships, the
current `Hooks: Create` + `Hook: Verify` pattern remains the way to
manage webhooks.

## Troubleshooting

| Symptom | Likely cause | What to check |
|---|---|---|
| "Platform shows 1000 processed, Podio is missing some" | Errors lost / not retried | Confirm B.4/B.5 retry logic is active. Add `reconcileBatch` to the flow and re-feed `missing`. |
| `err.kind === 'ROUTE_GONE'` | Connector bug — wrong endpoint | This means the path we hit does not exist on Podio. File an issue with the action name. |
| `err.kind === 'RESOURCE_MISSING'` | User error — bad id | The path exists; the referenced item/app/etc. doesn't. |
| `err.kind === 'FORBIDDEN'` | Auth/scope issue | The token doesn't have rights on this object. Re-auth or use a different OAuth client. |
| `err.kind === 'INVALID_REFERENCE'` | User passed a reserved `ref_type` | See `helpers/refTypes.js` — the type is in Podio's registry but not resolvable via `/reference`. |
| `err.kind === 'RATE_LIMIT'` | 420 hit | Auto-retries via sailor. If persistent, the workload exceeds 75k/hr. |
| Webhook on a field never fires | The field is a calculation field | See "Webhooks: the calculation-field trap" above. Use the stored-field bridge. |

## Contributing

- Tests live under `test/` — both spec-based (mocha) and the local
  `test/run.js` integration runner.
- Lint config is in `.eslintrc` / handled by gulp.
- `npm run test:unit` runs the mocha spec suite locally. (The bare
  `npm test` is intentionally a no-op so the AVA platform's build pod
  doesn't fail when devDependencies aren't installed.)
- `npm run test:integration` runs the local `test/run.js` against the
  live Podio API using fixtures from `test/fixtures/`.
- Pre-commit: please run `npm run test:unit` before pushing.

## License

Apache-2.0. See `LICENSE`.
