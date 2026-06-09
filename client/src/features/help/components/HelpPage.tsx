import { useState } from 'react'

interface FaqItem {
  question: string
  answer: string
}

const faqs: FaqItem[] = [
  {
    question: 'How do I upload my stock data?',
    answer:
      'Go to the Dashboard or Inventory page and use the CSV Upload section. Your file should include columns like product name, quantity, and optionally brand, SKU, and price. The system will parse the CSV and create a stock snapshot automatically.',
  },
  {
    question: 'How do I add a new vendor?',
    answer:
      'Navigate to the Vendors page and click "Add Vendor." Fill in the vendor name, contact info, preferred communication channel, and update cadence. You can also upload vendor price lists from the vendor detail view.',
  },
  {
    question: 'What does the Matching page do?',
    answer:
      'The Matching page helps you link products from your CSV stock uploads to your product catalog. This ensures that stock quantities from your POS reports are correctly mapped to the right catalog products, even if the names differ slightly.',
  },
  {
    question: 'How do I know when stock is low?',
    answer:
      'Each product has a minimum stock threshold (default: 10 units). When a product\'s quantity falls below this threshold, it appears in the "Low stock items" count on the Dashboard. You can adjust the default minimum in Settings.',
  },
  {
    question: 'Can I export my orders?',
    answer:
      'Yes! From the History page, you can view order details and export them. Orders are generated from the reorder workflow in the Inventory page, where you can split orders by vendor and send them.',
  },
  {
    question: 'How do I change my store name?',
    answer:
      'Go to Settings and update the "Store Name" field. The new name will appear in the header across all pages.',
  },
  {
    question: 'Where is my data stored?',
    answer:
      'All data is stored locally in your browser (localStorage). This means your data is private and never sent to any server. However, it also means data is specific to the browser and device you\'re using. Clearing browser data will erase your Estoqui data.',
  },
  {
    question: 'How do I reset all data?',
    answer:
      'Go to Settings and scroll to the bottom. Click "Clear All Data" to wipe all stored data including products, vendors, orders, and activity history. This action cannot be undone.',
  },
]

const quickLinks = [
  { label: 'Dashboard', description: 'Overview of your store KPIs and quick CSV upload', path: '/' },
  { label: 'Inventory', description: 'View stock levels, generate reorder lists', path: '/inventory' },
  { label: 'Vendors', description: 'Manage suppliers and price lists', path: '/vendors' },
  { label: 'Catalog', description: 'Product catalog with pricing and margins', path: '/catalog' },
  { label: 'Matching', description: 'Link CSV stock data to catalog products', path: '/matching' },
  { label: 'History', description: 'Audit log of all imports, orders, and changes', path: '/history' },
  { label: 'Settings', description: 'Store name, thresholds, and API configuration', path: '/settings' },
]

export function HelpPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Getting Started */}
      <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
              <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
            </svg>
          </span>
          <h2 className="text-fg font-semibold text-lg">Getting Started</h2>
        </div>
        <div className="space-y-3 text-[13px] text-fg-secondary leading-relaxed">
          <p>
            Welcome to <span className="font-semibold text-fg">Estoqui</span> — your inventory management system for small markets and grocery stores. Here's how to get up and running:
          </p>
          <ol className="list-decimal list-inside space-y-2 pl-1">
            <li><span className="font-medium text-fg">Upload your stock data</span> — Go to the Dashboard and upload a CSV from your POS system.</li>
            <li><span className="font-medium text-fg">Set up your vendors</span> — Add your suppliers on the Vendors page with their contact info and delivery preferences.</li>
            <li><span className="font-medium text-fg">Build your catalog</span> — Add or import products on the Catalog page to track prices and margins.</li>
            <li><span className="font-medium text-fg">Match products</span> — Use the Matching page to link your POS product names to catalog entries.</li>
            <li><span className="font-medium text-fg">Reorder stock</span> — When items run low, use Inventory to generate reorder lists split by vendor.</li>
          </ol>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
          </span>
          <h2 className="text-fg font-semibold text-lg">Quick Links</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {quickLinks.map((link) => (
            <a
              key={link.path}
              href={link.path}
              className="group flex items-center gap-3 p-3.5 rounded-xl border border-surface-border bg-background/40 hover:border-primary/40 hover:bg-surface-hover transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-fg">{link.label}</p>
                <p className="text-[11px] text-muted mt-0.5">{link.description}</p>
              </div>
              <svg className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </a>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2.5 mb-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <circle cx="12" cy="13" r="0.5" fill="currentColor" />
            </svg>
          </span>
          <h2 className="text-fg font-semibold text-lg">Frequently Asked Questions</h2>
        </div>
        <div className="divide-y divide-surface-border">
          {faqs.map((faq, i) => (
            <div key={i}>
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full text-left py-3.5 flex items-center justify-between gap-3"
              >
                <span className="text-[13px] font-medium text-fg">{faq.question}</span>
                <svg
                  className={`w-4 h-4 text-muted shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {openFaq === i && (
                <p className="text-[12px] text-fg-secondary leading-relaxed pb-3.5 -mt-1">
                  {faq.answer}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="relative overflow-hidden bg-primary text-primary-foreground rounded-2xl p-6 shadow-sm">
        <div className="pointer-events-none absolute -right-10 -top-14 size-44 rounded-full bg-primary-foreground/10 blur-2xl" />
        <div className="relative">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-foreground/15">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
          <h2 className="font-semibold text-lg mt-4">Need More Help?</h2>
          <p className="text-[13px] text-primary-foreground/80 leading-relaxed mt-1">
            If you can't find what you're looking for, reach out to the Estoqui team:
          </p>
          <div className="flex flex-col gap-2.5 mt-4 text-[13px]">
            <div className="flex items-center gap-2.5">
              <MailIcon className="w-4 h-4 text-primary-foreground/70 shrink-0" />
              <a href="mailto:support@2fly.digital" className="font-medium underline-offset-2 hover:underline">support@2fly.digital</a>
            </div>
            <div className="flex items-center gap-2.5 text-primary-foreground/80">
              <PhoneIcon className="w-4 h-4 text-primary-foreground/70 shrink-0" />
              <span>WhatsApp: Contact your administrator</span>
            </div>
          </div>
          <p className="text-[11px] text-primary-foreground/60 mt-5">
            Estoqui v1.0 — Built by 2Fly Digital
          </p>
        </div>
      </div>
    </div>
  )
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  )
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
    </svg>
  )
}
