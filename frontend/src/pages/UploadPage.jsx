import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileSpreadsheet, ChevronRight, Home, Briefcase, Layers,
  Sparkles, Info, CheckCircle2, AlertCircle, X
} from 'lucide-react'
import { uploadAndGenerate } from '../api/client'
import useStore from '../store'

const CATEGORIES = [
  {
    id: 'home',
    label: 'Home Furniture',
    description: 'Sofas, recliners, beds, wardrobes',
    icon: Home,
    tone: 'Aspirational & dreamy',
  },
  {
    id: 'custom',
    label: 'Full Home Customization',
    description: 'Curated collections & room bundles',
    icon: Layers,
    tone: 'Design journey & inspiration',
  },
  {
    id: 'office',
    label: 'Office Furniture',
    description: 'Ergonomic chairs, desks, storage',
    icon: Briefcase,
    tone: 'Technical & feature-forward',
  },
]

const BRANDS = [
  {
    id: 'durian',
    label: 'Durian',
    description: 'Opulent, craftsmanship, 40+ audience',
    color: 'brand',
  },
  {
    id: 'pure',
    label: 'Pure',
    description: 'Minimalist, modern, 25–35 audience',
    color: 'stone',
  },
]

export default function UploadPage() {
  const navigate = useNavigate()
  const { setJob, setUploadedProducts, selectedCategory, selectedBrand,
    setSelectedCategory, setSelectedBrand } = useStore()

  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState(null)
  const fileInputRef = useRef()

  const handleFile = (f) => {
    if (!f) return
    const valid = ['.xlsx', '.xls', '.csv'].some(ext => f.name.toLowerCase().endsWith(ext))
    if (!valid) {
      setError('Only Excel (.xlsx, .xls) or CSV files are supported.')
      return
    }
    setError(null)
    setFile(f)
  }

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }, [])

  const onDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)

  const handleGenerate = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const res = await uploadAndGenerate(
        file, selectedCategory, selectedBrand,
        (e) => setUploadProgress(Math.round((e.loaded / e.total) * 100))
      )
      const { job_id, total, products, column_mapping } = res.data
      setJob(job_id, total)
      setUploadedProducts(products, column_mapping)
      navigate(`/generating/${job_id}`)
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Upload failed.'
      setError(msg)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16 animate-fade-in">
      {/* Hero */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-50 border border-brand-100 rounded-full text-brand-600 text-xs font-medium mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          AI Content Generation
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900 mb-3">
          Turn product data into<br />
          <span className="text-brand-500">exceptional copy.</span>
        </h1>
        <p className="text-stone-500 text-base max-w-md mx-auto leading-relaxed">
          Upload your Durian ERP export and watch AI generate titles, stories,
          bullet points, meta tags, and social captions — all brand-aligned.
        </p>
      </div>

      {/* Step 1: Category */}
      <section className="mb-8">
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
          1 — Product Category
        </label>
        <div className="grid grid-cols-3 gap-3">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const active = selectedCategory === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`text-left p-4 rounded-xl border transition-all duration-150 ${
                  active
                    ? 'border-brand-400 bg-brand-50 shadow-sm'
                    : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${
                  active ? 'bg-brand-500' : 'bg-stone-100'
                }`}>
                  <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-stone-500'}`} />
                </div>
                <p className={`text-sm font-semibold mb-0.5 ${active ? 'text-brand-700' : 'text-stone-800'}`}>
                  {cat.label}
                </p>
                <p className="text-xs text-stone-400 leading-relaxed">{cat.description}</p>
                {active && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-brand-500 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                    {cat.tone}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* Step 2: Brand */}
      <section className="mb-8">
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
          2 — Brand Voice
        </label>
        <div className="grid grid-cols-2 gap-3">
          {BRANDS.map((brand) => {
            const active = selectedBrand === brand.id
            return (
              <button
                key={brand.id}
                onClick={() => setSelectedBrand(brand.id)}
                className={`text-left p-4 rounded-xl border transition-all duration-150 ${
                  active
                    ? 'border-brand-400 bg-brand-50 shadow-sm'
                    : 'border-stone-200 bg-white hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-sm font-semibold ${active ? 'text-brand-700' : 'text-stone-800'}`}>
                    {brand.label}
                  </span>
                  {active && <CheckCircle2 className="w-4 h-4 text-brand-500" />}
                </div>
                <p className="text-xs text-stone-400">{brand.description}</p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Step 3: File upload */}
      <section className="mb-8">
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
          3 — Upload Product Data
        </label>
        <div
          className={`relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer
            ${dragging ? 'border-brand-400 bg-brand-50' : file ? 'border-emerald-300 bg-emerald-50/50' : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'}
          `}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => !file && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />

          {file ? (
            <div className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-800 truncate">{file.name}</p>
                <p className="text-xs text-stone-400 mt-0.5">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null) }}
                className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="p-10 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center mb-4">
                <Upload className={`w-5 h-5 ${dragging ? 'text-brand-500' : 'text-stone-400'}`} />
              </div>
              <p className="text-sm font-medium text-stone-700 mb-1">
                {dragging ? 'Drop it here' : 'Drag & drop your Excel file'}
              </p>
              <p className="text-xs text-stone-400">or click to browse — .xlsx, .xls, .csv</p>
            </div>
          )}
        </div>

        <div className="mt-2.5 flex items-start gap-1.5 text-xs text-stone-400">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            The system auto-detects column names. Works with Durian's standard ERP export
            or any Excel with SKU, name, materials, and color fields.
          </span>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="mb-5 flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Upload progress */}
      {uploading && uploadProgress > 0 && uploadProgress < 100 && (
        <div className="mb-5">
          <div className="flex justify-between text-xs text-stone-400 mb-1.5">
            <span>Uploading…</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
            <div
              className="h-full bg-brand-400 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={handleGenerate}
        disabled={!file || uploading}
        className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 
          transition-all duration-200 ${
          file && !uploading
            ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm hover:shadow-md'
            : 'bg-stone-100 text-stone-400 cursor-not-allowed'
        }`}
      >
        {uploading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Uploading & starting generation…
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generate Content
            <ChevronRight className="w-4 h-4 ml-0.5" />
          </>
        )}
      </button>
    </div>
  )
}
