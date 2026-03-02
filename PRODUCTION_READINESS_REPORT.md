# Estoqui — Production Readiness Review

**Date:** March 2, 2025  
**Target stack:** Vercel (static) + hosted Postgres/Supabase (future backend)

---

## Executive Summary

Estoqui is a well-structured React + Vite + Zustand SPA for inventory and vendor ordering. The main gaps for production are: **SPA routing on static hosts** (404s on refresh), **no ErrorBoundary**, **hardcoded tenant copy** ("Adriana's Market"), **missing env/config docs**, and **inconsistent error handling** in some CSV flows. Auth and multi-tenant support are not implemented; the app is single-user/localStorage-only.

---

## 1. Project Structure and Routing

### Current state
- **Structure:** Clear feature-based layout (`features/dashboard`, `features/inventory`, etc.) with shared components and libs.
- **Routing:** React Router v6 with `BrowserRouter`. Routes: `/`, `/inventory`, `/catalog`, `/vendors`, `/matching`, `/history`, `/settings`.
- **Help & Support:** Nav item links to `#` and prevents default — no page exists.

### Issues
| Priority | Issue | Fix |
|----------|-------|-----|
| **High** | Refresh on `/inventory`, `/vendors`, etc. returns 404 on Vercel/Netlify | Add `vercel.json` with SPA rewrite: all routes → `index.html` |
| **Medium** | Help & Support has no page | Add `/help` route and placeholder page; update nav to `/help` |

---

## 2. Environment and Configuration

### Current state
- **No `.env` usage** — OpenAI API key comes from Settings (user input, stored in Zustand/localStorage).
- **Hardcoded:** `https://api.openai.com/v1/chat/completions` in `openaiVision.ts`.
- **Secrets:** None in repo; API key is user-provided and stored client-side (acceptable for MVP).

### Issues
| Priority | Issue | Fix |
|----------|-------|-----|
| **Medium** | No `.env.example` or docs for future backend/env vars | Add `.env.example` with `VITE_*` placeholders and brief docs |
| **Low** | OpenAI URL hardcoded | Optional: `VITE_OPENAI_BASE_URL` for custom endpoints |

---

## 3. State Management and Data Flow

### Current state
- **Zustand** with `persist` middleware → `localStorage` key `estoquiState`.
- **Sanitization:** `sanitizeState` on rehydration removes orphaned matches, vendor prices, and trims snapshots.
- **Dashboard KPIs:** `products.length`, `vendors.length`, `getLowStockCount(state)`, `orders.length` — all from same store. ✅

### Issues
| Priority | Issue | Fix |
|----------|-------|-----|
| **Low** | Dashboard `handleCsvUpload` has unused deps: `productsState`, `matches`, `setMatch` | Remove from `useCallback` dependency array |

---

## 4. API Layer and Error Handling

### Current state
- **No backend API** — data is Zustand + localStorage.
- **OpenAI:** `callOpenAIRaw` has try/catch, handles 401, returns `{ error }` or `{ content }`.
- **Toasts:** `useToast()` used for success/error feedback across features.
- **No ErrorBoundary** — uncaught React errors crash the whole app.

### Issues
| Priority | Issue | Fix |
|----------|-------|-----|
| **High** | No ErrorBoundary | Add `ErrorBoundary` around `AppRoutes`; show fallback UI with reload button |
| **Medium** | No error tracking hook for Sentry/etc. | Add `reportError(err)` wrapper in `lib/errorTracking.ts`; call from ErrorBoundary and key catch blocks |
| **Low** | Dashboard CSV `FileReader` has no `onerror` | Add `reader.onerror` → toast + return |

---

## 5. CSV Upload and Bulk Operations

### Current state
- **Parsers:** `csvStock.ts`, `vendorCsv.ts`, `productsCsv.ts` — header detection, required columns, validation.
- **MatchingPage:** Duplicate `parseCsvLine` / `detectSep` — could reuse `csvStock.ts`.
- **Bulk ops:** `commitStockImport`, `bulkCreateProductsFromSnapshot` are atomic (single `set()`).
- **Vendor CSV:** Returns `errors[]` with row numbers; valid/invalid counts.

### Issues
| Priority | Issue | Fix |
|----------|-------|-----|
| **Medium** | MatchingPage duplicate CSV parsing | Refactor to use `parseCSVLine` / `detectSeparator` from `csvStock.ts` |
| **Low** | No max file size check before parse | Add size limit (e.g. 5MB) and toast if exceeded |
| **Low** | `parseCSVStock` fallback when nameIdx/stockIdx missing uses `parts[2]` heuristics | Document or tighten fallback; consider returning `{ error }` instead of guessing |

