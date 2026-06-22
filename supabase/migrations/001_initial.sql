CREATE TABLE searches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT,
  flexible_dest BOOLEAN DEFAULT false,
  region TEXT,
  date_start DATE,
  date_end DATE,
  min_stay INTEGER DEFAULT 7,
  max_stay INTEGER DEFAULT 14,
  max_price_brl NUMERIC NOT NULL,
  passengers INTEGER DEFAULT 1,
  cabin_class TEXT DEFAULT 'economy',
  stops TEXT DEFAULT 'any',
  flex_dates BOOLEAN DEFAULT true,
  baggage_needs JSONB DEFAULT '{"checkedBags":0,"weightPerBag":23}',
  excluded_sources JSONB DEFAULT '["123milhas","MaxMilhas"]',
  preferred_airlines JSONB DEFAULT '[]',
  avoided_airlines JSONB DEFAULT '[]',
  fare_options JSONB DEFAULT '[]',
  extra_bag_price_brl NUMERIC DEFAULT 280,
  frequency INTEGER DEFAULT 3,
  times JSONB DEFAULT '["08:00","14:00","22:00"]',
  alert_on_any_below_max BOOLEAN DEFAULT true,
  alert_on_error_fare BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  frozen BOOLEAN DEFAULT false,
  current_price_brl NUMERIC,
  last_check TIMESTAMPTZ,
  ai_analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  search_id TEXT REFERENCES searches(id) ON DELETE CASCADE,
  search_name TEXT,
  price_brl NUMERIC,
  type TEXT,
  message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE price_history (
  id SERIAL PRIMARY KEY,
  search_id TEXT REFERENCES searches(id) ON DELETE CASCADE,
  price_brl NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  email TEXT,
  notifications BOOLEAN DEFAULT true,
  travelpayouts_token TEXT,
  duffel_token TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_price_history_search_id ON price_history(search_id);
CREATE INDEX idx_alerts_search_id ON alerts(search_id);
CREATE INDEX idx_searches_active ON searches(active, frozen);
