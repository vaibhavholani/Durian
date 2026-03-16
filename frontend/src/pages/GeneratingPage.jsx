import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2, Sparkles } from 'lucide-react'
import { getJob } from '../api/client'
import useStore from '../store'

const POLL_INTERVAL = 2500

export default function GeneratingPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { jobStatus, jobTotal, jobProcessed, jobResults, jobErrors, updateJobProgress, setJob } =
    useStore()
  const pollRef = useRef(null)

  useEffect(() => {
    if (!jobId) return

    const poll = async () => {
      try {
        const res = await getJob(jobId)
        updateJobProgress(res.data)

        if (res.data.status === 'completed' || res.data.status === 'failed') {
          clearInterval(pollRef.current)
          if (res.data.status === 'completed') {
            setTimeout(() => navigate(`/review/${jobId}`), 800)
          }
        }
      } catch (err) {
        console.error('Poll error:', err)
      }
    }

    poll()
    pollRef.current = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(pollRef.current)
  }, [jobId])

  const pct = jobTotal > 0 ? Math.round((jobProcessed / jobTotal) * 100) : 0
  const resultsList = Object.values(jobResults)
  const isFailed = jobStatus === 'failed'

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 animate-fade-in">
      {/* Header */}
      <div className="text-center mb-10">
        {isFailed ? (
          <div className="w-14 h-14 mx-auto rounded-2xl bg-red-100 flex items-center justify-center mb-5">
            <XCircle className="w-7 h-7 text-red-500" />
          </div>
        ) : jobStatus === 'completed' ? (
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 flex items-center justify-center mb-5">
            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          </div>
        ) : (
          <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-100 flex items-center justify-center mb-5">
            <Sparkles className="w-7 h-7 text-brand-500 animate-pulse-slow" />
          </div>
        )}

        <h2 className="text-2xl font-semibold text-stone-900 tracking-tight mb-2">
          {isFailed
            ? 'Generation Failed'
            : jobStatus === 'completed'
            ? 'All done!'
            : 'Writing your content…'}
        </h2>
        <p className="text-stone-500 text-sm">
          {isFailed
            ? 'Something went wrong. Check errors below.'
            : jobStatus === 'completed'
            ? `Generated content for ${jobProcessed} products. Redirecting to review…`
            : `AI is crafting copy for ${jobTotal} product${jobTotal !== 1 ? 's' : ''}. This takes about a minute.`}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-medium text-stone-500">
            {jobProcessed} of {jobTotal} processed
          </span>
          <span className="text-xs font-semibold text-stone-700">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isFailed ? 'bg-red-400' : 'bg-brand-400'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Live SKU feed */}
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {resultsList.slice(-15).reverse().map((item) => (
          <div
            key={item.sku_id}
            className="flex items-center gap-3 p-3 bg-white rounded-lg border border-stone-100 animate-slide-up"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-800 truncate">
                {item.product_title || item.sku_id}
              </p>
              {item.sku_id !== item.product_title && (
                <p className="text-xs text-stone-400">{item.sku_id}</p>
              )}
            </div>
          </div>
        ))}

        {/* Skeleton for in-progress */}
        {jobStatus === 'processing' && jobProcessed < jobTotal && (
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-stone-100">
            <Loader2 className="w-4 h-4 text-brand-400 animate-spin flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3 w-2/3" />
              <div className="skeleton h-2.5 w-1/3" />
            </div>
          </div>
        )}

        {/* Errors */}
        {jobErrors.map((err, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-100"
          >
            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-red-700 truncate">{err.sku_id}</p>
              <p className="text-xs text-red-500 truncate">{err.error}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Manual continue button if stuck */}
      {jobStatus === 'completed' && (
        <button
          onClick={() => navigate(`/review/${jobId}`)}
          className="mt-8 w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm transition-colors"
        >
          Go to Review →
        </button>
      )}
    </div>
  )
}
