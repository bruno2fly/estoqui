import type { Order } from '@/types'
import type { StateSetter, StateGetter } from '../types'
import { generateId } from '../lib/generateId'
import { supabase } from '@/lib/supabase'
import { createOrder as dbCreateOrder } from '@/lib/supabase/orders'

export const initialOrdersState = {
  orders: [] as Order[],
}

async function getUid(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? ''
}

export function getOrdersActions(set: StateSetter, _get: StateGetter) {
  return {
    addOrder: (order: Omit<Order, 'id'>) => {
      const o: Order = { ...order, id: generateId() }
      set((s) => ({ orders: [o, ...s.orders] }))
      getUid().then(uid => { if (uid) dbCreateOrder(o, uid).catch(console.error) })
      return o.id
    },
  }
}
