import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/slices/authSlice'

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function WarehouseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const signIn = useAuthStore((s) => s.signIn)
  const signUp = useAuthStore((s) => s.signUp)
  const loading = useAuthStore((s) => s.loading)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (isRegister) {
      const { error: err } = await signUp(email, password)
      if (err) {
        setError(err)
      } else {
        const user = useAuthStore.getState().user
        if (user) {
          navigate('/', { replace: true })
        } else {
          setSuccessMsg('Account created! Check your email to confirm, then sign in.')
          setIsRegister(false)
        }
      }
    } else {
      const { error: err } = await signIn(email, password)
      if (err) {
        setError(err)
      } else {
        navigate('/', { replace: true })
      }
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 via-blue-900 to-slate-900 px-4 w-full">
      <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-2xl p-10">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-100 mb-4">
            <WarehouseIcon className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">ESTOQUI</h1>
          <p className="text-gray-400 mt-1">Inventory Management</p>
          <p className="text-sm text-gray-500 mt-3 mb-8">
            {isRegister
              ? 'Create your account to get started.'
              : 'Streamline your stock, vendors, and orders in one place.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              required
              className="w-full py-3 px-4 rounded-lg border border-gray-300 bg-white text-slate-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? 'Min. 6 characters' : 'Enter your password'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
                minLength={isRegister ? 6 : undefined}
                className="w-full py-3 px-4 pr-12 rounded-lg border border-gray-300 bg-white text-slate-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOffIcon className="w-5 h-5" />
                ) : (
                  <EyeIcon className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center bg-red-50 py-2 px-3 rounded-lg">
              {error}
            </p>
          )}

          {successMsg && (
            <p className="text-sm text-green-700 text-center bg-green-50 py-2 px-3 rounded-lg">
              {successMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:bg-slate-400 disabled:hover:bg-slate-400 disabled:cursor-not-allowed"
          >
            {loading
              ? (isRegister ? 'Creating account...' : 'Signing in...')
              : (isRegister ? 'Create Account' : 'Sign In')}
          </button>

          <button
            type="button"
            onClick={() => { setIsRegister(!isRegister); setError(''); setSuccessMsg('') }}
            className="block w-full text-center text-sm text-blue-600 hover:text-blue-700 transition-colors"
          >
            {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-8">By 2Fly</p>
      </div>
    </div>
  )
}
