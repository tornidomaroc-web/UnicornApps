# Webhook payload fixtures

**Status: DOCS-DERIVED (two-layer plan).** Because the Paddle sandbox step was
skipped, we cannot capture real payloads until the live verification that happens
**after** the webhook ships. So these fixtures are built **now** from the official
Paddle Billing payload shapes (developer.paddle.com), as verified in the 8-field
docs pass, to let the webhook tests be written against real-looking shapes today.

This supersedes the earlier "EMPTY ON PURPOSE / never hand-author" stance: the
sandbox-skip made capture-first impossible, so we build on docs first and
reconcile against reality later. Every docs-derived fixture carries a
`_fixture_meta` header marking it as docs-derived and pointing here.

## The two layers

1. **Layer 1 — docs (now).** Author fixtures from the official Paddle Billing docs.
   They lock the field *paths and types* the handler depends on (string amounts,
   `subscription_id: null` for packs, `custom_data.user_id` presence, the
   `adjustment.*` action/status enums, etc.). Tests are written against these.
2. **Layer 2 — live reconciliation (after ship).** During live verification,
   capture the REAL payloads (one real purchase, one real refund, a forced
   renewal, a cancel/pause) and diff each captured body against the matching
   docs-derived fixture **field-for-field**. Any mismatch → fix the fixture AND
   the handler, re-run the suite. Only then is the field contract proven.

## Files (create alongside the Piece whose tests consume them)

| File | Layer-1 source | Locks | Reconcile in |
| --- | --- | --- | --- |
| `transaction.completed.pack.json` | Docs: one-time pack `transaction.completed` | `subscription_id: null`, `items[0].price.id`, `details.totals.grand_total` (string), `custom_data.user_id` | Real sandbox pack purchase |
| `transaction.completed.subscription.json` | Docs: first sub charge + renewal | `subscription_id` present, whether **recurring** carries `custom_data.user_id` (#4) | Real first charge + forced renewal |
| `subscription.created.json` / `subscription.activated.json` | Docs: sub lifecycle | whether `subscription.*` carries `custom_data.user_id` (#6), `current_billing_period.ends_at` | Same real sub flow |
| `subscription.canceled.json` | Docs: sub cancel | `current_billing_period` is **null** when canceled (correction A) | Cancel the sandbox sub |
| `subscription.paused.json` | Docs: sub pause | status path + `current_billing_period` null | Pause the sandbox sub |
| `adjustment.created.json` / `adjustment.updated.json` | Docs: full refund | `action` enum (#8b), `status` pending→approved lifecycle (#8d), `transaction_id` join | Real sandbox full refund |

Fixtures land **with the Piece that consumes them**, not all up front: Piece 1
(control-flow scaffold) shipped only `transaction.completed.pack.json`; Piece 2
(transaction.completed split) added `transaction.completed.subscription.json`;
Piece 3 (subscription lifecycle) adds `subscription.activated/canceled/past_due/
paused.json`; the remaining `adjustment.*` fixtures arrive with Piece 4 so each
piece's diff stays self-contained.

## The decisive field

Whether `data.custom_data.user_id` is **present** on the recurring
`transaction.completed` and on `subscription.*` is what determines if the
checkout's user resolution works. The Paddle.js rebuild (sub-step iii) now sends
`customData` on checkout, so the docs-derived fixtures assume it is present;
**Layer 2 must confirm it survives onto recurring charges and subscription
events** — if a real capture shows `custom_data: null` there, the resolution
path must change before that handler can be trusted.

## How tests consume these

The `createSupabaseMock()` helper in `../helpers/supabaseMock.ts` pairs with these
fixtures: a test loads a fixture as the request body and queues the DB results the
handler should see. `resolveJsonModule` is on, so tests `import` the JSON directly.
