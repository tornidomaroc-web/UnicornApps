import {
  deriveNavView,
  reconcileNavState,
  type NavAuthState,
} from '@/components/navbar-auth'

// deriveNavView only inspects truthiness / undefined-ness, so a bare object is a
// sufficient stand-in for a signed-in Supabase User here.
const fakeUser = { id: 'u1' } as unknown as NonNullable<
  Extract<NavAuthState, object>
>

describe('deriveNavView', () => {
  it('renders a neutral placeholder while unresolved — never LOGIN (the item-30 bug)', () => {
    expect(deriveNavView(undefined)).toBe('loading')
  })

  it('renders the signed-out cluster ONLY for a confirmed null', () => {
    expect(deriveNavView(null)).toBe('anon')
  })

  it('renders the signed-in cluster for a user', () => {
    expect(deriveNavView(fakeUser)).toBe('authed')
  })
})

describe('reconcileNavState', () => {
  it('replaces the previous state with the server seed (server wins)', () => {
    expect(reconcileNavState(fakeUser, null)).toBeNull()
    expect(reconcileNavState(null, fakeUser)).toBe(fakeUser)
    expect(reconcileNavState(fakeUser, undefined)).toBeUndefined()
  })

  it('never merges or preserves a stale truthy value', () => {
    const stale = { id: 'old' } as typeof fakeUser
    const fresh = { id: 'new' } as typeof fakeUser
    expect(reconcileNavState(stale, fresh)).toBe(fresh)
  })
})
