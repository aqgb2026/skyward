import { getCheapestPrices, parseToFareOptions, FareOption } from './travelpayouts'
import { searchFlights, getOffers, parseFareOptions } from './duffel'

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
  // Step 1: Travelpayouts
  const tpData = await getCheapestPrices({
    origin: search.origin,
    destination: search.destination,
    departMonth: search.date_start?.slice(0, 7),
    returnMonth: search.date_end?.slice(0, 7),
  })

  const tpFareOptions = tpData ? parseToFareOptions(tpData) : []
  const tpMinPrice = tpFareOptions[0]?.priceBRL ?? null

  // Step 2: decide se enriquece com Duffel
  // Enriquece se preço abaixo do teto OU dentro de 15% acima; ou se TP não retornou nada
  const withinThreshold =
    tpMinPrice === null || tpMinPrice <= search.max_price_brl * 1.15

  if (withinThreshold && search.destination && search.date_start) {
    const offerRequestId = await searchFlights({
      origin: search.origin,
      destination: search.destination,
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
