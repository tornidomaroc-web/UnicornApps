// Run with `npm test` (NOT `npx jest`): npx stages its binary shims through the
// home directory, which here contains "&" (C:\Users\RAGHAD&JAD). cmd.exe treats
// an unquoted "&" as a command separator, so the generated shim path splits and
// jest mis-resolves. `npm test` resolves jest from the project-local
// node_modules/.bin, whose path has no "&", so it runs cleanly despite the &.
// Hardened fallback if a shim ever misbehaves: "node node_modules/jest/bin/jest.js".
const nextJest = require('next/jest')

// Loads next.config + .env and wires Next's SWC transform — same compiler the
// build uses, so test transform == build transform. No ts-jest needed.
const createJestConfig = nextJest({ dir: './' })

/** @type {import('jest').Config} */
const config = {
  // Route handlers + crypto + Request/NextRequest — Node globals, no DOM.
  testEnvironment: 'node',
  // Only treat *.test.* / *.spec.* as suites. Jest's default ALSO globs every
  // __tests__/**/*.ts, which would try to run helpers/fixtures (e.g.
  // __tests__/helpers/supabaseMock.ts) as empty suites and fail. Existing tests
  // are *.test.ts, so they still match.
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  // tsconfig path alias: @/* -> src/* (explicit, independent of auto-detection).
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
}

// createJestConfig is async (it loads next.config/.env), so export its result.
module.exports = createJestConfig(config)
