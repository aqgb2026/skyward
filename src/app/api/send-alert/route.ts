import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase'
import { FareOption } from '@/lib/travelpayouts'

type AlertType = 'price_drop' | 'error_fare_suspect' | 'best_match'

type SendAlertBody = {
  searchName: string
  type: AlertType
  priceBRL: number
  previousPriceBRL: number | null
  maxPriceBRL: number
  origin: string
  destination: string | null
  message: string
  fareOptions: FareOption[]
}

function brl(value: number): string {
  return value.toLocaleString('pt-BR')
}

function buildSubject(type: AlertType, searchName: string, priceBRL: number): string {
  switch (type) {
    case 'price_drop':
      return `🔔 ${searchName} caiu para R$ ${brl(priceBRL)}`
    case 'error_fare_suspect':
      return `⚡ Possível error fare em ${searchName}`
    case 'best_match':
      return `✨ Melhor oferta encontrada: ${searchName}`
  }
}

function buildEmailHtml(body: SendAlertBody): string {
  const { searchName, type, priceBRL, previousPriceBRL, fareOptions } = body

  const badgeColor: Record<AlertType, string> = {
    price_drop: '#16a34a',
    error_fare_suspect: '#d97706',
    best_match: '#7c3aed',
  }

  const badgeLabel: Record<AlertType, string> = {
    price_drop: 'Queda de preço',
    error_fare_suspect: 'Possível error fare',
    best_match: 'Melhor oferta',
  }

  const priceDrop =
    type === 'price_drop' && previousPriceBRL && previousPriceBRL > priceBRL
      ? Math.round((1 - priceBRL / previousPriceBRL) * 100)
      : null

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '#'

  const fareRows = fareOptions
    .map(
      (f) => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;">
            <strong>${f.label}</strong><br>
            <span style="font-size:12px;color:#64748b;">${f.airline}</span>
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#475569;">
            ${f.checkedBags > 0 ? `${f.checkedBags}× ${f.checkedWeight}kg` : '<span style="color:#94a3b8;">Não inclusa</span>'}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:15px;font-weight:700;color:#0f172a;">
            R$${brl(f.priceBRL)}
          </td>
        </tr>`,
    )
    .join('')

  const priceDropBlock =
    priceDrop !== null
      ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:24px;">
        <tr>
          <td style="padding:14px 20px;font-size:14px;color:#15803d;">
            ▼ Era <strong>R$${brl(previousPriceBRL!)}</strong> — queda de <strong>${priceDrop}%</strong>
          </td>
        </tr>
      </table>`
      : ''

  const fareTable =
    fareOptions.length > 0
      ? `
      <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#1e293b;">Tarifas disponíveis</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:28px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">Tarifa</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">Bagagem</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">Preço</th>
          </tr>
        </thead>
        <tbody>
          ${fareRows}
        </tbody>
      </table>`
      : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Skyward · Alerta de tarifa</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#1e3a5f;border-radius:12px 12px 0 0;padding:24px 32px;">
              <p style="margin:0;color:#93c5fd;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Skyward · Alerta de tarifa</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">

              <!-- Badge -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                <tr>
                  <td style="background:${badgeColor[type]};border-radius:999px;padding:5px 14px;">
                    <span style="color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">${badgeLabel[type]}</span>
                  </td>
                </tr>
              </table>

              <!-- Title -->
              <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#0f172a;">${searchName}</h1>
              <p style="margin:0 0 28px;font-size:14px;color:#64748b;">${body.origin} → ${body.destination ?? 'destino flexível'}</p>

              <!-- Current price -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;margin-bottom:16px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.8px;">Preço atual</p>
                    <p style="margin:0;font-size:40px;font-weight:800;color:#0c4a6e;line-height:1;">R$${brl(priceBRL)}</p>
                  </td>
                </tr>
              </table>

              ${priceDropBlock}

              ${fareTable}

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;">
                <tr>
                  <td align="center">
                    <a href="${appUrl}" style="background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:8px;display:inline-block;">Ver no Skyward</a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-radius:0 0 12px 12px;padding:20px 32px;border:1px solid #e2e8f0;border-top:none;">
              <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.7;">
                Você recebe este email porque configurou alertas no Skyward.<br>
                Para cancelar, acesse as configurações.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function POST(request: NextRequest) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ skipped: true })
  }

  const body = (await request.json()) as SendAlertBody

  const { data: settings } = await supabaseAdmin
    .from('settings')
    .select('email')
    .eq('id', 1)
    .single()

  if (!settings?.email) {
    return NextResponse.json({ skipped: true })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)

  const { data, error } = await resend.emails.send({
    from: 'Skyward Alertas <onboarding@resend.dev>',
    to: settings.email,
    subject: buildSubject(body.type, body.searchName, body.priceBRL),
    html: buildEmailHtml(body),
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ sent: true, messageId: data?.id })
}
