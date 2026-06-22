'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Search, Alert } from '@/lib/database.types'
import type { FareOption } from '@/lib/travelpayouts'

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'new-search' | 'searches' | 'ai' | 'alerts' | 'settings'

type AppSettings = { email: string; notifications: boolean }

type AiResult = {
  recomendacao: 'COMPRAR' | 'ESPERAR'
  confianca: number
  razao: string
  preco_alvo: number | null
  janela_ideal: string | null
  dica_bagagem: string
}

type SearchForm = {
  name: string
  origin: string
  destination: string
  flexible_dest: boolean
  date_start: string
  date_end: string
  min_stay: number
  max_stay: number
  max_price_brl: number
  passengers: number
  cabin_class: string
  stops: string
  flex_dates: boolean
  checked_bags: number
  times: string
  alert_on_any_below_max: boolean
  alert_on_error_fare: boolean
  extra_bag_price_brl: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const EMPTY_FORM: SearchForm = {
  name: '',
  origin: '',
  destination: '',
  flexible_dest: false,
  date_start: '',
  date_end: '',
  min_stay: 7,
  max_stay: 14,
  max_price_brl: 0,
  passengers: 1,
  cabin_class: 'economy',
  stops: 'any',
  flex_dates: false,
  checked_bags: 0,
  times: '08:00, 20:00',
  alert_on_any_below_max: true,
  alert_on_error_fare: true,
  extra_bag_price_brl: 0,
}

const NAV_ITEMS: [Tab, string][] = [
  ['dashboard', '📊 Dashboard'],
  ['new-search', '➕ Nova busca'],
  ['searches', '🔍 Buscas ativas'],
  ['ai', '🤖 Análise IA'],
  ['alerts', '🔔 Alertas'],
  ['settings', '⚙️ Configurações'],
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function brl(n: number) {
  return n.toLocaleString('pt-BR')
}

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function fmtRelative(s: string) {
  const mins = Math.floor((Date.now() - new Date(s).getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `há ${mins} min`
  const h = Math.floor(mins / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d} dia${d !== 1 ? 's' : ''}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={`border rounded-xl p-5 ${accent}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm mt-1 opacity-70">{label}</p>
    </div>
  )
}

const ALERT_COLORS: Record<string, string> = {
  below_max: 'bg-green-100 text-green-700',
  error_fare: 'bg-yellow-100 text-yellow-800',
  price_drop: 'bg-blue-100 text-blue-700',
  best_match: 'bg-purple-100 text-purple-700',
}
const ALERT_LABELS: Record<string, string> = {
  below_max: 'Abaixo do teto',
  error_fare: 'Error fare',
  price_drop: 'Queda de preço',
  best_match: 'Melhor oferta',
}

function AlertRow({ alert }: { alert: Alert }) {
  const color = ALERT_COLORS[alert.type ?? ''] ?? 'bg-gray-100 text-gray-600'
  const label = ALERT_LABELS[alert.type ?? ''] ?? alert.type ?? '—'
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${color}`}>
          {label}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{alert.search_name ?? '—'}</p>
          {alert.message && (
            <p className="text-xs text-gray-500 truncate">{alert.message}</p>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {alert.price_brl !== null && (
          <p className="text-sm font-semibold text-gray-900">R${brl(alert.price_brl)}</p>
        )}
        <p className="text-xs text-gray-400">{fmtRelative(alert.sent_at)}</p>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
  )
}

// ─── Airport data ─────────────────────────────────────────────────────────────

type Airport = { code: string; city: string; name: string; country: string; isMetro?: boolean }

const AIRPORTS: Airport[] = [
  // Metrópoles
  { code: 'SAO', city: 'São Paulo', name: 'todos os aeroportos', country: 'Brasil', isMetro: true },
  { code: 'RIO', city: 'Rio de Janeiro', name: 'todos os aeroportos', country: 'Brasil', isMetro: true },
  { code: 'NYC', city: 'Nova York', name: 'todos os aeroportos', country: 'EUA', isMetro: true },
  { code: 'LON', city: 'Londres', name: 'todos os aeroportos', country: 'Reino Unido', isMetro: true },
  { code: 'PAR', city: 'Paris', name: 'todos os aeroportos', country: 'França', isMetro: true },
  { code: 'MIL', city: 'Milão', name: 'todos os aeroportos', country: 'Itália', isMetro: true },
  // Brasil
  { code: 'GRU', city: 'São Paulo', name: 'Guarulhos', country: 'Brasil' },
  { code: 'CGH', city: 'São Paulo', name: 'Congonhas', country: 'Brasil' },
  { code: 'VCP', city: 'Campinas', name: 'Viracopos', country: 'Brasil' },
  { code: 'GIG', city: 'Rio de Janeiro', name: 'Galeão', country: 'Brasil' },
  { code: 'SDU', city: 'Rio de Janeiro', name: 'Santos Dumont', country: 'Brasil' },
  { code: 'BSB', city: 'Brasília', name: 'Brasília', country: 'Brasil' },
  { code: 'CNF', city: 'Belo Horizonte', name: 'Confins', country: 'Brasil' },
  { code: 'POA', city: 'Porto Alegre', name: 'Salgado Filho', country: 'Brasil' },
  { code: 'REC', city: 'Recife', name: 'Guararapes', country: 'Brasil' },
  { code: 'FOR', city: 'Fortaleza', name: 'Pinto Martins', country: 'Brasil' },
  { code: 'SSA', city: 'Salvador', name: 'Luís Eduardo Magalhães', country: 'Brasil' },
  { code: 'FLN', city: 'Florianópolis', name: 'Hercílio Luz', country: 'Brasil' },
  { code: 'CWB', city: 'Curitiba', name: 'Afonso Pena', country: 'Brasil' },
  { code: 'NAT', city: 'Natal', name: 'São Gonçalo do Amarante', country: 'Brasil' },
  { code: 'MCZ', city: 'Maceió', name: 'Zumbi dos Palmares', country: 'Brasil' },
  { code: 'BEL', city: 'Belém', name: 'Val de Cans', country: 'Brasil' },
  { code: 'MAO', city: 'Manaus', name: 'Eduardo Gomes', country: 'Brasil' },
  // Portugal
  { code: 'LIS', city: 'Lisboa', name: 'Humberto Delgado', country: 'Portugal' },
  { code: 'OPO', city: 'Porto', name: 'Francisco Sá Carneiro', country: 'Portugal' },
  { code: 'FAO', city: 'Faro', name: 'Faro', country: 'Portugal' },
  // Europa
  { code: 'MAD', city: 'Madri', name: 'Barajas', country: 'Espanha' },
  { code: 'BCN', city: 'Barcelona', name: 'El Prat', country: 'Espanha' },
  { code: 'CDG', city: 'Paris', name: 'Charles de Gaulle', country: 'França' },
  { code: 'ORY', city: 'Paris', name: 'Orly', country: 'França' },
  { code: 'LHR', city: 'Londres', name: 'Heathrow', country: 'Reino Unido' },
  { code: 'LGW', city: 'Londres', name: 'Gatwick', country: 'Reino Unido' },
  { code: 'FCO', city: 'Roma', name: 'Fiumicino', country: 'Itália' },
  { code: 'MXP', city: 'Milão', name: 'Malpensa', country: 'Itália' },
  { code: 'LIN', city: 'Milão', name: 'Linate', country: 'Itália' },
  { code: 'FRA', city: 'Frankfurt', name: 'Frankfurt', country: 'Alemanha' },
  { code: 'MUC', city: 'Munique', name: 'Franz Josef Strauss', country: 'Alemanha' },
  { code: 'BER', city: 'Berlim', name: 'Brandenburg', country: 'Alemanha' },
  { code: 'AMS', city: 'Amsterdã', name: 'Schiphol', country: 'Países Baixos' },
  { code: 'ZRH', city: 'Zurique', name: 'Zurique', country: 'Suíça' },
  { code: 'VIE', city: 'Viena', name: 'Schwechat', country: 'Áustria' },
  { code: 'DUB', city: 'Dublin', name: 'Dublin', country: 'Irlanda' },
  { code: 'ATH', city: 'Atenas', name: 'Eleftherios Venizelos', country: 'Grécia' },
  { code: 'CPH', city: 'Copenhague', name: 'Kastrup', country: 'Dinamarca' },
  { code: 'ARN', city: 'Estocolmo', name: 'Arlanda', country: 'Suécia' },
  { code: 'HEL', city: 'Helsinki', name: 'Vantaa', country: 'Finlândia' },
  { code: 'OSL', city: 'Oslo', name: 'Gardermoen', country: 'Noruega' },
  { code: 'BRU', city: 'Bruxelas', name: 'Zaventem', country: 'Bélgica' },
  { code: 'GVA', city: 'Genebra', name: 'Genebra', country: 'Suíça' },
  { code: 'PRG', city: 'Praga', name: 'Václav Havel', country: 'Rep. Tcheca' },
  { code: 'WAW', city: 'Varsóvia', name: 'Chopin', country: 'Polônia' },
  { code: 'BUD', city: 'Budapeste', name: 'Liszt Ferenc', country: 'Hungria' },
  // Américas
  { code: 'JFK', city: 'Nova York', name: 'John F. Kennedy', country: 'EUA' },
  { code: 'EWR', city: 'Nova York', name: 'Newark', country: 'EUA' },
  { code: 'LGA', city: 'Nova York', name: 'LaGuardia', country: 'EUA' },
  { code: 'MIA', city: 'Miami', name: 'Miami', country: 'EUA' },
  { code: 'MCO', city: 'Orlando', name: 'Orlando', country: 'EUA' },
  { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles', country: 'EUA' },
  { code: 'SFO', city: 'São Francisco', name: 'São Francisco', country: 'EUA' },
  { code: 'ORD', city: 'Chicago', name: "O'Hare", country: 'EUA' },
  { code: 'BOS', city: 'Boston', name: 'Logan', country: 'EUA' },
  { code: 'YYZ', city: 'Toronto', name: 'Pearson', country: 'Canadá' },
  { code: 'MEX', city: 'Cidade do México', name: 'Benito Juárez', country: 'México' },
  { code: 'CUN', city: 'Cancún', name: 'Cancún', country: 'México' },
  { code: 'BOG', city: 'Bogotá', name: 'El Dorado', country: 'Colômbia' },
  { code: 'SCL', city: 'Santiago', name: 'Arturo Merino Benítez', country: 'Chile' },
  { code: 'EZE', city: 'Buenos Aires', name: 'Ezeiza', country: 'Argentina' },
  { code: 'LIM', city: 'Lima', name: 'Jorge Chávez', country: 'Peru' },
  { code: 'UIO', city: 'Quito', name: 'Mariscal Sucre', country: 'Equador' },
  { code: 'MVD', city: 'Montevidéu', name: 'Carrasco', country: 'Uruguai' },
  // Ásia / Oriente Médio / África
  { code: 'DXB', city: 'Dubai', name: 'Dubai', country: 'Emirados Árabes' },
  { code: 'DOH', city: 'Doha', name: 'Hamad', country: 'Qatar' },
  { code: 'AUH', city: 'Abu Dhabi', name: 'Zayed', country: 'Emirados Árabes' },
  { code: 'IST', city: 'Istambul', name: 'Istambul', country: 'Turquia' },
  { code: 'TLV', city: 'Tel Aviv', name: 'Ben Gurion', country: 'Israel' },
  { code: 'NRT', city: 'Tóquio', name: 'Narita', country: 'Japão' },
  { code: 'HND', city: 'Tóquio', name: 'Haneda', country: 'Japão' },
  { code: 'HKG', city: 'Hong Kong', name: 'Hong Kong', country: 'Hong Kong' },
  { code: 'SIN', city: 'Singapura', name: 'Changi', country: 'Singapura' },
  { code: 'BKK', city: 'Bangkok', name: 'Suvarnabhumi', country: 'Tailândia' },
  { code: 'ICN', city: 'Seul', name: 'Incheon', country: 'Coreia do Sul' },
  { code: 'PEK', city: 'Pequim', name: 'Capital', country: 'China' },
  { code: 'PVG', city: 'Xangai', name: 'Pudong', country: 'China' },
  { code: 'SYD', city: 'Sydney', name: 'Kingsford Smith', country: 'Austrália' },
  { code: 'MEL', city: 'Melbourne', name: 'Tullamarine', country: 'Austrália' },
  { code: 'JNB', city: 'Joanesburgo', name: 'OR Tambo', country: 'África do Sul' },
  { code: 'CPT', city: 'Cidade do Cabo', name: 'Cape Town', country: 'África do Sul' },
  { code: 'CAI', city: 'Cairo', name: 'Cairo', country: 'Egito' },
  { code: 'CMN', city: 'Casablanca', name: 'Mohammed V', country: 'Marrocos' },
]

// ─── AirportSelect ────────────────────────────────────────────────────────────

function AirportSelect({
  value,
  onChange,
  placeholder,
  disabled,
  required,
}: {
  value: string
  onChange: (code: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = AIRPORTS.find((a) => a.code === value)
  const displayValue = open ? query : selected ? `${selected.code} · ${selected.city}` : value

  const filtered =
    query.length >= 1
      ? AIRPORTS.filter((a) => {
          const q = query.toLowerCase()
          return (
            a.code.toLowerCase().startsWith(q) ||
            a.city.toLowerCase().includes(q) ||
            a.name.toLowerCase().includes(q) ||
            a.country.toLowerCase().includes(q)
          )
        }).slice(0, 12)
      : []

  return (
    <div ref={containerRef} className="relative">
      <input
        required={required}
        value={displayValue}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          if (!e.target.value) onChange('')
        }}
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filtered.map((a) => (
            <li key={a.code}>
              <button
                type="button"
                onClick={() => {
                  onChange(a.code)
                  setOpen(false)
                  setQuery('')
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
              >
                <span
                  className={`font-mono font-bold w-10 shrink-0 ${
                    a.isMetro ? 'text-purple-700' : 'text-blue-700'
                  }`}
                >
                  {a.code}
                </span>
                <span className="text-gray-700 truncate">
                  {a.city}
                  <span className="text-gray-400">
                    {' · '}
                    {a.isMetro ? 'todos os aeroportos' : a.name}
                  </span>
                </span>
                <span className="text-xs text-gray-400 ml-auto shrink-0">{a.country}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Home() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [searches, setSearches] = useState<Search[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [settings, setSettings] = useState<AppSettings>({ email: '', notifications: true })
  const [globalLoading, setGlobalLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form
  const [form, setForm] = useState<SearchForm>(EMPTY_FORM)
  const [formBusy, setFormBusy] = useState(false)

  // AI
  const [aiSearchId, setAiSearchId] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<AiResult | null>(null)

  // Settings form
  const [settingsBusy, setSettingsBusy] = useState(false)

  // ── Data loading ────────────────────────────────────────────────────────────

  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3500)
  }

  const loadAll = useCallback(async () => {
    setGlobalLoading(true)
    setError(null)
    try {
      const [sRes, aRes, stRes] = await Promise.all([
        fetch('/api/searches'),
        fetch('/api/alerts'),
        fetch('/api/settings'),
      ])
      const [sData, aData, stData] = await Promise.all([
        sRes.json(),
        aRes.json(),
        stRes.json(),
      ])
      if (sRes.ok) setSearches(Array.isArray(sData) ? sData : [])
      if (aRes.ok) setAlerts(Array.isArray(aData) ? aData : [])
      if (stRes.ok && stData)
        setSettings({
          email: stData.email ?? '',
          notifications: stData.notifications ?? true,
        })
    } catch {
      setError('Erro ao carregar dados. Verifique a conexão com o servidor.')
    } finally {
      setGlobalLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // ── Search CRUD ─────────────────────────────────────────────────────────────

  const handleCreateSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormBusy(true)
    setError(null)
    try {
      const times = form.times
        .split(',')
        .map((t) => t.trim())
        .filter((t) => /^\d{2}:\d{2}$/.test(t))

      const body = {
        name: form.name,
        origin: form.origin.toUpperCase(),
        destination: form.flexible_dest
          ? null
          : form.destination.toUpperCase() || null,
        flexible_dest: form.flexible_dest,
        region: null,
        date_start: form.date_start || null,
        date_end: form.date_end || null,
        min_stay: form.min_stay,
        max_stay: form.max_stay,
        max_price_brl: form.max_price_brl,
        passengers: form.passengers,
        cabin_class: form.cabin_class,
        stops: form.stops,
        flex_dates: form.flex_dates,
        baggage_needs: { checkedBags: form.checked_bags },
        excluded_sources: [],
        preferred_airlines: [],
        avoided_airlines: [],
        fare_options: [],
        extra_bag_price_brl: form.extra_bag_price_brl,
        frequency: 24,
        times,
        alert_on_any_below_max: form.alert_on_any_below_max,
        alert_on_error_fare: form.alert_on_error_fare,
        active: true,
        frozen: false,
        current_price_brl: null,
        last_check: null,
        ai_analysis: null,
      }

      const res = await fetch('/api/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Erro ao criar busca')
      }

      setForm(EMPTY_FORM)
      showSuccess('Busca criada com sucesso!')
      await loadAll()
      setTab('searches')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar busca')
    } finally {
      setFormBusy(false)
    }
  }

  const handleDeleteSearch = async (id: string) => {
    if (!confirm('Excluir esta busca?')) return
    try {
      const res = await fetch(`/api/searches/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erro ao excluir')
      setSearches((prev) => prev.filter((s) => s.id !== id))
      showSuccess('Busca excluída.')
    } catch {
      setError('Não foi possível excluir a busca.')
    }
  }

  const handleToggle = async (search: Search, field: 'active' | 'frozen') => {
    try {
      const res = await fetch(`/api/searches/${search.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: !search[field] }),
      })
      if (!res.ok) throw new Error()
      const updated: Search = await res.json()
      setSearches((prev) => prev.map((s) => (s.id === search.id ? updated : s)))
    } catch {
      setError('Erro ao atualizar busca.')
    }
  }

  // ── AI analysis ─────────────────────────────────────────────────────────────

  const handleAiAnalyze = async () => {
    const search = searches.find((s) => s.id === aiSearchId)
    if (!search) return
    setAiLoading(true)
    setAiResult(null)
    setError(null)
    try {
      const fareOptions = (
        Array.isArray(search.fare_options) ? search.fare_options : []
      ) as FareOption[]

      const res = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search, fareOptions }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro na análise')
      setAiResult(data as AiResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na análise de IA')
    } finally {
      setAiLoading(false)
    }
  }

  // ── Settings ────────────────────────────────────────────────────────────────

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSettingsBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Erro ao salvar configurações')
      showSuccess('Configurações salvas!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSettingsBusy(false)
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  const activeSearches = searches.filter((s) => s.active && !s.frozen)

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top nav */}
      <nav className="bg-blue-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight">✈ Skyward</span>
          <span className="text-blue-300 text-sm hidden sm:block">Monitor de tarifas</span>
        </div>
        <button
          onClick={loadAll}
          disabled={globalLoading}
          className="text-blue-300 hover:text-white text-sm flex items-center gap-2 disabled:opacity-60"
        >
          {globalLoading ? <Spinner /> : '↻'} Atualizar
        </button>
      </nav>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-52 shrink-0 bg-white border-r border-gray-200 pt-4">
          {NAV_ITEMS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`w-full text-left px-5 py-3 text-sm font-medium transition-colors ${
                tab === key
                  ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 p-8 max-w-4xl">
          {/* Flash messages */}
          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex justify-between items-start">
              <span>⚠️ {error}</span>
              <button onClick={() => setError(null)} className="ml-4 underline shrink-0">
                Fechar
              </button>
            </div>
          )}
          {success && (
            <div className="mb-5 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
              ✓ {success}
            </div>
          )}

          {/* ── DASHBOARD ── */}
          {tab === 'dashboard' && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

              <div className="grid grid-cols-3 gap-4 mb-8">
                <StatCard
                  label="Buscas ativas"
                  value={activeSearches.length}
                  accent="bg-blue-50 text-blue-900 border-blue-100"
                />
                <StatCard
                  label="Total de alertas"
                  value={alerts.length}
                  accent="bg-green-50 text-green-900 border-green-100"
                />
                <StatCard
                  label="Total de buscas"
                  value={searches.length}
                  accent="bg-gray-50 text-gray-900 border-gray-200"
                />
              </div>

              {alerts.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-800 mb-3">Alertas recentes</h2>
                  <div className="space-y-2">
                    {alerts.slice(0, 5).map((a) => (
                      <AlertRow key={a.id} alert={a} />
                    ))}
                  </div>
                  {alerts.length > 5 && (
                    <button
                      onClick={() => setTab('alerts')}
                      className="mt-3 text-sm text-blue-600 hover:underline"
                    >
                      Ver todos os alertas →
                    </button>
                  )}
                </div>
              )}

              {searches.length === 0 && !globalLoading && (
                <div className="text-center py-16 text-gray-500">
                  <p className="text-5xl mb-4">✈️</p>
                  <p className="font-medium text-gray-700">Nenhuma busca cadastrada ainda.</p>
                  <p className="text-sm mt-1 mb-4">
                    Crie uma busca para começar a monitorar tarifas.
                  </p>
                  <button
                    onClick={() => setTab('new-search')}
                    className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"
                  >
                    Criar primeira busca
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── NOVA BUSCA ── */}
          {tab === 'new-search' && (
            <div className="max-w-2xl">
              <h1 className="text-2xl font-bold text-gray-900 mb-6">Nova busca</h1>
              <form
                onSubmit={handleCreateSearch}
                className="bg-white rounded-xl border border-gray-200 p-6 space-y-5"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nome da busca *
                  </label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Férias em Lisboa"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Origem *
                    </label>
                    <AirportSelect
                      required
                      value={form.origin}
                      onChange={(code) => setForm({ ...form, origin: code })}
                      placeholder="GRU ou São Paulo..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Destino
                    </label>
                    <AirportSelect
                      value={form.destination}
                      onChange={(code) => setForm({ ...form, destination: code })}
                      placeholder={form.flexible_dest ? 'Qualquer destino' : 'LIS ou Lisboa...'}
                      disabled={form.flexible_dest}
                    />
                    <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.flexible_dest}
                        onChange={(e) =>
                          setForm({ ...form, flexible_dest: e.target.checked })
                        }
                        className="rounded"
                      />
                      <span className="text-xs text-gray-500">Destino flexível</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data de ida
                    </label>
                    <input
                      type="date"
                      value={form.date_start}
                      onChange={(e) => setForm({ ...form, date_start: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data de volta
                    </label>
                    <input
                      type="date"
                      value={form.date_end}
                      onChange={(e) => setForm({ ...form, date_end: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Teto (R$) *
                    </label>
                    <input
                      required
                      type="number"
                      min={1}
                      value={form.max_price_brl || ''}
                      onChange={(e) =>
                        setForm({ ...form, max_price_brl: Number(e.target.value) })
                      }
                      placeholder="2000"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Passageiros
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={9}
                      value={form.passengers}
                      onChange={(e) =>
                        setForm({ ...form, passengers: Number(e.target.value) })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Classe
                    </label>
                    <select
                      value={form.cabin_class}
                      onChange={(e) => setForm({ ...form, cabin_class: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="economy">Econômica</option>
                      <option value="premium_economy">Premium eco.</option>
                      <option value="business">Executiva</option>
                      <option value="first">Primeira</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Estadia mínima (dias)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={form.min_stay}
                      onChange={(e) =>
                        setForm({ ...form, min_stay: Number(e.target.value) })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Estadia máxima (dias)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={form.max_stay}
                      onChange={(e) =>
                        setForm({ ...form, max_stay: Number(e.target.value) })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Malas despachadas
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={4}
                      value={form.checked_bags}
                      onChange={(e) =>
                        setForm({ ...form, checked_bags: Number(e.target.value) })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Paradas
                    </label>
                    <select
                      value={form.stops}
                      onChange={(e) => setForm({ ...form, stops: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="any">Qualquer</option>
                      <option value="nonstop">Direto</option>
                      <option value="1stop">Até 1 parada</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Horários de varredura (HH:MM, separados por vírgula)
                  </label>
                  <input
                    value={form.times}
                    onChange={(e) => setForm({ ...form, times: e.target.value })}
                    placeholder="08:00, 12:00, 20:00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Horário de Brasília (UTC-3)</p>
                </div>

                <div className="space-y-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.alert_on_any_below_max}
                      onChange={(e) =>
                        setForm({ ...form, alert_on_any_below_max: e.target.checked })
                      }
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">
                      Alertar quando o preço cair abaixo do teto
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.alert_on_error_fare}
                      onChange={(e) =>
                        setForm({ ...form, alert_on_error_fare: e.target.checked })
                      }
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">
                      Alertar em possíveis error fares
                    </span>
                  </label>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={formBusy}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {formBusy && <Spinner />}
                    {formBusy ? 'Criando...' : 'Criar busca'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(EMPTY_FORM)}
                    className="text-gray-600 px-4 py-2 rounded-lg text-sm border border-gray-300 hover:bg-gray-50"
                  >
                    Limpar
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── BUSCAS ATIVAS ── */}
          {tab === 'searches' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Buscas</h1>
                <button
                  onClick={() => setTab('new-search')}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"
                >
                  + Nova busca
                </button>
              </div>

              {searches.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhuma busca cadastrada.</p>
              ) : (
                <div className="space-y-3">
                  {searches.map((s) => (
                    <div
                      key={s.id}
                      className="bg-white border border-gray-200 rounded-xl p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-gray-900 truncate">
                              {s.name}
                            </span>
                            <span
                              className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                                s.frozen
                                  ? 'bg-blue-100 text-blue-700'
                                  : s.active
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {s.frozen ? 'Pausada' : s.active ? 'Ativa' : 'Inativa'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500">
                            {s.origin} → {s.destination ?? 'Flexível'}
                            {s.date_start && ` · ${fmtDate(s.date_start)}`}
                          </p>
                          <div className="flex items-center gap-4 mt-2 flex-wrap">
                            {s.current_price_brl !== null ? (
                              <span
                                className={`text-sm font-semibold ${
                                  s.current_price_brl <= s.max_price_brl
                                    ? 'text-green-600'
                                    : 'text-red-500'
                                }`}
                              >
                                R${brl(s.current_price_brl)}
                                <span className="text-gray-400 font-normal">
                                  {' '}/ teto R${brl(s.max_price_brl)}
                                </span>
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">
                                Teto R${brl(s.max_price_brl)} · sem preço registrado
                              </span>
                            )}
                            {s.last_check && (
                              <span className="text-xs text-gray-400">
                                Verificado {fmtRelative(s.last_check)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              setAiSearchId(s.id)
                              setAiResult(null)
                              setTab('ai')
                            }}
                            className="text-xs text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50"
                          >
                            IA
                          </button>
                          <button
                            onClick={() => handleToggle(s, 'active')}
                            className="text-xs text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                          >
                            {s.active ? 'Pausar' : 'Ativar'}
                          </button>
                          <button
                            onClick={() => handleDeleteSearch(s.id)}
                            className="text-xs text-red-500 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ANÁLISE IA ── */}
          {tab === 'ai' && (
            <div className="max-w-2xl">
              <h1 className="text-2xl font-bold text-gray-900 mb-6">Análise IA</h1>
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Selecione uma busca
                  </label>
                  <select
                    value={aiSearchId}
                    onChange={(e) => {
                      setAiSearchId(e.target.value)
                      setAiResult(null)
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Escolha uma busca —</option>
                    {searches.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.origin} → {s.destination ?? 'Flexível'})
                      </option>
                    ))}
                  </select>
                </div>

                {aiSearchId && (() => {
                  const s = searches.find((x) => x.id === aiSearchId)
                  if (!s) return null
                  return (
                    <>
                      <div className="bg-gray-50 rounded-lg p-4 mb-5 grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                        <div className="text-gray-500">
                          Preço atual:{' '}
                          <strong className="text-gray-900">
                            {s.current_price_brl
                              ? `R$${brl(s.current_price_brl)}`
                              : 'Sem dados'}
                          </strong>
                        </div>
                        <div className="text-gray-500">
                          Teto:{' '}
                          <strong className="text-gray-900">
                            R${brl(s.max_price_brl)}
                          </strong>
                        </div>
                        <div className="text-gray-500">
                          Partida:{' '}
                          <strong className="text-gray-900">
                            {s.date_start ? fmtDate(s.date_start) : 'Flexível'}
                          </strong>
                        </div>
                        <div className="text-gray-500">
                          Passageiros:{' '}
                          <strong className="text-gray-900">{s.passengers}</strong>
                        </div>
                      </div>

                      <button
                        onClick={handleAiAnalyze}
                        disabled={aiLoading}
                        className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {aiLoading && <Spinner />}
                        {aiLoading ? 'Analisando...' : '🤖 Analisar com IA'}
                      </button>
                    </>
                  )
                })()}

                {aiResult && (
                  <div className="mt-6 space-y-4">
                    <div
                      className={`rounded-xl p-5 text-center ${
                        aiResult.recomendacao === 'COMPRAR'
                          ? 'bg-green-50 border border-green-200'
                          : 'bg-amber-50 border border-amber-200'
                      }`}
                    >
                      <p className="text-3xl font-black mb-1">
                        {aiResult.recomendacao === 'COMPRAR' ? '✅ COMPRAR' : '⏳ ESPERAR'}
                      </p>
                      <p className="text-sm text-gray-600">
                        Confiança: <strong>{aiResult.confianca}%</strong>
                      </p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 leading-relaxed">
                      <p className="font-semibold text-gray-900 mb-1">Análise</p>
                      <p>{aiResult.razao}</p>
                    </div>

                    {aiResult.preco_alvo !== null && (
                      <div className="text-sm flex items-center gap-2">
                        <span className="text-gray-500">Preço alvo:</span>
                        <span className="font-semibold text-gray-900">
                          R${brl(aiResult.preco_alvo)}
                        </span>
                      </div>
                    )}

                    {aiResult.janela_ideal && (
                      <div className="text-sm flex items-start gap-2">
                        <span className="text-gray-500 shrink-0">Janela ideal:</span>
                        <span className="text-gray-800">{aiResult.janela_ideal}</span>
                      </div>
                    )}

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                      💼 {aiResult.dica_bagagem}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── ALERTAS ── */}
          {tab === 'alerts' && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-6">Alertas</h1>
              {alerts.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <p className="text-4xl mb-3">🔔</p>
                  <p>Nenhum alerta disparado ainda.</p>
                  <p className="text-sm mt-1">
                    Os alertas aparecem aqui quando um preço cai abaixo do teto ou
                    é detectada uma tarifa de erro.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((a) => (
                    <AlertRow key={a.id} alert={a} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── CONFIGURAÇÕES ── */}
          {tab === 'settings' && (
            <div className="max-w-lg">
              <h1 className="text-2xl font-bold text-gray-900 mb-6">Configurações</h1>
              <form
                onSubmit={handleSaveSettings}
                className="bg-white border border-gray-200 rounded-xl p-6 space-y-5"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email para alertas
                  </label>
                  <input
                    type="email"
                    value={settings.email}
                    onChange={(e) =>
                      setSettings({ ...settings, email: e.target.value })
                    }
                    placeholder="seu@email.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Utilizado para envio de alertas de preço via Resend.
                  </p>
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.notifications}
                    onChange={(e) =>
                      setSettings({ ...settings, notifications: e.target.checked })
                    }
                    className="rounded w-4 h-4"
                  />
                  <span className="text-sm text-gray-700">
                    Receber notificações por email
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={settingsBusy}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
                >
                  {settingsBusy && <Spinner />}
                  {settingsBusy ? 'Salvando...' : 'Salvar configurações'}
                </button>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
