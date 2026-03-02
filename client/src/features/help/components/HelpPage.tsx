export function HelpPage() {
  return (
    <div className="space-y-6">
      <div className="bg-surface border border-surface-border rounded-2xl p-6">
        <h2 className="text-fg font-semibold text-lg mb-3">Help & Support</h2>
        <p className="text-fg-secondary text-sm leading-relaxed">
          Get started with Estoqui by uploading your POS report on the Dashboard or Inventory page.
          Use the Catalog to manage products, Vendors to track supplier price lists, and Matching to
          link POS items to your catalog.
        </p>
        <p className="text-fg-secondary text-sm leading-relaxed mt-3">
          For support, contact your administrator or visit the Estoqui documentation.
        </p>
      </div>
    </div>
  )
}
