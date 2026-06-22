import { FareOption } from './travelpayouts'

const BASE = 'https://api.duffel.com'
const token = () => process.env.DUFFEL_TOKEN!

function headers() {
  return {
    Authorization: `Bearer ${token()}`,
    'Duffel-Version': 'v2',
    'Content-Type': 'application/json',
  }
}

export async function searchFlights(params: {
  origin: string
  destination: string
  departDate: string
  returnDate?: string
  adults: number
  cabinClass: string
}): Promise<string | null> {
  try {
    const slices: { origin: string; destination: string; departure_date: string }[] = [
      {
        origin: params.origin,
        destination: params.destination,
        departure_date: params.departDate,
      },
    ]

    if (params.returnDate) {
      slices.push({
        origin: params.destination,
        destination: params.origin,
        departure_date: params.returnDate,
      })
    }

    const res = await fetch(`${BASE}/air/offer_requests`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        data: {
          slices,
          passengers: Array(params.adults).fill({ type: 'adult' }),
          cabin_class: params.cabinClass,
        },
      }),
    })

    if (!res.ok) return null

    const json = await res.json()
    return (json.data?.id as string) ?? null
  } catch {
    return null
  }
}

export async function getOffers(offerRequestId: string): Promise<unknown[] | null> {
  try {
    const url = new URL(`${BASE}/air/offers`)
    url.searchParams.set('offer_request_id', offerRequestId)
    url.searchParams.set('limit', '10')

    const res = await fetch(url.toString(), { headers: headers() })
    if (!res.ok) return null

    const json = await res.json()
    return (json.data as unknown[]) ?? null
  } catch {
    return null
  }
}

export function parseFareOptions(offers: unknown[]): FareOption[] {
  if (!offers?.length) return []

  const typeMap: Array<'basic' | 'standard' | 'flex'> = ['basic', 'standard', 'flex']
  const labelMap = ['Básico', 'Standard', 'Flex']

  try {
    return offers.slice(0, 3).map((offer, i) => {
      const o = offer as Record<string, unknown>

      const currency = String(o.total_currency ?? 'USD')
      const rawAmount = Number(o.total_amount ?? 0)
      const priceBRL = currency === 'BRL' ? Math.round(rawAmount) : Math.round(rawAmount * 5.5)

      const conditions = (o.conditions ?? {}) as Record<string, unknown>
      const refund = (conditions.refund_before_departure ?? {}) as Record<string, unknown>
      const change = (conditions.change_before_departure ?? {}) as Record<string, unknown>

      const slices = (o.slices as unknown[]) ?? []
      const firstSlice = (slices[0] ?? {}) as Record<string, unknown>
      const segments = (firstSlice.segments as unknown[]) ?? []
      const firstSegment = (segments[0] ?? {}) as Record<string, unknown>
      const passengers = (firstSegment.passengers as unknown[]) ?? []
      const firstPassenger = (passengers[0] ?? {}) as Record<string, unknown>
      const baggages = (firstPassenger.baggages as Record<string, unknown>[]) ?? []

      const checkedBag = baggages.find(
        (b) => b.type === 'checked' && Number(b.quantity) > 0
      )

      const mktCarrier = (firstSegment.marketing_carrier ?? {}) as Record<string, unknown>
      const airline = String(mktCarrier.iata_code ?? '')

      return {
        type: typeMap[i],
        label: labelMap[i],
        airline,
        priceBRL,
        carryOn: 8,
        checkedBags: checkedBag ? Number(checkedBag.quantity) : 0,
        checkedWeight: checkedBag ? 23 : 0,
        flexible: Boolean(change.allowed),
        refundable: Boolean(refund.allowed),
      }
    })
  } catch {
    return []
  }
}
