import { CheckCircle2, ThumbsUp, ThumbsDown, AlertCircle } from 'lucide-react'

function statusDot(result) {
  if (result.approved) return 'bg-emerald-400'
  if (result.error) return 'bg-red-400'
  if (result.liked === true) return 'bg-brand-400'
  if (result.liked === false) return 'bg-stone-300'
  return 'bg-blue-400'
}

export default function SKUList({ results, selectedId, onSelect }) {
  return (
    <div className="flex-1 overflow-y-auto py-2">
      {results.map((result) => {
        const active = result.sku_id === selectedId
        return (
          <button
            key={result.sku_id}
            onClick={() => onSelect(result.sku_id)}
            className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors
              ${active ? 'bg-brand-50' : 'hover:bg-stone-50'}`}
          >
            {/* Status dot */}
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${statusDot(result)}`} />

            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium truncate leading-snug
                ${active ? 'text-brand-700' : 'text-stone-800'}`}>
                {result.product_title || result.sku_id}
              </p>
              <p className="text-xs text-stone-400 mt-0.5 truncate">{result.sku_id}</p>
            </div>

            {/* Indicators */}
            <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
              {result.approved && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
              {result.liked === true && <ThumbsUp className="w-3 h-3 text-brand-400" />}
              {result.liked === false && <ThumbsDown className="w-3 h-3 text-stone-300" />}
              {result.error && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
            </div>
          </button>
        )
      })}
    </div>
  )
}
