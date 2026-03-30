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
} from 'lucide-react'
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
}

interface Generation {
  id: string
  created_at: string
  content: GeneratedContent
  image_url: string
}

export default function DashboardClient({ 
  initialCredits, 
  initialHistory 
}: { 
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
    const headers = ['SEO Title', 'Meta Description', 'Product Description', 'Social Media Tags', 'Created At']
    const rows = data.map(item => [
      item.content.seoTitle,
      item.content.metaDescription,
      item.content.productDescription,
      item.content.socialMediaTags.join('; '),
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
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          AI Product Copywriter
        </h2>
        <Card className="border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <CardContent className="p-12 text-center">
            {!preview ? (
              <div
                className="flex flex-col items-center gap-4 cursor-pointer"
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-full">
                  <UploadCloud className="w-8 h-8 text-zinc-500" />
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
                <div className="relative mx-auto w-full max-w-sm aspect-square rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Product preview" className="object-contain w-full h-full" />
                  <button
                    onClick={() => {
                      setFile(null)
                      setPreview(null)
                      setResults(null)
                    }}
                    className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                  >
                    <AlertCircle className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex justify-center gap-4">
                  <Button
                    onClick={handleGenerate}
                    disabled={loading || initialCredits <= 0}
                    className="w-full max-w-xs"
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
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {results && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card className="col-span-full">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Generated E-commerce Assets</CardTitle>
                <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Completed
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SEO Title</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(results.seoTitle, 'title')}
              >
                {copySuccess === 'title' ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-base text-zinc-900 dark:text-zinc-50">{results.seoTitle}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Meta Description</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(results.metaDescription, 'meta')}
              >
                {copySuccess === 'meta' ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-base text-zinc-900 dark:text-zinc-50">{results.metaDescription}</p>
            </CardContent>
          </Card>

          <Card className="col-span-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Product Description</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(results.productDescription, 'desc')}
              >
                {copySuccess === 'desc' ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-base text-zinc-900 dark:text-zinc-50 leading-relaxed">
                {results.productDescription}
              </p>
            </CardContent>
          </Card>

          <Card className="col-span-full">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Social Media Tags</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {results.socialMediaTags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded text-sm text-zinc-600 dark:text-zinc-400"
                >
                  {tag}
                </span>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

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
