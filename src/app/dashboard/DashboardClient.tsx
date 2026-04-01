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
  Zap,
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
  Target,
  ArrowRight,
  Play,
  Globe,
  BadgeCheck,
  Search,
  Hash,
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
import { isNative, takePicture } from '@/lib/capacitor'
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
  initialHistory
}: {
  userId: string,
  initialCredits: number,
  initialHistory: Generation[]
}) {
  const router = useRouter()
  const { t, lang } = useLang()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<GeneratedContent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copySuccess, setCopySuccess] = useState<string | null>(null)
  const [history, setHistory] = useState<Generation[]>(initialHistory)
  const [activeTab, setActiveTab] = useState<'seo' | 'shopify' | 'amazon' | 'social' | 'data'>('seo')
  
  // Royal Obsidian State
  const [displayCredits, setDisplayCredits] = useState(0)
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
  const [viewMode, setViewMode] = useState<'raw' | 'preview'>('raw')
  const [shopifyViewMode, setShopifyViewMode] = useState<'preview' | 'code'>('preview')
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Camera Support
  const [showCamera, setShowCamera] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const openCamera = async () => {
    if (isNative()) {
      try {
        const photo = await takePicture();
        if (photo) {
          setPreview(photo);
          setFile(null);
          setError(null);
          setResults(null);
        }
      } catch (err) {
        setError(t('dash.cameraError'));
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
      setError(t('dash.cameraError'))
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
    closeCamera()
  }

  const closeCamera = () => {
    stream?.getTracks().forEach(track => track.stop())
    setStream(null)
    setShowCamera(false)
  }

  // Animated Credit Counter
  useEffect(() => {
    let start = 0
    const end = initialCredits
    const duration = 1000
    const step = end / (duration / 16)
    const timer = setInterval(() => {
      start += step
      if (start >= end) { 
        setDisplayCredits(end)
        clearInterval(timer) 
      } else {
        setDisplayCredits(Math.floor(start))
      }
    }, 16)
    return () => clearInterval(timer)
  }, [initialCredits])

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  const platforms = [
    { id: 'amazon', label: t('dash.tab.amazon'), emoji: '🛒', color: 'orange' },
    { id: 'shopify', label: t('dash.tab.shopify'), emoji: '🏪', color: 'green' },
    { id: 'instagram', label: 'Instagram', emoji: '📱', color: 'pink' },
    { id: 'tiktok', label: 'TikTok', emoji: '🎵', color: 'red' },
  ]

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (selectedFile.size > 4 * 1024 * 1024) {
        setError(t('dash.filesizeError'))
        return
      }
      setFile(selectedFile)
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result as string)
      }
      reader.readAsDataURL(selectedFile)
      setError(null)
      setResults(null)
    }
  }

  const handleGenerate = async () => {
    if (!preview) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          image: preview,
          platform: selectedPlatform,
          lang: lang
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || t('dash.error').replace('{error}', 'Generation failed'))
      }

      setResults(data)
      
      // Add to history locally for immediate feedback if needed, 
      // but router.refresh() will handle the actual data sync
      router.refresh() 
      
      setChatHistory(prev => [...prev, {
        role: 'ai',
        message: t('dash.analysisComplete').replace('{platform}', selectedPlatform.toUpperCase()),
        timestamp: new Date()
      }])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRefine = async (instruction?: string) => {
    const finalInstruction = instruction || refineInput
    if (!results || !finalInstruction.trim()) return

    setIsRefining(true)
    setError(null)

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

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to refine content')
      }

      setResults(data)
      setRefineInput('')

      // Add AI response to chat history
      setChatHistory(prev => [...prev, {
        role: 'ai',
        message: t('dash.refineSuccess'),
        timestamp: new Date()
      }])
    } catch (err: any) {
      setError(err.message)
      setChatHistory(prev => [...prev, {
        role: 'ai',
        message: t('dash.error').replace('{error}', err.message),
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
    <div className="bg-white text-[#111] p-8 rounded-2xl shadow-2xl font-sans max-w-4xl mx-auto border border-zinc-200 overflow-hidden">
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
        <div className="flex gap-6 text-sm font-medium text-zinc-600">
          <span>Shop All</span>
          <span>Our Story</span>
          <span>Contact</span>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto p-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
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
              <h1 className="text-4xl font-bold tracking-tight text-zinc-900">{results?.seoTitle}</h1>
              <p className="text-2xl text-zinc-500 font-light">$99.00 USD</p>
            </div>

            <div className="prose prose-zinc max-w-none prose-p:text-zinc-600 prose-headings:text-zinc-900">
              {results?.shopifyHtml ? (
                <div dangerouslySetInnerHTML={{ __html: results.shopifyHtml }} />
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

  return (
    <div className="min-h-screen bg-[#070710] text-[#c8cfe0] selection:bg-violet-500/30 selection:text-white px-4 py-8 md:px-8">
      {/* BACKGROUND EFFECTS */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-600/10 rounded-full blur-[120px] animate-float-orb" />
        <div className="absolute bottom-[10%] right-[-5%] w-[35%] h-[35%] bg-blue-500/5 rounded-full blur-[120px] animate-float-orb-slow" />
      </div>

      <div className="max-w-7xl mx-auto space-y-12 relative z-10">
        
        {/* 1. CREDITS HEADER BAR */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative flex flex-col md:flex-row justify-between items-center bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-6 shadow-[0_0_40px_-15px_rgba(124,58,237,0.2)] overflow-hidden"
        >
          <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
          
          <div className="flex items-center gap-4 mb-4 md:mb-0">
             <div className="w-10 h-10 bg-white text-slate-950 flex items-center justify-center rounded-xl text-xl font-black shadow-[0_0_20px_rgba(255,255,255,0.1)]">U</div>
             <h1 className="text-2xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-violet-400">
               {t('dash.title').toUpperCase()}
             </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
             <div className="bg-black/40 border border-white/10 rounded-2xl px-5 py-2.5 flex items-center gap-4 backdrop-blur-xl">
                 <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span className="text-2xl font-black text-white">
                      {displayCredits}
                    </span>
                    <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                      {t('dash.creditsWord')}
                    </span>
                 </div>
                <div className="h-4 w-px bg-white/10" />
                 <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest text-center px-2">
                   You&apos;ve reached your free limit. More features are available on the official UnicornApps website.
                 </p>
              </div>
             <Button variant="ghost" size="icon" className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:border-white/30" onClick={() => router.refresh()}>
               <Clock className="w-4 h-4" />
             </Button>
          </div>
        </motion.div>

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
                          <h2 className="text-3xl font-black text-white tracking-tighter uppercase">{t('dash.title')}</h2>
                          <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">{t('dash.inputSource')}</p>
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
                                <h3 className="text-lg font-black text-white uppercase tracking-tight">{t('dash.uploadBtn')}</h3>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{t('dash.uploadFormat')}</p>
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
                                <h3 className="text-lg font-black text-white uppercase tracking-tight">{t('dash.cameraBtn')}</h3>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{t('dash.cameraSub')}</p>
                             </div>
                          </button>
                       </div>

                       <div className="flex gap-2 flex-wrap justify-center opacity-50">
                          {[t('dash.badge.edge'), t('dash.badge.vercel'), t('dash.badge.gemini')].map(b => (
                            <span key={b} className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-500">{b}</span>
                          ))}
                       </div>
                       <input id="file-upload" type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                    </motion.div>
                 ) : (
                   <div className="grid md:grid-cols-[1fr,400px] gap-12 items-start p-8 md:p-12">
                      {/* Left: Preview */}
                      <div className="relative aspect-square rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl bg-black/50 group/img">
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
                            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/hotspot:opacity-100 transition-all pointer-events-none bg-black/80 backdrop-blur-xl text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border border-white/10 shadow-2xl whitespace-nowrap">
                              {hotspot.label}
                            </div>
                          </div>
                        ))}

                         <button 
                           onClick={() => { setFile(null); setPreview(null); setResults(null); }}
                           className="absolute top-6 right-6 w-10 h-10 bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors z-30"
                         >
                            <Trash2 className="w-5 h-5" />
                         </button>
                      </div>

                      {/* Right: Requirements & Action */}
                      <div className="space-y-8 h-full flex flex-col justify-between">
                         <div className="space-y-6">
                            <h3 className="text-xl font-black text-white uppercase tracking-tighter">{t('dash.readyTitle')}</h3>
                            <div className="space-y-4">
                               {[
                                 { label: t('dash.step.image'), sub: t('dash.step.imageSub'), status: 'done' },
                                 { label: t('dash.step.vision'), sub: t('dash.step.visionSub'), status: 'done' },
                                 { label: `${t('dash.platform')}: ${selectedPlatform.toUpperCase()}`, sub: t('dash.step.platformSub'), status: 'platform' },
                                 { label: loading ? t('dash.analyzing') : t('dash.step.pending'), sub: loading ? t('dash.step.loadingSub') : t('dash.step.pendingSub'), status: loading ? 'loading' : 'pending' }
                               ].map((item, i) => (
                                 <div key={i} className={`flex items-start gap-4 p-4 rounded-2xl border transition-all ${item.status === 'done' ? 'bg-emerald-500/5 border-emerald-500/20' : item.status === 'platform' ? 'bg-violet-500/5 border-violet-500/20' : 'bg-white/5 border-white/10'}`}>
                                    <div className="mt-1">
                                       {item.status === 'done' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : item.status === 'loading' ? <Loader2 className="w-5 h-5 text-violet-500 animate-spin" /> : item.status === 'platform' ? <Target className="w-5 h-5 text-violet-500" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-700 animate-pulse" />}
                                    </div>
                                    <div>
                                       <p className={`text-sm font-black uppercase tracking-widest ${item.status === 'done' ? 'text-emerald-400' : item.status === 'platform' ? 'text-violet-400' : item.status === 'loading' ? 'text-violet-400' : 'text-slate-500'}`}>{item.label}</p>
                                       <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">{item.sub}</p>
                                    </div>
                                 </div>
                               ))}
                            </div>
                         </div>

                         {/* 3. PLATFORM SELECTOR */}
                         <div className="space-y-4">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{t('dash.platform')}</span>
                            <div className="grid grid-cols-2 gap-2">
                               {platforms.map(p => (
                                 <button
                                   key={p.id}
                                   onClick={() => setSelectedPlatform(p.id)}
                                   className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
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
                                    <span className="text-lg">{p.emoji}</span>
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

                         {/* 4. GENERATE BUTTON UPGRADE */}
                         <Button
                           onClick={handleGenerate}
                           disabled={loading || initialCredits <= 0}
                           className={`w-full h-20 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-500 group relative overflow-hidden ${
                             loading 
                             ? 'bg-black border border-violet-500/50' 
                             : initialCredits <= 0 
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
                            ) : initialCredits <= 0 ? (
                               <div className="flex flex-col items-center gap-3">
                                  <AlertCircle className="w-5 h-5 text-red-500/50" />
                                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest text-center px-2">
                                    You&apos;ve reached your free limit. More features are available on the official UnicornApps website.
                                  </p>
                               </div>
                            ) : (
                              <>
                                 <span className="relative z-10 text-sm font-black uppercase tracking-[0.2em] flex items-center gap-2">
                                   <Sparkles className="w-5 h-5 animate-pulse" />
                                   {t('dash.generate').split(' — ')[0]}
                                 </span>
                                 <span className="relative z-10 text-[9px] font-bold uppercase tracking-widest text-white/60">
                                   {t('dash.consuming')}
                                 </span>
                                 <div className="absolute inset-0 bg-gradient-to-t from-black/0 via-white/10 to-black/0 translate-y-[-100%] group-hover:translate-y-[100%] transition-transform duration-1000" />
                              </>
                            )}
                         </Button>
                      </div>
                   </div>
                 )}
              </div>
           </motion.div>
        </div>

        {/* 5. RESULTS & STEALTH CONSOLE ZONE */}
        {results && (
           <div className="grid lg:grid-cols-[1fr,360px] gap-8 items-start">
              <div className="space-y-6">
                {/* Visual View Mode Selector */}
                <div className="flex justify-between items-center bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-2">
                   <div className="flex gap-1">
                      <button onClick={() => setViewMode('raw')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'raw' ? 'bg-white text-slate-950' : 'text-slate-500 hover:text-white'}`}>{t('dash.raw')}</button>
                      <button onClick={() => setViewMode('preview')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'preview' ? 'bg-white text-slate-950' : 'text-slate-500 hover:text-white'}`}>{t('dash.preview')}</button>
                   </div>
                   <div className="flex items-center gap-2 px-4 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      {t('dash.stable')}
                   </div>
                </div>

                <AnimatePresence mode="wait">
                  {viewMode === 'preview' ? (
                     <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} className="space-y-12">
                        <section className="space-y-6">
                           <div className="flex items-center gap-3">
                              <div className="p-2 bg-orange-500/20 rounded-lg"><ShoppingBag className="w-5 h-5 text-orange-400" /></div>
                              <h2 className="text-xl font-black text-white uppercase tracking-tighter">{t('dash.amazon.live')}</h2>
                           </div>
                           <AmazonMockup />
                        </section>
                        <section className="space-y-6">
                           <div className="flex items-center gap-3">
                              <div className="p-2 bg-green-500/20 rounded-lg"><Store className="w-5 h-5 text-green-400" /></div>
                              <h2 className="text-xl font-black text-white uppercase tracking-tighter">{t('dash.shopify.live')}</h2>
                           </div>
                           <ShopifyMockup />
                        </section>
                     </motion.div>
                  ) : (
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
                       {/* 5. TABS UPGRADE */}
                       <div className="flex gap-2 p-1 bg-black/40 border border-white/5 rounded-2xl overflow-x-auto no-scrollbar">
                          {[
                            { id: 'seo', label: t('dash.tab.seo'), icon: <Search className="w-3.5 h-3.5" /> },
                            { id: 'shopify', label: t('dash.tab.shopify'), icon: <Store className="w-3.5 h-3.5" /> },
                            { id: 'amazon', label: t('dash.tab.amazon'), icon: <ShoppingBag className="w-3.5 h-3.5" /> },
                            { id: 'social', label: t('dash.tab.social'), icon: <Hash className="w-3.5 h-3.5" /> },
                            { id: 'data', label: t('dash.tab.data'), icon: <Database className="w-3.5 h-3.5" /> }
                          ].map(t => (
                            <button
                              key={t.id}
                              onClick={() => setActiveTab(t.id as any)}
                              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all relative ${activeTab === t.id ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                               {t.icon}
                               {t.label}
                               {activeTab === t.id && (
                                 <motion.div layoutId="tab-active" className="absolute inset-0 bg-white/5 border border-white/10 rounded-xl -z-10 shadow-[0_0_15px_rgba(124,58,237,0.3)]">
                                    <div className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-violet-400" />
                                 </motion.div>
                               )}
                            </button>
                          ))}
                       </div>

                       <div className="grid gap-6">
                          {activeTab === 'seo' && (
                             <Card className="bg-white/[0.03] border-white/10 rounded-3xl overflow-hidden">
                                <CardHeader className="border-b border-white/5 py-8 px-10">
                                   <CardTitle className="text-white font-black text-2xl uppercase tracking-tighter">{t('dash.seo.title')}</CardTitle>
                                </CardHeader>
                                <CardContent className="p-10 space-y-10">
                                   <div className="space-y-4">
                                      <div className="flex justify-between items-center">
                                         <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('dash.seo.target')}</span>
                                         <Button variant="ghost" size="sm" onClick={() => copyToClipboard(results.seoTitle, 't')} className="h-8 px-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/20 text-[10px] font-black uppercase">
                                            {copySuccess === 't' ? t('dash.copied') : t('dash.seo.copy')}
                                         </Button>
                                      </div>
                                      <p className="text-xl font-bold text-white leading-tight">{results.seoTitle}</p>
                                   </div>
                                   <div className="space-y-4">
                                      <div className="flex justify-between items-center">
                                         <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('dash.seo.meta')}</span>
                                         <Button variant="ghost" size="sm" onClick={() => copyToClipboard(results.metaDescription, 'm')} className="h-8 px-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/20 text-[10px] font-black uppercase">
                                            {copySuccess === 'm' ? t('dash.copied') : t('dash.copyLogic')}
                                         </Button>
                                      </div>
                                      <p className="text-slate-400 leading-relaxed font-medium">{results.metaDescription}</p>
                                   </div>
                                </CardContent>
                             </Card>
                          )}
                          {/* Shopify Redesign */}
                          {activeTab === 'shopify' && (
                            <Card className="bg-white/[0.03] border-white/10 rounded-3xl p-10 space-y-8">
                               <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                  <div className="space-y-1">
                                     <h3 className="text-xl font-black text-white uppercase tracking-tighter">{t('dash.shopify.title')}</h3>
                                     <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('dash.liquidData')}</p>
                                  </div>
                                  <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                                     <button 
                                       onClick={() => setShopifyViewMode('preview')}
                                       className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${shopifyViewMode === 'preview' ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20' : 'text-slate-500 hover:text-white'}`}
                                     >
                                        {t('dash.shopify.preview')}
                                     </button>
                                     <button 
                                       onClick={() => setShopifyViewMode('code')}
                                       className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${shopifyViewMode === 'code' ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20' : 'text-slate-500 hover:text-white'}`}
                                     >
                                        {t('dash.shopify.code')}
                                     </button>
                                  </div>
                                  <Button onClick={() => copyToClipboard(results.shopifyHtml || '', 'sh')} className="bg-white/5 border border-white/10 hover:border-white/20 text-white text-[10px] font-black uppercase rounded-xl px-6 h-10">
                                     {copySuccess === 'sh' ? t('dash.copied') : <><Copy className="w-3.5 h-3.5 mr-2" /> {t('dash.copyCode')}</>}
                                  </Button>
                               </div>

                               <AnimatePresence mode="wait">
                                  {shopifyViewMode === 'preview' ? (
                                    <motion.div 
                                      key="preview"
                                      initial={{ opacity: 0, scale: 0.98 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 1.02 }}
                                      className="bg-black/60 rounded-[2rem] p-10 border border-white/5 h-[500px] overflow-auto custom-scrollbar"
                                    >
                                       <div className="prose prose-invert max-w-none prose-p:text-slate-300 prose-headings:text-white prose-strong:text-violet-400 prose-ul:text-slate-400 prose-li:marker:text-violet-500">
                                          <div dangerouslySetInnerHTML={{ __html: results.shopifyHtml || '' }} />
                                       </div>
                                    </motion.div>
                                  ) : (
                                    <motion.div 
                                      key="code"
                                      initial={{ opacity: 0, scale: 0.98 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 1.02 }}
                                      className="bg-black/80 rounded-[2rem] p-8 border border-white/5 font-mono text-xs text-violet-300/80 h-[500px] overflow-auto custom-scrollbar relative"
                                    >
                                       <pre className="whitespace-pre-wrap">{results.shopifyHtml}</pre>
                                       <div className="absolute top-4 right-4 text-[8px] font-black uppercase tracking-[0.2em] text-slate-700 pointer-events-none">{t('dash.liquidSig')}</div>
                                    </motion.div>
                                  )}
                               </AnimatePresence>
                            </Card>
                          )}
                          {/* Amazon Redesign */}
                          {activeTab === 'amazon' && (
                            <Card className="bg-white/[0.03] border-white/10 rounded-3xl p-10 space-y-8">
                               <h3 className="text-xl font-black text-white uppercase tracking-tighter">{t('dash.amazon.title')}</h3>
                               <div className="space-y-4">
                                  {results.amazonBullets?.map((b, i) => (
                                    <div key={i} className="flex items-start gap-4 p-5 bg-white/5 border border-white/5 rounded-2xl group hover:border-violet-500/30 transition-all">
                                       <span className="text-violet-500 font-bold mt-1">✦</span>
                                       <p className="text-slate-300 font-medium group-hover:text-white transition-colors">{b}</p>
                                    </div>
                                  ))}
                               </div>
                            </Card>
                          )}
                          {/* Social Redesign */}
                          {activeTab === 'social' && (
                            <div className="grid gap-6">
                               <Card className="bg-white/[0.03] border-white/10 rounded-3xl p-10 space-y-6">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('dash.social.hook')}</span>
                                  <p className="text-2xl font-black text-white tracking-tight leading-none italic uppercase">&quot;{results.viralScript?.hook}&quot;</p>
                               </Card>
                               <div className="grid md:grid-cols-2 gap-6">
                                  <Card className="bg-white/[0.03] border-white/10 rounded-3xl p-8 space-y-4">
                                     <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('dash.social.concept')}</span>
                                     <p className="text-slate-400 font-medium leading-relaxed">{results.viralScript?.concept}</p>
                                  </Card>
                                  <Card className="bg-white/[0.03] border-white/10 rounded-3xl p-8 space-y-4">
                                     <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('dash.social.tags')}</span>
                                     <div className="flex flex-wrap gap-2">
                                        {results.socialMediaTags?.map(t => (
                                          <span key={t} className="px-3 py-1 bg-violet-600/10 border border-violet-500/20 rounded-lg text-xs font-bold text-violet-400">{t}</span>
                                        ))}
                                     </div>
                                  </Card>
                               </div>
                            </div>
                          )}
                          {/* Data Redesign */}
                          {activeTab === 'data' && (
                             <div className="grid md:grid-cols-2 gap-6">
                                {[
                                  { l: t('dash.data.material'), v: results.structuredData?.material },
                                  { l: t('dash.data.color'), v: results.structuredData?.dominantColor },
                                  { l: t('dash.data.audience'), v: results.structuredData?.targetAudience },
                                  { l: t('dash.data.care'), v: results.structuredData?.careInstructions }
                                ].map((d, i) => (
                                  <Card key={i} className="bg-white/[0.03] border-white/10 rounded-3xl p-8 flex flex-col justify-between">
                                     <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">{d.l}</span>
                                     <p className="text-white font-black text-lg uppercase tracking-tight">{d.v}</p>
                                  </Card>
                                ))}
                             </div>
                          )}
                       </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 6. STEALTH CONSOLE UPGRADE */}
              <div className="space-y-6">
                  <div className="flex items-center justify-between px-2">
                     <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white flex items-center gap-2">
                        <MessagesSquare className="w-4 h-4 text-violet-500" />
                        {t('dash.stealthConsole')}
                     </h3>
                     <span className="text-[8px] font-black uppercase tracking-widest text-slate-600 animate-pulse">{t('dash.matrixSync')}</span>
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
                             <span className="text-[8px] font-black text-slate-600 uppercase mt-2 px-1 tracking-widest">
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
                               className="px-3 py-1.5 bg-white/5 border border-white/5 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:border-violet-500/50 transition-all active:scale-95 disabled:opacity-50"
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

        {/* 7. HISTORY TABLE UPGRADE */}
        <section className="space-y-8">
           <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center">
                    <History className="w-6 h-6 text-violet-400" />
                 </div>
                 <div className="space-y-1">
                    <h2 className="text-3xl font-black text-white tracking-tighter uppercase">{t('dash.history')}</h2>
                    <p className="text-xs font-medium text-slate-500 tracking-widest uppercase">{t('dash.productionHistory')}</p>
                 </div>
              </div>
              <div className="flex gap-2">
                 <Button 
                   onClick={() => downloadCSV(history, `matrix-export-${new Date().toISOString().split('T')[0]}.csv`)}
                   className="h-12 px-6 bg-white/5 border border-white/10 hover:border-white/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#c8cfe0] flex items-center gap-2 transition-all"
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
                          <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{t('dash.asset')}</th>
                          <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{t('dash.platformName')}</th>
                          <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{t('dash.matrixSignature')}</th>
                          <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{t('dash.timestamp')}</th>
                          <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-right">{t('dash.action')}</th>
                       </tr>
                    </thead>
                    <tbody>
                       {history.length > 0 ? history.map((item) => (
                         <tr key={item.id} className="group border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors relative cursor-pointer" onClick={() => {
                            setResults(item.content);
                            setPreview(item.image_url);
                            setSelectedPlatform(item.platform || 'amazon');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                         }}>
                            {/* HOVER BORDER EFFECT */}
                            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-violet-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                            
                            <td className="px-8 py-4">
                               <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/10 shadow-lg">
                                  <img src={item.image_url} alt="Product" className="w-full h-full object-cover" />
                               </div>
                            </td>
                            <td className="px-8 py-4">
                               <span className={`px-4 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest ${platformBadge(item.platform)}`}>
                                  {item.platform || 'amazon'}
                               </span>
                            </td>
                            <td className="px-8 py-4">
                               <div className="max-w-[300px]">
                                  <p className="text-white font-bold truncate group-hover:text-violet-400 transition-colors uppercase tracking-tight">{item.content.seoTitle}</p>
                                  <p className="text-[10px] font-medium text-slate-600 mt-1 uppercase tracking-widest">{t('dash.id')}: {item.id.slice(0, 8)}</p>
                               </div>
                            </td>
                            <td className="px-8 py-4">
                               <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                                  <Clock className="w-3.5 h-3.5" />
                                  {new Date(item.created_at).toLocaleDateString()}
                               </div>
                            </td>
                            <td className="px-8 py-4 text-right">
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
                                     <p className="text-xl font-bold text-slate-500 uppercase tracking-tighter">{t('dash.noHistory')}</p>
                                     <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">{t('dash.noSignatures')}</p>
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
              <div className="absolute top-8 left-0 right-0 z-10 text-center">
                <p className="text-xs font-black uppercase tracking-[0.3em] text-white/40 mb-2">{t('dash.cameraVision')}</p>
                <h3 className="text-xl font-black text-white uppercase tracking-tighter">{t('dash.cameraPoint')}</h3>
              </div>

              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />

              <div className="absolute bottom-12 left-0 right-0 z-10 flex items-center justify-center gap-12">
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
    </div>
  )
}
