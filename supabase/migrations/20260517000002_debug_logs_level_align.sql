-- Align the debug_logs.level CHECK constraint with the TypeScript LogLevel
-- union ('log' | 'warn' | 'error' | 'info'). The original migration accepted
-- 'debug' as well but the client never emits it.
ALTER TABLE debug_logs DROP CONSTRAINT IF EXISTS debug_logs_level_check;
ALTER TABLE debug_logs ADD CONSTRAINT debug_logs_level_check
  CHECK (level IN ('log','warn','error','info'));
