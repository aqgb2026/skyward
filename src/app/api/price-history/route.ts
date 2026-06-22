import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const searchId = searchParams.get('searchId')

  if (!searchId) {
    return NextResponse.json({ error: 'searchId is required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('price_history')
    .select('*')
    .eq('search_id', searchId)
    .order('recorded_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const body = await request.json()

  const { data, error } = await supabaseAdmin
    .from('price_history')
    .insert(body)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
