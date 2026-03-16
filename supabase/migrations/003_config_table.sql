-- Config table for global app settings (e.g. current week)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- RLS: readable by anyone authenticated, writable only by service role (admin API)
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config_read" ON config
  FOR SELECT TO authenticated USING (true);

-- Seed initial season config
INSERT INTO config (key, value)
VALUES ('season', '{"currentWeek": "Preseason", "year": 2026}')
ON CONFLICT (key) DO NOTHING;
