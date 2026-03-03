import { useState, useEffect } from 'react'
import { Outlet, useLocation, NavLink, useNavigate } from 'react-router-dom'
import { useStore, DEFAULT_SETTINGS } from '@/store'
import { useAuthStore } from '@/store/slices/authSlice'

const mainNavItems = [
  { to: '/', label: 'Dashboard', icon: DashboardIcon },
  { to: '/inventory', label: 'Inventory', icon: InventoryIcon },
  { to: '/vendors', label: 'Vendors', icon: VendorsIcon },
  { to: '/catalog', label: 'Catalog', icon: CatalogIcon },
  { to: '/matching', label: 'Matching', icon: MatchingIcon },
  { to: '/history', label: 'History', icon: HistoryIcon },
] as const

const otherNavItems = [
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/help', label: 'Help & Support', icon: HelpIcon },
] as const

const pathToTitle: Record<string, string> = {
  '/': 'Dashboard',
  '/inventory': 'Inventory',
  '/catalog': 'Catalog',
  '/vendors': 'Vendors',
  '/matching': 'Matching',
  '/history': 'History',
  '/settings': 'Settings',
  '/help': 'Help & Support',
}

export function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const title = pathToTitle[location.pathname] ?? 'Estoqui'
  const storeName = useStore((s) => s.settings?.storeName ?? DEFAULT_SETTINGS.storeName)
  const logout = useAuthStore((s) => s.logout)
  const [storeMenuOpen, setStoreMenuOpen] = useState(false)

  const [dark, setDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark'
    }
    return false
  })

  useEffect(() => {
    const root = document.documentElement
    if (dark) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [dark])

  return (
    <>
      <aside className="w-[220px] flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 overflow-y-auto">
        <div className="px-5 pt-6 pb-4">
          <h1 className="text-[18px] font-extrabold text-fg tracking-tight leading-tight">ESTOQUI</h1>
          <p className="text-[10px] text-muted mt-0.5 tracking-wide">By 2Fly</p>
        </div>

        <div className="px-3 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted px-2 mb-1.5">Main menu</p>
          <nav className="space-y-px">
            {mainNavItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                    isActive
                      ? 'bg-sidebar-active text-fg'
                      : 'text-fg-secondary hover:bg-sidebar-active hover:text-fg'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted px-2 mb-1.5 mt-5">Others</p>
          <nav className="space-y-px">
            {otherNavItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={label}
                to={to}
                end
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                    isActive
                      ? 'bg-sidebar-active text-fg'
                      : 'text-fg-secondary hover:bg-sidebar-active hover:text-fg'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="px-5 py-4 border-t border-sidebar-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-fg-secondary flex items-center gap-2">
              <MoonIcon className="w-3.5 h-3.5" />
              Dark Mode
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={dark}
              onClick={() => setDark(!dark)}
              className={`relative inline-flex h-[18px] w-8 shrink-0 rounded-full transition-colors focus:outline-none ${
                dark ? 'bg-primary' : 'bg-surface-border'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform mt-[2px] ml-[2px] ${
                  dark ? 'translate-x-3.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <button
            type="button"
            onClick={() => { logout(); navigate('/login', { replace: true }) }}
            className="flex items-center gap-2 text-[12px] text-fg-secondary hover:text-danger transition-colors w-full"
          >
            <LogoutIcon className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        <header className="py-3.5 px-6 bg-surface border-b border-surface-border shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-fg text-2xl font-bold">{title}</h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="text-fg-secondary hover:text-fg transition-colors"
                title="Settings"
              >
                <GearIcon className="w-[18px] h-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="text-fg-secondary hover:text-fg transition-colors"
                title="Notifications"
              >
                <BellIcon className="w-[18px] h-[18px]" />
              </button>
              <div className="relative pl-2 border-l border-surface-border">
                <button
                  type="button"
                  onClick={() => setStoreMenuOpen(!storeMenuOpen)}
                  className="flex items-center gap-1.5 text-fg hover:opacity-80 transition-opacity"
                >
                  <LockIcon className="w-3.5 h-3.5 text-fg-secondary" />
                  <span className="text-[17px] font-bold">{storeName}</span>
                  <ChevronDownIcon className={`w-3.5 h-3.5 text-muted transition-transform ${storeMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {storeMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setStoreMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-48 bg-surface border border-surface-border rounded-xl shadow-lg z-20 py-1">
                      <button
                        type="button"
                        onClick={() => { setStoreMenuOpen(false); navigate('/settings') }}
                        className="w-full text-left px-4 py-2.5 text-[13px] text-fg-secondary hover:bg-surface-hover transition-colors flex items-center gap-2.5"
                      >
                        <GearIcon className="w-4 h-4" />
                        Store Settings
                      </button>
                      <button
                        type="button"
                        onClick={() => { setStoreMenuOpen(false); navigate('/help') }}
                        className="w-full text-left px-4 py-2.5 text-[13px] text-fg-secondary hover:bg-surface-hover transition-colors flex items-center gap-2.5"
                      >
                        <HelpSmIcon className="w-4 h-4" />
                        Help & Support
                      </button>
                      <div className="border-t border-surface-border my-1" />
                      <button
                        type="button"
                        onClick={() => { setStoreMenuOpen(false); logout(); navigate('/login', { replace: true }) }}
                        className="w-full text-left px-4 py-2.5 text-[13px] text-danger hover:bg-surface-hover transition-colors flex items-center gap-2.5"
                      >
                        <LogoutIcon className="w-4 h-4" />
                        Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <Outlet />
        </div>
      </main>
    </>
  )
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function InventoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}

function VendorsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

function CatalogIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  )
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

function HelpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  )
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  )
}

function MatchingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function HelpSmIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
