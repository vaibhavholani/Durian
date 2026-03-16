import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { Sparkles } from 'lucide-react'

export default function Layout() {
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      {/* Top bar */}
      <header className="h-14 flex items-center px-6 border-b border-stone-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <NavLink to="/" className="flex items-center gap-2.5 select-none">
          <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" strokeWidth={2} />
          </div>
          <span className="font-semibold text-stone-900 tracking-tight text-[15px]">
            Durian<span className="text-brand-500"> AI</span>
          </span>
        </NavLink>

        <div className="ml-auto flex items-center gap-1 text-xs text-stone-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
          Content Studio
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
