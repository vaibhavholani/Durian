import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
})

// Upload Excel and immediately start generation
export const uploadAndGenerate = (file, category, brandType, provider, onUploadProgress) =>
  api.post(
    `/upload-and-generate?category=${category}&brand_type=${brandType}&provider=${provider || 'claude'}`,
    (() => {
      const fd = new FormData()
      fd.append('file', file)
      return fd
    })(),
    { onUploadProgress }
  )

// Upload only (to preview before generating)
export const uploadFile = (file, onUploadProgress) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/upload', fd, { onUploadProgress })
}

// Start generation for selected SKUs from an already-uploaded job
export const startGeneration = (jobId, skuIds, category, brandType, provider) =>
  api.post('/generate', { sku_ids: skuIds, category, brand_type: brandType, provider: provider || 'claude' })

// Poll job progress
export const getJob = (jobId) => api.get(`/jobs/${jobId}`)

// List all jobs
export const listJobs = () => api.get('/jobs')

// Update / approve content
export const updateContent = (jobId, skuId, updates, approved) =>
  api.patch('/content', {
    job_id: jobId,
    sku_id: skuId,
    updates,
    ...(approved !== undefined ? { approved } : {}),
  })

// Combine mix-matched versions
export const combineVersions = (jobId, skuId, selections) =>
  api.post('/combine', {
    job_id: jobId,
    sku_id: skuId,
    selections,
  })

// Regenerate a section (or full item if section is null)
export const regenerateSection = (jobId, skuId, category, brandType, section = null) =>
  api.post('/regenerate', {
    job_id: jobId,
    sku_id: skuId,
    category,
    brand_type: brandType,
    ...(section ? { section } : {}),
  })

// Like / dislike
export const submitFeedback = (jobId, skuId, liked, content) =>
  api.post('/feedback', { job_id: jobId, sku_id: skuId, liked, content })

// Export
export const exportContent = (jobId, format = 'json', approvedOnly = false) =>
  api.get(`/export/${jobId}?format=${format}&approved_only=${approvedOnly}`, {
    responseType: 'blob',
  })

// Gold examples
export const getGoldExamples = () => api.get('/gold-examples')

export default api
