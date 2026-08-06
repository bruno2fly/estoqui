import { useState } from 'react'
import { useToast } from '@/shared/components'
import {
  syncAllFromApp,
  pushAllToApp,
  getLastSync,
  type AppSyncResult,
} from '@/lib/appSync'

/**
 * App ↔ Software sync controls, shown on the Catalog page.
 * Pull ("Sync from App") also runs automatically on login — this card is the
 * manual trigger + status. Push ("Send to App") is manual-only by design so a
 * big vendor import can't silently flood the team's phones.
 */
export function AppSyncCard() {
  const toast = useToast()
  const [syncing, setSyncing] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [lastSync, setLastSync] = useState<AppSyncResult | null>(() => getLastSync())

  const handleSync = async () => {
    setSyncing(true)
    try {
      const { products, vendors } = await syncAllFromApp()
      setLastSync(products)
      if (products.ok && vendors.ok) {
        const changes = products.created + products.updated + vendors.created + vendors.updated
        toast.show(
          changes === 0
            ? 'Already up to date with the App'
            : `Synced from the App: ${products.created + products.updated} product(s), ${vendors.created + vendors.updated} vendor(s)`,
        )
      } else {
        toast.show(products.error ?? vendors.error ?? 'Sync failed', 'error')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handlePush = async () => {
    setPushing(true)
    try {
      const { products, vendors } = await pushAllToApp()
      if (products.ok && vendors.ok) {
        toast.show(
          products.created + vendors.created === 0
            ? 'The App already has everything (products need a SKU)'
            : `Sent to the App: ${products.created} product(s), ${vendors.created} vendor(s)`,
        )
      } else {
        toast.show(products.error ?? vendors.error ?? 'Push failed', 'error')
      }
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="bg-surface border border-surface-border rounded-2xl p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="2" width="10" height="20" rx="2" />
            <path d="M12 18h.01" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-fg">Estoqui App sync</h2>
          <p className="text-xs text-fg-secondary">
            Products your team scans on the phone appear here; send desktop products back to make them scannable.
            {lastSync?.ok && (
              <>
                {' '}Last sync: {lastSync.created} new, {lastSync.updated} updated ·{' '}
                {new Date(lastSync.at).toLocaleString()}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing || pushing}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : 'Sync from App'}
          </button>
          <button
            onClick={handlePush}
            disabled={syncing || pushing}
            title="Create App products for catalog items the App doesn't have yet (needs a SKU). Never modifies existing App products."
            className="px-4 py-2 rounded-xl border border-surface-border text-fg text-sm font-medium hover:bg-surface-hover transition disabled:opacity-50"
          >
            {pushing ? 'Sending…' : 'Send to App'}
          </button>
        </div>
      </div>
    </div>
  )
}
