import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { searchPriceForMonitor } from '@/lib/flightSearch'

function spTotalMinutes(): number {
  const now = new Date()
  const h = (now.getUTCHours() - 3 + 24) % 24
  return h * 60 + now.getUTCMinutes()
}

function parseMinutes(timeStr: string): number {
  const [h = '0', m = '0'] = timeStr.split(':')
  return parseInt(h) * 60 + parseInt(m)
}

function minuteDiff(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 1440 - d)
}

function shouldScanNow(times: unknown): boolean {
  if (!Array.isArray(times) || times.length === 0) return false
  const current = spTotalMinutes()
  return (times as string[]).some((t) => minuteDiff(parseMinutes(t), current) < 35)
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: searches, error: fetchError } = await supabaseAdmin
    .from('searches')
    .select('*')
    .eq('active', true)
    .eq('frozen', false)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const toScan = (searches ?? []).filter((s) => shouldScanNow(s.times))

  let alertCount = 0
  const errors: string[] = []

  for (const search of toScan) {
    try {
      const result = await searchPriceForMonitor({
        origin: search.origin,
        destination: search.destination ?? undefined,
        max_price_brl: search.max_price_brl,
        date_start: search.date_start ?? undefined,
        date_end: search.date_end ?? undefined,
        passengers: search.passengers,
        cabin_class: search.cabin_class,
      })

      if (result.currentPriceBRL === null) continue

      const price = result.currentPriceBRL
      const prevPrice = search.current_price_brl
      const now = new Date().toISOString()

      await supabaseAdmin.from('price_history').insert({
        search_id: search.id,
        price_brl: price,
        recorded_at: now,
      })

      await supabaseAdmin
        .from('searches')
        .update({ current_price_brl: price, last_check: now })
        .eq('id', search.id)

      let isErrorFare = false
      if (search.alert_on_error_fare) {
        const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        const { data: history } = await supabaseAdmin
          .from('price_history')
          .select('price_brl')
          .eq('search_id', search.id)
          .gte('recorded_at', since30)

        const prices = (history ?? []).map((r) => r.price_brl)
        if (prices.length >= 3) {
          const avg = prices.reduce((a, b) => a + b, 0) / prices.length
          isErrorFare = price < avg * 0.65
        }
      }

      const droppedBelowMax =
        search.alert_on_any_below_max &&
        price <= search.max_price_brl &&
        (prevPrice === null || prevPrice > search.max_price_brl)

      if (isErrorFare || droppedBelowMax) {
        const alertType = isErrorFare ? 'error_fare' : 'below_max'
        const message = isErrorFare
          ? `Tarifa de erro detectada: R$${price} (muito abaixo da média histórica)`
          : `Preço caiu abaixo do teto: R$${price} (teto: R$${search.max_price_brl})`

        await supabaseAdmin.from('alerts').insert({
          id: crypto.randomUUID(),
          search_id: search.id,
          search_name: search.name,
          price_brl: price,
          type: alertType,
          message,
        })

        const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`
        await fetch(`${baseUrl}/api/send-alert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ search, price, alertType, fareOptions: result.fareOptions }),
        })

        alertCount++
      }
    } catch (err) {
      errors.push(`${search.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({ scanned: toScan.length, alerts: alertCount, errors })
}
