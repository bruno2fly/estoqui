import { useState } from 'react'
import { useAuthStore } from '@/store/slices/authSlice'

/**
 * Shown when a signed-in user's plan does NOT include the Software
 * (entitlement tier !== 'software_app'). Deliberately has NO in-app purchase
 * button or external checkout link — purchases originate in the Estoqui App,
 * and an external-purchase link would violate Apple's App Store rules if this
 * screen is ever reused in the iOS build.
 */
export function Locked() {
  const checkEntitlement = useAuthStore((s) => s.checkEntitlement)
  const signOut = useAuthStore((s) => s.signOut)
  const [checking, setChecking] = useState(false)

  const retry = async () => {
    setChecking(true)
    await checkEntitlement()
    setChecking(false)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-fg">
            The Software isn&apos;t part of your plan
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            The desktop Software is included in the <strong>App + Software</strong> plan.
            Your current plan gives you the Estoqui App only. Upgrade your plan from your
            Estoqui account, then come back and refresh.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={retry}
            disabled={checking}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {checking ? 'Checking…' : 'I upgraded — refresh'}
          </button>
          <button
            onClick={signOut}
            className="px-4 py-2 rounded-xl border border-surface-border text-fg text-sm font-medium hover:bg-surface-hover transition"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
