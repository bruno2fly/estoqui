/**
 * Safe Supabase upsert that automatically retries by stripping unknown columns.
 * This handles the case where our mapper sends a column that doesn't exist in
 * the DB yet (e.g., pack_type before the column was added).
 */

import { supabase } from '@/lib/supabase'

interface UpsertOptions {
  table: string
  data: Record<string, unknown> | Record<string, unknown>[]
  onConflict?: string
}

/** Pattern for "column X of relation Y does not exist" */
const COLUMN_NOT_FOUND = /column "([^"]+)" of relation/i
/** Pattern for "Could not find the .* column" */
const COLUMN_NOT_FOUND_2 = /Could not find the '?([^'"]+)'? column/i
/** Pattern for unique constraint errors with onConflict */
const NO_UNIQUE_CONSTRAINT = /there is no unique or exclusion constraint/i

export async function safeUpsert(opts: UpsertOptions): Promise<void> {
  const { table, onConflict } = opts
  let data = opts.data

  // Try up to 10 times, stripping one bad column each time
  for (let attempt = 0; attempt < 10; attempt++) {
    const query = onConflict
      ? supabase.from(table).upsert(data, { onConflict })
      : supabase.from(table).upsert(data)

    const { error } = await query

    if (!error) return // success

    // Check if the error is about an unknown column
    const colMatch = error.message.match(COLUMN_NOT_FOUND) ?? error.message.match(COLUMN_NOT_FOUND_2)
    if (colMatch) {
      const badCol = colMatch[1]
      console.warn(`[safeUpsert] Stripping unknown column "${badCol}" from ${table} and retrying`)
      if (Array.isArray(data)) {
        data = data.map((row) => {
          const copy = { ...row }
          delete copy[badCol]
          return copy
        })
      } else {
        const copy = { ...data }
        delete copy[badCol]
        data = copy
      }
      continue // retry without the bad column
    }

    // If onConflict constraint doesn't exist or server error, fall back to plain insert
    const errMsg = error.message ?? ''
    const errCode = String((error as unknown as Record<string, unknown>).code ?? '')
    const isConstraintIssue = NO_UNIQUE_CONSTRAINT.test(errMsg)
    const isServerError = errCode === '500' || errMsg.includes('Internal Server Error')

    if (onConflict && (isConstraintIssue || isServerError)) {
      console.warn(`[safeUpsert] ${isServerError ? '500 error' : 'No unique constraint'} for "${onConflict}" on ${table}, falling back to insert`)
      const { error: insertError } = await supabase.from(table).insert(data)
      if (!insertError) return
      // If duplicate key on insert, that's fine — data already exists
      const insertMsg = insertError.message ?? ''
      if (insertMsg.includes('duplicate key') || insertMsg.includes('unique constraint') || insertMsg.includes('already exists')) {
        console.warn(`[safeUpsert] Insert fallback hit duplicates on ${table}, skipping`)
        return
      }
      throw insertError
    }

    // Some other error — throw it
    throw error
  }

  throw new Error(`[safeUpsert] Failed after 10 retries on ${table}`)
}
