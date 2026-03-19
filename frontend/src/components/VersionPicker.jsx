import { useState } from 'react'
import {
  CheckCircle2, Loader2, Sparkles, BookOpen, List, Heart,
  AlignLeft, Hash, ArrowLeft, Eye
} from 'lucide-react'
import { combineVersions } from '../api/client'
import useStore from '../store'

// ── Section config ──────────────────────────────────────────────────────────
const FIELDS = [
  { key: 'design_story', label: 'Design Story', icon: BookOpen },
  { key: 'what_you_need_to_know', label: 'What You Need to Know', icon: List },
  { key: 'wyli_icon_text', label: 'Why You Will Love It', icon: Heart },
  { key: 'icons', label: 'W Icons (Feature Badges)', icon: Sparkles, isGroup: true,
    subKeys: ['w_icon_1', 'w_icon_2', 'w_icon_3', 'w_icon_4'] },
  { key: 'small_description', label: 'Small Description', icon: AlignLeft },
  { key: 'meta_keywords', label: 'Meta Keywords', icon: Hash },
]

const VERSION_LABELS = ['V1', 'V2', 'V3']
const VERSION_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-700', ring: 'ring-blue-200', badge: 'bg-blue-100 text-blue-700', activeBg: 'bg-blue-50/80' },
  { bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-700', ring: 'ring-amber-200', badge: 'bg-amber-100 text-amber-700', activeBg: 'bg-amber-50/80' },
  { bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-700', ring: 'ring-emerald-200', badge: 'bg-emerald-100 text-emerald-700', activeBg: 'bg-emerald-50/80' },
]

// ── Rich content renderers (matching ContentPanel formatting) ───────────────

function EmptyState() {
  return <span className="text-stone-300 text-sm italic">Not generated</span>
}

function RichContent({ fieldKey, value, version }) {
  if (!value) return <EmptyState />

  if (fieldKey === 'what_you_need_to_know') {
    const lines = value.split('\n')
    return (
      <div className="space-y-1.5">
        {lines.map((line, i) => {
          const isNumbered = /^\d+\./.test(line.trim())
          return (
            <p key={i} className={`text-sm leading-relaxed ${
              isNumbered ? 'font-semibold text-stone-800 mt-1.5' : 'text-stone-600'
            }`}>{line}</p>
          )
        })}
      </div>
    )
  }

  if (fieldKey === 'wyli_icon_text') {
    const [headline, ...rest] = value.split('\n')
    return (
      <div>
        <p className="text-sm font-semibold text-stone-900 mb-1">{headline}</p>
        {rest.length > 0 && <p className="text-sm text-stone-600 leading-relaxed">{rest.join(' ')}</p>}
      </div>
    )
  }

  if (fieldKey === 'meta_keywords') {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.split(',').map((kw, i) => (
          <span key={i} className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-xs font-medium">{kw.trim()}</span>
        ))}
      </div>
    )
  }

  // Default: design_story, small_description
  return <p className="text-sm text-stone-700 leading-[1.75] whitespace-pre-wrap">{value}</p>
}

function IconBadges({ version }) {
  const icons = [version?.w_icon_1, version?.w_icon_2, version?.w_icon_3, version?.w_icon_4]
  const hasAny = icons.some(Boolean)
  if (!hasAny) return <EmptyState />
  return (
    <div className="flex flex-wrap gap-2">
      {icons.map((ic, i) =>
        ic ? (
          <span key={i} className="px-3 py-1.5 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-xs font-medium">{ic}</span>
        ) : (
          <span key={i} className="px-3 py-1.5 rounded-full bg-stone-100 text-stone-300 text-xs">Icon {i + 1} empty</span>
        )
      )}
    </div>
  )
}

// ── Version card ────────────────────────────────────────────────────────────

function VersionCard({ idx, isSelected, onClick, children }) {
  const colors = VERSION_COLORS[idx]
  return (
    <button
      onClick={onClick}
      className={`relative text-left w-full p-4 rounded-xl border-2 transition-all duration-150 ${
        isSelected
          ? `${colors.border} ${colors.bg} ring-2 ${colors.ring}`
          : 'border-stone-150 bg-white hover:border-stone-250 hover:bg-stone-50/50'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
          {VERSION_LABELS[idx]}
        </span>
        {isSelected && <CheckCircle2 className={`w-4 h-4 ${colors.text}`} />}
      </div>
      {children}
    </button>
  )
}

// ── Field row: label + 3 full-content version cards side by side ────────────

function FieldRow({ field, versions, selectedIdx, onSelect }) {
  const Icon = field.icon
  const isIcons = field.isGroup

  return (
    <div className="mb-6">
      {/* Field label */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5 text-stone-500" />
        </div>
        <span className="text-sm font-semibold text-stone-700">{field.label}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ml-auto ${VERSION_COLORS[selectedIdx]?.badge || 'bg-stone-100 text-stone-500'}`}>
          {VERSION_LABELS[selectedIdx] || 'V1'} selected
        </span>
      </div>

      {/* 3 version cards */}
      <div className="grid grid-cols-3 gap-3">
        {versions.map((version, idx) => (
          <VersionCard
            key={idx}
            idx={idx}
            isSelected={idx === selectedIdx}
            onClick={() => onSelect(idx)}
          >
            {isIcons
              ? <IconBadges version={version} />
              : <RichContent fieldKey={field.key} value={version?.[field.key]} version={version} />
            }
          </VersionCard>
        ))}
      </div>
    </div>
  )
}

