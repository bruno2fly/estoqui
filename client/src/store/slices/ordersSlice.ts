import type { Order } from '@/types'
import type { StateSetter, StateGetter } from '../types'
import { generateId } from '../lib/generateId'

export const initialOrdersState = {
  orders: [] as Order[],
}

export function getOrdersActions(set: StateSetter, _get: StateGetter) {
  return {
    addOrder: (order: Omit<Order, 'id'>) => {
      const o: Order = { ...order, id: generateId() }
      set((s) => ({ orders: [o, ...s.orders] }))
      return o.id
    },
  }
}
