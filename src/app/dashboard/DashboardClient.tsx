'use client'

import { useState, useEffect } from 'react'
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
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
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
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<GeneratedContent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copySuccess, setCopySuccess] = useState<string | null>(null)
  const [history, setHistory] = useState<Generation[]>(initialHistory)
  const [activeTab, setActiveTab] = useState<'seo' | 'shopify' | 'amazon' | 'social' | 'data'>('seo')
  
  // Phase 3 State
  const [refineInput, setRefineInput] = useState('')
  const [isRefining, setIsRefining] = useState(false)
  const [viewMode, setViewMode] = useState<'raw' | 'preview'>('raw')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true) // For mobile bottom sheet

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (selectedFile.size > 4 * 1024 * 1024) {
        setError('File size too large. Please use an image under 4MB.')
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
        body: JSON.stringify({ image: preview }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate content')
      }

      setResults(data)
      router.refresh() // Refresh to update context
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

    try {
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          currentContent: results,
          instruction: finalInstruction 
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to refine content')
      }

      setResults(data)
      setRefineInput('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsRefining(false)
    }
  }

  // --- MOCKUP COMPONENTS ---
  const AmazonMockup = () => (
    <div className="bg-white text-[#111] p-8 rounded-lg shadow-2xl font-sans max-w-4xl mx-auto border border-zinc-200">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="aspect-square rounded-md overflow-hidden bg-white border border-zinc-100 p-4">
             <img src={preview!} alt="Amazon Product" className="w-full h-full object-contain" />
          </div>
        </div>
        <div className="space-y-4">
          <h1 className="text-2xl font-medium leading-tight text-[#111]">
            {results?.seoTitle}
          </h1>
          <div className="flex items-center gap-1 text-[#007185] text-sm hover:underline cursor-pointer">
            Visit the Store
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
            <h3 className="font-bold text-sm">About this item</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-800">
              {results?.amazonBullets?.map((bullet, i) => (
                <li key={i}>{bullet}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-2 pt-4">
            <Button className="w-full bg-[#FFD814] hover:bg-[#F7CA00] text-black border-none rounded-full shadow-sm py-6">
              Add to Cart
            </Button>
            <Button className="w-full bg-[#FFA41C] hover:bg-[#FA8900] text-black border-none rounded-full shadow-sm py-6">
              Buy Now
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  const ShopifyMockup = () => (
    <div className="bg-white text-zinc-900 min-h-[600px] rounded-lg shadow-2xl overflow-hidden font-sans border border-zinc-100">
      <nav className="border-b border-zinc-100 p-6 flex justify-between items-center bg-white">
        <div className="text-xl font-bold tracking-tighter flex items-center gap-2">
           <ShoppingBag className="w-6 h-6" style={{ color: 'var(--theme-primary)' }} />
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
                <span className="text-[var(--theme-primary)] font-semibold tracking-widest text-xs uppercase">New Arrival</span>
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
                    <label className="text-[10px] uppercase font-bold text-zinc-400">Quantity</label>
                    <div className="h-12 border border-zinc-200 rounded-xl flex items-center justify-center font-medium">1</div>
                  </div>
                  <div className="flex-[2] space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-zinc-400">Variant</label>
                    <div className="h-12 border border-zinc-200 rounded-xl flex items-center px-4 justify-between font-medium">
                      Standard
                      <ChevronDown className="w-4 h-4 text-zinc-400" />
                    </div>
                  </div>
                </div>
                <Button 
                  className="w-full py-7 text-lg font-bold rounded-2xl shadow-xl shadow-[var(--theme-primary)]/20 transition-all hover:-translate-y-1"
                  style={{ backgroundColor: 'var(--theme-primary)', color: 'white' }}
                >
                  ADD TO CART
                </Button>
                <div className="flex items-center justify-center gap-2 text-xs text-zinc-400 font-medium pt-2">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  Fast worldwide shipping
                </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  )

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopySuccess(id)
    setTimeout(() => setCopySuccess(null), 2000)
  }

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

  const dynamicThemeStyles = {
    '--theme-primary': results?.dynamicTheme?.dominantColorHex || '#10b981', // emerald-500
    '--theme-accent': results?.dynamicTheme?.accentColorHex || '#34d399', // emerald-400
  } as React.CSSProperties

  return (
    <div className="space-y-8 min-h-screen text-zinc-100" style={dynamicThemeStyles}>
      <div className="flex flex-col gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
        >
          <h2 className="text-xl font-semibold text-white">
            AI Product Copywriter
          </h2>
          
          {/* Top Up / Upgrade Section */}
          <div className="flex flex-wrap gap-3">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="outline"
                className="bg-black/20 backdrop-blur-md border-white/10 hover:bg-white/10 text-zinc-100 shadow-sm group transition-all"
                asChild
              >
                <a 
                  href={`https://jadtrader.lemonsqueezy.com/checkout/buy/173d1849-c625-4fe5-952e-0372e6e337de?checkout[custom][user_id]=${userId}`}
                  className="flex items-center gap-2"
                >
                  <CreditCardIcon className="w-4 h-4 text-zinc-400 group-hover:rotate-12 transition-transform" />
                  Starter Plan ($9)
                </a>
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                className="group border border-[var(--theme-primary)] hover:shadow-[0_0_20px_var(--theme-primary)] transition-all duration-300 relative overflow-hidden text-zinc-50"
                style={{ backgroundColor: 'var(--theme-primary)' }}
                asChild
              >
                <a 
                  href={`https://jadtrader.lemonsqueezy.com/checkout/buy/46ed7c0f-c7ad-4b0b-90f2-11cf50168bf2?checkout[custom][user_id]=${userId}`}
                  className="flex items-center gap-2 relative z-10"
                >
                  <Zap className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                  Upgrade to Pro ($29)
                </a>
              </Button>
            </motion.div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card className="border-white/10 bg-white/20 backdrop-blur-xl overflow-hidden group hover:border-[var(--theme-primary)] hover:shadow-[0_0_30px_-5px_var(--theme-primary)] transition-all duration-500">
            <CardContent className="p-12 text-center text-zinc-100">
              {!preview ? (
                <div
                  className="flex flex-col items-center gap-4 cursor-pointer"
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <div className="p-4 bg-white/5 rounded-full group-hover:scale-110 group-hover:bg-[var(--theme-primary)] transition-all duration-500">
                    <UploadCloud className="w-8 h-8 text-zinc-400 group-hover:text-white transition-colors" />
                  </div>
                  <div>
                    <p className="text-lg font-medium">Drag & Drop or Click to upload</p>
                    <p className="text-sm text-zinc-400">Supported formats: JPEG, PNG (Max 4MB)</p>
                  </div>
                  <input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="relative mx-auto w-full max-w-sm aspect-square rounded-lg overflow-hidden border border-white/10 shadow-2xl bg-black/50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Product preview" className="object-cover w-full h-full transform transition-transform group-hover:scale-105 duration-700 relative z-10" />
                    
                    {/* The AI Pulse (Scanning Laser & Brightness Sweep) */}
                    {loading && (
                      <div className="absolute inset-0 z-20 pointer-events-none rounded-lg overflow-hidden">
                         <div className="absolute inset-0 bg-black/40 backdrop-brightness-150 transition-all duration-500" />
                         <motion.div
                           className="absolute left-0 right-0 h-0.5"
                           style={{ backgroundColor: 'var(--theme-primary)', boxShadow: '0 0 20px 2px var(--theme-primary)' }}
                           animate={{ top: ['0%', '100%', '0%'] }}
                           transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                         />
                      </div>
                    )}

                    {/* Interactive Hotspots */}
                    {!loading && results?.hotspots?.map((hotspot, idx) => (
                      <div
                        key={idx}
                        className="absolute z-20 group/hotspot cursor-pointer"
                        style={{ top: `${hotspot.y}%`, left: `${hotspot.x}%`, transform: 'translate(-50%, -50%)' }}
                      >
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: 0.8 + idx * 0.2, type: 'spring' }}
                          className="w-4 h-4 rounded-full border-2 border-white shadow-[0_0_15px_var(--theme-primary)] relative"
                          style={{ backgroundColor: 'var(--theme-primary)' }}
                        >
                          <span className="absolute inset-0 rounded-full animate-ping opacity-75" style={{ backgroundColor: 'var(--theme-primary)' }} />
                        </motion.div>
                        <div className="absolute top-1/2 left-6 -translate-y-1/2 opacity-0 group-hover/hotspot:opacity-100 transition-opacity pointer-events-none whitespace-nowrap bg-black/60 backdrop-blur-md text-zinc-100 text-xs px-3 py-1.5 rounded-md border border-white/10 shadow-xl">
                          {hotspot.label}
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={() => {
                        setFile(null)
                        setPreview(null)
                        setResults(null)
                      }}
                      disabled={loading}
                      className="absolute top-2 right-2 p-1 bg-black/60 backdrop-blur-md text-zinc-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-full transition-colors z-30 border border-white/10 hover:border-white/30"
                    >
                      <AlertCircle className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex justify-center gap-4">
                    <Button
                      onClick={handleGenerate}
                      disabled={loading || initialCredits <= 0}
                      className="w-full max-w-xs shadow-lg transition-all text-zinc-50 hover:shadow-[0_0_20px_var(--theme-primary)]"
                      style={{ backgroundColor: 'var(--theme-primary)' }}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Analyzing Context...
                        </>
                      ) : initialCredits <= 0 ? (
                        'No Credits Available'
                      ) : (
                        'Ignite Matrix (1 Credit)'
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {error && (
        <div className="bg-red-500/10 backdrop-blur-md border border-red-500/50 text-red-400 p-4 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        {results && (
          <motion.div
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { staggerChildren: 0.15 }
              }
            }}
            className="flex flex-col gap-6"
          >
            <motion.div variants={{
              hidden: { filter: "blur(12px)", opacity: 0, scale: 0.98 },
              visible: { filter: "blur(0px)", opacity: 1, scale: 1 }
            }}>
              <Card className="col-span-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-lg">
                <CardHeader>
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Sparkles className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--theme-primary)' }} />
                      <span 
                         className="bg-clip-text text-transparent bg-gradient-to-r"
                         style={{ backgroundImage: 'linear-gradient(to right, var(--theme-primary), var(--theme-accent))' }}
                      >
                        Matrix Activated
                      </span>
                    </CardTitle>
                    
                    {/* View Mode Toggle */}
                    <div className="flex items-center bg-white/5 backdrop-blur-md border border-white/10 rounded-full p-1 self-start md:self-center">
                      <button
                        onClick={() => setViewMode('raw')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${viewMode === 'raw' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        <Layout className="w-3.5 h-3.5" />
                        Raw Content
                      </button>
                      <button
                        onClick={() => setViewMode('preview')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${viewMode === 'preview' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        <Monitor className="w-3.5 h-3.5" />
                        Live Preview
                      </button>
                    </div>

                    <div className="flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--theme-accent)' }}>
                      <CheckCircle2 className="w-4 h-4" />
                      Target Established
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-8 items-start">
              <div className="space-y-6">
                <AnimatePresence mode="wait">
                  {viewMode === 'raw' ? (
                    <motion.div
                      key="raw-view"
                      initial={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
                      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
                      transition={{ duration: 0.4 }}
                      className="space-y-6"
                    >
                      {/* Tabs Navigation */}
                      <div 
                        className="flex gap-2 p-1 bg-black/40 backdrop-blur-xl border border-white/10 rounded-lg overflow-x-auto w-full custom-scrollbar shadow-lg"
                      >
                        {['seo', 'shopify', 'amazon', 'social', 'data'].map((tabId) => {
                           const labels: Record<string, string> = {
                             seo: 'SEO & Basic',
                             shopify: 'Shopify HTML',
                             amazon: 'Amazon Bullets',
                             social: 'Social & Viral',
                             data: 'Structured Data'
                           }
                           const isActive = activeTab === tabId;
                           return (
                             <button 
                               key={tabId}
                               onClick={() => setActiveTab(tabId as typeof activeTab)} 
                               className={`whitespace-nowrap px-4 py-2 rounded-md text-sm font-medium transition-all duration-300 ${isActive ? 'bg-white/10 shadow-sm text-zinc-50' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'}`}
                               style={isActive ? { borderColor: 'var(--theme-primary)', borderWidth: '1px' } : { borderWidth: '1px', borderColor: 'transparent' }}
                             >
                               {labels[tabId]}
                             </button>
                           )
                        })}
                      </div>

                      <div className="relative">
                         {/* Content Cards based on Active Tab */}
                         {activeTab === 'seo' && (
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <Card className="group hover:shadow-[0_0_15px_var(--theme-primary)] transition-all bg-black/40 backdrop-blur-xl border border-white/10 hover:border-[var(--theme-primary)]">
                               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                 <CardTitle className="text-sm font-medium text-zinc-400">SEO Title</CardTitle>
                                 <Button
                                   variant="ghost"
                                   size="sm"
                                   onClick={() => copyToClipboard(results.seoTitle, 'title')}
                                   className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-300 hover:text-white"
                                 >
                                   {copySuccess === 'title' ? <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--theme-accent)' }} /> : <Copy className="h-4 w-4" />}
                                 </Button>
                               </CardHeader>
                               <CardContent>
                                 <p className="text-base font-semibold text-zinc-100">{results.seoTitle}</p>
                               </CardContent>
                             </Card>

                             <Card className="group hover:shadow-[0_0_15px_var(--theme-primary)] transition-all bg-black/40 backdrop-blur-xl border border-white/10 hover:border-[var(--theme-primary)]">
                               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                 <CardTitle className="text-sm font-medium text-zinc-400">Meta Description</CardTitle>
                                 <Button
                                   variant="ghost"
                                   size="sm"
                                   onClick={() => copyToClipboard(results.metaDescription, 'meta')}
                                   className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-300 hover:text-white"
                                 >
                                   {copySuccess === 'meta' ? <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--theme-accent)' }} /> : <Copy className="h-4 w-4" />}
                                 </Button>
                               </CardHeader>
                               <CardContent>
                                 <p className="text-base text-zinc-100 leading-relaxed">{results.metaDescription}</p>
                               </CardContent>
                             </Card>

                             <Card className="col-span-full group hover:shadow-[0_0_15px_var(--theme-primary)] transition-all bg-black/40 backdrop-blur-xl border border-white/10 hover:border-[var(--theme-primary)]">
                               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                 <CardTitle className="text-sm font-medium text-zinc-400">Product Description</CardTitle>
                                 <Button
                                   variant="ghost"
                                   size="sm"
                                   onClick={() => copyToClipboard(results.productDescription, 'desc')}
                                   className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-300 hover:text-white"
                                 >
                                   {copySuccess === 'desc' ? <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--theme-accent)' }} /> : <Copy className="h-4 w-4" />}
                                 </Button>
                               </CardHeader>
                               <CardContent>
                                 <p className="text-base text-zinc-100 leading-relaxed whitespace-pre-line">
                                   {results.productDescription}
                                 </p>
                               </CardContent>
                             </Card>
                           </div>
                         )}

                         {activeTab === 'shopify' && (
                           <Card className="group hover:shadow-[0_0_15px_var(--theme-primary)] transition-all bg-black/40 backdrop-blur-xl border border-white/10 hover:border-[var(--theme-primary)] overflow-hidden">
                             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-black/20 border-b border-white/5 rounded-t-xl">
                               <CardTitle className="text-sm font-medium text-zinc-400">Shopify HTML Formatted</CardTitle>
                               <Button
                                 variant="ghost"
                                 size="sm"
                                 onClick={() => copyToClipboard(results.shopifyHtml || '', 'shopify')}
                                 className="text-zinc-300 hover:text-white"
                               >
                                 {copySuccess === 'shopify' ? <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--theme-accent)' }} /> : <Copy className="h-4 w-4" />}
                               </Button>
                             </CardHeader>
                             <CardContent className="pt-6 overflow-x-auto custom-scrollbar">
                               {results.shopifyHtml ? (
                                  <div className="prose prose-invert max-w-none text-zinc-100" dangerouslySetInnerHTML={{ __html: results.shopifyHtml }} />
                               ) : (
                                  <p className="text-zinc-500 italic">No Shopify HTML generated.</p>
                               )}
                             </CardContent>
                           </Card>
                         )}

                         {activeTab === 'amazon' && (
                           <Card className="group hover:shadow-[0_0_15px_var(--theme-primary)] transition-all bg-black/40 backdrop-blur-xl border border-white/10 hover:border-[var(--theme-primary)]">
                             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                               <CardTitle className="text-sm font-medium text-zinc-400">A9-Optimized Bullets</CardTitle>
                               <Button
                                 variant="ghost"
                                 size="sm"
                                 onClick={() => copyToClipboard(results.amazonBullets?.join('\n') || '', 'amazon')}
                                 className="text-zinc-300 hover:text-white"
                               >
                                 {copySuccess === 'amazon' ? <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--theme-accent)' }} /> : <Copy className="h-4 w-4" />}
                               </Button>
                             </CardHeader>
                             <CardContent className="pt-4">
                               {results.amazonBullets?.length ? (
                                 <ul className="space-y-3">
                                   {results.amazonBullets.map((bullet, idx) => (
                                     <li key={idx} className="flex items-start gap-3 text-zinc-100">
                                       <span className="font-bold flex-shrink-0 mt-0.5" style={{ color: 'var(--theme-primary)' }}>•</span>
                                       <span>{bullet}</span>
                                     </li>
                                   ))}
                                 </ul>
                               ) : (
                                 <p className="text-zinc-500 italic">No Amazon Bullets generated.</p>
                               )}
                             </CardContent>
                           </Card>
                         )}

                         {activeTab === 'social' && (
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <Card className="group hover:shadow-[0_0_15px_var(--theme-primary)] transition-all bg-black/40 backdrop-blur-xl border border-white/10 hover:border-[var(--theme-primary)]">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                 <CardTitle className="text-sm font-medium text-zinc-400">TikTok/Reels Hook</CardTitle>
                                 <Button
                                   variant="ghost"
                                   size="sm"
                                   onClick={() => copyToClipboard(results.viralScript?.hook || '', 'hook')}
                                   className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-300 hover:text-white"
                                 >
                                   {copySuccess === 'hook' ? <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--theme-accent)' }} /> : <Copy className="h-4 w-4" />}
                                 </Button>
                               </CardHeader>
                               <CardContent>
                                 {results.viralScript?.hook ? (
                                   <p 
                                     className="text-base text-zinc-50 font-medium italic border-l-4 pl-4 py-1"
                                     style={{ borderColor: 'var(--theme-accent)' }}
                                   >&quot;{results.viralScript.hook}&quot;</p>
                                 ) : (
                                   <p className="text-zinc-500 italic">No hook generated.</p>
                                 )}
                               </CardContent>
                             </Card>

                             <Card className="group hover:shadow-[0_0_15px_var(--theme-primary)] transition-all bg-black/40 backdrop-blur-xl border border-white/10 hover:border-[var(--theme-primary)]">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                 <CardTitle className="text-sm font-medium text-zinc-400">Visual Concept</CardTitle>
                                 <Button
                                   variant="ghost"
                                   size="sm"
                                   onClick={() => copyToClipboard(results.viralScript?.concept || '', 'concept')}
                                   className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-300 hover:text-white"
                                 >
                                   {copySuccess === 'concept' ? <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--theme-accent)' }} /> : <Copy className="h-4 w-4" />}
                                 </Button>
                               </CardHeader>
                               <CardContent>
                                 {results.viralScript?.concept ? (
                                   <p className="text-base text-zinc-100 leading-relaxed">{results.viralScript.concept}</p>
                                 ) : (
                                   <p className="text-zinc-500 italic">No concept generated.</p>
                                 )}
                               </CardContent>
                             </Card>

                             <div className="col-span-full flex flex-wrap gap-2">
                                {results.socialMediaTags?.map((tag) => (
                                  <motion.span
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    key={tag}
                                    className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-sm font-medium transition-colors hover:bg-white/10"
                                    style={{ color: 'var(--theme-accent)' }}
                                  >
                                    {tag}
                                  </motion.span>
                                ))}
                             </div>
                           </div>
                         )}

                         {activeTab === 'data' && (
                           <Card className="group hover:shadow-[0_0_15px_var(--theme-primary)] transition-all bg-black/40 backdrop-blur-xl border border-white/10 hover:border-[var(--theme-primary)]">
                             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                               <CardTitle className="text-sm font-medium text-zinc-400">Structured Data</CardTitle>
                               <Button
                                 variant="ghost"
                                 size="sm"
                                 onClick={() => copyToClipboard(JSON.stringify(results.structuredData, null, 2) || '', 'data')}
                                 className="text-zinc-300 hover:text-white"
                               >
                                 {copySuccess === 'data' ? <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--theme-accent)' }} /> : <Copy className="h-4 w-4" />}
                               </Button>
                             </CardHeader>
                             <CardContent>
                               {results.structuredData ? (
                                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                                    <div>
                                      <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Material</p>
                                      <p className="text-zinc-50 font-medium">{results.structuredData.material}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Dominant Color</p>
                                      <p className="text-zinc-50 font-medium">{results.structuredData.dominantColor}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Target Audience</p>
                                      <p className="text-zinc-50 font-medium">{results.structuredData.targetAudience}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Care Instructions</p>
                                      <p className="text-zinc-50 font-medium">{results.structuredData.careInstructions}</p>
                                    </div>
                                 </div>
                               ) : (
                                 <p className="text-zinc-500 italic">No structured data generated.</p>
                               )}
                             </CardContent>
                           </Card>
                         )}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="preview-view"
                      initial={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
                      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
                      transition={{ duration: 0.4 }}
                      className="space-y-8"
                    >
                      <div className="flex justify-center gap-4 p-1 bg-white/20 rounded-full w-fit mx-auto border border-white/10">
                        <button
                          onClick={() => setActiveTab('amazon')}
                          className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${activeTab === 'amazon' ? 'bg-[#FF9900] text-black shadow-lg shadow-[#FF9900]/20' : 'text-zinc-400 hover:text-zinc-200'}`}
                        >
                          Amazon Mode
                        </button>
                        <button
                          onClick={() => setActiveTab('shopify')}
                          className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${activeTab === 'shopify' ? 'bg-[#96bf48] text-white shadow-lg shadow-[#96bf48]/20' : 'text-zinc-400 hover:text-zinc-200'}`}
                        >
                          Shopify Mode
                        </button>
                      </div>

                      {activeTab === 'amazon' ? <AmazonMockup /> : <ShopifyMockup />}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* MATRIX CHAT SIDEBAR */}
              <div className="lg:sticky lg:top-8 order-none lg:order-last">
                <Card className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl h-[600px] flex flex-col group/sidebar">
                  <CardHeader className="border-b border-white/10 bg-white/20 p-4">
                    <div className="flex items-center justify-between">
                       <CardTitle className="text-sm font-bold flex items-center gap-2 text-white">
                         <MessagesSquare className="w-4 h-4" style={{ color: 'var(--theme-primary)' }} />
                         Matrix Chat
                       </CardTitle>
                       <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">Active</span>
                       </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
                    <div className="space-y-4">
                       <div className="bg-white/20 border border-white/10 rounded-2xl p-4 text-xs leading-relaxed text-white">
                         Welcome to the **Matrix Refinement**. Tell me how you&apos;d like to adjust this generation.
                       </div>
                       
                       {/* Quick Action Chips */}
                       <div className="grid grid-cols-2 gap-2">
                         {[
                           { label: 'Professional', icon: Target },
                           { label: 'Shorten', icon: ZapIcon },
                           { label: 'Younger Audience', icon: Smile },
                           { label: 'More Viral', icon: Sparkles }
                         ].map((chip) => (
                           <button
                             key={chip.label}
                             onClick={() => handleRefine(`Make the output more ${chip.label.toLowerCase()}`)}
                             disabled={isRefining}
                             className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 border border-white/10 rounded-xl text-[10px] font-bold text-white hover:bg-gray-700/50 hover:border-[var(--theme-primary)] transition-all group/chip"
                           >
                             <chip.icon className="w-3 h-3 group-hover/chip:text-[var(--theme-primary)] transition-colors" />
                             {chip.label}
                           </button>
                         ))}
                       </div>
                    </div>

                    {isRefining && (
                      <div className="flex items-center gap-3 text-white text-xs py-4">
                        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--theme-primary)' }} />
                        Recalculating Matrix...
                      </div>
                    )}
                  </CardContent>

                  <div className="p-4 border-t border-white/10 bg-white/20">
                    <div className="relative group">
                      <textarea
                        value={refineInput}
                        onChange={(e) => setRefineInput(e.target.value)}
                        placeholder="Refine this generation..."
                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[var(--theme-primary)] transition-all resize-none h-24"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleRefine()
                          }
                        }}
                      />
                      <button
                        onClick={() => handleRefine()}
                        disabled={isRefining || !refineInput.trim()}
                        className="absolute bottom-3 right-3 p-2 rounded-lg bg-[var(--theme-primary)] text-white shadow-lg disabled:opacity-50 disabled:grayscale transition-all hover:scale-105"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent Generations History */}
      <div className="mt-12 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <History className="w-5 h-5" style={{ color: 'var(--theme-primary)' }} />
            Recent Generations
          </h2>
          {history.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCSV(history, 'all_generations.csv')}
              className="border-white/10 bg-white/20 hover:bg-white/30 text-white"
            >
              <FileDown className="w-4 h-4 mr-2" />
              Export All (CSV)
            </Button>
          )}
        </div>
        
        <Card className="border-white/10 bg-white/20 backdrop-blur-xl overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-white uppercase bg-black/60 border-b border-white/10">
                  <tr>
                    <th className="px-6 py-4 font-medium">Image</th>
                    <th className="px-6 py-4 font-medium">Title</th>
                    <th className="px-6 py-4 font-medium">Date</th>
                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {history.map((gen) => (
                    <tr 
                      key={gen.id} 
                      className="hover:bg-white/5 transition-colors cursor-pointer group border-white/10"
                      onClick={() => {
                        setResults(gen.content)
                        setPreview(gen.image_url)
                        // This updates the main dashboard to reflect the clicked generation's theme
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                    >
                      <td className="px-6 py-4">
                        <div className="w-12 h-12 rounded border border-white/20 overflow-hidden bg-black flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={gen.image_url} alt="" className="object-cover max-w-full max-h-full" />
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-200 truncate max-w-[240px] group-hover:text-white">
                        {gen.content.seoTitle}
                      </td>
                      <td className="px-6 py-4 text-gray-200 group-hover:text-white">
                        {new Date(gen.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="px-6 py-4 text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); copyToClipboard(JSON.stringify(gen.content, null, 2), gen.id) }}
                          title="Copy Full Content"
                          className="text-gray-200 hover:text-white"
                        >
                          {copySuccess === gen.id ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); downloadCSV([gen], `generation_${gen.id.slice(0, 8)}.csv`) }}
                          title="Download CSV"
                          className="text-gray-200 hover:text-white"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-400 italic">
                        <div className="flex flex-col items-center gap-2">
                          <UploadCloud className="w-8 h-8 opacity-20" />
                          <p>No generations found yet. Your history will appear here.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
