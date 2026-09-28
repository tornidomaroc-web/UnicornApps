'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ChevronDown, Loader2, MessagesSquare, Send, ShoppingBag, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useLang } from '@/lib/i18n/LanguageContext'
import { takePicture } from '@/lib/capacitor'
import Link from 'next/link'
import { openCheckout } from '@/lib/checkout'
import { useCreditGrantPoll } from '@/hooks/useCreditGrantPoll'
import { refreshCredits } from '@/lib/credits-bus'
import { localGenerationRow, prependGeneration } from '@/lib/dashboard-history'
import { resolveApiError } from '@/lib/api-error'
import { prepareImageForUpload } from '@/lib/prepare-image'
import { sanitizeModelHtml } from '@/lib/safe-html'
import ResultsPanel from './ResultsPanel'
import InputPanel, { PrimaryAction, type PrimaryActionProps } from './InputPanel'
import HistoryPanel from './HistoryPanel'
import CameraModal from './CameraModal'
import { MAX_SOURCE_FILE_BYTES } from '@/lib/image-budget'
import {
  bannerToneClass,
  checkoutBannerTone,
  isCameraCancellation,
  nextDashboardError,
  toUserMessage,
  ERROR_BANNER_TONE,
  UserFacingError,
} from '@/lib/dashboard-banner'

interface GeneratedContent {
  seoTitle: string
  metaDescription: string
  productDescription: string
  socialMediaTags: string[]
  shopifyHtml?: string
  amazonBullets?: string[]
  structuredData?: {
    material: string
    dominantColor: string
    targetAudience: string
    careInstructions: string
  }
  viralScript?: {
    hook: string
    concept: string
  }
  dynamicTheme?: {
    dominantColorHex: string
    accentColorHex: string
  }
  hotspots?: {
    x: number
    y: number
    label: string
  }[]
}

interface Generation {
  id: string
  created_at: string
  content: GeneratedContent
  image_url: string
  /** Older server rows carry the platform the user once picked; nothing reads it now. */
  platform?: string
}

interface ChatMessage {
  role: 'user' | 'ai'
  message: string
  timestamp: Date
}

