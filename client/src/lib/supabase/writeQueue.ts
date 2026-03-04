import { safeUpsert } from './safeUpsert'

type QueueEntry = {
  table: string
  data: Record<string, unknown>
  onConflict?: string
}

const queues = new Map<string, { entries: QueueEntry[]; timer: ReturnType<typeof setTimeout> | null }>()

const FLUSH_DELAY = 100 // ms
const CHUNK_SIZE = 200

async function flushQueue(table: string) {
  const q = queues.get(table)
  if (!q || q.entries.length === 0) return
  const entries = q.entries.splice(0)
  q.timer = null
  const onConflict = entries[0]?.onConflict
  const allData = entries.map((e) => e.data)
  for (let i = 0; i < allData.length; i += CHUNK_SIZE) {
    const chunk = allData.slice(i, i + CHUNK_SIZE)
    await safeUpsert({ table, data: chunk, onConflict })
  }
}

export function enqueueWrite(opts: QueueEntry): void {
  const { table } = opts
  if (!queues.has(table)) {
    queues.set(table, { entries: [], timer: null })
  }
  const q = queues.get(table)!
  q.entries.push(opts)
  if (q.timer) clearTimeout(q.timer)
  q.timer = setTimeout(() => flushQueue(table), FLUSH_DELAY)
}
