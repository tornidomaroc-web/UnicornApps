import { isClassString, readSource, skeleton, skeletonHash, skeletonHashOf } from './helpers/class-skeleton'

/**
 * Restyle fence for files that handle sign-in, sessions or credits.
 *
 * A reskin may change the CONTENTS of their Tailwind class strings and nothing
 * else: no new function, condition, handler, prop, state, import, constant or
 * string. Each file's skeleton (its exact text with class-string contents
 * blanked, see helpers/class-skeleton.ts) is pinned below; the hashes were
 * taken from the files before the Clay Night skin.
 *
 * If this fails after a deliberate LOGIC change, that change is not a restyle:
 * ship it separately, and update its hash in that PR so the review sees it.
 */
const PINNED: Record<string, string> = {
  'src/app/(auth)/login/page.tsx': '093fedb13624bfa6',
  'src/app/(auth)/update-password/page.tsx': 'd14f4ab4703a3f3a',
  'src/app/account/AccountClient.tsx': '30b100ab67ea55dc',
  'src/app/account/page.tsx': '2ad067bccb103352',
  'src/app/auth/confirm/ConfirmForm.tsx': '56e5c9c2490780ab',
  'src/app/auth/confirm/page.tsx': '0ab86d4679a42723',
  'src/app/dashboard/DashboardClient.tsx': '608d39f0d162eeb3', // declared layers below: PR4, unknown balance
  'src/app/dashboard/page.tsx': '6fc7032261c8ebfc', // declared layer below: unknown balance
  'src/app/delete-account/DeleteAccountClient.tsx': '1d9f7f520980a17e',
  'src/app/layout.tsx': '273b1b02703bb4da', // declared layer below: unknown balance
  'src/app/pricing/PricingClient.tsx': '907be88880c895c6', // declared layer below: unknown purchase baseline
  'src/app/pricing/page.tsx': 'c2e457a688b1f476', // declared layer below: unknown purchase baseline
  'src/app/welcome/WelcomeClient.tsx': '1016ef4c7bb98846',
  'src/app/welcome/page.tsx': '419519675f41d01b',
  'src/components/Navbar.tsx': 'a905ebdb818e853c', // declared layer below: unknown balance
  'src/components/auth/AuthShell.tsx': '8060c1017cffffe5',
  'src/components/auth/SocialButtons.tsx': '2c36d8e8cb492dc7',
  'src/components/auth/TurnstileWidget.tsx': '2b0d00d6aba6b446',
  'src/hooks/useCreditGrantPoll.ts': 'f427ceb204a719e0', // declared layer below: unknown purchase baseline
}

describe('auth, session and credit files change only inside class strings', () => {
  it.each(Object.entries(PINNED))('%s', (file, hash) => {
    expect(skeletonHash(file)).toBe(hash)
  })
})

/**
 * DECLARED LOGIC EXCEPTIONS, as layers. A layer is one PR's logic edits to one
 * protected file, each written as the exact text BEFORE and AFTER (an insertion
 * has an empty `before`). The test undoes a file's layers newest first: every
 * `after` must occur exactly once and is replaced by its `before`, and after
 * each layer the skeleton must equal the pin the file had before that PR. So a
 * layer's edits are provably the only logic change that PR made, and nothing
 * else moved. PINNED above then freezes the file as it is now.
 */
type Edit = { before: string; after: string }
type Layer = { pr: string; pinBefore: string; edits: Edit[] }
const ins = (after: string): Edit => ({ before: '', after })

// PR4, the dashboard home: "native detection has resolved", and the home's props.
const PR4_DASHBOARD: Layer = {
  pr: 'PR4 dashboard home',
  pinBefore: 'fac672e36160dfd5',
  edits: [
    ins(`  // False until the client check below has run. "Add credits" on the home
  // renders only once this is true AND the page is not native, so it can never
  // flash in the app, even where only Capacitor (not the UA) knows it is native.
  const [nativeResolved, setNativeResolved] = useState(false)
`),
    ins(`      setNativeResolved(true)
`),
    ins(`          credits={credits}
          isNative={isNative}
          showAddCredits={nativeResolved && !isNative}
          addCreditsBusy={checkoutPending !== null}
          onAddCredits={() => void handlePaid('pack')}
`),
  ],
}

