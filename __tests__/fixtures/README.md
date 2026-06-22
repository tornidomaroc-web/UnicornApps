# Webhook payload fixtures

**Status: EMPTY ON PURPOSE.** These fixtures will be filled from **real captured
Paddle sandbox payloads**, never from assumed shapes. Do not hand-author payloads
here from documentation or memory — the entire point of the capture runbook is to
prove the field paths against reality before the webhook handler trusts them.

## How these get populated

Run the field-capture runbook (sandbox simulation + one real sandbox purchase +
one real sandbox refund). Paste each captured `JSON.stringify(payload)` from the
non-prod capture target into the matching file below, verbatim, then redact any
secrets (the signature header is not part of these bodies, so there is nothing
sensitive beyond customer/email — scrub those).

## Expected files (create as captured)

| File | Captured from | Locks |
| --- | --- | --- |
| `transaction.completed.pack.json` | Real sandbox one-time pack purchase | `subscription_id: null`, `items[0].price.id`, `details.totals.grand_total` (string) |
| `transaction.completed.subscription.json` | Real sandbox first sub charge + a forced renewal | `subscription_id` present, whether **recurring** carries `custom_data.user_id` (#4) |
| `subscription.created.json` / `subscription.activated.json` | Same real sub flow | whether `subscription.*` carries `custom_data.user_id` (#6), `current_billing_period.ends_at` |
| `subscription.canceled.json` | Cancel the sandbox sub | `current_billing_period` is **null** when canceled (correction A) |
| `subscription.paused.json` | Pause the sandbox sub | status path + `current_billing_period` null |
| `adjustment.created.json` / `adjustment.updated.json` | Real sandbox full refund | `action` enum (#8b), `status` pending→approved lifecycle (#8d), `transaction_id` join |

## The decisive field

Whether `data.custom_data.user_id` is **present** on the recurring
`transaction.completed` and on `subscription.*` is what determines if the current
hosted-link checkout (`?user_id=` query param) works at all. If those captures
show `custom_data: null`, the checkout must be rebuilt (Paddle.js `customData` or
server-created transactions) **before** the webhook can resolve users — the
handler is not built until this is resolved.

## Once captured

The `createSupabaseMock()` helper in `../helpers/supabaseMock.ts` consumes these
fixtures: a test loads a fixture as the request body and queues the DB results the
handler should see. Tests are written **after** these files exist, so they encode
real shapes rather than guesses.
