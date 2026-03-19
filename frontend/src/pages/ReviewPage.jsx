import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CheckCircle2, Download, ChevronLeft, ChevronRight,
  Loader2, AlertCircle, ThumbsUp, ThumbsDown
} from 'lucide-react'
import { getJob, submitFeedback, updateContent } from '../api/client'
import useStore from '../store'
import SKUList from '../components/SKUList'
import VersionPicker from '../components/VersionPicker'

export default function ReviewPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { updateJobProgress, jobStatus, jobTotal, jobProcessed, jobResults, selectedSkuId, setSelectedSkuId, applyResultUpdate } = useStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!jobId) return
    getJob(jobId)
      .then((res) => {
        updateJobProgress(res.data)
        const results = res.data.results || []
        if (results.length > 0 && !selectedSkuId) {
          // Pick the first SKU from versions
          const firstSku = results[0]?.versions?.[0]?.sku_id
          if (firstSku) setSelectedSkuId(firstSku)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [jobId])

  // Build a flat list of SKU results for the sidebar
  const skuEntries = Object.entries(jobResults)
  const skuIds = skuEntries.map(([id]) => id)

  // Build results array for SKUList (needs sku_id + approved)
  const skuListItems = skuEntries.map(([skuId, r]) => {
    const combined = r.combined
    const firstVersion = r.versions?.[0]
    return {
      sku_id: skuId,
      approved: combined?.approved || firstVersion?.approved || false,
      product_title: firstVersion?.product_title || skuId,
    }
  })

  const approvedCount = skuListItems.filter((r) => r.approved).length
  const selectedResult = selectedSkuId ? jobResults[selectedSkuId] : null

  // Navigate to prev/next SKU
  const currentIdx = skuIds.indexOf(selectedSkuId)
  const goPrev = () => currentIdx > 0 && setSelectedSkuId(skuIds[currentIdx - 1])
  const goNext = () => currentIdx < skuIds.length - 1 && setSelectedSkuId(skuIds[currentIdx + 1])

  // Feedback & approve handlers
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [approveLoading, setApproveLoading] = useState(false)

  const handleFeedback = async (isLiked) => {
    if (feedbackLoading || !selectedResult) return
    setFeedbackLoading(true)
    try {
      const content = selectedResult.combined || selectedResult.versions?.[0] || {}
      await submitFeedback(jobId, selectedSkuId, isLiked, content)
      applyResultUpdate(selectedSkuId, { liked: isLiked })
    } catch (e) { console.error(e) }
    finally { setFeedbackLoading(false) }
  }

  const handleApprove = async () => {
    if (!selectedResult) return
    setApproveLoading(true)
    try {
      const current = selectedResult.combined || selectedResult.versions?.[0] || {}
      const next = !current.approved
      await updateContent(jobId, selectedSkuId, {}, next)
      applyResultUpdate(selectedSkuId, { approved: next })
    } catch (e) { console.error(e) }
    finally { setApproveLoading(false) }
  }

  const isApproved = (selectedResult?.combined || selectedResult?.versions?.[0])?.approved
  const isLiked = (selectedResult?.combined || selectedResult?.versions?.[0])?.liked

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />
      </div>
    )
  }

  if (skuEntries.length === 0) {
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
            <span className="text-xs text-stone-400">{skuEntries.length} total</span>
          </div>
          {/* Approved progress */}
          <div className="mt-2.5">
            <div className="flex justify-between text-xs text-stone-400 mb-1">
              <span>{approvedCount} approved</span>
              <span>{skuEntries.length > 0 ? Math.round((approvedCount / skuEntries.length) * 100) : 0}%</span>
            </div>
            <div className="h-1 rounded-full bg-stone-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                style={{ width: `${skuEntries.length > 0 ? (approvedCount / skuEntries.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        <SKUList
          results={skuListItems}
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
            {currentIdx + 1} / {skuEntries.length}
          </span>
          <button
            onClick={goNext}
            disabled={currentIdx >= skuEntries.length - 1}
            className="p-1.5 rounded-lg hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-stone-500" />
          </button>

          {selectedSkuId && (
            <div className="ml-3 text-sm font-medium text-stone-700 truncate">
              {selectedSkuId}
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Feedback buttons */}
          {selectedResult && (
            <div className="flex items-center gap-1 mr-2">
              <button
                onClick={() => handleFeedback(true)}
                disabled={feedbackLoading}
                title="Like — saves as style example"
                className={`p-2 rounded-lg transition-all ${
                  isLiked === true ? 'bg-brand-100 text-brand-600' : 'hover:bg-stone-100 text-stone-400 hover:text-brand-500'
                }`}
              >
                <ThumbsUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleFeedback(false)}
                disabled={feedbackLoading}
                title="Dislike"
                className={`p-2 rounded-lg transition-all ${
                  isLiked === false ? 'bg-red-50 text-red-400' : 'hover:bg-stone-100 text-stone-400 hover:text-red-400'
                }`}
              >
                <ThumbsDown className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Approve button */}
          {selectedResult && (
            <button
              onClick={handleApprove}
              disabled={approveLoading}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                isApproved
                  ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              {isApproved ? 'Approved' : 'Approve'}
            </button>
          )}
        </div>

        {/* Content: VersionPicker */}
        {selectedResult ? (
          <VersionPicker jobId={jobId} skuResult={selectedResult} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">
            Select a product from the list
          </div>
        )}
      </main>
    </div>
  )
}