// The unknown balance: a failed read is null, never an invented 0.
const UNKNOWN = 'unknown credit balance'
// The unknown purchase baseline: /pricing carries null too, and the purchase
// poll never confirms a grant by comparing against it.
const UNKNOWN_BASELINE = 'unknown purchase baseline'
const LAYERS: Record<string, Layer[]> = {
  'src/app/pricing/page.tsx': [
    {
      pr: UNKNOWN_BASELINE,
      pinBefore: '385b1e96f8df586c',
      edits: [
        {
          before: `  // poll then reads /api/credits, never a server re-render. Failure degrades to
  // 0, which is only ever a baseline — a grant still moves the value.
  let initialCredits = 0`,
          after: `  // poll then reads /api/credits, never a server re-render. A failed read is
  // null, never 0: a 0 baseline made the first real read look like a grant.
  let initialCredits: number | null = 0`,
        },
        { before: '        const { data: profile } = await supabase', after: '        const { data: profile, error } = await supabase' },
        { before: '        initialCredits = profile?.credits ?? 0', after: '        initialCredits = error ? null : (profile?.credits ?? 0)' },
      ],
    },
  ],
  'src/app/pricing/PricingClient.tsx': [
    {
      pr: UNKNOWN_BASELINE,
      pinBefore: 'fea86915fb5c9e68',
      edits: [
        {
          before: `  // here saw the counter frozen until a full reload.
  initialCredits: number
`,
          after: `  // here saw the counter frozen until a full reload. null = the server could not
  // read it; the hook then never confirms a grant by comparison.
  initialCredits: number | null
`,
        },
      ],
    },
  ],
  'src/hooks/useCreditGrantPoll.ts': [
    {
      pr: UNKNOWN_BASELINE,
      pinBefore: '7ba8e9476d295f70',
      edits: [
        {
          before: ' * given) is only the baseline: the number the buyer was looking at.\n',
          after: ` * given) is only the baseline: the number the buyer was looking at. null means
 * the server could not read it, and then no read can confirm a grant (Phase 1).
`,
        },
        {
          before: 'export function useCreditGrantPoll(initialCredits: number) {',
          after: 'export function useCreditGrantPoll(initialCredits: number | null) {',
        },
        {
          before: `      baselineRef.current = creditsRef.current
      void pollForCreditGrant(creditsRef.current, {
`,
          after: `      // An unknown (null) baseline has nothing a read can be compared with: the
      // first real number may be the old balance or the granted one. The poll
      // still reads and publishes on its schedule, so the counter settles on the
      // real balance, but readCredits holds still, so it can only end exhausted
      // (success_pending), never confirmed. A null baseline also keeps
      // statusAfterLateCredits from confirming later.
      const baseline = creditsRef.current
      baselineRef.current = baseline
      void pollForCreditGrant(baseline ?? 0, {
`,
        },
        {
          before: '        readCredits: () => creditsRef.current,',
          after: '        readCredits: () => (baseline === null ? 0 : (creditsRef.current ?? baseline)),',
        },
      ],
    },
  ],
  'src/app/dashboard/DashboardClient.tsx': [
    {
      pr: UNKNOWN,
      pinBefore: 'c81280a2464432e3',
      edits: [
        { before: "import { refreshCredits } from '@/lib/credits-bus'", after: "import { refreshCredits, subscribeCredits } from '@/lib/credits-bus'" },
        { before: '  initialCredits: number,', after: '  initialCredits: number | null,' },
        {
          before: '  const { checkoutStatus, setCheckoutStatus, credits } = useCreditGrantPoll(initialCredits)\n',
          after: `  const { checkoutStatus, setCheckoutStatus, credits } = useCreditGrantPoll(initialCredits ?? 0)
  // initialCredits is null when the server could not read the balance. Then
  // the hook's 0 is a placeholder, not a balance: it stays unknown until a real
  // read is published (the self-heal read below, a generate, or a purchase
  // poll), and every gate below reads shownCredits, never the placeholder.
  const [creditsKnown, setCreditsKnown] = useState(initialCredits !== null)
  useEffect(() => setCreditsKnown(initialCredits !== null), [initialCredits])
  useEffect(() => subscribeCredits(() => setCreditsKnown(true)), [])
  useEffect(() => {
    if (initialCredits === null) void refreshCredits()
  }, [initialCredits])
  const shownCredits = creditsKnown ? credits : null
`,
        },
        ins(`        // 403 is the server's own credit check (reserve_credit) saying no. Show
        // the same out-of-credits copy the bar would, and re-read the balance so
        // an unknown one becomes a confirmed 0.
        if (response.status === 403) {
          void refreshCredits()
          throw new UserFacingError(isNative ? t('dash.limitReached') : t('dash.noCredits'))
        }
`),
        { before: '    const outOfCredits = credits <= 0', after: '    const outOfCredits = shownCredits !== null && shownCredits <= 0' },
        { before: '        {results && !isNative && (', after: '        {results && !isNative && shownCredits !== null && (' },
        { before: '          credits={credits}\n', after: '          credits={shownCredits}\n' },
        {
          before: '          showAddCredits={nativeResolved && !isNative}\n',
          after: '          showAddCredits={nativeResolved && !isNative && shownCredits !== null}\n',
        },
      ],
    },
    PR4_DASHBOARD,
  ],
  'src/app/dashboard/page.tsx': [
    {
      pr: UNKNOWN,
      pinBefore: '0e18e232bc8e5d59',
      edits: [
        { before: '  let credits = 0\n', after: '  let credits: number | null = 0\n' },
        ins(`        credits = null
`),
      ],
    },
  ],
  'src/app/layout.tsx': [
    {
      pr: UNKNOWN,
      pinBefore: 'bae6e6b5b0b0e084',
      edits: [
        {
          before: 'async function getNavSeed(): Promise<{ user: User | null; credits: number }> {',
          after: 'async function getNavSeed(): Promise<{ user: User | null; credits: number | null }> {',
        },
        {
          before: `    // no row -> 0. That is what keeps the getSession seed safe from spoofing.`,
          after: `    // no row -> an error -> null. That is what keeps the getSession seed safe
    // from spoofing. null means "could not read": the navbar shows it as
    // unavailable, never as an invented 0.`,
        },
        { before: '    const { data } = await supabase', after: '    const { data, error } = await supabase' },
        { before: '    return { user, credits: data?.credits ?? 0 };', after: '    return { user, credits: error ? null : (data?.credits ?? 0) };' },
      ],
    },
  ],
  'src/components/Navbar.tsx': [
    {
      pr: UNKNOWN,
      pinBefore: '2360e9d4dd13061d',
      edits: [
        { before: '  initialCredits?: number;\n', after: '  initialCredits?: number | null;\n' },
        { before: '  const [credits, setCredits] = useState(initialCredits);', after: '  const [credits, setCredits] = useState<number | null>(initialCredits);' },
        {
          before: `              {/* 🔴 THIS IS THE ONLY PLACE A CREDIT BALANCE RENDERS ANYWHERE IN THE APP.
                  The dashboard used to carry a header bar of its own; that bar has been
                  deleted outright, so there is no second surface to fall back on.
                  Putting ANY breakpoint gate on the NUMBER leaves a phone user with no
                  credit count at all, on every screen, and nothing else will show it to
                  them. Only the WORD beside it gives way, below 640px and only while
                  the dashboard pill is taking the room; it stays in the tree for
                  assistive technology. */}`,
          after: `              {/* 🔴 THE ONLY CREDIT BALANCE ON EVERY SCREEN. The dashboard home's credits
                  card shows it too, but only there, so this chip is still what a user
                  sees everywhere else. Putting ANY breakpoint gate on the NUMBER leaves
                  a phone user with no credit count on those screens. Only the WORD
                  beside it gives way, below 640px and only while the dashboard pill is
                  taking the room; it stays in the tree for assistive technology.
                  null = the server could not read the balance: a dash and
                  "Unavailable", never an invented 0. */}`,
        },
        { before: '                <span>{credits}</span>', after: "                <span>{credits === null ? '–' : credits}</span>" },
        {
          before: '                  {creditsWord(credits, lang)}',
          after: "                  {credits === null ? t('nav.credits.unknown') : creditsWord(credits, lang)}",
        },
      ],
    },
  ],
}

