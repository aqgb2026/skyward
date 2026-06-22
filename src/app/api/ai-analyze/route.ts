import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { Search } from '@/lib/database.types'
import { FareOption } from '@/lib/travelpayouts'

const anthropic = new Anthropic()

function detectSeason(dateStr: string | null): 'alta' | 'normal' {
  if (!dateStr) return 'normal'
  const month = new Date(dateStr).getMonth() + 1
  if (month === 7 || month === 12 || month === 1 || month === 2) return 'alta'
  return 'normal'
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)))
}

export async function POST(request: NextRequest) {
  try {
    const { search, fareOptions } = (await request.json()) as {
      search: Search
      fareOptions: FareOption[]
    }

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { data: history } = await supabaseAdmin
      .from('price_history')
      .select('price_brl')
      .eq('search_id', search.id)
      .gte('recorded_at', since)

    const prices = (history ?? []).map((r) => r.price_brl)
    const avg90 = prices.length
      ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      : null
    const min90 = prices.length ? Math.min(...prices) : null
    const max90 = prices.length ? Math.max(...prices) : null

    const season = detectSeason(search.date_start)
    const daysLeft = daysUntil(search.date_start)
    const baggage =
      (search.baggage_needs as { checkedBags?: number } | null)?.checkedBags ?? 0

    const faresSummary = fareOptions
      .map(
        (f) =>
          `${f.label} (${f.airline}): R$${f.priceBRL} - ${f.checkedBags} mala(s) despachada(s), ${f.flexible ? 'flexível' : 'não flexível'}`,
      )
      .join('\n')

    const prompt = `Você é um especialista em compras de passagens aéreas. Analise os dados abaixo e retorne SOMENTE um JSON válido, sem markdown, sem explicação.

ROTA: ${search.origin} → ${search.destination ?? 'flexível'}
PREÇO ATUAL: R$${search.current_price_brl ?? 'não disponível'}
HISTÓRICO 90 DIAS: média R$${avg90 ?? 'N/D'}, mínimo R$${min90 ?? 'N/D'}, máximo R$${max90 ?? 'N/D'}
TETO DO USUÁRIO: R$${search.max_price_brl}
DIAS ATÉ A VIAGEM: ${daysLeft !== null ? daysLeft : 'não informado'}
TEMPORADA: ${season === 'alta' ? 'ALTA (julho ou dezembro/janeiro/fevereiro)' : 'NORMAL'}
NECESSIDADE DE BAGAGEM: ${baggage} mala(s) despachada(s)

OPÇÕES DE TARIFA DISPONÍVEIS:
${faresSummary || 'Nenhuma opção disponível'}

Retorne EXATAMENTE este JSON (sem nenhum texto fora dele):
{
  "recomendacao": "COMPRAR" ou "ESPERAR",
  "confianca": número de 0 a 100,
  "razao": "explicação em português em 1-2 frases",
  "preco_alvo": número em reais ou null,
  "janela_ideal": "descrição da janela ideal para compra" ou null,
  "dica_bagagem": "dica sobre bagagem em 1 frase"
}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const firstBlock = message.content[0]
    const raw = firstBlock?.type === 'text' ? firstBlock.text : ''

    let analysis: object
    try {
      analysis = JSON.parse(raw)
    } catch {
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Resposta da IA não contém JSON válido')
      analysis = JSON.parse(match[0])
    }

    return NextResponse.json(analysis)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
