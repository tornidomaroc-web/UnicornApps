/**
 * The dashboard sends an account that has not claimed its free credits to
 * /welcome, and nobody else: the server component with its data mocked.
 */
const mockGetUser = jest.fn()
const mockProfile = jest.fn()
const mockRedirect = jest.fn((to: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { to })
})

jest.mock('next/navigation', () => ({ redirect: (to: string) => mockRedirect(to) }))
jest.mock('@/lib/native-request', () => ({ isNativeRequest: () => false }))
jest.mock('@/app/dashboard/DashboardClient', () => ({ __esModule: true, default: () => null }))
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: async () => ({ data: [], error: null }),
        single: async () => (table === 'profiles' ? mockProfile() : { data: null, error: null }),
      }
      return chain
    },
  }),
}))

import DashboardPage from '../src/app/dashboard/page'

const render = async () => {
  try {
    await DashboardPage()
    return null
  } catch (e: any) {
    if (e?.to) return e.to
    throw e
  }
}

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  mockProfile.mockReset()
  mockRedirect.mockClear()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('the dashboard and the free-credit claim', () => {
  it('an unclaimed account goes to /welcome', async () => {
    mockProfile.mockResolvedValue({ data: { credits: 0, free_credits_claimed_at: null }, error: null })
    expect(await render()).toBe('/welcome')
  })

  it('a claimed account renders', async () => {
    mockProfile.mockResolvedValue({ data: { credits: 3, free_credits_claimed_at: '2026-10-10T00:00:00Z' }, error: null })
    expect(await render()).toBeNull()
  })

  it('a profile read that fails does not bounce the user around', async () => {
    mockProfile.mockResolvedValue({ data: null, error: { message: 'column does not exist' } })
    expect(await render()).toBeNull()
  })

  it('no session still goes to /login first', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await render()).toBe('/login')
    expect(mockProfile).not.toHaveBeenCalled()
  })
})
