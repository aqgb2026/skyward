import { getCheapestPrices, parseToFareOptions, FareOption } from './travelpayouts'
import { searchFlights, getOffers, parseFareOptions } from './duffel'

const METRO_AIRPORTS: Record<string, string[]> = {
  SAO: ['GRU', 'CGH', 'VCP'],
  RIO: ['GIG', 'SDU'],
  NYC: ['JFK', 'EWR', 'LGA'],
  LON: ['LHR', 'LGW'],
  PAR: ['CDG', 'ORY'],
  MIL: ['MXP', 'LIN'],
}

function expandMetro(code: string): string {
  const airports = METRO_AIRPORTS[code.toUpperCase()]
  return airports ? airports[0] : code.toUpperCase()
}

export type FlightSearchResult = {
  currentPriceBRL: number | null
  fareOptions: FareOption[]
  source: 'travelpayouts' | 'duffel' | 'both' | 'error'
}

export async function searchPriceForMonitor(search: {
  origin: string
  destination?: string
  max_price_brl: number
  date_start?: string
  date_end?: string
  passengers?: number
  cabin_class?: string
}): Promise<FlightSearchResult> {
  const origin = expandMetro(search.origin)
  const destination = search.destination ? expandMetro(search.destination) : undefined

  // Step 1: Travelpayouts
  const tpData = await getCheapestPrices({
    origin,
    destination,
    departMonth: search.date_start?.slice(0, 7),
    returnMonth: search.date_end?.slice(0, 7),
  })

  const tpFareOptions = tpData ? parseToFareOptions(tpData) : []
  const tpMinPrice = tpFareOptions[0]?.priceBRL ?? null

  // Step 2: decide se enriquece com Duffel
  // Enriquece se preço abaixo do teto OU dentro de 15% acima; ou se TP não retornou nada
  const withinThreshold =
    tpMinPrice === null || tpMinPrice <= search.max_price_brl * 1.15

  if (withinThreshold && destination && search.date_start) {
    const offerRequestId = await searchFlights({
      origin,
      destination,
      departDate: search.date_start,
      returnDate: search.date_end,
      adults: search.passengers ?? 1,
      cabinClass: search.cabin_class ?? 'economy',
    })

    if (offerRequestId) {
      const offers = await getOffers(offerRequestId)
      if (offers?.length) {
        const duffelOptions = parseFareOptions(offers)
        if (duffelOptions.length) {
          const duffelMinPrice = duffelOptions[0].priceBRL

          if (tpMinPrice !== null) {
            // Merge: preços do TP + detalhes de bagagem do Duffel
            const merged = duffelOptions.map((df, i) => ({
              ...df,
              priceBRL: tpFareOptions[i]?.priceBRL ?? df.priceBRL,
            }))
            return { currentPriceBRL: tpMinPrice, fareOptions: merged, source: 'both' }
          }

          // TP falhou — usa Duffel puro
          return { currentPriceBRL: duffelMinPrice, fareOptions: duffelOptions, source: 'duffel' }
        }
      }
    }
  }

  // Step 3: fallback para TP sozinho ou erro
  if (tpMinPrice !== null) {
    return { currentPriceBRL: tpMinPrice, fareOptions: tpFareOptions, source: 'travelpayouts' }
  }

  return { currentPriceBRL: null, fareOptions: [], source: 'error' }
}