describe('declared logic exceptions are the only logic change', () => {
  it.each(Object.entries(LAYERS))('%s, undone layer by layer, matches each earlier pin', (file, layers) => {
    let text = readSource(file)
    for (const layer of layers) {
      for (const { before, after } of layer.edits) {
        expect({ layer: layer.pr, after, count: text.split(after).length - 1 }).toEqual({ layer: layer.pr, after, count: 1 })
        text = text.replace(after, before)
      }
      expect({ layer: layer.pr, hash: skeletonHashOf(text, file) }).toEqual({ layer: layer.pr, hash: layer.pinBefore })
    }
  })

  it('the Add credits gate is resolved && !isNative on a confirmed balance, and it calls the existing checkout handler', () => {
    const pr4 = PR4_DASHBOARD.edits.map((e) => e.after).join('')
    expect(pr4).toContain("onAddCredits={() => void handlePaid('pack')}")
    const now = readSource('src/app/dashboard/DashboardClient.tsx')
    expect(now).toContain('showAddCredits={nativeResolved && !isNative && shownCredits !== null}')
    const all = Object.values(LAYERS).flat().flatMap((l) => l.edits.map((e) => e.after)).join('')
    expect(all).not.toMatch(/openCheckout|Paddle|router\./)
  })

  it('no purchase entry and no zero-credit bar is driven by an unconfirmed balance', () => {
    const now = readSource('src/app/dashboard/DashboardClient.tsx')
    expect(now).toContain('const outOfCredits = shownCredits !== null && shownCredits <= 0')
    expect(now).toContain('{results && !isNative && shownCredits !== null && (')
    // The purchase hook is untouched: the dashboard only ever hands it a number.
    expect(now).toContain('useCreditGrantPoll(initialCredits ?? 0)')
  })
})

