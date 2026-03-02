/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      animation: {
        slideIn: 'slideIn 0.3s ease-out',
      },
      keyframes: {
        slideIn: {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
      },
      colors: {
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-border': 'var(--color-surface-border)',
        'surface-hover': 'var(--color-surface-hover)',
        sidebar: {
          DEFAULT: 'var(--color-sidebar)',
          border: 'var(--color-sidebar-border)',
          active: 'var(--color-sidebar-active)',
        },
        primary: '#4a9eff',
        'primary-hover': '#3a8eef',
        muted: 'var(--color-text-muted)',
        fg: 'var(--color-text-primary)',
        'fg-secondary': 'var(--color-text-secondary)',
        success: '#22c55e',
        'success-bg': 'var(--color-success-bg)',
        danger: '#ef4444',
        'danger-bg': 'var(--color-danger-bg)',
        'input-bg': 'var(--color-input-bg)',
        'input-border': 'var(--color-input-border)',
      },
    },
  },
  plugins: [],
}
