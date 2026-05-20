-- Debug Logging Schema for StreamSocial

-- Console logs table
CREATE TABLE IF NOT EXISTS debug_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('log', 'warn', 'error', 'info', 'debug')),
  message text NOT NULL,
  context jsonb,
  stack_trace text,
  timestamp timestamptz DEFAULT now(),
  session_id text
);

-- Network request metrics
CREATE TABLE IF NOT EXISTS network_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  method text,
  status_code int,
  response_time_ms int,
  response_size_bytes int,
  error text,
  timestamp timestamptz DEFAULT now(),
  session_id text
);

-- Performance metrics (Core Web Vitals, custom)
CREATE TABLE IF NOT EXISTS performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  value float NOT NULL,
  unit text,
  page text,
  timestamp timestamptz DEFAULT now(),
  session_id text
);

-- Error tracking
CREATE TABLE IF NOT EXISTS error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  error_type text NOT NULL,
  error_message text NOT NULL,
  stack_trace text,
  context jsonb,
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  timestamp timestamptz DEFAULT now(),
  session_id text,
  resolved boolean DEFAULT false
);

-- Indexes (no partial predicates using now() — PostgreSQL requires IMMUTABLE expressions)
CREATE INDEX IF NOT EXISTS idx_debug_logs_user_timestamp ON debug_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_debug_logs_level_timestamp ON debug_logs(level, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_debug_logs_timestamp ON debug_logs(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_network_metrics_timestamp ON network_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_network_metrics_slow ON network_metrics(response_time_ms DESC) WHERE response_time_ms > 1000;

CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_page ON performance_metrics(page, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity, timestamp DESC);

-- RLS: service role bypass on all four tables (INSERT allowed for any auth user; SELECT restricted to owner + service role)
ALTER TABLE debug_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "debug_logs_select" ON debug_logs FOR SELECT
  USING (auth.uid() = user_id OR (auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "debug_logs_insert" ON debug_logs FOR INSERT
  WITH CHECK (true);  -- service role ingest route writes with null user_id

ALTER TABLE network_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "network_metrics_select" ON network_metrics FOR SELECT
  USING (auth.uid() = user_id OR (auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "network_metrics_insert" ON network_metrics FOR INSERT WITH CHECK (true);

ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "performance_metrics_select" ON performance_metrics FOR SELECT
  USING (auth.uid() = user_id OR (auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "performance_metrics_insert" ON performance_metrics FOR INSERT WITH CHECK (true);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "error_logs_select" ON error_logs FOR SELECT
  USING (auth.uid() = user_id OR (auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "error_logs_insert" ON error_logs FOR INSERT WITH CHECK (true);

-- Grant usage to anon + authenticated (service_role already has full access)
GRANT SELECT, INSERT ON debug_logs TO anon, authenticated;
GRANT SELECT, INSERT ON network_metrics TO anon, authenticated;
GRANT SELECT, INSERT ON performance_metrics TO anon, authenticated;
GRANT SELECT, INSERT ON error_logs TO anon, authenticated;
