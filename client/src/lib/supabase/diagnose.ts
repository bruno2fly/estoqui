/**
 * Browser console diagnostic tool for Supabase connectivity.
 * Usage: open browser DevTools console and run:
 *   window.__diagnoseSupabase()
 */

import { supabase } from '@/lib/supabase'

const TABLES = [
  'products',
  'vendors',
  'vendor_prices',
  'orders',
  'activity',
  'settings',
  'stock_snapshots',
] as const

async function diagnose() {
  console.group('🔍 Supabase Diagnostic')

  // 1. Auth status
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    console.error('❌ No active session — user not logged in')
    console.groupEnd()
    return
  }
  console.log('✅ Authenticated as:', session.user.email, '(', session.user.id, ')')

  // 2. Test read access on each table
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select('*').limit(1)
    if (error) {
      console.error(`❌ ${table}: READ failed —`, error.message, `(${error.code})`)
    } else {
      const cols = data?.[0] ? Object.keys(data[0]).join(', ') : '(empty table)'
      console.log(`✅ ${table}: READ OK — columns: ${cols}`)
    }
  }

  // 3. Test write access on vendor_prices (the reported broken table)
  const testId = `diag-${Date.now()}`
  const vpTestRow = {
    user_id: session.user.id,
    vendor_id: testId,
    product_id: testId,
    unit_price: 0.01,
    updated_at: new Date().toISOString(),
  }

  const { error: vpInsertErr } = await supabase.from('vendor_prices').insert(vpTestRow)
  if (vpInsertErr) {
    console.error('❌ vendor_prices: WRITE failed —', vpInsertErr.message, `(${vpInsertErr.code})`)

    // Check if it's an RLS issue
    if (vpInsertErr.code === '42501' || vpInsertErr.message.includes('row-level security')) {
      console.error('   ↳ RLS policy is blocking inserts. Check the INSERT policy for vendor_prices.')
    }
  } else {
    console.log('✅ vendor_prices: WRITE OK')
    // Cleanup
    await supabase.from('vendor_prices').delete().eq('vendor_id', testId).eq('product_id', testId)
  }

  // 4. Test write access on products
  const pTestRow = {
    id: testId,
    user_id: session.user.id,
    name: 'diag-test',
    brand: 'diag',
  }
  const { error: pInsertErr } = await supabase.from('products').insert(pTestRow)
  if (pInsertErr) {
    console.error('❌ products: WRITE failed —', pInsertErr.message, `(${pInsertErr.code})`)
  } else {
    console.log('✅ products: WRITE OK')
    await supabase.from('products').delete().eq('id', testId)
  }

  // 5. Test write on vendors
  const vTestRow = {
    id: testId,
    user_id: session.user.id,
    name: 'diag-test',
    phone: '000',
  }
  const { error: vInsertErr } = await supabase.from('vendors').insert(vTestRow)
  if (vInsertErr) {
    console.error('❌ vendors: WRITE failed —', vInsertErr.message, `(${vInsertErr.code})`)
  } else {
    console.log('✅ vendors: WRITE OK')
    await supabase.from('vendors').delete().eq('id', testId)
  }

  console.groupEnd()
}

// Expose globally for browser console
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__diagnoseSupabase = diagnose
}

export { diagnose }