export default function DashboardClient({
  userId,
  initialCredits,
  initialHistory,
  serverIsNative = false
}: {
  userId: string,
  initialCredits: number,
  initialHistory: Generation[],
  serverIsNative?: boolean
}) {
  const router = useRouter()
  const { t, lang } = useLang()
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<GeneratedContent | null>(null)
  // Rendered by the banner row, the first element in the page container. Every
  // write goes through nextDashboardError so the clearing rules stay in one
  // place (lib/dashboard-banner.ts).
  const [error, setError] = useState<string | null>(null)
  const [copySuccess, setCopySuccess] = useState<string | null>(null)
  const [history, setHistory] = useState<Generation[]>(initialHistory)
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: 'ai',
      message: t('dash.matrixInit'),
      timestamp: new Date()
    }
  ])
  const [refineInput, setRefineInput] = useState('')
  const [isRefining, setIsRefining] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  // Raised by handleGenerate only. `refine` also calls setResults, and yanking
  // the user out of the refine console mid-conversation would be wrong.
  const scrollToResults = useRef(false)

  // Seeded from the server's native User-Agent check so the Paddle upgrade links
  // never render on native (no flash). Client check only ever upgrades to native.
  const [isNative, setIsNative] = useState(serverIsNative)

  useEffect(() => {
    const checkNative = async () => {
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (Capacitor.isNativePlatform()) setIsNative(true)
      } catch {
        // keep server-seeded value
      }
    }
    checkNative()
  }, [])

  // Paddle checkout feedback + post-purchase credit reconciliation. The whole
  // mechanism (event bridge, poll, focus catch-up, late-landing detection) is
  // hooks/useCreditGrantPoll.ts, shared with /pricing so the two surfaces
  // cannot drift. `initialCredits` seeds it; `credits` is the live balance
  // (server prop, or a post-purchase read published on lib/credits-bus.ts) and
  // is what the out-of-credits gate below must read, so a purchase made at zero
  // flips the bar back to Generate without a server re-render.
  const { checkoutStatus, setCheckoutStatus, credits } = useCreditGrantPoll(initialCredits)

  // Which product is opening, from the click until Paddle's overlay is up (or
  // the attempt failed). Both CTAs disable so the dynamic-import + CDN
  // round-trip cannot be clicked through twice, but only the clicked one shows
  // the pending label. lib/checkout.ts holds the real interlock (see there).
  const [checkoutPending, setCheckoutPending] = useState<'sub' | 'pack' | null>(null)

  // Reuses the SAME openCheckout from lib/checkout.ts as the pricing page (no
  // duplicated checkout logic). userId is the server-provided prop, so it is
  // non-null at click time; openCheckout's null guard stays as a harmless backstop.
  const handlePaid = async (kind: 'sub' | 'pack') => {
    if (checkoutPending) return
    setCheckoutPending(kind)
    setCheckoutStatus(null)
    try {
      await openCheckout({ kind, userId, navigate: (path) => router.push(path) })
    } catch (err) {
      // Paddle.js failed to load. Previously `void`-ed, so the button silently
      // did nothing and every later click in the session failed the same way.
      console.error('Checkout: Paddle failed to load', err)
      setCheckoutStatus('error')
    } finally {
      setCheckoutPending(null)
    }
  }

  // Camera Support
  const [showCamera, setShowCamera] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const openCamera = async () => {
    if (isNative) {
      try {
        const photo = await takePicture();
        if (photo) {
          setPreview(photo);
          setError(nextDashboardError({ kind: 'input-changed' }));
          setResults(null);
        }
      } catch (err) {
        // Backing out of the native camera throws through this same channel.
        // Telling that user their camera permission was denied would be a lie,
        // and one they would now SEE. See isCameraCancellation.
        if (isCameraCancellation(err)) return;
        setError(nextDashboardError({ kind: 'capture-failed', message: t('dash.cameraError') }));
      }
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })
      setStream(mediaStream)
      setShowCamera(true)
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
        }
      }, 100)
    } catch (err) {
      setError(nextDashboardError({ kind: 'capture-failed', message: t('dash.cameraError') }))
    }
  }

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    setPreview(dataUrl)
    // A photo taken after a denied-then-granted permission prompt must not land
    // under a stale "camera access denied" banner.
    setError(nextDashboardError({ kind: 'input-changed' }))
    closeCamera()
  }

  const closeCamera = () => {
    stream?.getTracks().forEach(track => track.stop())
    setStream(null)
    setShowCamera(false)
  }

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  // The banner sits at the top of the page, but the Generate button that raises
  // it is at the bottom of the input card and, on a phone, well below the
  // fold. Without this the fix would be invisible on exactly the surface that
  // matters most. Same mechanism the chat above already uses.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

  // MUST run after commit, never inline after setResults. The results zone
  // renders ABOVE the input card, so a first generation inserts ~2400px above
  // a user who is down at the Generate button. Scrolling before React commits
  // moves the OLD, shorter document; the browser then applies scroll anchoring
  // to the inserted content and pushes them straight back down. Measured at
  // 500x861: the inline version settled at y1118 instead of 0.
  //
  // MUST ALSO STAY DECLARED AFTER the chatHistory effect above. handleGenerate
  // calls setResults and setChatHistory in the same handler, so React batches
  // them into one commit and runs both effects in declaration order. The chat
  // effect scrolls to the bottom of the refine console; this one has to be
  // issued second to win. Measured on the shipped order, a successful generate
  // ended at y2500 — the console — having scrolled the user PAST the results
  // they had just paid a credit for.
  useEffect(() => {
    if (!results || !scrollToResults.current) return
    scrollToResults.current = false
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [results])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      // DECODE sanity only — not the payload guard. The payload is bounded by
      // prepareImageForUpload at the generate call site, which downscales
      // instead of refusing; this only has to stop something too large to
      // decode without exhausting a phone WebView's memory.
      if (selectedFile.size > MAX_SOURCE_FILE_BYTES) {
        setError(nextDashboardError({ kind: 'input-rejected', message: t('dash.filesizeError') }))
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result as string)
      }
      reader.readAsDataURL(selectedFile)
      setError(nextDashboardError({ kind: 'input-changed' }))
      setResults(null)
    }
  }

  const handleGenerate = async () => {
    if (!preview) return

    setLoading(true)
    setError(nextDashboardError({ kind: 'attempt-started' }))

    try {
      // THE choke point. `preview` stays full-size so the on-screen image is not
      // degraded; only what goes on the wire is bounded. All three inputs —
      // upload, webcam canvas, native camera — converge here, so none of them
      // carries a size guard of its own. See lib/prepare-image.ts.
      const image = await prepareImageForUpload(preview)

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image,
          lang: lang
        }),
      })

      // Check the status BEFORE parsing. Vercel's platform errors (413, 502, …)
      // are text/plain, so parsing first turned them into a raw SyntaxError and
      // hid the real status. See @/lib/api-error.
      if (!response.ok) {
        // UserFacingError, not Error: the catch below shows this message, and
        // only a message we translated ourselves may be shown. See toUserMessage.
        throw new UserFacingError(await resolveApiError(response, t))
      }

      const data = await response.json()

      // Recalling a past generation already scrolls to top, and the error banner
      // scrolls itself into view for the same stated reason — the success path
      // never did, and now it must: the results zone renders above this button.
      scrollToResults.current = true
      setResults(data)

      // NO router.refresh() here, and none after refine. It used to carry two
      // things — the new history row and the spent credit — by re-rendering the
      // server tree. On this Next.js version the first refresh after this page
      // mounts REMOUNTS it (measured live, 2026-09-26), which threw away `results`
      // the instant they appeared: the user paid a credit and watched the answer
      // vanish. Both things now arrive without a re-render: the row is built
      // here from what we already hold (the server list replaces it on the next
      // visit), and the balance is read and published on lib/credits-bus.ts,
      // which the navbar counter and the out-of-credits gate both follow.
      setHistory((prev) => prependGeneration(prev, localGenerationRow(data, preview)))
      void refreshCredits()

      setChatHistory(prev => [...prev, {
        role: 'ai',
        message: t('dash.analysisComplete'),
        timestamp: new Date()
      }])
    } catch (err) {
      // The ONLY user-visible outcome of a failed generate. Before this branch
      // was rendered, a 429 or 503 here produced nothing at all on screen.
      setError(nextDashboardError({ kind: 'attempt-failed', message: toUserMessage(err, t) }))
    } finally {
      setLoading(false)
    }
  }

  const handleRefine = async (instruction?: string) => {
    const finalInstruction = instruction || refineInput
    if (!results || !finalInstruction.trim()) return

    setIsRefining(true)
    setError(nextDashboardError({ kind: 'attempt-started' }))

    // Add user message to chat history
    const userMsg: ChatMessage = {
      role: 'user',
      message: finalInstruction,
      timestamp: new Date()
    }
    setChatHistory(prev => [...prev, userMsg])

    try {
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentContent: results,
          instruction: finalInstruction,
          lang: lang
        }),
      })

      // Check the status BEFORE parsing. Vercel's platform errors (413, 502, …)
      // are text/plain, so parsing first turned them into a raw SyntaxError and
      // hid the real status. See @/lib/api-error.
      if (!response.ok) {
        // 403 keeps its bespoke chat-message UI rather than raising. (403 is
        // never `ok`, so this branch is reached exactly as often as before.)
        if (response.status === 403) {
          setChatHistory(prev => [...prev, {
            role: 'ai',
            // Native surface must not steer to upgrade/website (Play policy);
            // web keeps the existing steering copy. isNative is server-seeded.
            message: isNative ? t('dash.noCreditsNeutral') : t('dash.noCredits'),
            timestamp: new Date()
          }])
          return
        }
        throw new UserFacingError(await resolveApiError(response, t))
      }

      const data = await response.json()

      setResults(data)
      setRefineInput('')
      // Refine writes no history row; the only thing the old refresh carried was
      // the spent credit. See the note in handleGenerate for why no refresh.
      void refreshCredits()

      // Add AI response to chat history
      setChatHistory(prev => [...prev, {
        role: 'ai',
        message: t('dash.refineSuccess'),
        timestamp: new Date()
      }])
    } catch (err) {
      // DELIBERATELY does not write `error`. Refine already has a purpose-built
      // surface for its own failures: the console the user is looking at, where
      // the reply lands in the turn they just took. Also raising the page-level
      // banner would report one failure twice, in two different wordings (bare
      // message up there, dash.error template down here), and would leave the
      // user's message with no reply if they scrolled. The banner is for the
      // paths that have no other surface.
      setChatHistory(prev => [...prev, {
        role: 'ai',
        // Shown AS WRITTEN, exactly as the generate path shows it. Every message
        // that can arrive here is already a complete, translated sentence, so
        // wrapping it in a template appended advice ("try a different
        // instruction") that was correct for at most one of the nine failures
        // that reach this catch, and wrong for a busy model, an oversize image
        // and a dropped connection. It also produced a doubled full stop in both
        // languages, because every message already ends in one.
        message: toUserMessage(err, t),
        timestamp: new Date()
      }])
    } finally {
      setIsRefining(false)
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopySuccess(id)
    setTimeout(() => setCopySuccess(null), 2000)
  }

  // Recalling a past generation replaces the image on screen, so a banner
  // about the previous one is stale.
  const recallGeneration = (item: Generation) => {
    setResults(item.content)
    setPreview(item.image_url)
    setError(nextDashboardError({ kind: 'input-changed' }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // The ONLY reset in the app — the sole setPreview(null) outside initial
  // state. The file input and the camera live in the other branch of the input
  // card, reachable only while `preview` is null, so the card must never be
  // hidden once `results` is set: that would strand the user on one generation
  // per page load with no way back except reloading.
  const clearPhoto = () => {
    setPreview(null)
    setResults(null)
    setError(nextDashboardError({ kind: 'input-changed' }))
  }

  // --- MOCKUP COMPONENTS ---
  // Store previews carry NO price, no rating count and no shipping or returns
  // claim: every such figure was invented, and a store mock-up that states one
  // is a fake listing. What they show is the generated copy in a store's frame.
  const AmazonMockup = () => (
    <div className="bg-white text-[#111] p-4 sm:p-8 rounded-2xl shadow-2xl font-sans max-w-4xl mx-auto border border-zinc-200 overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="aspect-square rounded-xl overflow-hidden bg-white border border-zinc-100 p-4">
            <img src={preview!} alt="Amazon Product" className="w-full h-full object-contain" />
          </div>
        </div>
        <div className="space-y-4">
          <h1 className="text-2xl font-medium leading-tight text-[#111]">
            {results?.seoTitle}
          </h1>
          <div className="flex items-center gap-1 text-[#007185] text-sm hover:underline cursor-pointer">
            {t('dash.visitStore')}
          </div>
          <div className="border-t border-zinc-200 pt-4 space-y-2">
            <h3 className="font-bold text-sm">{t('dash.aboutItem')}</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-800">
              {results?.amazonBullets?.map((bullet, i) => (
                <li key={i}>{bullet}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-2 pt-4">
            <Button className="w-full bg-[#FFD814] hover:bg-[#F7CA00] text-black border-none rounded-full shadow-sm py-6">
              {t('dash.addToCart')}
            </Button>
            <Button className="w-full bg-[#FFA41C] hover:bg-[#FA8900] text-black border-none rounded-full shadow-sm py-6">
              {t('dash.buyNow')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  const ShopifyMockup = () => (
    <div className="bg-white text-zinc-900 min-h-[600px] rounded-2xl shadow-2xl overflow-hidden font-sans border border-zinc-100">
      <nav className="border-b border-zinc-100 p-6 flex justify-between items-center bg-white">
        <div className="text-xl font-bold tracking-tighter flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-violet-600" />
          MODERN STORE
        </div>
        <div className="hidden sm:flex gap-6 text-sm font-medium text-zinc-600">
          <span>Shop All</span>
          <span>Our Story</span>
          <span>Contact</span>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto p-5 sm:p-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-start">
          <div className="aspect-[4/5] bg-zinc-50 rounded-2xl overflow-hidden shadow-inner border border-zinc-100">
            <img src={preview!} alt="Shopify Product" className="w-full h-full object-cover" />
          </div>
          <div className="space-y-8">
            <div className="space-y-2">
              <span className="text-violet-600 font-semibold tracking-widest text-xs uppercase">{t('dash.newArrival')}</span>
              {/* No tracking-* here: this renders GENERATED text, which is Arabic whenever the user
                  generated in Arabic — independent of the UI language. The global RTL guard keys on
                  the wrapper's dir, so it does not fire on the English surface and the tracking lands
                  on joined Arabic glyphs. Measured on the history title: -0.4px under the English UI. */}
              <h1 className="text-2xl sm:text-4xl font-bold text-zinc-900 break-words">{results?.seoTitle}</h1>
            </div>

            <div className="prose prose-zinc max-w-none prose-p:text-zinc-600 prose-headings:text-zinc-900">
              {results?.shopifyHtml ? (
                <div dangerouslySetInnerHTML={{ __html: sanitizeModelHtml(results.shopifyHtml) }} />
              ) : (
                <p>{results?.productDescription}</p>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1 space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-zinc-400">{t('dash.tab.quantity')}</label>
                  <div className="h-12 border border-zinc-200 rounded-xl flex items-center justify-center font-medium">1</div>
                </div>
                <div className="flex-[2] space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-zinc-400">{t('dash.tab.variant')}</label>
                  <div className="h-12 border border-zinc-200 rounded-xl flex items-center px-4 justify-between font-medium">
                    {t('dash.tab.standard')}
                    <ChevronDown className="w-4 h-4 text-zinc-400" />
                  </div>
                </div>
              </div>
              <Button
                className="w-full py-7 text-lg font-bold rounded-2xl bg-violet-600 hover:bg-violet-500 text-white shadow-xl shadow-violet-500/20 transition-all hover:-translate-y-1 border-none"
              >
                {t('dash.addToCart').toUpperCase()}
              </Button>
              <div className="flex items-center justify-center gap-2 text-xs text-zinc-400 font-medium pt-2">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                {t('dash.fastShipping')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // No platform column: the picker is gone, and a column that read "amazon"
  // for every row described the picker's default, not the listing.
  const downloadCSV = (data: Generation[], filename: string) => {
    const headers = [
      'SEO Title', 'Meta Description', 'Product Description', 'Social Media Tags',
      'Shopify HTML', 'Amazon Bullet 1', 'Amazon Bullet 2', 'Amazon Bullet 3', 'Amazon Bullet 4', 'Amazon Bullet 5',
      'Material', 'Dominant Color', 'Target Audience', 'Care Instructions',
      'Viral Hook', 'Viral Concept',
      'Created At'
    ]
    const rows = data.map(item => [
      item.content.seoTitle || '',
      item.content.metaDescription || '',
      item.content.productDescription || '',
      item.content.socialMediaTags?.join('; ') || '',
      item.content.shopifyHtml || '',
      item.content.amazonBullets?.[0] || '',
      item.content.amazonBullets?.[1] || '',
      item.content.amazonBullets?.[2] || '',
      item.content.amazonBullets?.[3] || '',
      item.content.amazonBullets?.[4] || '',
      item.content.structuredData?.material || '',
      item.content.structuredData?.dominantColor || '',
      item.content.structuredData?.targetAudience || '',
      item.content.structuredData?.careInstructions || '',
      item.content.viralScript?.hook || '',
      item.content.viralScript?.concept || '',
      new Date(item.created_at).toLocaleString()
    ])

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  /* THE PRIMARY ACTION — ONE decision, TWO render sites, mutually exclusive by
     construction: in flow inside the input card once `results` exist, in the
     fixed bar while `preview && !results`. It is never rendered twice — two
     Generate buttons would be a defect in the UI and would also make any
     querySelector/.find() probe silently measure whichever came first.

     The GATING lives here, not in the presentation: `allowPurchase` is passed
     EXPLICITLY at each site rather than inferred from `results`, so this control
     never depends on a gate written hundreds of lines away. The box becomes a
     purchase ONLY in the bar, ONLY on web, ONLY at zero credits. `!isNative` is
     the Android architecture, not a preference: that build ships payment-free,
     so on a Play install the purchase kind must never exist and the neutral
     out-of-credits kind renders instead — with copy that steers nowhere. */
  const primaryProps = ({ allowPurchase }: { allowPurchase: boolean }): PrimaryActionProps => {
    const outOfCredits = credits <= 0
    const purchaseHere = allowPurchase && outOfCredits && !isNative
    const busy = checkoutPending !== null
    if (loading) {
      return { kind: 'loading', label: t('dash.analyzing'), disabled: true, onClick: () => {} }
    }
    if (purchaseHere) {
      return {
        kind: 'purchase',
        label: busy ? t('checkout.pending') : t('dash.cta.pack'),
        disabled: busy,
        onClick: () => void handlePaid('pack'),
      }
    }
    if (outOfCredits) {
      return {
        kind: 'limit',
        // NATIVE: neutral, steers nowhere (Play policy). Do not swap this for
        // dash.noCredits, which upsells. WEB: may steer to purchase. Same key
        // and the same ternary shape as the refine 403 branch above, so the two
        // out-of-credits surfaces cannot drift apart.
        label: isNative ? t('dash.limitReached') : t('dash.noCredits'),
        disabled: true,
        onClick: () => {},
      }
    }
    return { kind: 'generate', label: t('dash.generate'), disabled: false, onClick: () => void handleGenerate() }
  }

  return (
    <div className="min-h-screen bg-[#070710] text-[#c8cfe0] selection:bg-brand/30 selection:text-white px-4 py-8 md:px-8">
      <div className="max-w-7xl mx-auto space-y-12 relative z-10">

        {/* Banner row. Both banners share ONE container + tone vocabulary, held
            in lib/dashboard-banner.ts, so the error state cannot drift into a
            second visual language. They can co-exist: a checkout outcome and a
            failed generate are unrelated events and suppressing either would
            lose information. */}
        {checkoutStatus && (
          <div className={bannerToneClass(checkoutBannerTone(checkoutStatus))}>
            {checkoutStatus === 'success'
              ? t('pricing.banner.success')
              : checkoutStatus === 'confirmed'
                ? t('pricing.banner.confirmed')
                : checkoutStatus === 'success_pending'
                  ? t('pricing.banner.successPending')
                  : checkoutStatus === 'error'
                    ? t('pricing.banner.error')
                    : t('pricing.banner.failed')}
          </div>
        )}

        {/* `error` is ALREADY translated at every write site (see toUserMessage),
            so no copy is composed here. */}
        {error && (
          <div ref={errorRef} role="alert" aria-live="assertive" className={bannerToneClass(ERROR_BANNER_TONE)}>
            {error}
          </div>
        )}

        {/* RESULTS & REFINE CONSOLE

            Deliberately ABOVE the input card below it. A generation leaves
            `preview` set, so both render at once; with the input first, the
            generated title sat about a screen below the fold on a phone.
            DOM order, NOT `order:` on a flex parent: visual order has to match
            reading and tab order. The companion change is the scrollTo in
            handleGenerate: without it a fresh generation inserts this block
            above the user, who is down at the Generate button. */}
        {results && (
           <div className="grid lg:grid-cols-[1fr,360px] gap-8 items-start">
              <div className="min-w-0 space-y-6">
                    {/* The generated product page. Presentation only: every piece of
                        state and every handler stays in this file and is passed down. */}
                    <ResultsPanel
                      results={results}
                      t={t}
                      copiedId={copySuccess}
                      onCopy={copyToClipboard}
                      previewSlot={
                        <>
                          <section className="space-y-6">
                             <div className="flex items-center gap-3">
                                <div className="p-2 bg-orange-500/20 rounded-lg"><ShoppingBag className="w-5 h-5 text-orange-400" /></div>
                                <h2 className="text-base font-black text-white uppercase">{t('dash.amazon.live')}</h2>
                             </div>
                             <AmazonMockup />
                          </section>
                          <section className="space-y-6">
                             <div className="flex items-center gap-3">
                                <div className="p-2 bg-green-500/20 rounded-lg"><Store className="w-5 h-5 text-green-400" /></div>
                                <h2 className="text-base font-black text-white uppercase">{t('dash.shopify.live')}</h2>
                             </div>
                             <ShopifyMockup />
                          </section>
                        </>
                      }
                    />
              </div>

              {/* REFINE CONSOLE */}
              <div className="min-w-0 space-y-6">
                  <div className="flex items-center justify-between px-2">
                     <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white flex items-center gap-2">
                        <MessagesSquare className="w-4 h-4 text-violet-500" />
                        {t('dash.stealthConsole')}
                     </h3>
                  </div>

                  <Card className="bg-black/60 border border-white/5 rounded-[2rem] flex flex-col h-[650px] overflow-hidden shadow-2xl">
                     {/* Chat History Area */}
                     <div className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar scroll-smooth">
                        {chatHistory.map((msg, i) => (
                          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                             <div className={`max-w-[85%] p-4 rounded-2xl text-xs font-medium leading-relaxed ${
                               msg.role === 'user'
                               ? 'bg-violet-600 text-white rounded-tr-none shadow-[0_0_15px_rgba(124,58,237,0.3)]'
                               : 'bg-white/5 border border-white/10 text-slate-300 rounded-tl-none backdrop-blur-xl'
                             }`}>
                                {msg.message}
                             </div>
                             <span className="text-xs font-black text-slate-600 uppercase mt-2 px-1 tracking-widest">
                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {msg.role === 'user' ? t('dash.vectorSent') : t('dash.matrixRefined')}
                             </span>
                          </div>
                        ))}
                        <div ref={chatEndRef} />
                     </div>

                     {/* Console Input Area */}
                     <div className="p-6 bg-white/[0.02] border-t border-white/5 space-y-6">
                        <div className="flex flex-wrap gap-2">
                           {[
                             { l: t('dash.refine.prof'), v: t('dash.refine.prof.v') },
                             { l: t('dash.refine.short'), v: t('dash.refine.short.v') },
                             { l: t('dash.refine.luxury'), v: t('dash.refine.luxury.v') },
                             { l: t('dash.refine.gulf'), v: t('dash.refine.gulf.v') }
                           ].map(c => (
                             <button
                               key={c.l}
                               onClick={() => handleRefine(c.v)}
                               disabled={isRefining}
                               className="px-3 py-1.5 bg-white/5 border border-white/5 rounded-lg text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white hover:border-violet-500/50 transition-all active:scale-95 disabled:opacity-50"
                             >
                               {c.l}
                             </button>
                           ))}
                        </div>

                        <div className="relative">
                           <input
                             value={refineInput}
                             onChange={(e) => setRefineInput(e.target.value)}
                             onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                             placeholder={isRefining ? t('dash.processing') : t('dash.enterVector')}
                             disabled={isRefining}
                             className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-5 pr-14 text-xs font-medium text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 transition-all disabled:opacity-50"
                           />
                           <button
                             onClick={() => handleRefine()}
                             disabled={isRefining || !refineInput.trim()}
                             className="absolute right-2 top-2 w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:bg-slate-800"
                           >
                              {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                           </button>
                        </div>
                     </div>
                  </Card>
              </div>
           </div>
        )}

        {/* PURCHASE BAND — the two-CTA pair, and the only place BOTH tiers are offered.
            Renders once, here, after the user has read the output. `results &&` is
            load-bearing: on the pre-generation screen there is nothing to have been
            convinced by.

            ONE ACTION, NEVER TWO ON A SCREEN. A second purchase call site exists:
            the fixed bar's primary action, offering the pack tier alone. The two can
            never co-render — this block requires `results`, that bar requires
            `preview && !results` — and that exclusivity is the whole reason the rule
            still holds. Break the exclusivity, break both.

            `!isNative` per the Android architecture: the app ships payment-free, so on
            every Play install this block does not exist and the screen simply ends at
            the results. */}
        {results && !isNative && (
          <div className="border-y border-white/10 bg-white/[0.02] px-4 py-6 space-y-4">
            <span className="block text-xs font-black uppercase tracking-widest text-slate-500">{t('dash.addCredits')}</span>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => void handlePaid('pack')}
                disabled={checkoutPending !== null}
                aria-busy={checkoutPending === 'pack'}
                className="h-12 rounded-xl border border-white/20 text-[#c8cfe0] hover:border-white/40 hover:text-white text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkoutPending === 'pack' ? t('checkout.pending') : t('dash.cta.pack')}
              </button>
              <button
                type="button"
                onClick={() => void handlePaid('sub')}
                disabled={checkoutPending !== null}
                aria-busy={checkoutPending === 'sub'}
                className="h-12 rounded-xl bg-brand hover:bg-brand/90 text-white text-xs font-black uppercase tracking-widest shadow-glow-brand transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkoutPending === 'sub' ? t('checkout.pending') : t('dash.cta.sub')}
              </button>
            </div>
            {/* Merchant-of-record disclosure. Lives inside this block's
                `results && !isNative` gate on purpose — it is payment copy and
                must never exist on a Play install. The fixed-bar pack button
                carries no disclosure: that control is a fixed-height nowrap box
                with nothing to give. */}
            <p className="text-xs leading-relaxed text-slate-500">
              {t('checkout.mor')}{' '}
              <Link href="/refund" className="underline underline-offset-4 hover:text-white transition-colors">
                {t('refund.title')}
              </Link>
            </p>
          </div>
        )}

        {/* INPUT CARD. Presentation only; every handler is defined above. The
            primary action is passed in only once results exist — before that the
            fixed bar at the foot of the viewport carries it (see below). */}
        <InputPanel
          t={t}
          preview={preview}
          loading={loading}
          hotspots={results?.hotspots}
          onFileChange={handleFileChange}
          onOpenCamera={openCamera}
          onClear={clearPhoto}
          action={results ? <PrimaryAction {...primaryProps({ allowPurchase: false })} /> : null}
        />

        {/* HISTORY. Presentation only. */}
        <HistoryPanel
          t={t}
          rows={history}
          onRecall={recallGeneration}
          onExport={() => downloadCSV(history, `unicornapps-export-${new Date().toISOString().split('T')[0]}.csv`)}
        />

        {/* WEB CAMERA. The native path never renders this: takePicture opens the
            system camera app instead. */}
        {showCamera && (
          <CameraModal t={t} videoRef={videoRef} canvasRef={canvasRef} onCapture={capturePhoto} onClose={closeCamera} />
        )}
      </div>

      {/* PINNED PRIMARY ACTION — PRE-GENERATION SCREEN ONLY.
          Rendered when a photo is chosen and no result exists yet: the one screen with a
          single pending action and nothing competing. NOT on the entry screen (no action
          yet), NOT on the results surface (a bar pinned over a result competes with the
          most valuable thing on the page), NOT on history.

          IT STAYS OUT HERE, A SIBLING OF THE max-w-7xl WRAPPER, so nothing on its
          ancestor chain sets transform, filter, perspective, contain or
          backdrop-filter and the viewport stays its containing block.

          The spacer below is the compensation: without it the last element in flow
          sits underneath the bar. Its height mirrors the bar's box — keep the two
          expressions in step, they are deliberately adjacent. */}
      {preview && !results && (
        <>
          {/* THE SAFE AREA IS ADDITIVE, NEVER calc(base + env(...)).
              globals.css states the rule and its failure mode: a browser without env()
              support drops the WHOLE declaration as invalid, so folding the base into a
              calc() alongside env() destroys the base too and collapses the layout.
              So the base lives in a Tailwind class and the inset is a SEPARATE property
              on a separate declaration, exactly like the pt-safe/mt-safe pairs already in
              globals.css. If env() is unsupported the inset contributes nothing and the
              layout degrades to the 105px base instead of breaking.
              105px = 12 (pt-3) + 80 (h-20 button) + 12 (pb-3) + 1 (border-t).
              `mb-safe` here and the `pb-safe` child inside the bar are the SAME inset, so
              the spacer and the bar grow together. Keep the two in step — they are
              adjacent deliberately. */}
          <div aria-hidden className="h-[105px] mb-safe" />
          <div className="fixed bottom-0 start-0 end-0 z-40 bg-[#070710]/95 border-t border-white/10 px-4 pt-3 pb-3">
            <div className="max-w-7xl mx-auto">
              <PrimaryAction {...primaryProps({ allowPurchase: true })} />
            </div>
            {/* zero-height; carries ONLY the inset, so it adds to pb-3 rather than
                replacing it and vanishes cleanly when env() is unsupported */}
            <div aria-hidden className="pb-safe" />
          </div>
        </>
      )}
    </div>
  )
}
