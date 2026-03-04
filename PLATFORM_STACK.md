# Estoqui — Platform Stack

## GitHub
- **Repository**: Estoqui (private)
- **Branch**: `main` (production)
- **Auto-deploy**: Pushes to `main` trigger Vercel deployment

## Vercel
- **Project**: estoqui-app
- **Live URL**: https://estoqui-app.vercel.app
- **Framework**: Vite (React)
- **Root directory**: `client`
- **Environment Variables**:
  - `VITE_SUPABASE_URL` = `https://cvonvoyozbdfvyvefeqn.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = *(set in Vercel dashboard)*

## Supabase
- **Project ID**: `cvonvoyozbdfvyvefeqn`
- **Region**: (check dashboard)
- **Dashboard**: https://supabase.com/dashboard/project/cvonvoyozbdfvyvefeqn
- **Auth**: Email + password (Supabase Auth)
- **Database tables**: products, vendors, vendor_prices, orders, activity, settings, stock_snapshots
- **Storage bucket**: `product-images`
- **RLS**: Enabled on all tables (filters by `auth.uid() = user_id`)

## Cursor (IDE)
- **Editor**: Cursor (VS Code fork with AI)
- **Project path**: local clone of the GitHub repo

## Tech Stack
- **Frontend**: React 18 + TypeScript 5.6 + Vite 5.4
- **State**: Zustand 5 (in-memory cache, Supabase persistence)
- **Routing**: React Router v6
- **Styling**: Custom CSS variables + utility classes
- **Backend**: Supabase (Postgres + Auth + Storage)
- **Hosting**: Vercel (auto-deploy from GitHub)

## Debugging
- Open browser DevTools console and run `window.__diagnoseSupabase()` to test Supabase connectivity and write permissions for all tables.
