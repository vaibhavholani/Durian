import { useState } from 'react'
import {
  ThumbsUp, ThumbsDown, CheckCircle2, RefreshCw, ChevronDown, ChevronUp,
  BookOpen, List, Heart, Tag, AlignLeft, Hash, Pencil, Check, X, Loader2,
  Sparkles
} from 'lucide-react'
import { updateContent, submitFeedback, regenerateSection } from '../api/client'
import useStore from '../store'

// ── Content sections matching MiracleAi.xlsx output format ────────────────────
const SECTIONS = [
  {
    key: 'design_story',
    label: 'Design Story',
    icon: BookOpen,
    hint: '1 paragraph · 65–70 words · "X has been designed for those who…"',
    type: 'text',
  },
  {
    key: 'what_you_need_to_know',
    label: 'What You Need to Know',
    icon: List,
    hint: '5 numbered points · Bold headline per point · ~110–120 words total',
    type: 'text',
  },
  {
    key: 'wyli_icon_text',
    label: 'Why You Will Love It',
    icon: Heart,
    hint: '~25 words · Bold tagline line 1, then 1–2 supporting sentences',
    type: 'text',
  },
  {
    key: 'icons',
    label: 'W Icons  (Feature Badges)',
    icon: Sparkles,
    hint: 'Four 3–5 word feature badges shown on the product card',
    type: 'icons',
    subKeys: ['w_icon_1', 'w_icon_2', 'w_icon_3', 'w_icon_4'],
    subLabels: ['Icon 1', 'Icon 2', 'Icon 3', 'Icon 4'],
  },
  {
    key: 'small_description',
    label: 'Small Description',
    icon: AlignLeft,
    hint: '15–20 words · Plain product summary for category pages',
    type: 'text',
  },
  {
    key: 'meta_keywords',
    label: 'Meta Keywords',
    icon: Hash,
    hint: '8–10 comma-separated SEO keywords',
    type: 'text',
  },
]

// ── Render helpers ────────────────────────────────────────────────────────────

function DesignStory({ value }) {
  if (!value) return <EmptyState />
  return <p className="text-sm text-stone-800 leading-[1.75] whitespace-pre-wrap">{value}</p>
}

function WYNIContent({ value }) {
  if (!value) return <EmptyState />
  // Render numbered list with visual separation
  const lines = value.split('\n')
  return (
    <div className="space-y-3">
      {lines.map((line, i) => {
        const isNumbered = /^\d+\./.test(line.trim())
        return (
          <p
            key={i}
            className={`text-sm leading-relaxed ${
              isNumbered ? 'font-semibold text-stone-800 mt-2' : 'text-stone-700'
            }`}
          >
            {line}
          </p>
        )
      })}
    </div>
  )
}

function WYLIContent({ value }) {
  if (!value) return <EmptyState />
  const [headline, ...rest] = value.split('\n')
  return (
    <div>
      <p className="text-sm font-semibold text-stone-900 mb-1">{headline}</p>
      {rest.length > 0 && (
        <p className="text-sm text-stone-600 leading-relaxed">{rest.join(' ')}</p>
      )}
    </div>
  )
}

function IconBadges({ result }) {
  const icons = [result.w_icon_1, result.w_icon_2, result.w_icon_3, result.w_icon_4]
  const hasAny = icons.some(Boolean)
  if (!hasAny) return <EmptyState />
  return (
    <div className="flex flex-wrap gap-2">
      {icons.map((ic, i) =>
        ic ? (
          <span
            key={i}
            className="px-3 py-1.5 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-xs font-medium"
          >
            {ic}
          </span>
        ) : (
          <span key={i} className="px-3 py-1.5 rounded-full bg-stone-100 text-stone-300 text-xs">
            Icon {i + 1} empty
          </span>
        )
      )}
    </div>
  )
}

function MetaKeywords({ value }) {
  if (!value) return <EmptyState />
  return (
    <div className="flex flex-wrap gap-1.5">
      {value.split(',').map((kw, i) => (
        <span key={i} className="px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 text-xs font-medium">
          {kw.trim()}
        </span>
      ))}
    </div>
  )
}

function EmptyState() {
  return <span className="text-stone-300 text-sm italic">Not generated</span>
}

