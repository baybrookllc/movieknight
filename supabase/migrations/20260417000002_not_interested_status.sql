-- Add 'not_interested' as a valid watch_history status value.
-- Drops the existing CHECK constraint (whatever it is named) and recreates it
-- with the new value included.
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM   pg_constraint
  WHERE  conrelid = 'watch_history'::regclass
    AND  contype  = 'c'
    AND  pg_get_constraintdef(oid) ILIKE '%status%'
  LIMIT  1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE 'ALTER TABLE watch_history DROP CONSTRAINT ' || quote_ident(v_constraint);
  END IF;
END;
$$;

ALTER TABLE watch_history
  ADD CONSTRAINT watch_history_status_check
  CHECK (status IN ('want_to_watch','watching','watched','dropped','not_interested'));
