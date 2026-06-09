import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const NATIVE_UA_TOKEN = 'UnicornAppsAndroid'

export async function middleware(request: NextRequest) {
  const ua = request.headers.get('user-agent') || ''
  const isNativeApp = ua.includes(NATIVE_UA_TOKEN)
  const { pathname } = request.nextUrl

  // The native Android app is payment-free (Google Play disallows routing users
  // to external checkout for digital goods). Make the pricing page unreachable
  // on native — at the edge, before any HTML is produced. Deterministic: this
  // reads the real WebView User-Agent, unlike a server-component headers() call.
  if (isNativeApp && (pathname === '/pricing' || pathname.startsWith('/pricing/'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Expose native-ness to downstream server components (e.g. /dashboard) via a
  // request header they can read reliably with headers().
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-unicorn-native', isNativeApp ? '1' : '0')

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              request.cookies.set(name, value)
            )
            response = NextResponse.next({
              request: {
                headers: requestHeaders,
              },
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user && pathname.startsWith('/dashboard')) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    if (user && pathname.startsWith('/login')) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    return response
  } catch (e) {
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
