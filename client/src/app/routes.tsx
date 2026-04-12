import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@/app/Layout'
import { ProtectedRoute } from '@/app/ProtectedRoute'
import { LoginPage } from '@/features/auth'
import { DashboardPage } from '@/features/dashboard'
import { InventoryPage } from '@/features/inventory'
import { CatalogPage } from '@/features/catalog'
import { VendorsPage } from '@/features/vendors'
import { HistoryPage } from '@/features/history'
import { SettingsPage } from '@/features/settings'
import { HelpPage } from '@/features/help'
import { ConverterPage } from '@/features/converter'
import { NeedsSkuQueuePage } from '@/features/import'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="vendors" element={<VendorsPage />} />
          <Route path="catalog/needs-sku" element={<NeedsSkuQueuePage />} />
          <Route path="converter" element={<ConverterPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
