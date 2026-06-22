const BASE = 'https://api.travelpayouts.com'
const token = () => process.env.TRAVELPAYOUTS_TOKEN!

type CacheEntry = { data: unknown; ts: number }
const cache = new Map<string, CacheEntry>()
const TTL = 30 * 60 * 1000

function fromCache<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry || Date.now() - entry.ts > TTL) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

function toCache(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() })
}

export type FareOption = {
  type: 'basic' | 'standard' | 'flex'
  label: string
  airline: string
  priceBRL: number
  carryOn: number
  checkedBags: number
  checkedWeight: number
  flexible: boolean
  refundable: boolean
}

export async function getCheapestPrices(params: {
  origin: string
  destination?: string
  departMonth?: string
  returnMonth?: string
}): Promise<Record<string, Record<string, unknown>> | null> {
  const key = `cheapest:${JSON.stringify(params)}`
  const cached = fromCache<Record<string, Record<string, unknown>>>(key)
  if (cached) return cached

  try {
    const url = new URL(`${BASE}/aviasales/v3/get_cheapest_prices`)
    url.searchParams.set('origin', params.origin)
    if (params.destination) url.searchParams.set('destination', params.destination)
    if (params.departMonth) url.searchParams.set('depart_date', params.departMonth)
    if (params.returnMonth) url.searchParams.set('return_date', params.returnMonth)
    url.searchParams.set('currency', 'brl')

    const res = await fetch(url.toString(), {
      headers: { 'X-Access-Token': token() },
    })
    if (!res.ok) return null

    const json = await res.json()
    if (!json.success) return null

    toCache(key, json.data)
    return json.data as Record<string, Record<string, unknown>>
  } catch {
    return null
  }
}

export async function getMonthMatrix(params: {
  origin: string
  destination: string
  departDate: string
  returnDate?: string
}): Promise<unknown[] | null> {
  const key = `month-matrix:${JSON.stringify(params)}`
  const cached = fromCache<unknown[]>(key)
  if (cached) return cached

  try {
    const url = new URL(`${BASE}/v2/prices/month-matrix`)
    url.searchParams.set('origin', params.origin)
    url.searchParams.set('destination', params.destination)
    url.searchParams.set('month', params.departDate)
    if (params.returnDate) url.searchParams.set('return_date', params.returnDate)
    url.searchParams.set('currency', 'brl')

    const res = await fetch(url.toString(), {
      headers: { 'X-Access-Token': token() },
    })
    if (!res.ok) return null

    const json = await res.json()
    if (!json.success) return null

    toCache(key, json.data)
    return json.data as unknown[]
  } catch {
    return null
  }
}

export async function getLatestPrices(params: {
  origin: string
  destination?: string
}): Promise<unknown[] | null> {
  const key = `latest:${JSON.stringify(params)}`
  const cached = fromCache<unknown[]>(key)
  if (cached) return cached

  try {
    const url = new URL(`${BASE}/v2/prices/latest`)
    url.searchParams.set('origin', params.origin)
    if (params.destination) url.searchParams.set('destination', params.destination)
    url.searchParams.set('currency', 'brl')
    url.searchParams.set('limit', '10')

    const res = await fetch(url.toString(), {
      headers: { 'X-Access-Token': token() },
    })
    if (!res.ok) return null

    const json = await res.json()
    if (!json.success) return null

    toCache(key, json.data)
    return json.data as unknown[]
  } catch {
    return null
  }
}

export function parseToFareOptions(data: unknown): FareOption[] {
  if (!data) return []

  try {
    let minPrice = Infinity
    let airline = ''

    const topLevel = Array.isArray(data)
      ? data
      : Object.values(data as Record<string, unknown>)

    for (const item of topLevel) {
      if (typeof item !== 'object' || item === null) continue

      // Nested map: { "0": { price, airline }, "1": { price, airline } }
      const subItems = Array.isArray(item)
        ? item
        : Object.values(item as Record<string, unknown>)

      for (const sub of subItems) {
        if (typeof sub !== 'object' || sub === null) continue
        const typed = sub as Record<string, unknown>
        const price = Number(typed.price ?? typed.value)
        if (!isNaN(price) && price > 0 && price < minPrice) {
          minPrice = price
          airline = String(typed.airline ?? '')
        }
      }
    }

    if (minPrice === Infinity) return []

    return [
      {
        type: 'basic',
        label: 'Básico',
        airline,
        priceBRL: Math.round(minPrice),
        carryOn: 8,
        checkedBags: 0,
        checkedWeight: 0,
        flexible: false,
        refundable: false,
      },
      {
        type: 'standard',
        label: 'Standard',
        airline,
        priceBRL: Math.round(minPrice * 1.12),
        carryOn: 8,
        checkedBags: 1,
        checkedWeight: 23,
        flexible: false,
        refundable: false,
      },
      {
        type: 'flex',
        label: 'Flex',
        airline,
        priceBRL: Math.round(minPrice * 1.35),
        carryOn: 8,
        checkedBags: 2,
        checkedWeight: 23,
        flexible: true,
        refundable: true,
      },
    ]
  } catch {
    return []
  }
}
