import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CheckCircle2, Download, ChevronLeft, ChevronRight,
  Loader2, AlertCircle
} from 'lucide-react'
import { getJob } from '../api/client'
import useStore from '../store'
import SKUList from '../components/SKUList'
import ContentPanel from '../components/ContentPanel'

export default function ReviewPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { updateJobProgress, jobStatus, jobTotal, jobProcessed, jobResults, selectedSkuId, setSelectedSkuId } = useStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!jobId) return
    getJob(jobId)
      .then((res) => {
        updateJobProgress(res.data)
        const results = res.data.results || []
        if (results.length > 0 && !selectedSkuId) {
          setSelectedSkuId(results[0].sku_id)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [jobId])

  const results = Object.values(jobResults)
  const approvedCount = results.filter((r) => r.approved).length
  const selectedResult = selectedSkuId ? jobResults[selectedSkuId] : null

  // Navigate to prev/next SKU
  const skuIds = results.map((r) => r.sku_id)
  const currentIdx = skuIds.indexOf(selectedSkuId)
  const goPrev = () => currentIdx > 0 && setSelectedSkuId(skuIds[currentIdx - 1])
  const goNext = () => currentIdx < skuIds.length - 1 && setSelectedSkuId(skuIds[currentIdx + 1])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] text-center px-6">
        <AlertCircle className="w-10 h-10 text-stone-300 mb-4" />
        <p className="text-stone-500 text-sm">No results found for this job.</p>
        <button onClick={() => navigate('/')} className="mt-4 text-brand-500 text-sm font-medium hover:underline">
          ← Start over
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Left: SKU list */}
      <aside className="w-72 flex-shrink-0 border-r border-stone-200 bg-white flex flex-col">
        {/* Panel header */}
        <div className="px-4 py-3.5 border-b border-stone-100">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
              Products
            </span>
            <span className="text-xs text-stone-400">{results.length} total</span>
          </div>
          {/* Approved progress */}
          <div className="mt-2.5">
            <div className="flex justify-between text-xs text-stone-400 mb-1">
              <span>{approvedCount} approved</span>
              <span>{Math.round((approvedCount / results.length) * 100)}%</span>
            </div>
            <div className="h-1 rounded-full bg-stone-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                style={{ width: `${(approvedCount / results.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <SKUList
          results={results}
          selectedId={selectedSkuId}
          onSelect={setSelectedSkuId}
        />

        {/* Export CTA */}
        <div className="p-3 border-t border-stone-100">
          <button
            onClick={() => navigate(`/export/${jobId}`)}
            className="w-full py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold 
              flex items-center justify-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export Content
            {approvedCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/25 text-white text-xs">
                {approvedCount} approved
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* Right: Content panel */}
      <main className="flex-1 flex flex-col overflow-hidden bg-stone-50">
        {/* Navigation bar */}
        <div className="h-12 flex items-center px-5 bg-white border-b border-stone-100 flex-shrink-0">
          <button
            onClick={goPrev}
            disabled={currentIdx <= 0}
            className="p-1.5 rounded-lg hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-stone-500" />
          </button>
          <span className="text-xs text-stone-400 mx-2">
            {currentIdx + 1} / {results.length}
          </span>
          <button
            onClick={goNext}
            disabled={currentIdx >= results.length - 1}
            className="p-1.5 rounded-lg hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-stone-500" />
          </button>

          {selectedResult && (
            <div className="ml-3 text-sm font-medium text-stone-700 truncate">
              {selectedResult.product_title || selectedResult.sku_id}
            </div>
          )}

          {selectedResult?.approved && (
            <div className="ml-auto flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Approved
            </div>
          )}
        </div>

        {/* Content */}
        {selectedResult ? (
          <ContentPanel jobId={jobId} result={selectedResult} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">
            Select a product from the list
          </div>
        )}
      </main>
    </div>
  )
}
