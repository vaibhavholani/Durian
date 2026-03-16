import { create } from 'zustand'

const useStore = create((set, get) => ({
  // ─── Upload State ────────────────────────────────────────────────────────────
  uploadedProducts: [],   // ProductInput[]
  columnMapping: null,    // mapping report from backend
  selectedCategory: 'home',
  selectedBrand: 'durian',

  setUploadedProducts: (products, columnMapping) =>
    set({ uploadedProducts: products, columnMapping }),
  setSelectedCategory: (cat) => set({ selectedCategory: cat }),
  setSelectedBrand: (brand) => set({ selectedBrand: brand }),

  // ─── Job State ───────────────────────────────────────────────────────────────
  currentJobId: null,
  jobStatus: null,        // 'pending' | 'processing' | 'completed' | 'failed'
  jobTotal: 0,
  jobProcessed: 0,
  jobResults: {},         // sku_id → GeneratedContent
  jobErrors: [],

  setJob: (jobId, total) =>
    set({ currentJobId: jobId, jobTotal: total, jobStatus: 'pending', jobProcessed: 0, jobResults: {}, jobErrors: [] }),

  updateJobProgress: (data) => {
    const resultMap = {}
    ;(data.results || []).forEach((r) => { resultMap[r.sku_id] = r })
    set({
      jobStatus: data.status,
      jobTotal: data.total,
      jobProcessed: data.processed,
      jobResults: resultMap,
      jobErrors: data.errors || [],
    })
  },

  // Local optimistic updates (edits before saving)
  localEdits: {},  // sku_id → partial content updates

  setLocalEdit: (skuId, field, value) =>
    set((state) => ({
      localEdits: {
        ...state.localEdits,
        [skuId]: { ...(state.localEdits[skuId] || {}), [field]: value },
      },
    })),

  clearLocalEdits: (skuId) =>
    set((state) => {
      const edits = { ...state.localEdits }
      delete edits[skuId]
      return { localEdits: edits }
    }),

  applyResultUpdate: (skuId, updates) =>
    set((state) => ({
      jobResults: {
        ...state.jobResults,
        [skuId]: { ...(state.jobResults[skuId] || {}), ...updates },
      },
    })),

  // ─── Review UI State ─────────────────────────────────────────────────────────
  selectedSkuId: null,
  setSelectedSkuId: (id) => set({ selectedSkuId: id }),

  expandedSections: new Set(['product_title', 'short_description', 'feature_bullets']),
  toggleSection: (key) =>
    set((state) => {
      const next = new Set(state.expandedSections)
      next.has(key) ? next.delete(key) : next.add(key)
      return { expandedSections: next }
    }),
  expandAll: () =>
    set({
      expandedSections: new Set([
        'product_title', 'short_description', 'long_description', 'design_story',
        'feature_bullets', 'what_you_need_to_know', 'meta_title', 'meta_description',
        'meta_keywords', 'social_caption', 'highlight_icons',
      ]),
    }),
  collapseAll: () => set({ expandedSections: new Set() }),
}))

export default useStore
