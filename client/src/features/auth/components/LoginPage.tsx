import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/slices/authSlice'
import { Input } from '@/shared/components'
import { Button } from '@/shared/components'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Small delay to feel like a real auth check
    setTimeout(() => {
      const ok = login(username, password)
      setLoading(false)
      if (ok) {
        navigate('/', { replace: true })
      } else {
        setError('Invalid username or password')
      }
    }, 400)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-fg tracking-tight">ESTOQUI</h1>
          <p className="text-xs text-muted mt-1 tracking-wide">Inventory Management</p>
        </div>

        {/* Login card */}
        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-surface-border rounded-xl p-6 shadow-sm space-y-4"
        >
          <h2 className="text-lg font-semibold text-fg text-center">Sign in to your account</h2>

          <Input
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            autoComplete="username"
            autoFocus
            required
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            required
          />

          {error && (
            <p className="text-sm text-danger text-center">{error}</p>
          )}

          <Button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <p className="text-[10px] text-muted text-center mt-6">By 2Fly</p>
      </div>
    </div>
  )
}
