'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Download,
  History,
  FileDown,
  Zap,
  CreditCard as CreditCardIcon,
  Sparkles,
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
          <h2 className="text-xl font-semibold text-zinc-50">
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
          <Card className="border-dashed border-white/20 bg-black/40 backdrop-blur-xl overflow-hidden group hover:border-[var(--theme-primary)] hover:shadow-[0_0_30px_-5px_var(--theme-primary)] transition-all duration-500">
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
                    <CardTitle className="flex items-center gap-2 text-zinc-100">
                      <Sparkles className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--theme-primary)' }} />
                      <span 
                         className="bg-clip-text text-transparent bg-gradient-to-r"
                         style={{ backgroundImage: 'linear-gradient(to right, var(--theme-primary), var(--theme-accent))' }}
                      >
                        Matrix Activated
                      </span>
                    </CardTitle>
                    <div className="flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--theme-accent)' }}>
                      <CheckCircle2 className="w-4 h-4" />
                      Target Established
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </motion.div>

            {/* Tabs Navigation */}
            <motion.div 
              variants={{
                hidden: { filter: "blur(12px)", opacity: 0, scale: 0.98 },
                visible: { filter: "blur(0px)", opacity: 1, scale: 1 }
              }}
              className="flex gap-2 p-1 bg-black/40 backdrop-blur-xl border border-white/10 rounded-lg overflow-x-auto w-full md:w-fit custom-scrollbar shadow-lg"
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
            </motion.div>

            <div className="relative">
              <AnimatePresence mode="wait">
                {activeTab === 'seo' && (
                  <motion.div
                    key="seo"
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    variants={{
                      hidden: { filter: "blur(12px)", opacity: 0, x: 10 },
                      visible: { filter: "blur(0px)", opacity: 1, x: 0 }
                    }}
                    transition={{ duration: 0.3 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                  >
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
                  </motion.div>
                )}

                {activeTab === 'shopify' && (
                  <motion.div
                    key="shopify"
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    variants={{
                      hidden: { filter: "blur(12px)", opacity: 0, x: 10 },
                      visible: { filter: "blur(0px)", opacity: 1, x: 0 }
                    }}
                    transition={{ duration: 0.3 }}
                    className="grid grid-cols-1 gap-6"
                  >
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
                           <p className="text-zinc-500 italic">No Shopify HTML generated (Legacy Record).</p>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {activeTab === 'amazon' && (
                  <motion.div
                    key="amazon"
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    variants={{
                      hidden: { filter: "blur(12px)", opacity: 0, x: 10 },
                      visible: { filter: "blur(0px)", opacity: 1, x: 0 }
                    }}
                    transition={{ duration: 0.3 }}
                    className="grid grid-cols-1 gap-6"
                  >
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
                          <p className="text-zinc-500 italic">No Amazon Bullets generated (Legacy Record).</p>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {activeTab === 'social' && (
                  <motion.div
                    key="social"
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    variants={{
                      hidden: { filter: "blur(12px)", opacity: 0, x: 10 },
                      visible: { filter: "blur(0px)", opacity: 1, x: 0 }
                    }}
                    transition={{ duration: 0.3 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                  >
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
                          <p className="text-zinc-500 italic">No hook generated (Legacy Record).</p>
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
                          <p className="text-zinc-500 italic">No concept generated (Legacy Record).</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="col-span-full bg-black/40 backdrop-blur-xl border border-white/10">
                      <CardHeader>
                        <CardTitle className="text-sm font-medium text-zinc-400">Social Media Tags</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2">
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
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {activeTab === 'data' && (
                  <motion.div
                    key="data"
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    variants={{
                      hidden: { filter: "blur(12px)", opacity: 0, x: 10 },
                      visible: { filter: "blur(0px)", opacity: 1, x: 0 }
                    }}
                    transition={{ duration: 0.3 }}
                    className="grid grid-cols-1 gap-6"
                  >
                     <Card className="group hover:shadow-[0_0_15px_var(--theme-primary)] transition-all bg-black/40 backdrop-blur-xl border border-white/10 hover:border-[var(--theme-primary)]">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">Structured Data (Filters/Variants)</CardTitle>
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
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/10">
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
                          <p className="text-zinc-500 italic">No structured data generated (Legacy Record).</p>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent Generations History */}
      <div className="mt-12 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-50 flex items-center gap-2">
            <History className="w-5 h-5" style={{ color: 'var(--theme-primary)' }} />
            Recent Generations
          </h2>
          {history.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCSV(history, 'all_generations.csv')}
              className="border-white/10 bg-white/5 hover:bg-white/10 text-zinc-100"
            >
              <FileDown className="w-4 h-4 mr-2" />
              Export All (CSV)
            </Button>
          )}
        </div>
        
        <Card className="border-white/10 bg-black/40 backdrop-blur-xl overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-400 uppercase bg-black/60 border-b border-white/10">
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
                      className="hover:bg-white/5 transition-colors cursor-pointer group"
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
                      <td className="px-6 py-4 font-medium text-zinc-100 truncate max-w-[240px] group-hover:text-white">
                        {gen.content.seoTitle}
                      </td>
                      <td className="px-6 py-4 text-zinc-400">
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
                          className="text-zinc-400 hover:text-zinc-100"
                        >
                          {copySuccess === gen.id ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); downloadCSV([gen], `generation_${gen.id.slice(0, 8)}.csv`) }}
                          title="Download CSV"
                          className="text-zinc-400 hover:text-zinc-100"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-zinc-500 italic">
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
