'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  History,
  FileDown,
  CreditCard as CreditCardIcon,
  Sparkles,
  Send,
  MessagesSquare,
  Monitor,
  Layout,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  ShoppingBag,
  Copy,
  ZapIcon,
  Smile,
  ArrowRight,
  Play,
  Globe,
  BadgeCheck,
  Database,
  Smartphone,
  Store,
  User as UserIcon,
  Clock,
  Trash2,
  Maximize2,
  Camera,
  X
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

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
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<GeneratedContent | null>(null)
  // Rendered by the banner row, which is now the FIRST element in the page container:
  // the credits header bar that used to sit above it is gone. Every write goes through
  // nextDashboardError so the clearing rules stay in one place (lib/dashboard-banner.ts).
  const [error, setError] = useState<string | null>(null)
  const [copySuccess, setCopySuccess] = useState<string | null>(null)
  const [history, setHistory] = useState<Generation[]>(initialHistory)
  // 'preview' joined this union when the raw/live-preview selector was folded into
  // the destination grid. It is a sixth destination, not a second mode, so there is
  // one piece of state describing what the user is looking at instead of two.
  const [activeTab, setActiveTab] = useState<'seo' | 'shopify' | 'amazon' | 'social' | 'data' | 'preview'>('seo')
  
  // Royal Obsidian State
  const [selectedPlatform, setSelectedPlatform] = useState('amazon')
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { 
      role: 'ai', 
      message: t('dash.matrixInit'), 
      timestamp: new Date() 
    }
  ])
  const [refineInput, setRefineInput] = useState('')
  const [isRefining, setIsRefining] = useState(false)
  const [shopifyViewMode, setShopifyViewMode] = useState<'preview' | 'code'>('preview')
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
          setFile(null);
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
  // it is at the bottom of the right-hand column and, on a phone, well below the
  // fold. Without this the fix would be invisible on exactly the surface that
  // matters most. Same mechanism the chat above already uses.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

  // MUST run after commit, never inline after setResults. The results zone
  // renders ABOVE the upload zone, so a first generation inserts ~2400px above
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

  const platforms = [
    { id: 'amazon', label: t('dash.tab.amazon'), emoji: '🛒', color: 'orange' },
    { id: 'shopify', label: t('dash.tab.shopify'), emoji: '🏪', color: 'green' },
    { id: 'instagram', label: 'Instagram', emoji: '📱', color: 'pink' },
    { id: 'tiktok', label: 'TikTok', emoji: '🎵', color: 'red' },
  ]

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      // DECODE sanity only — no longer the payload guard. This used to be
      // 4 * 1024 * 1024, compared against the raw File.size, which is the wrong
      // quantity: what crosses the wire is the base64 data URL, ~1.37x larger,
      // so the check admitted payloads over Vercel's 4.5 MB limit while
      // rejecting files that were perfectly sendable. The payload is now bounded
      // by prepareImageForUpload at the generate call site, which downscales
      // instead of refusing, so this only has to stop something too large to
      // decode without exhausting a phone WebView's memory.
      if (selectedFile.size > MAX_SOURCE_FILE_BYTES) {
        setError(nextDashboardError({ kind: 'input-rejected', message: t('dash.filesizeError') }))
        return
      }
      setFile(selectedFile)
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
          platform: selectedPlatform,
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
      setHistory((prev) =>
        prependGeneration(prev, localGenerationRow(data, preview, selectedPlatform))
      )
      void refreshCredits()

      setChatHistory(prev => [...prev, {
        role: 'ai',
        message: t('dash.analysisComplete').replace('{platform}', selectedPlatform.toUpperCase()),
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

  const platformBadge = (platform?: string) => {
    if (platform === 'shopify') return 'bg-green-500/20 text-green-400 border-green-500/30'
    if (platform === 'instagram') return 'bg-pink-500/20 text-pink-400 border-pink-500/30'
    if (platform === 'tiktok') return 'bg-red-500/20 text-red-400 border-red-500/30'
    return 'bg-orange-500/20 text-orange-400 border-orange-500/30' // amazon default
  }

  // --- MOCKUP COMPONENTS (KEPT AS IS) ---
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
          <div className="flex items-center gap-2">
            <div className="flex text-[#FFA41C]">
              {[1, 2, 3, 4, 5].map((s) => (
                <span key={s}>★</span>
              ))}
            </div>
            <span className="text-[#007185] text-sm">42 ratings</span>
          </div>
          <div className="border-t border-zinc-200 pt-4">
            <p className="text-2xl font-light">$129.99</p>
            <p className="text-sm text-zinc-500">FREE Returns</p>
          </div>
          <div className="space-y-2">
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
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="aspect-[4/5] bg-zinc-50 rounded-2xl overflow-hidden shadow-inner border border-zinc-100"
          >
            <img src={preview!} alt="Shopify Product" className="w-full h-full object-cover" />
          </motion.div>
          <div className="space-y-8">
            <div className="space-y-2">
              <span className="text-violet-600 font-semibold tracking-widest text-xs uppercase">{t('dash.newArrival')}</span>
                            {/* No tracking-* here: this renders GENERATED text, which is Arabic whenever the user
                  generated in Arabic — independent of the UI language. The global RTL guard keys on
                  the wrapper's dir, so it does not fire on the English surface and the tracking lands
                  on joined Arabic glyphs. Measured on the history title: -0.4px under the English UI. */}
              <h1 className="text-2xl sm:text-4xl font-bold text-zinc-900 break-words">{results?.seoTitle}</h1>
              <p className="text-2xl text-zinc-500 font-light">$99.00 USD</p>
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

  const downloadCSV = (data: Generation[], filename: string) => {
    const headers = [
      'Platform', 'SEO Title', 'Meta Description', 'Product Description', 'Social Media Tags',
      'Shopify HTML', 'Amazon Bullet 1', 'Amazon Bullet 2', 'Amazon Bullet 3', 'Amazon Bullet 4', 'Amazon Bullet 5',
      'Material', 'Dominant Color', 'Target Audience', 'Care Instructions',
      'Viral Hook', 'Viral Concept',
      'Created At'
    ]
    const rows = data.map(item => [
      item.platform || 'amazon',
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

  /* THE PRIMARY ACTION, DEFINED ONCE AND RENDERED IN EXACTLY ONE PLACE.
     On the pre-generation screen it lives in the fixed bar at the foot of the
     viewport; once `results` exist it returns to the flow, under the controls,
     so re-generating after a result still works. It is never rendered twice —
     two Generate buttons would be a defect in the UI and would also make any
     `querySelector`/`.find()` probe silently measure whichever came first. */
  // PRIMARY ACTION — ONE definition, TWO render sites, and they are mutually exclusive
  // by construction: in flow once `results` exist, in the fixed bar while
  // `preview && !results`. `allowPurchase` is passed EXPLICITLY at each site rather than
  // inferred from `results`, so this control never depends on a gate written hundreds of
  // lines away that a later edit could quietly move out from under it.
  const primaryAction = ({ allowPurchase }: { allowPurchase: boolean }) => {
    const outOfCredits = credits <= 0
    // The box becomes a purchase ONLY in the bar, ONLY on web, ONLY at zero credits.
    // `!isNative` is the Android architecture, not a preference: that build ships
    // payment-free, so on a Play install this branch must never exist and the neutral
    // out-of-credits state below renders instead.
    const purchaseHere = allowPurchase && outOfCredits && !isNative
    const busy = checkoutPending !== null
    return (
    <Button
      onClick={purchaseHere ? () => void handlePaid('pack') : handleGenerate}
      disabled={loading || (purchaseHere ? busy : outOfCredits)}
      className={`w-full h-20 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-500 group relative overflow-hidden ${
        loading 
        ? 'bg-black border border-violet-500/50' 
        : (outOfCredits && !purchaseHere)
          ? 'bg-red-500/10 border border-red-500/20 text-red-400' 
          : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_40px_-5px_rgba(124,58,237,0.5)]'
      }`}
    >
       {loading ? (
         <div className="relative z-10 flex flex-col items-center">
            <span className="text-xs font-black uppercase tracking-[0.3em] text-violet-400 animate-pulse">
              {t('dash.analyzing')}
            </span>
            <div className="mt-2 w-48 h-1 bg-white/5 rounded-full overflow-hidden">
               <motion.div className="h-full bg-violet-500" animate={{ x: ['-100%', '100%'] }} transition={{ repeat: Infinity, duration: 1.5 }} />
            </div>
         </div>
       ) : purchaseHere ? (
          <>
            {/* The SAME 16px nowrap row as the generate label below, for the same reason:
                this box is w-full h-20 overflow-hidden, so a control cannot reflow out of
                trouble. Measured at vw 500, the narrowest this box ever gets. Do NOT raise
                it to the 32px step, and do not buy room by shortening the price — the
                price is the part the user needs before tapping, not after. */}
            <span className="relative z-10 text-base leading-[1.15] font-black uppercase flex items-center gap-2">
              <CreditCardIcon className="w-5 h-5" />
              {busy ? t('checkout.pending') : t('dash.cta.pack')}
            </span>
            <div className="absolute inset-0 bg-gradient-to-t from-black/0 via-white/10 to-black/0 translate-y-[-100%] group-hover:translate-y-[100%] transition-transform duration-1000" />
          </>
       ) : outOfCredits ? (
          <div className="flex flex-col items-center gap-3">
             <AlertCircle className="w-5 h-5 text-red-500/50" />
             <p className="text-xs font-medium text-slate-500 uppercase tracking-widest text-center px-2">
               {isNative
                 // NATIVE: neutral, steers nowhere (Play policy). Do not
                 // swap this for dash.noCredits, which upsells.
                 ? t('dash.limitReached')
                 // WEB: may steer to purchase. Same key, same ternary shape
                 // as the refine 403 branch above, so the two out-of-credits
                 // surfaces can no longer drift apart. Was hardcoded English
                 // (rendered untranslated on the Arabic surface) AND pointed
                 // web users at "the official UnicornApps website", which is
                 // the site they are already on.
                 : t('dash.noCredits')}
             </p>
          </div>
       ) : (
         <>
            {/* 🔴 THE HERO STEP IS FOR CONTENT, NOT FOR CONTROLS — content can
                reflow, a control cannot. This label sat at the ladder's 32px top
                step and CLIPPED: the button above is w-full h-20 overflow-hidden
                with a nowrap flex row, so there is nothing to give. Measured at
                vw 500, below every breakpoint and the narrowest this button ever
                gets: inner box 339px, and icon 20 + gap 8 + the English label at
                32px = 369px. The sparkle was cut in half on the left and
                the final T of CONTENT sliced on the right. At 16px the same row
                measures 199px, a 140px margin that survives a longer string or a
                new locale. The other three 32px sites are content and absorb the
                pressure by wrapping; this one had no such move.
                Do NOT raise this back to a large step to "finish" the ladder, and
                do not buy the room by cutting a word — the Arabic string at :506
                was shortened because the short form is the FAITHFUL translation,
                not to make it fit, and that distinction is the whole reason it
                was acceptable. */}
            <span className="relative z-10 text-base leading-[1.15] font-black uppercase flex items-center gap-2">
              <Sparkles className="w-5 h-5 animate-pulse" />
              {t('dash.generate').split(' — ')[0]}
            </span>
            {/* The "(consumes 1 credit)" sublabel was removed here. The cost is stated
                once, in the pre-flight line, which is a whole sentence; this was a
                fragment that only read correctly directly beneath it. Pinning the button
                to the foot of the viewport put the two on screen together for the first
                time, saying the same thing twice — the pin CREATED that duplication, it
                did not inherit it. This was its only call site, so the key was deleted
                from both dictionaries rather than left behind to be wired back in. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/0 via-white/10 to-black/0 translate-y-[-100%] group-hover:translate-y-[100%] transition-transform duration-1000" />
         </>
       )}
    </Button>
    )
  }

  return (
    <div className="min-h-screen bg-[#070710] text-[#c8cfe0] selection:bg-violet-500/30 selection:text-white px-4 py-8 md:px-8">
      {/* BACKGROUND EFFECTS */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-600/10 rounded-full blur-[120px] animate-float-orb" />
        <div className="absolute bottom-[10%] right-[-5%] w-[35%] h-[35%] bg-blue-500/5 rounded-full blur-[120px] animate-float-orb-slow" />
      </div>

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

        {/* Defect B. `error` was written by nine call sites and read by none, so
            a 429/503 on the generate path, an oversize image and a camera
            failure were all silent. `error` is ALREADY translated at every write
            site (see toUserMessage), so no copy is composed here. */}
        {error && (
          <div ref={errorRef} role="alert" aria-live="assertive" className={bannerToneClass(ERROR_BANNER_TONE)}>
            {error}
          </div>
        )}

        {/* 5. RESULTS & STEALTH CONSOLE ZONE

            Deliberately ABOVE the upload/platform zone below it. A generation
            leaves `preview` set, so both blocks render at once; with the upload
            zone first, the generated title sat ~1700px down a 500px-wide phone
            layout — about a screen below the fold — and the largest thing on the
            first screen was the "U" avatar glyph. Measured at 500x861, moving
            this block up puts the title at y462 (ar) / y494 (en) against a fold
            of 861, with document height, node count and horizontal overflow all
            unchanged.

            DOM order, NOT `order:` on a flex parent: visual order has to match
            reading and tab order.

            The companion change is the scrollTo in handleGenerate. Without it a
            fresh generation inserts this block above the user, who is down at
            the Generate button, and they never see it. */}
        {results && (
           <div className="grid lg:grid-cols-[1fr,360px] gap-8 items-start">
              <div className="min-w-0 space-y-6">
                    {/* The generated product page. Presentation only: every piece of
                        state and every handler stays in this file and is passed down.
                        Why one stacked column with a copy action per part, and why the
                        old 3x2 tab grid is gone, is written at the top of ResultsPanel. */}
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

              {/* 6. REFINE CONSOLE */}
              <div className="min-w-0 space-y-6">
                  <div className="flex items-center justify-between px-2">
                     <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white flex items-center gap-2">
                        <MessagesSquare className="w-4 h-4 text-violet-500" />
                        {t('dash.stealthConsole')}
                     </h3>
                     {/* "AI assistant ready" was removed here. It asserted a readiness
                         nothing on the page verifies: it renders identically when the
                         API key is absent, when the limiter is throttling and when the
                         daily quota is spent — all three of which end in a banner, not
                         in a refinement. A pulsing green-ish claim that is right by
                         luck is worse than no claim. Its key is gone from both
                         dictionaries; this was its only call site. */}
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
            They used to sit in a header bar above the result, shown to someone who had
            not yet seen what a credit buys. They now render once, here, after the user
            has read the output. `results &&` is load-bearing: on the pre-generation
            screen there is nothing to have been convinced by. That header bar has since
            been deleted outright.

            🔴 ONE ACTION, NEVER TWO ON A SCREEN. A second purchase call site exists:
            `primaryAction({ allowPurchase: true })` in the fixed bar, offering the pack
            tier alone. The two can never co-render — this block requires `results`, that
            bar requires `preview && !results` — and that exclusivity is the whole reason
            the rule still holds. It is also what stops a querySelector/.find() probe
            silently measuring whichever comes first. Break the exclusivity, break both.

            Not a Card, on its own ground, between hairlines, with SUBSCRIBE as the one
            filled brand surface on the screen — every piece of generated output here
            lives inside a card, so "not a card" is the screen's own vocabulary for
            "this is the app talking, not the model".

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
                (primaryAction, purchaseHere) carries no disclosure: that control
                is a fixed-height nowrap box with nothing to give. */}
            <p className="text-xs leading-relaxed text-slate-500">
              {t('checkout.mor')}{' '}
              <Link href="/refund" className="underline underline-offset-4 hover:text-white transition-colors">
                {t('refund.title')}
              </Link>
            </p>
          </div>
        )}

        {/* 2. UPLOAD & PLATFORM CONTROL ZONE */}
        <div className="grid lg:grid-cols-1 gap-8">
           <motion.div
              layout
              className="relative p-1 bg-white/5 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden group"
           >
              {/* DASHED ANIMATED BORDER */}
              <div className="absolute inset-0 z-0 pointer-events-none p-2">
                 <svg className="w-full h-full">
                    <rect 
                      width="100%" height="100%" 
                      fill="none" 
                      rx="32" ry="32" 
                      stroke="rgba(124, 58, 237, 0.4)" 
                      strokeWidth="2" 
                      strokeDasharray="10 10" 
                      className="animate-[dash-rotate_3s_linear_infinite]"
                    />
                 </svg>
              </div>

              <div className="relative z-10">
                 {!preview ? (
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center gap-12 py-12"
                    >
                       <div className="text-center space-y-3">
                          <h2 className="text-[32px] leading-[1.15] font-black text-white">{t('dash.inputSource')}</h2>
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl px-4">
                          {/* OPTION 1: UPLOAD */}
                          <button 
                            onClick={() => document.getElementById('file-upload')?.click()}
                            className="group relative flex flex-col items-center gap-6 p-10 rounded-[2rem] bg-white/5 border border-white/10 hover:border-violet-500/50 transition-all duration-500 hover:-translate-y-1"
                          >
                             <div className="absolute inset-0 bg-violet-600/0 group-hover:bg-violet-600/5 rounded-[2rem] transition-all" />
                             <div className="relative w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:border-violet-500/50 transition-all">
                                <UploadCloud className="w-8 h-8 text-violet-400" />
                             </div>
                             <div className="text-center relative">
                                <h3 className="text-base font-black text-white uppercase tracking-tight">{t('dash.uploadBtn')}</h3>
                                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mt-1">{t('dash.uploadFormat')}</p>
                             </div>
                          </button>

                          {/* OPTION 2: CAMERA */}
                          <button 
                            onClick={openCamera}
                            className="group relative flex flex-col items-center gap-6 p-10 rounded-[2rem] bg-white/5 border border-white/10 hover:border-violet-500/50 transition-all duration-500 hover:-translate-y-1"
                          >
                             <div className="absolute inset-0 bg-violet-600/0 group-hover:bg-violet-600/5 rounded-[2rem] transition-all" />
                             <div className="relative w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:border-violet-500/50 transition-all">
                                <Camera className="w-8 h-8 text-violet-400" />
                             </div>
                             <div className="text-center relative">
                                <h3 className="text-base font-black text-white uppercase tracking-tight">{t('dash.cameraBtn')}</h3>
                                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mt-1">{t('dash.cameraSub')}</p>
                             </div>
                          </button>
                       </div>

                       <div className="flex gap-2 flex-wrap justify-center opacity-50">
                          {[t('dash.badge.edge'), t('dash.badge.vercel'), t('dash.badge.gemini')].map(b => (
                            <span key={b} className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500">{b}</span>
                          ))}
                       </div>
                       <input id="file-upload" type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                    </motion.div>
                 ) : (
                   <>
                   <div className="p-5 sm:p-8 md:p-12 pb-0 md:pb-0">
                      {/* 🔴 POSITION IS LOAD-BEARING: this sits ABOVE the grid, not inside the
                          right-hand column. Measured at 500x861 it had been below a square
                          preview image and landed at docY 842 against a fold of 861 — the one
                          honest sentence on the screen, clipped by the fold. Its old position
                          depended on the IMAGE HEIGHT, which depends on the container width,
                          so any pixel-level fix would have been per-device luck. Above the
                          grid it clears the fold by construction at every width. */}
                      {/* 🔴 ONE LINE, AND IT DESCRIBES THE ACTION — NEVER A STATE.
                          This replaced four status cards. Three of them carried no
                          information and one of them lied:
                            · "Image loaded" was guaranteed by the enclosing `preview`
                              conditional — it could not render and be false.
                            · "Gemini Vision ready" asserted something NOTHING verifies.
                              With the API key absent it still said ready; it would have
                              read "ready" through an outage or an exhausted quota.
                            · the platform card was the only live read, and it printed the
                              RAW id (`selectedPlatform.toUpperCase()`), so the Arabic
                              surface said "AMAZON" while the selector below it said
                              "أمازون". That leak is fixed here by sourcing the label.
                            · the last card reverted to "waiting to start" after a FAILED
                              generation, because `loading` is false in both the
                              never-started and the just-failed case.
                          🔴 Do not reintroduce a readiness indicator on this screen. There
                          is nothing on it whose readiness is checked, so any such element
                          is decoration at best and a false assurance at worst. The failure
                          path already has a home: the banner from lib/dashboard-banner.ts.
                          Interpolation is done here because `t()` is a bare lookup with no
                          placeholder support (LanguageContext.tsx:845) — keeping the whole
                          sentence per dictionary lets each language own its word order. */}
                      <p className="text-base font-medium text-slate-300">
                         {t('dash.preflight').replace(
                           '{platform}',
                           platforms.find(p => p.id === selectedPlatform)?.label ?? selectedPlatform
                         )}
                      </p>
                   </div>
                   <div className="grid md:grid-cols-[1fr,400px] gap-8 md:gap-12 items-start p-5 sm:p-8 md:p-12">
                      {/* Left: Preview */}
                      <div className="relative min-w-0 aspect-square rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl bg-black/50 group/img">
                         <img src={preview} alt="Preview" className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-105" />
                         {loading && (
                            <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
                               <motion.div
                                 className="absolute left-0 right-0 h-[2px] bg-violet-500 shadow-[0_0_30px_violet]"
                                 animate={{ top: ['0%', '100%', '0%'] }}
                                 transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }}
                               />
                               <div className="absolute inset-0 bg-violet-600/10 backdrop-blur-[2px]" />
                            </div>
                         )}

                         {/* Results Hotspots */}
                         {!loading && results?.hotspots?.map((hotspot, idx) => (
                          <div
                            key={idx}
                            className="absolute z-20 group/hotspot cursor-pointer"
                            style={{ top: `${hotspot.y}%`, left: `${hotspot.x}%`, transform: 'translate(-50%, -50%)' }}
                          >
                            <motion.div
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ delay: 0.5 + idx * 0.1 }}
                              className="w-5 h-5 rounded-full border-2 border-white bg-violet-600 shadow-[0_0_20px_rgba(124,58,237,0.8)] relative"
                            >
                               <span className="absolute inset-0 rounded-full animate-ping bg-violet-400 opacity-75" />
                            </motion.div>
                            {/* No tracking-* here: hotspot labels are GENERATED text and are Arabic
                                whenever the user generated in Arabic, independent of the UI language.
                                The global RTL guard keys on the wrapper's dir and misses that. */}
                            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/hotspot:opacity-100 transition-all pointer-events-none bg-black/80 backdrop-blur-xl text-white text-xs font-black uppercase px-4 py-2 rounded-xl border border-white/10 shadow-2xl whitespace-nowrap">
                              {hotspot.label}
                            </div>
                          </div>
                        ))}

                         <button 
                           /* The ONLY reset in the app — the sole setPreview(null)
                              outside initial state. The file input and the camera
                              button live in the OTHER branch of this ternary, which
                              is reachable only while `preview` is null. So this zone
                              must never be conditionally hidden once `results` is set:
                              that strands the user on one generation per page load
                              with no way back except reloading. */
                           onClick={() => { setFile(null); setPreview(null); setResults(null); setError(nextDashboardError({ kind: 'input-changed' })); }}
                           className="absolute top-6 right-6 w-10 h-10 bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors z-30"
                         >
                            <Trash2 className="w-5 h-5" />
                         </button>
                      </div>

                      {/* Right: Requirements & Action */}
                      <div className="min-w-0 space-y-8 h-full flex flex-col justify-between">

                         {/* 3. PLATFORM SELECTOR */}
                         <div className="space-y-4">
                            <span className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">{t('dash.platform')}</span>
                            <div className="grid grid-cols-2 gap-2">
                               {platforms.map(p => (
                                 <button
                                   key={p.id}
                                   onClick={() => setSelectedPlatform(p.id)}
                                   className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${
                                     selectedPlatform === p.id 
                                     ? `border-${p.color}-500/50 bg-${p.color}-500/10 text-${p.color}-300 shadow-[0_0_15px_rgba(var(--${p.color}-rgb),0.2)] scale-[1.02]` 
                                     : 'border-white/5 bg-white/5 text-slate-500 hover:border-white/20'
                                   }`}
                                   // Tailwind dynamic colors workaround - usually you'd use a record
                                   style={selectedPlatform === p.id ? { 
                                      borderColor: `var(--${p.id}-color-glow)`, 
                                      backgroundColor: `var(--${p.id}-color-bg)`,
                                      color: `var(--${p.id}-color-text)`
                                   } : {}}
                                 >
                                    <span className="text-base">{p.emoji}</span>
                                    {p.label}
                                 </button>
                               ))}
                               <style jsx>{`
                                  button { --amazon-color-glow: rgba(251, 146, 60, 0.4); --amazon-color-bg: rgba(251, 146, 60, 0.1); --amazon-color-text: #fb923c; }
                                  button { --shopify-color-glow: rgba(74, 222, 128, 0.4); --shopify-color-bg: rgba(74, 222, 128, 0.1); --shopify-color-text: #4ade80; }
                                  button { --instagram-color-glow: rgba(244, 114, 182, 0.4); --instagram-color-bg: rgba(244, 114, 182, 0.1); --instagram-color-text: #f472b6; }
                                  button { --tiktok-color-glow: rgba(248, 113, 113, 0.4); --tiktok-color-bg: rgba(248, 113, 113, 0.1); --tiktok-color-text: #f87171; }
                               `}</style>
                            </div>
                         </div>

                         {/* 4. PRIMARY ACTION — in flow only once results exist; otherwise it
                             lives in the fixed bar. See `primaryAction`. */}
                         {results && primaryAction({ allowPurchase: false })}
                      </div>
                   </div>
                   </>
                 )}
              </div>
           </motion.div>
        </div>

        {/* 7. HISTORY TABLE UPGRADE */}
        <section className="space-y-8">
           <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center">
                    <History className="w-6 h-6 text-violet-400" />
                 </div>
                 <div className="space-y-1">
                    {/* TOP STEP, not decoration. At text-base this heading computed 16px — the
                        SAME size and the SAME colour as the row titles inside the table it labels,
                        which carry no size class and inherit 16px. Measured: heading 16/900/#fff,
                        row title 16/700/#fff, both uppercase. Under RTL the global letter-spacing
                        rule zeroes tracking and `uppercase` does nothing to Arabic glyphs, so in
                        Arabic the two were separated by font-weight ALONE. It was text-3xl (30px)
                        before the ladder. Do not send it back to the label tier to tidy the ladder:
                        a section heading in the same tier as its own contents has no step. */}
                    <h2 className="text-[32px] leading-[1.15] font-black text-white tracking-tighter uppercase">{t('dash.history')}</h2>
                    <p className="text-xs font-medium text-slate-500 tracking-widest uppercase">{t('dash.productionHistory')}</p>
                 </div>
              </div>
              <div className="flex gap-2">
                 <Button 
                   onClick={() => downloadCSV(history, `unicornapps-export-${new Date().toISOString().split('T')[0]}.csv`)}
                   className="h-12 px-6 bg-white/5 border border-white/10 hover:border-white/20 rounded-xl text-xs font-black uppercase tracking-widest text-[#c8cfe0] flex items-center gap-2 transition-all"
                 >
                    <FileDown className="w-4 h-4" />
                    {t('dash.exportCsv')}
                 </Button>
              </div>
           </div>

           <Card className="bg-black/40 border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
              <div className="overflow-x-auto no-scrollbar">
                 <table className="w-full text-left border-collapse">
                    <thead className="bg-white/5 border-b border-white/5">
                       <tr>
                          <th className="px-4 sm:px-8 py-5 text-xs font-black uppercase tracking-[0.2em] text-slate-500">{t('dash.asset')}</th>
                          <th className="px-4 sm:px-8 py-5 text-xs font-black uppercase tracking-[0.2em] text-slate-500">{t('dash.platformName')}</th>
                          <th className="px-4 sm:px-8 py-5 text-xs font-black uppercase tracking-[0.2em] text-slate-500">{t('dash.matrixSignature')}</th>
                          <th className="px-4 sm:px-8 py-5 text-xs font-black uppercase tracking-[0.2em] text-slate-500">{t('dash.timestamp')}</th>
                          <th className="px-4 sm:px-8 py-5 text-xs font-black uppercase tracking-[0.2em] text-slate-500 text-right">{t('dash.action')}</th>
                       </tr>
                    </thead>
                    <tbody>
                       {history.length > 0 ? history.map((item) => (
                         <tr key={item.id} className="group border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors relative cursor-pointer" onClick={() => {
                            setResults(item.content);
                            setPreview(item.image_url);
                            setSelectedPlatform(item.platform || 'amazon');
                            // Recalling a past generation replaces the image on
                            // screen, so a banner about the previous one is stale.
                            setError(nextDashboardError({ kind: 'input-changed' }));
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                         }}>
                            <td className="px-4 sm:px-8 py-4">
                               {/* HOVER BORDER EFFECT — must stay INSIDE this cell. A <div> as a
                                   direct child of <tr> is invalid HTML; the parser relocates it and
                                   hydration fails. This <td> is static, so the bar still resolves
                                   against the `relative` <tr>. Do NOT add `relative` to this <td>. */}
                               <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-violet-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                               <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/10 shadow-lg">
                                  <img src={item.image_url} alt="Product" className="w-full h-full object-cover" />
                               </div>
                            </td>
                            <td className="px-4 sm:px-8 py-4">
                               <span className={`px-4 py-1.5 rounded-lg border text-xs font-black uppercase tracking-widest ${platformBadge(item.platform)}`}>
                                  {item.platform || 'amazon'}
                               </span>
                            </td>
                            <td className="px-4 sm:px-8 py-4">
                               <div className="max-w-[300px]">
                                                                    {/* No tracking-* here: this renders GENERATED text, which is Arabic whenever the user
                                      generated in Arabic — independent of the UI language. The global RTL guard keys on
                                      the wrapper's dir, so it does not fire on the English surface and the tracking lands
                                      on joined Arabic glyphs. Measured on the history title: -0.4px under the English UI. */}
                                  <p className="text-white font-bold truncate group-hover:text-violet-400 transition-colors uppercase">{item.content.seoTitle}</p>
                                  <p className="text-xs font-medium text-slate-600 mt-1 uppercase tracking-widest">{t('dash.id')}: {item.id.slice(0, 8)}</p>
                               </div>
                            </td>
                            <td className="px-4 sm:px-8 py-4">
                               <div className="flex items-center gap-2 text-slate-500 text-xs font-black uppercase tracking-widest">
                                  <Clock className="w-3.5 h-3.5" />
                                  {new Date(item.created_at).toLocaleDateString()}
                               </div>
                            </td>
                            <td className="px-4 sm:px-8 py-4 text-right">
                               <Button variant="ghost" size="icon" className="w-10 h-10 rounded-xl text-slate-600 hover:text-white hover:bg-white/5">
                                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                               </Button>
                            </td>
                         </tr>
                       )) : (
                         <tr>
                            <td colSpan={5} className="py-32 text-center">
                               <div className="flex flex-col items-center gap-6">
                                  <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center">
                                     <Database className="w-10 h-10 text-slate-700" />
                                  </div>
                                  <div className="space-y-2">
                                     <p className="text-base font-bold text-slate-500 uppercase tracking-tighter">{t('dash.noHistory')}</p>
                                     <p className="text-xs font-black text-slate-700 uppercase tracking-widest">{t('dash.noSignatures')}</p>
                                  </div>
                               </div>
                            </td>
                         </tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </Card>
        </section>

        {/* CAMERA MODAL */}
        <AnimatePresence>
          {showCamera && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center"
            >
              <div className="absolute top-8 mt-safe left-0 right-0 z-10 text-center">
                <p className="text-xs font-black uppercase tracking-[0.3em] text-white/40 mb-2">{t('dash.cameraVision')}</p>
                <h3 className="text-base font-black text-white uppercase tracking-tighter">{t('dash.cameraPoint')}</h3>
              </div>

              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />

              <div className="absolute bottom-12 mb-safe left-0 right-0 z-10 flex items-center justify-center gap-12">
                <button 
                  onClick={closeCamera}
                  className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-all"
                >
                   <X className="w-6 h-6" />
                </button>
                
                <button 
                  onClick={capturePhoto}
                  className="w-24 h-24 rounded-full bg-violet-600 border-4 border-white/20 flex items-center justify-center text-white shadow-[0_0_50px_rgba(124,58,237,0.5)] hover:scale-110 active:scale-95 transition-all"
                >
                   <Camera className="w-10 h-10" />
                </button>

                <div className="w-14 h-14" /> {/* Spacer for balance */}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 🔴 PINNED PRIMARY ACTION — PRE-GENERATION SCREEN ONLY.
          Rendered when a photo is chosen and no result exists yet: the one screen with a
          single pending action and nothing competing. NOT on the entry screen (no action
          yet), NOT on the results surface (a bar pinned over a result competes with the
          most valuable thing on the page), NOT on history.

          🔴 IT MUST STAY OUT HERE, A SIBLING OF THE max-w-7xl WRAPPER. It cannot move
          inside the panel that holds this screen: that panel is a `motion.div` with the
          `layout` prop AND `overflow-hidden`, and a non-`none` transform makes an element
          the containing block for its `position: fixed` descendants. Framer-motion writes
          a transform there on every layout animation, so a bar nested inside would stop
          being viewport-fixed mid-animation and then be clipped by that same ancestor.
          Nothing on the chain out here (the page root, the max-w-7xl wrapper) sets
          transform, filter, perspective, contain or backdrop-filter, so the viewport is
          the containing block — the decorative `fixed inset-0` layer at the top of this
          component already relies on that and proves it.

          The spacer below is the compensation: without it the last element in flow, the
          platform selector, sits underneath the bar. Its height mirrors the bar's box —
          keep the two expressions in step, they are deliberately adjacent. */}
      {preview && !results && (
        <>
          {/* 🔴 THE SAFE AREA IS ADDITIVE, NEVER calc(base + env(...)).
              globals.css states the rule and its failure mode: a browser without env()
              support drops the WHOLE declaration as invalid, so folding the base into a
              calc() alongside env() destroys the base too and collapses the layout. A
              first version of this bar did exactly that — `height: calc(5rem + 0.75rem +
              1px + max(0.75rem, env(...)))` — which would have left this spacer at height
              ZERO and put the controls under the bar, in precisely the browser that
              cannot report it.
              So the base lives in a Tailwind class and the inset is a SEPARATE property
              on a separate declaration, exactly like the pt-safe/mt-safe pairs already in
              globals.css. If env() is unsupported the inset contributes nothing and the
              layout degrades to the 105px base instead of breaking.
              105px = 12 (pt-3) + 80 (h-20 button) + 12 (pb-3) + 1 (border-t).
              `mb-safe` here and the `pb-safe` child inside the bar are the SAME inset, so
              the spacer and the bar grow together. Keep the two in step — they are
              adjacent deliberately. */}
          <div aria-hidden className="h-[105px] mb-safe" />
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#070710]/95 backdrop-blur-xl border-t border-white/10 px-4 pt-3 pb-3">
            <div className="max-w-7xl mx-auto">
              {primaryAction({ allowPurchase: true })}
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
