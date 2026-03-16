import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Download, FileJson, FileSpreadsheet, CheckCircle2, ArrowLeft,
  Filter, Info
} from 'lucide-react'
import { getJob, exportContent } from '../api/client'
import useStore from '../store'

const FORMAT_OPTIONS = [
  {
    id: 'json',
    label: 'JSON',
    description: 'Structured format, ideal for CMS imports and developer handoff.',
    icon: FileJson,
    ext: '.json',
  },
  {
    id: 'csv',
    label: 'CSV / Excel',
    description: 'Spreadsheet format, ideal for manual review or bulk upload tools.',
    icon: FileSpreadsheet,
    ext: '.csv',
  },
]

export default function ExportPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { jobResults, updateJobProgress } = useStore()

  const [format, setFormat] = useState('json')
  const [approvedOnly, setApprovedOnly] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  const results = Object.values(jobResults)
  const approvedCount = results.filter((r) => r.approved).length
  const exportCount = approvedOnly ? approvedCount : results.length

  useEffect(() => {
    if (results.length === 0 && jobId) {
      getJob(jobId).then((res) => updateJobProgress(res.data)).catch(console.error)
    }
  }, [jobId])

  const handleExport = async () => {
    setDownloading(true)
    try {
      const res = await exportContent(jobId, format, approvedOnly)
      const blob = new Blob([res.data])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `durian_content_${jobId}.${format === 'json' ? 'json' : 'csv'}`
      a.click()
      URL.revokeObjectURL(url)
      setDownloaded(true)
      setTimeout(() => setDownloaded(false), 3000)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-16 animate-fade-in">
      {/* Back */}
      <button
        onClick={() => navigate(`/review/${jobId}`)}
        className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to review
      </button>

      <h1 className="text-2xl font-semibold text-stone-900 tracking-tight mb-1.5">
        Export Content
      </h1>
      <p className="text-stone-500 text-sm mb-8">
        Download your generated content for CMS upload, team review, or marketplace listing.
      </p>

      {/* Format selector */}
      <section className="mb-6">
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
          Format
        </label>
        <div className="grid grid-cols-2 gap-3">
          {FORMAT_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const active = format === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => setFormat(opt.id)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  active
                    ? 'border-brand-400 bg-brand-50 shadow-sm'
                    : 'border-stone-200 bg-white hover:border-stone-300'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${
                  active ? 'bg-brand-500' : 'bg-stone-100'
                }`}>
                  <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-stone-500'}`} />
                </div>
                <p className={`text-sm font-semibold mb-1 ${active ? 'text-brand-700' : 'text-stone-800'}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-stone-400 leading-relaxed">{opt.description}</p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Filter: approved only */}
      <section className="mb-8">
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
          Filter
        </label>
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <button
            onClick={() => setApprovedOnly(false)}
            className={`w-full flex items-center justify-between px-4 py-3.5 transition-colors ${
              !approvedOnly ? 'bg-brand-50' : 'hover:bg-stone-50'
            }`}
          >
            <div>
              <p className={`text-sm font-medium ${!approvedOnly ? 'text-brand-700' : 'text-stone-700'}`}>
                All generated content
              </p>
              <p className="text-xs text-stone-400">{results.length} products</p>
            </div>
            {!approvedOnly && <CheckCircle2 className="w-4 h-4 text-brand-500" />}
          </button>
          <div className="h-px bg-stone-100" />
          <button
            onClick={() => setApprovedOnly(true)}
            className={`w-full flex items-center justify-between px-4 py-3.5 transition-colors ${
              approvedOnly ? 'bg-brand-50' : 'hover:bg-stone-50'
            }`}
          >
            <div>
              <p className={`text-sm font-medium ${approvedOnly ? 'text-brand-700' : 'text-stone-700'}`}>
                Approved only
              </p>
              <p className="text-xs text-stone-400">
                {approvedCount > 0 ? `${approvedCount} products` : 'None approved yet'}
              </p>
            </div>
            {approvedOnly && <CheckCircle2 className="w-4 h-4 text-brand-500" />}
          </button>
        </div>
        {approvedOnly && approvedCount === 0 && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-600">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            No approved items yet. Approve products in the review panel first.
          </div>
        )}
      </section>

      {/* Export summary */}
      <div className="mb-6 p-4 bg-stone-50 rounded-xl border border-stone-200">
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-600">Products to export</span>
          <span className="font-semibold text-stone-900">{exportCount}</span>
        </div>
        <div className="flex items-center justify-between text-sm mt-1.5">
          <span className="text-stone-600">File format</span>
          <span className="font-semibold text-stone-900">
            {FORMAT_OPTIONS.find((f) => f.id === format)?.label}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm mt-1.5">
          <span className="text-stone-600">Job ID</span>
          <span className="font-mono text-xs text-stone-500">{jobId}</span>
        </div>
      </div>

      {/* Download button */}
      <button
        onClick={handleExport}
        disabled={downloading || exportCount === 0}
        className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 
          transition-all ${
          downloaded
            ? 'bg-emerald-500 text-white'
            : exportCount > 0 && !downloading
            ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm hover:shadow-md'
            : 'bg-stone-100 text-stone-400 cursor-not-allowed'
        }`}
      >
        {downloading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Preparing download…
          </>
        ) : downloaded ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Downloaded!
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Download {exportCount} product{exportCount !== 1 ? 's' : ''}
          </>
        )}
      </button>
    </div>
  )
}
