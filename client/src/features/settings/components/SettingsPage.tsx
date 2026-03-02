import { useState, useEffect } from 'react'
import { useStore, DEFAULT_SETTINGS, clearAllData } from '@/store'
import { Input, ConfirmDialog } from '@/shared/components'
import { useToast } from '@/shared/components'

export function SettingsPage() {
  const toast = useToast()
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const resetSettings = useStore((s) => s.resetSettings)

  const [storeName, setStoreName] = useState(
    settings?.storeName ?? DEFAULT_SETTINGS.storeName
  )
  const [stalenessThreshold, setStalenessThreshold] = useState(
    String(settings?.stalenessThreshold ?? DEFAULT_SETTINGS.stalenessThreshold)
  )
  const [defaultMinStock, setDefaultMinStock] = useState(
    String(settings?.defaultMinStock ?? DEFAULT_SETTINGS.defaultMinStock)
  )
  const [openaiApiKey, setOpenaiApiKey] = useState(
    settings?.openaiApiKey ?? ''
  )
  const [showApiKey, setShowApiKey] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false)

  useEffect(() => {
    setStoreName(settings?.storeName ?? DEFAULT_SETTINGS.storeName)
    setStalenessThreshold(
      String(settings?.stalenessThreshold ?? DEFAULT_SETTINGS.stalenessThreshold)
    )
    setDefaultMinStock(
      String(settings?.defaultMinStock ?? DEFAULT_SETTINGS.defaultMinStock)
    )
    setOpenaiApiKey(settings?.openaiApiKey ?? '')
  }, [settings?.storeName, settings?.stalenessThreshold, settings?.defaultMinStock, settings?.openaiApiKey])

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setSettings({
      storeName: storeName.trim() || DEFAULT_SETTINGS.storeName,
      stalenessThreshold: Math.max(
        1,
        Math.min(365, parseInt(stalenessThreshold, 10) || 45)
      ),
      defaultMinStock: Math.max(1, parseInt(defaultMinStock, 10) || 10),
      openaiApiKey: openaiApiKey.trim(),
    })
    toast.show('Settings saved!')
  }

  const handleResetConfirm = () => {
    resetSettings()
    setStoreName(DEFAULT_SETTINGS.storeName)
    setStalenessThreshold(String(DEFAULT_SETTINGS.stalenessThreshold))
    setDefaultMinStock(String(DEFAULT_SETTINGS.defaultMinStock))
    setOpenaiApiKey('')
    setShowResetConfirm(false)
    toast.show('Settings reset to defaults')
  }

  const handleClearAllConfirm = () => {
    clearAllData()
    setShowClearAllConfirm(false)
    toast.show('All data cleared. Reloading…')
    window.location.reload()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="space-y-5">
        {/* General */}
        <div className="bg-surface border border-surface-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            <span className="text-[13px] font-semibold text-fg">General</span>
          </div>
          <Input
            label="Store Name"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="e.g. Adriana's Market"
          />
          <p className="text-muted text-xs mt-1">
            Appears in sidebar and WhatsApp order messages
          </p>
        </div>

        {/* Inventory / Reorder */}
        <div className="bg-surface border border-surface-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            <span className="text-[13px] font-semibold text-fg">Inventory / Reorder</span>
          </div>
          <Input
            label="Price Staleness Threshold (days)"
            type="number"
            value={stalenessThreshold}
            onChange={(e) => setStalenessThreshold(e.target.value)}
            min={1}
            max={365}
          />
          <p className="text-muted text-xs mt-1">
            Prices older than this are marked STALE. Default: 45
          </p>
          <div className="mt-4">
            <Input
              label="Default Min Stock"
              type="number"
              value={defaultMinStock}
              onChange={(e) => setDefaultMinStock(e.target.value)}
              min={1}
            />
          </div>
          <p className="text-muted text-xs mt-1">
            Used when creating new products. Default: 10
          </p>
        </div>

        {/* AI / Image Import */}
        <div className="bg-surface border border-surface-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span className="text-[13px] font-semibold text-fg">AI / Image Import</span>
          </div>
          <div className="relative">
            <Input
              label="OpenAI API Key"
              type={showApiKey ? 'text' : 'password'}
              value={openaiApiKey}
              onChange={(e) => setOpenaiApiKey(e.target.value)}
              placeholder="sk-..."
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-7 text-xs text-muted hover:text-fg transition-colors"
            >
              {showApiKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="text-muted text-xs mt-1">
            Required for "Upload image" in Catalog → Add Product.
            Uses GPT-4o vision to extract products from screenshots.
            Key is stored locally and only sent to OpenAI.
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-fg text-background text-[12px] font-medium hover:opacity-80 transition-opacity"
          >
            Save Settings
          </button>
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="px-4 py-2 rounded-lg border border-surface-border text-[12px] font-medium text-fg-secondary hover:bg-surface-hover transition-colors"
          >
            Reset to Defaults
          </button>
          <button
            type="button"
            onClick={() => setShowClearAllConfirm(true)}
            className="px-4 py-2 rounded-lg border border-danger/50 text-[12px] font-medium text-danger hover:bg-danger/10 transition-colors"
          >
            Clear All Data
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleResetConfirm}
        title="Reset settings?"
        message="Reset all settings to defaults?"
        confirmLabel="Reset"
        variant="danger"
      />

      <ConfirmDialog
        open={showClearAllConfirm}
        onClose={() => setShowClearAllConfirm(false)}
        onConfirm={handleClearAllConfirm}
        title="Clear all data?"
        message="This will permanently delete all products, vendors, orders, and settings. The app will reload. This cannot be undone."
        confirmLabel="Clear All"
        variant="danger"
      />
    </div>
  )
}
