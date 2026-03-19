import { create } from 'zustand'

const useStore = create((set, get) => ({
  // ─── Upload State ────────────────────────────────────────────────────────────
  uploadedProducts: [],   // ProductInput[]
  columnMapping: null,    // mapping report from backend
  selectedCategory: 'home',
  selectedBrand: 'durian',
  selectedProvider: 'claude',  // 'claude' | 'gemini'

  setUploadedProducts: (products, columnMapping) =>
    set({ uploadedProducts: products, columnMapping }),
  setSelectedCategory: (cat) => set({ selectedCategory: cat }),
  setSelectedBrand: (brand) => set({ selectedBrand: brand }),
  setSelectedProvider: (provider) => set({ selectedProvider: provider }),

  // ─── Job State ───────────────────────────────────────────────────────────────
  currentJobId: null,
  jobStatus: null,        // 'pending' | 'processing' | 'completed' | 'failed'
  jobTotal: 0,
  jobProcessed: 0,
  jobResults: {},         // sku_id → { versions: [...], combined: null, html_preview: null }
  jobErrors: [],

  setJob: (jobId, total) =>
    set({ currentJobId: jobId, jobTotal: total, jobStatus: 'pending', jobProcessed: 0, jobResults: {}, jobErrors: [], versionSelections: {} }),

  updateJobProgress: (data) => {
    const resultMap = {}
    ;(data.results || []).forEach((r) => {
      // Each result is a SKUResult: { versions: [...], combined, html_preview }
      if (r.versions && r.versions.length > 0) {
        const skuId = r.versions[0].sku_id
        resultMap[skuId] = r
      }
    })
    set({
      jobStatus: data.status,
      jobTotal: data.total,
      jobProcessed: data.processed,
      jobResults: resultMap,
      jobErrors: data.errors || [],
    })
  },

  // ─── Version Selections (mix-match per field) ──────────────────────────────
  versionSelections: {},  // sku_id → { field: versionIndex }

  setVersionSelection: (skuId, field, versionIndex) =>
    set((state) => ({
      versionSelections: {
        ...state.versionSelections,
        [skuId]: {
          ...(state.versionSelections[skuId] || {}),
          [field]: versionIndex,
        },
      },
    })),

  getVersionSelections: (skuId) => {
    return get().versionSelections[skuId] || {}
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

  applyCombinedResult: (skuId, polishedContent, htmlPreview) =>
    set((state) => {
      const existing = state.jobResults[skuId] || {}
      return {
        jobResults: {
          ...state.jobResults,
          [skuId]: {
            ...existing,
            combined: polishedContent,
            html_preview: htmlPreview,
          },
        },
      }
    }),

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