function renderValue(section, result) {
  switch (section.type) {
    case 'icons':    return <IconBadges result={result} />
    default:
      if (section.key === 'what_you_need_to_know') return <WYNIContent value={result[section.key]} />
      if (section.key === 'wyli_icon_text')         return <WYLIContent value={result[section.key]} />
      if (section.key === 'meta_keywords')          return <MetaKeywords value={result[section.key]} />
      return <DesignStory value={result[section.key]} />
  }
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ section, result, jobId, category, onUpdate }) {
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editValues, setEditValues] = useState({})
  const [regenerating, setRegenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const isIcons = section.type === 'icons'
  const isEmpty = isIcons
    ? !section.subKeys.some(k => result[k])
    : !result[section.key]

  const startEdit = () => {
    if (isIcons) {
      const vals = {}
      section.subKeys.forEach(k => { vals[k] = result[k] || '' })
      setEditValues(vals)
    } else {
      setEditValues({ [section.key]: result[section.key] || '' })
    }
    setEditing(true)
  }

  const saveEdit = async () => {
    setSaving(true)
    try {
      await updateContent(jobId, result.sku_id, editValues)
      onUpdate(editValues)
      setEditing(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      // For icons: regenerate all 4 by sending null section (full regen) or each individually
      const sectionKey = isIcons ? null : section.key
      const res = await regenerateSection(jobId, result.sku_id, category, 'durian', sectionKey)
      const updates = res.data?.updates || res.data
      onUpdate(updates)
    } catch (e) {
      console.error(e)
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className={`section-card ${isEmpty ? 'opacity-60' : ''}`}>
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-7 h-7 rounded-md bg-stone-100 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-50 transition-colors">
          <section.icon className="w-3.5 h-3.5 text-stone-500 group-hover:text-brand-500 transition-colors" />
        </div>
        <span className="text-sm font-semibold text-stone-700 flex-1">{section.label}</span>

        {/* Action buttons */}
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            title="Regenerate"
            className="p-1.5 rounded-md hover:bg-stone-100 text-stone-400 hover:text-brand-500 transition-colors disabled:opacity-30"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={startEdit}
            title="Edit"
            className="p-1.5 rounded-md hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>

        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-stone-300 flex-shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-stone-300 flex-shrink-0" />
        }
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-stone-50">
          <p className="text-xs text-stone-400 pt-3 pb-3 leading-relaxed">{section.hint}</p>

          {editing ? (
            <div className="space-y-2">
              {isIcons ? (
                section.subKeys.map((k, i) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="text-xs text-stone-400 w-14 flex-shrink-0">{section.subLabels[i]}</span>
                    <input
                      className="flex-1 px-3 py-2 rounded-lg border border-stone-200 focus:border-brand-300 
                        focus:ring-2 focus:ring-brand-100 text-sm outline-none transition-all"
                      value={editValues[k] || ''}
                      onChange={e => setEditValues(prev => ({ ...prev, [k]: e.target.value }))}
                      placeholder="3–5 word badge…"
                    />
                  </div>
                ))
              ) : (
                <textarea
                  className="w-full min-h-[100px] p-3 rounded-lg border border-stone-200 
                    focus:border-brand-300 focus:ring-2 focus:ring-brand-100 text-sm 
                    text-stone-800 leading-relaxed resize-none outline-none transition-all"
                  value={editValues[section.key] || ''}
                  onChange={e => setEditValues({ [section.key]: e.target.value })}
                  autoFocus
                />
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 
                    hover:bg-brand-600 text-white text-xs font-medium transition-colors"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-stone-100 
                    text-stone-500 text-xs font-medium transition-colors"
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="animate-fade-in">{renderValue(section, result)}</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main ContentPanel ─────────────────────────────────────────────────────────

export default function ContentPanel({ jobId, result }) {
  const { applyResultUpdate, selectedCategory } = useStore()
  const [liked, setLiked] = useState(result.liked)
  const [approved, setApproved] = useState(result.approved)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [approveLoading, setApproveLoading] = useState(false)

  const category = selectedCategory || 'home'

  const handleFeedback = async (isLiked) => {
    if (feedbackLoading) return
    setFeedbackLoading(true)
    try {
      await submitFeedback(jobId, result.sku_id, isLiked, result)
      setLiked(isLiked)
      applyResultUpdate(result.sku_id, { liked: isLiked })
    } catch (e) { console.error(e) }
    finally { setFeedbackLoading(false) }
  }

  const handleApprove = async () => {
    setApproveLoading(true)
    try {
      const next = !approved
      await updateContent(jobId, result.sku_id, {}, next)
      setApproved(next)
      applyResultUpdate(result.sku_id, { approved: next })
    } catch (e) { console.error(e) }
    finally { setApproveLoading(false) }
  }

  const handleUpdate = (updates) => applyResultUpdate(result.sku_id, updates)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-5">

        {/* SKU meta + action bar */}
        <div className="flex items-center gap-3 mb-5 p-3.5 bg-white rounded-xl border border-stone-100 shadow-card">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-stone-400 mb-0.5">SKU</p>
            <p className="text-sm font-mono font-medium text-stone-700 truncate">{result.sku_id}</p>
          </div>

          <div className="h-8 w-px bg-stone-100" />

          {/* Like / dislike */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleFeedback(true)}
              disabled={feedbackLoading}
              title="Like — saves as style example for future generations"
              className={`p-2 rounded-lg transition-all ${
                liked === true ? 'bg-brand-100 text-brand-600' : 'hover:bg-stone-100 text-stone-400 hover:text-brand-500'
              }`}
            >
              <ThumbsUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleFeedback(false)}
              disabled={feedbackLoading}
              title="Dislike"
              className={`p-2 rounded-lg transition-all ${
                liked === false ? 'bg-red-50 text-red-400' : 'hover:bg-stone-100 text-stone-400 hover:text-red-400'
              }`}
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
          </div>

          <div className="h-8 w-px bg-stone-100" />

          {/* Approve */}
          <button
            onClick={handleApprove}
            disabled={approveLoading}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
              approved
                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            {approved ? 'Approved' : 'Approve'}
          </button>
        </div>

        {/* Error state */}
        {result.error && (
          <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
            <strong>Generation error:</strong> {result.error}
          </div>
        )}

        {/* Content sections */}
        <div className="space-y-3">
          {SECTIONS.map(section => (
            <SectionCard
              key={section.key}
              section={section}
              result={result}
              jobId={jobId}
              category={category}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