// ── HTML Preview Panel ──────────────────────────────────────────────────────

function HTMLPreview({ html, onBack }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-stone-100">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-stone-100 text-stone-500 text-xs font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Edit Selections
        </button>
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
          <Eye className="w-3.5 h-3.5" />
          HTML Preview
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-stone-50 p-4">
        <div
          className="w-full bg-white rounded-xl shadow-lg overflow-hidden"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}

// ── Main VersionPicker ──────────────────────────────────────────────────────

export default function VersionPicker({ jobId, skuResult }) {
  const { versionSelections, setVersionSelection, applyCombinedResult } = useStore()
  const [combining, setCombining] = useState(false)
  const [combineError, setCombineError] = useState(null)
  const [showPreview, setShowPreview] = useState(false)

  const versions = skuResult?.versions || []
  const skuId = versions[0]?.sku_id
  const selections = versionSelections[skuId] || {}
  const hasCombined = !!skuResult?.combined
  const htmlPreview = skuResult?.html_preview

  if (showPreview && htmlPreview) {
    return <HTMLPreview html={htmlPreview} onBack={() => setShowPreview(false)} />
  }

  if (versions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">
        No versions generated yet
      </div>
    )
  }

  const getSelection = (fieldKey) => selections[fieldKey] ?? 0

  // For the icon group, we track w_icon_1 selection for the whole group
  const getIconGroupSelection = () => selections['w_icon_1'] ?? 0

  const handleIconGroupSelect = (idx) => {
    ;['w_icon_1', 'w_icon_2', 'w_icon_3', 'w_icon_4'].forEach(k =>
      setVersionSelection(skuId, k, idx)
    )
  }

  const handleCombine = async () => {
    setCombining(true)
    setCombineError(null)
    try {
      const selectionMap = {}
      FIELDS.forEach(f => {
        if (f.isGroup) {
          f.subKeys.forEach(k => { selectionMap[k] = getSelection(k) })
        } else {
          selectionMap[f.key] = getSelection(f.key)
        }
      })
      const res = await combineVersions(jobId, skuId, selectionMap)
      const { polished_content, html_preview } = res.data
      applyCombinedResult(skuId, polished_content, html_preview)
      setShowPreview(true)
    } catch (e) {
      setCombineError(e.response?.data?.detail || e.message || 'Combine failed')
    } finally {
      setCombining(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1100px] mx-auto px-6 py-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs text-stone-400 mb-0.5">SKU</p>
            <p className="text-sm font-mono font-medium text-stone-700">{skuId}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-stone-400">
              {versions.length} version{versions.length !== 1 ? 's' : ''} — click a card to select
            </span>
            <div className="flex gap-1.5">
              {versions.map((_, idx) => (
                <span key={idx} className={`text-xs font-bold px-2 py-0.5 rounded-full ${VERSION_COLORS[idx]?.badge || ''}`}>
                  {VERSION_LABELS[idx]}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Combined result banner */}
        {hasCombined && (
          <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-medium text-emerald-700">Content combined & polished</span>
            </div>
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              View Preview
            </button>
          </div>
        )}

        {/* All field rows — expanded by default with full content */}
        {FIELDS.map(field =>
          field.isGroup ? (
            <FieldRow
              key={field.key}
              field={field}
              versions={versions}
              selectedIdx={getIconGroupSelection()}
              onSelect={handleIconGroupSelect}
            />
          ) : (
            <FieldRow
              key={field.key}
              field={field}
              versions={versions}
              selectedIdx={getSelection(field.key)}
              onSelect={(idx) => setVersionSelection(skuId, field.key, idx)}
            />
          )
        )}

        {/* Combine error */}
        {combineError && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
            {combineError}
          </div>
        )}

        {/* Combine button */}
        <div className="mt-2 mb-6 sticky bottom-4">
          <button
            onClick={handleCombine}
            disabled={combining}
            className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2
              transition-all duration-200 shadow-lg ${
              combining
                ? 'bg-brand-400 text-white cursor-wait'
                : 'bg-brand-500 hover:bg-brand-600 text-white hover:shadow-xl'
            }`}
          >
            {combining ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Combining & generating preview…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {hasCombined ? 'Re-combine Selected' : 'Combine Selected'}
              </>
            )}
          </button>
          <p className="text-xs text-stone-400 text-center mt-2">
            Claude will harmonize tone across your selections and generate an HTML preview
          </p>
        </div>
      </div>
    </div>
  )
}
