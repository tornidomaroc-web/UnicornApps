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
  'src/app/dashboard/DashboardClient.tsx': 'c81280a2464432e3', // PR4: declared insertions below
  'src/app/dashboard/page.tsx': '0e18e232bc8e5d59',
  'src/app/delete-account/DeleteAccountClient.tsx': '1d9f7f520980a17e',
  'src/app/layout.tsx': 'bae6e6b5b0b0e084',
  'src/app/pricing/PricingClient.tsx': 'fea86915fb5c9e68',
  'src/app/pricing/page.tsx': '385b1e96f8df586c',
  'src/app/welcome/WelcomeClient.tsx': '1016ef4c7bb98846',
  'src/app/welcome/page.tsx': '419519675f41d01b',
  'src/components/Navbar.tsx': '2360e9d4dd13061d',
  'src/components/auth/AuthShell.tsx': '8060c1017cffffe5',
  'src/components/auth/SocialButtons.tsx': '2c36d8e8cb492dc7',
  'src/components/auth/TurnstileWidget.tsx': '2b0d00d6aba6b446',
}

describe('auth, session and credit files change only inside class strings', () => {
  it.each(Object.entries(PINNED))('%s', (file, hash) => {
    expect(skeletonHash(file)).toBe(hash)
  })
})

/**
 * DECLARED LOGIC EXCEPTIONS. The dashboard home (PR4) needed a few lines of
 * logic in DashboardClient: a flag for "native detection has resolved", set at
 * the end of the existing check, and the props the home's credits card and
 * quick actions read. Each is listed here verbatim. The test removes every one
 * (each must occur exactly once) and requires what is left to have the
 * skeleton the file had BEFORE PR4. So these insertions are the only logic
 * change in the file, and nothing else moved. The new pin in PINNED above
 * then freezes the file as it is now.
 */
const DECLARED: Record<string, { before: string; insertions: string[] }> = {
  'src/app/dashboard/DashboardClient.tsx': {
    before: 'fac672e36160dfd5',
    insertions: [
      `  // False until the client check below has run. "Add credits" on the home
  // renders only once this is true AND the page is not native, so it can never
  // flash in the app, even where only Capacitor (not the UA) knows it is native.
  const [nativeResolved, setNativeResolved] = useState(false)
`,
      `      setNativeResolved(true)
`,
      `          credits={credits}
          isNative={isNative}
          showAddCredits={nativeResolved && !isNative}
          addCreditsBusy={checkoutPending !== null}
          onAddCredits={() => void handlePaid('pack')}
`,
    ],
  },
}

describe('declared logic exceptions are the only logic change', () => {
  it.each(Object.entries(DECLARED))('%s minus its declared insertions is the file before them', (file, { before, insertions }) => {
    let text = readSource(file)
    for (const ins of insertions) {
      expect(text.split(ins).length - 1).toBe(1)
      text = text.replace(ins, '')
    }
    expect(skeletonHashOf(text, file)).toBe(before)
  })

  it('the Add credits gate is exactly resolved && !isNative, and it calls the existing checkout handler', () => {
    const ins = DECLARED['src/app/dashboard/DashboardClient.tsx'].insertions.join('')
    expect(ins).toContain('showAddCredits={nativeResolved && !isNative}')
    expect(ins).toContain("onAddCredits={() => void handlePaid('pack')}")
    expect(ins).not.toMatch(/openCheckout|Paddle|fetch\(|router\./)
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
