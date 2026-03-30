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

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
        >
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            AI Product Copywriter
          </h2>
          
          {/* Top Up / Upgrade Section */}
          <div className="flex flex-wrap gap-3">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="outline"
                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm group"
                asChild
              >
                <a 
                  href={`https://jadtrader.lemonsqueezy.com/checkout/buy/173d1849-c625-4fe5-952e-0372e6e337de?checkout[custom][user_id]=${userId}`}
                  className="flex items-center gap-2"
                >
                  <CreditCardIcon className="w-4 h-4 text-zinc-500 group-hover:rotate-12 transition-transform" />
                  Starter Plan ($9)
                </a>
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20 group"
                asChild
              >
                <a 
                  href={`https://jadtrader.lemonsqueezy.com/checkout/buy/46ed7c0f-c7ad-4b0b-90f2-11cf50168bf2?checkout[custom][user_id]=${userId}`}
                  className="flex items-center gap-2"
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
          <Card className="border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden group hover:border-primary/50 transition-colors">
            <CardContent className="p-12 text-center">
              {!preview ? (
                <div
                  className="flex flex-col items-center gap-4 cursor-pointer"
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-full group-hover:scale-110 transition-transform duration-500">
                    <UploadCloud className="w-8 h-8 text-zinc-500 group-hover:text-primary transition-colors" />
                  </div>
                  <div>
                    <p className="text-lg font-medium">Drag & Drop or Click to upload</p>
                    <p className="text-sm text-zinc-500">Supported formats: JPEG, PNG (Max 4MB)</p>
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
                  <div className="relative mx-auto w-full max-w-sm aspect-square rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Product preview" className="object-contain w-full h-full transform transition-transform group-hover:scale-105 duration-700" />
                    <button
                      onClick={() => {
                        setFile(null)
                        setPreview(null)
                        setResults(null)
                      }}
                      className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors z-10"
                    >
                      <AlertCircle className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex justify-center gap-4">
                    <Button
                      onClick={handleGenerate}
                      disabled={loading || initialCredits <= 0}
                      className="w-full max-w-xs shadow-lg shadow-primary/10"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Analyzing...
                        </>
                      ) : initialCredits <= 0 ? (
                        'No Credits Available'
                      ) : (
                        'Generate Copy (1 Credit)'
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
        <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        {results && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col gap-6"
          >
            <Card className="col-span-full bg-zinc-50/50 dark:bg-zinc-900/50 border-emerald-500/20">
              <CardHeader>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-500" />
                    Generated E-commerce Assets
                  </CardTitle>
                  <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Completed
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Tabs Navigation */}
            <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-x-auto w-full md:w-fit custom-scrollbar">
              <button onClick={() => setActiveTab('seo')} className={`whitespace-nowrap px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'seo' ? 'bg-white shadow-sm dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}>SEO & Basic</button>
              <button onClick={() => setActiveTab('shopify')} className={`whitespace-nowrap px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'shopify' ? 'bg-white shadow-sm dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}>Shopify HTML</button>
              <button onClick={() => setActiveTab('amazon')} className={`whitespace-nowrap px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'amazon' ? 'bg-white shadow-sm dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}>Amazon Bullets</button>
              <button onClick={() => setActiveTab('social')} className={`whitespace-nowrap px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'social' ? 'bg-white shadow-sm dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}>Social & Viral</button>
              <button onClick={() => setActiveTab('data')} className={`whitespace-nowrap px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'data' ? 'bg-white shadow-sm dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}>Structured Data</button>
            </div>

            <div className="relative">
              <AnimatePresence mode="wait">
                {activeTab === 'seo' && (
                  <motion.div
                    key="seo"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                  >
                    <Card className="group hover:shadow-md transition-shadow">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-500">SEO Title</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(results.seoTitle, 'title')}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {copySuccess === 'title' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </CardHeader>
                      <CardContent>
                        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{results.seoTitle}</p>
                      </CardContent>
                    </Card>

                    <Card className="group hover:shadow-md transition-shadow">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-500">Meta Description</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(results.metaDescription, 'meta')}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {copySuccess === 'meta' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </CardHeader>
                      <CardContent>
                        <p className="text-base text-zinc-900 dark:text-zinc-50 leading-relaxed">{results.metaDescription}</p>
                      </CardContent>
                    </Card>

                    <Card className="col-span-full group hover:shadow-md transition-shadow">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-500">Product Description</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(results.productDescription, 'desc')}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {copySuccess === 'desc' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </CardHeader>
                      <CardContent>
                        <p className="text-base text-zinc-900 dark:text-zinc-50 leading-relaxed whitespace-pre-line">
                          {results.productDescription}
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {activeTab === 'shopify' && (
                  <motion.div
                    key="shopify"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="grid grid-cols-1 gap-6"
                  >
                    <Card className="group hover:shadow-md transition-shadow">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 rounded-t-xl">
                        <CardTitle className="text-sm font-medium text-zinc-500">Shopify HTML Formatted</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(results.shopifyHtml || '', 'shopify')}
                        >
                          {copySuccess === 'shopify' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </CardHeader>
                      <CardContent className="pt-6 overflow-x-auto">
                        {results.shopifyHtml ? (
                           <div className="prose dark:prose-invert max-w-none text-zinc-900 dark:text-zinc-100" dangerouslySetInnerHTML={{ __html: results.shopifyHtml }} />
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
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="grid grid-cols-1 gap-6"
                  >
                    <Card className="group hover:shadow-md transition-shadow">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-500">A9-Optimized Bullets</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(results.amazonBullets?.join('\n') || '', 'amazon')}
                        >
                          {copySuccess === 'amazon' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </CardHeader>
                      <CardContent className="pt-4">
                        {results.amazonBullets?.length ? (
                          <ul className="space-y-3">
                            {results.amazonBullets.map((bullet, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-zinc-900 dark:text-zinc-50">
                                <span className="font-bold text-primary shrink-0 mt-0.5">•</span>
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
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                  >
                    <Card className="group hover:shadow-md transition-shadow">
                       <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-500">TikTok/Reels Hook</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(results.viralScript?.hook || '', 'hook')}
                        >
                          {copySuccess === 'hook' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </CardHeader>
                      <CardContent>
                        {results.viralScript?.hook ? (
                          <p className="text-base text-zinc-900 dark:text-zinc-50 font-medium italic border-l-4 border-indigo-500 pl-4 py-1">&quot;{results.viralScript.hook}&quot;</p>
                        ) : (
                          <p className="text-zinc-500 italic">No hook generated (Legacy Record).</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="group hover:shadow-md transition-shadow">
                       <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-500">Visual Concept</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(results.viralScript?.concept || '', 'concept')}
                        >
                          {copySuccess === 'concept' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </CardHeader>
                      <CardContent>
                        {results.viralScript?.concept ? (
                          <p className="text-base text-zinc-900 dark:text-zinc-50 leading-relaxed">{results.viralScript.concept}</p>
                        ) : (
                          <p className="text-zinc-500 italic">No concept generated (Legacy Record).</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="col-span-full">
                      <CardHeader>
                        <CardTitle className="text-sm font-medium text-zinc-500">Social Media Tags</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2">
                        {results.socialMediaTags?.map((tag) => (
                          <motion.span
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            key={tag}
                            className="px-3 py-1 bg-primary/5 dark:bg-primary/10 border border-primary/10 rounded-full text-sm text-primary font-medium"
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
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="grid grid-cols-1 gap-6"
                  >
                     <Card className="group hover:shadow-md transition-shadow">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-500">Structured Data (Filters/Variants)</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(JSON.stringify(results.structuredData, null, 2) || '', 'data')}
                        >
                          {copySuccess === 'data' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </CardHeader>
                      <CardContent>
                        {results.structuredData ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                             <div>
                               <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Material</p>
                               <p className="text-zinc-900 dark:text-zinc-50 font-medium">{results.structuredData.material}</p>
                             </div>
                             <div>
                               <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Dominant Color</p>
                               <p className="text-zinc-900 dark:text-zinc-50 font-medium">{results.structuredData.dominantColor}</p>
                             </div>
                             <div>
                               <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Target Audience</p>
                               <p className="text-zinc-900 dark:text-zinc-50 font-medium">{results.structuredData.targetAudience}</p>
                             </div>
                             <div>
                               <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Care Instructions</p>
                               <p className="text-zinc-900 dark:text-zinc-50 font-medium">{results.structuredData.careInstructions}</p>
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
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Recent Generations
          </h2>
          {history.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCSV(history, 'all_generations.csv')}
              className="border-zinc-200 dark:border-zinc-800"
            >
              <FileDown className="w-4 h-4 mr-2" />
              Export All (CSV)
            </Button>
          )}
        </div>
        
        <Card className="border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="px-6 py-4 font-medium">Image</th>
                    <th className="px-6 py-4 font-medium">Title</th>
                    <th className="px-6 py-4 font-medium">Date</th>
                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {history.map((gen) => (
                    <tr key={gen.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="w-12 h-12 rounded border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-white flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={gen.image_url} alt="" className="object-contain max-w-full max-h-full" />
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[240px]">
                        {gen.content.seoTitle}
                      </td>
                      <td className="px-6 py-4 text-zinc-500">
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
                          onClick={() => copyToClipboard(JSON.stringify(gen.content, null, 2), gen.id)}
                          title="Copy Full Content"
                          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                        >
                          {copySuccess === gen.id ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadCSV([gen], `generation_${gen.id.slice(0, 8)}.csv`)}
                          title="Download CSV"
                          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
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