---

## 6. UI/UX Polish and Consistency

### Current state
- Tailwind + design tokens (`text-fg`, `bg-surface`, `border-surface-border`, etc.).
- Cards, modals, buttons follow consistent patterns.

### Issues
| Priority | Issue | Fix |
|----------|-------|-----|
| **High** | Dashboard labels: "Total vendor" → "Total vendors", "Total order" → "Total orders" | Fix copy |
| **Medium** | Email signature in `orderExport.ts` hardcoded as `"Thank you,\nAdriana"` | Use `storeName` from settings (or generic "Store Manager") |
| **Medium** | Default `storeName` in types: `"Adriana's Market"` | Change to `"My Store"` or `"Estoqui"` |

---

## 7. Performance and Scaling

### Current state
- **MatchingSection:** Pagination with `PAGE_SIZE = 50`. ✅
- **VendorsPage, CatalogPage, InventoryPage:** No virtualization; lists are typically small for small markets.
- **No code splitting** beyond Vite's default chunking.

### Issues
| Priority | Issue | Fix |
|----------|-------|-----|
| **Low** | Large tables (1000+ rows) could lag | Add virtualization (e.g. `@tanstack/react-virtual`) if needed later |
| **Low** | Route-level code splitting | Add `React.lazy` for feature pages if bundle grows |

---

## 8. Auth, Multi-Tenant, Security

### Current state
- **No auth** — single-user, localStorage-only.
- **Tenant:** `storeName` is a display setting; "Adriana's Market" is default.
- **Security:** No server; client input is trusted. OpenAI key stored in localStorage (user responsibility).

### Issues
| Priority | Issue | Fix |
|----------|-------|-----|
| **Medium** | Tenant-specific default copy | Use generic default store name |
| **Low** | Path to add auth/roles | Document: add Supabase Auth or similar; scope data by `userId`/`tenantId` |

---

## 9. History, Logging, Observability

### Current state
- **Activity log:** `activitySlice` — max 50 entries; types: `stock_uploaded`, `reorder_generated`, `order_created`, etc.
- **Orders:** Stored in `ordersSlice`; History page shows list + detail modal.
- **No external logging** — no Sentry, LogRocket, etc.

### Issues
| Priority | Issue | Fix |
|----------|-------|-----|
| **Medium** | `verifyBrandDetection` in `brand.ts` calls `console.log`/`console.error` | Guard with `import.meta.env.DEV` or remove from production build |
| **Low** | Error tracking | Add `reportError` wrapper; plug Sentry when ready |

---

## 10. Code Quality and Consistency

### Current state
- TypeScript throughout; types in `types/index.ts`.
- `console.debug` in `csvStock.ts` and `InventoryPage.tsx` guarded by `import.meta.env.DEV`. ✅
- No TODOs/FIXMEs found.

### Issues
| Priority | Issue | Fix |
|----------|-------|-----|
| **Low** | `verifyBrandDetection` console output | Guard or remove |

---

## Prioritized Checklist

### High (blocking solid production)
- [ ] Add `vercel.json` SPA rewrite for deep links
- [ ] Add ErrorBoundary with fallback UI
- [ ] Fix Dashboard labels: "Total vendors", "Total orders"

### Medium (important for polish)
- [ ] Add `.env.example` and env docs
- [ ] Fix email signature to use store name
- [ ] Change default store name to generic
- [ ] Add Help route and placeholder page
- [ ] Add `reportError` wrapper for observability
- [ ] Add FileReader `onerror` in Dashboard CSV
- [ ] Guard `verifyBrandDetection` console

### Low (nice to have)
- [ ] Remove unused deps from Dashboard `handleCsvUpload`
- [ ] Consolidate MatchingPage CSV parsing with `csvStock.ts`
- [ ] Add max file size check for CSV uploads
- [ ] Route-level code splitting if bundle grows

---

## Files Modified in This Review

See inline edits applied for:
- `client/vercel.json` (new)
- `client/.env.example` (new)
- `client/src/features/dashboard/components/DashboardPage.tsx`
- `client/src/shared/lib/orderExport.ts`
- `client/src/types/index.ts`
- `client/src/app/Layout.tsx` (Help nav)
- `client/src/app/routes.tsx` (Help route)
- `client/src/app/providers.tsx` (ErrorBoundary)
- `client/src/shared/lib/errorTracking.ts` (new)
- `client/src/lib/catalogMatch/brand.ts`