describe('the skeleton itself (it is load-bearing above)', () => {
  it('ignores a class-string change', () => {
    const a = `const X = 'rounded-2xl bg-white/5'\n<div className="text-white p-4" />`
    const b = `const X = 'rounded-row bg-row shadow-tap'\n<div className="text-fg p-4" />`
    expect(skeleton(a)).toBe(skeleton(b))
  })

  it('ignores a class change inside a template literal', () => {
    expect(skeleton('const c = `${A} bg-brand px-5`')).toBe(skeleton('const c = `${A} bg-fill-btn shadow-btn px-5`'))
  })

  it.each([
    ['a new condition', `<div className={ok ? 'p-4' : 'p-2'} />`, `<div className={ok && ready ? 'p-4' : 'p-2'} />`],
    ['a new prop', `<div className="p-4" />`, `<div className="p-4" onClick={go} />`],
    ['a new import', `import a from 'a'\n`, `import a from 'a'\nimport b from 'b'\n`],
    ['a new constant', `const A = 'p-4'\n`, `const A = 'p-4'\nconst B = 'p-2'\n`],
    ['a changed translation key', `t('dash.generate')`, `t('dash.generated')`],
    ['a changed cookie name', `get('sb-localhost-auth-token')`, `get('sb-other-auth-token')`],
  ])('catches %s', (_label, a, b) => {
    expect(skeleton(a)).not.toBe(skeleton(b))
  })

  it.each([
    ['rounded-2xl border border-white/10 bg-white/[0.03]', true],
    ['hover:bg-brand/90 focus-visible:ring-2 disabled:opacity-50', true],
    ['font-arabic', true],
    ['sb-localhost-auth-token', false],
    ['content-type', false],
    ['dash.photo.selected', false],
    ['Sign in', false],
  ])('isClassString(%j) = %s', (s, expected) => {
    expect(isClassString(s)).toBe(expected)
  })
})
