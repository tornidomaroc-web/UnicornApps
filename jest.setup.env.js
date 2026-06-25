// Deterministic Paddle price ids for the test run.
//
// WHY HERE (not at top-of-test-file): src/lib/billing.ts reads these env vars at
// MODULE-INIT time to build its price->credits map (unlike route.ts/checkout.ts,
// which read at call time). A test that imports the webhook route transitively
// loads billing.ts during import hoisting — before any top-of-file
// `process.env.X = ...` runs. setupFiles executes before the test module is
// evaluated, so billing.ts initializes with these values.
//
// .env.local does NOT define the price ids (only PADDLE_WEBHOOK_SECRET), so
// there's nothing to override — this simply makes creditsForPrice deterministic:
//   creditsForPrice('pri_sub_test')  === 100
//   creditsForPrice('pri_pack_test') === 30
// These match the ids used by the docs-derived fixtures and checkout.test.ts.
process.env.NEXT_PUBLIC_PADDLE_SUB_PRICE_ID = 'pri_sub_test'
process.env.NEXT_PUBLIC_PADDLE_PACK_PRICE_ID = 'pri_pack_test'
