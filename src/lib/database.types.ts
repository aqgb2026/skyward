export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Search = {
  id: string
  name: string
  origin: string
  destination: string | null
  flexible_dest: boolean
  region: string | null
  date_start: string | null
  date_end: string | null
  min_stay: number
  max_stay: number
  max_price_brl: number
  passengers: number
  cabin_class: string
  stops: string
  flex_dates: boolean
  baggage_needs: Json
  excluded_sources: Json
  preferred_airlines: Json
  avoided_airlines: Json
  fare_options: Json
  extra_bag_price_brl: number
  frequency: number
  times: Json
  alert_on_any_below_max: boolean
  alert_on_error_fare: boolean
  active: boolean
  frozen: boolean
  current_price_brl: number | null
  last_check: string | null
  ai_analysis: Json | null
  created_at: string
  updated_at: string
}

export type Alert = {
  id: string
  search_id: string | null
  search_name: string | null
  price_brl: number | null
  type: string | null
  message: string | null
  sent_at: string
}

export type PriceHistory = {
  id: number
  search_id: string | null
  price_brl: number
  recorded_at: string
}

export type Settings = {
  id: number
  email: string | null
  notifications: boolean
  travelpayouts_token: string | null
  duffel_token: string | null
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      searches: {
        Row: Search
        Insert: Omit<Search, 'created_at' | 'updated_at'> & {
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Search>
        Relationships: []
      }
      alerts: {
        Row: Alert
        Insert: Omit<Alert, 'sent_at'> & { sent_at?: string }
        Update: Partial<Alert>
        Relationships: []
      }
      price_history: {
        Row: PriceHistory
        Insert: Omit<PriceHistory, 'id' | 'recorded_at'> & {
          id?: number
          recorded_at?: string
        }
        Update: Partial<PriceHistory>
        Relationships: []
      }
      settings: {
        Row: Settings
        Insert: Partial<Settings>
        Update: Partial<Settings>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
