import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import UploadPage from './pages/UploadPage'
import GeneratingPage from './pages/GeneratingPage'
import ReviewPage from './pages/ReviewPage'
import ExportPage from './pages/ExportPage'
import Layout from './components/Layout'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<UploadPage />} />
          <Route path="/generating/:jobId" element={<GeneratingPage />} />
          <Route path="/review/:jobId" element={<ReviewPage />} />
          <Route path="/export/:jobId" element={<ExportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
