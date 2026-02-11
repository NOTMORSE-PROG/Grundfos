-- Enable pgvector extension for RAG embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Pump types enum
CREATE TYPE pump_type AS ENUM (
  'circulator', 'multistage', 'submersible', 'booster',
  'dosing', 'end_suction', 'wastewater'
);

-- Pumps catalog table
CREATE TABLE pumps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family TEXT NOT NULL,
  model TEXT NOT NULL UNIQUE,
  type pump_type NOT NULL,
  application TEXT[] DEFAULT '{}',
  connection_dn INT,
  max_flow_m3h DECIMAL,
  max_head_m DECIMAL,
  power_kw DECIMAL,
  eei DECIMAL,
  voltage TEXT,
  energy_class TEXT,
  typical_annual_kwh INT,
  price_range_min INT,
  price_range_max INT,
  dimensions_json JSONB DEFAULT '{}',
  features TEXT[] DEFAULT '{}',
  image_url TEXT,
  datasheet_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for pump queries
CREATE INDEX idx_pumps_type ON pumps(type);
CREATE INDEX idx_pumps_flow ON pumps(max_flow_m3h);
CREATE INDEX idx_pumps_head ON pumps(max_head_m);
CREATE INDEX idx_pumps_power ON pumps(power_kw);
CREATE INDEX idx_pumps_application ON pumps USING GIN(application);

-- Pump embeddings for RAG
CREATE TABLE pump_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pump_id UUID REFERENCES pumps(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('technical', 'natural_language', 'application')),
  content_text TEXT NOT NULL,
  embedding vector(384),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pump_embeddings_pump ON pump_embeddings(pump_id);

-- Similarity search function
CREATE OR REPLACE FUNCTION match_pumps(
  query_embedding vector(384),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  pump_id UUID,
  content_type TEXT,
  content_text TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pe.id,
    pe.pump_id,
    pe.content_type,
    pe.content_text,
    1 - (pe.embedding <=> query_embedding) AS similarity
  FROM pump_embeddings pe
  WHERE 1 - (pe.embedding <=> query_embedding) > match_threshold
  ORDER BY pe.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  session_id TEXT,
  title TEXT DEFAULT 'New Chat',
  summary TEXT,
  pump_recommended TEXT,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_session ON conversations(session_id);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  token_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

-- Sizing rules table
CREATE TABLE sizing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_type TEXT NOT NULL,
  building_type TEXT,
  watts_per_sqm DECIMAL,
  liters_per_person_day DECIMAL,
  peak_factor DECIMAL,
  default_delta_t DECIMAL,
  default_operating_hours INT,
  notes TEXT
);

-- Energy rates table
CREATE TABLE energy_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region TEXT NOT NULL,
  country_code TEXT NOT NULL,
  electricity_rate_per_kwh DECIMAL NOT NULL,
  co2_kg_per_kwh DECIMAL NOT NULL,
  currency TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed sizing rules
INSERT INTO sizing_rules (application_type, building_type, watts_per_sqm, default_delta_t, default_operating_hours, notes)
VALUES
  ('heating', 'residential', 20, 10, 4380, 'Standard residential heating'),
  ('heating', 'commercial', 25, 10, 4380, 'Commercial heating with higher load'),
  ('cooling', 'office', 80, 5, 2190, 'Office cooling'),
  ('cooling', 'commercial', 100, 5, 2190, 'Commercial cooling');

INSERT INTO sizing_rules (application_type, building_type, liters_per_person_day, peak_factor, default_operating_hours, notes)
VALUES
  ('domestic_water', 'residential', 200, 2.5, 8760, 'Domestic water supply'),
  ('water_supply', 'commercial', 150, 3.0, 8760, 'Commercial water supply');

-- Seed energy rates
INSERT INTO energy_rates (region, country_code, electricity_rate_per_kwh, co2_kg_per_kwh, currency)
VALUES
  ('Philippines', 'PH', 9.50, 0.52, 'PHP'),
  ('United States', 'US', 0.12, 0.42, 'USD'),
  ('European Union', 'EU', 0.25, 0.30, 'EUR'),
  ('Global Average', 'GLOBAL', 0.15, 0.42, 'USD');

-- RLS policies
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Allow all access for now (will tighten with auth)
CREATE POLICY "Allow all conversations" ON conversations FOR ALL USING (true);
CREATE POLICY "Allow all messages" ON messages FOR ALL USING (true);
CREATE POLICY "Allow read pumps" ON pumps FOR SELECT USING (true);
CREATE POLICY "Allow read embeddings" ON pump_embeddings FOR SELECT USING (true);
