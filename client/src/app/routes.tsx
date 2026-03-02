import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@/app/Layout'
import { DashboardPage } from '@/features/dashboard'
import { InventoryPage } from '@/features/inventory'
import { CatalogPage } from '@/features/catalog'
import { VendorsPage } from '@/features/vendors'
import { HistoryPage } from '@/features/history'
import { SettingsPage } from '@/features/settings'
import { MatchingPage } from '@/features/matching'
import { HelpPage } from '@/features/help'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="vendors" element={<VendorsPage />} />
        <Route path="matching" element={<MatchingPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
