CREATE OR REPLACE FUNCTION public.sync_title_streaming_platforms()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.watch_providers_json IS NULL THEN
    DELETE FROM public.title_streaming_platforms WHERE title_id = NEW.id;
    RETURN NEW;
  END IF;

  -- 1. Insert new links
  INSERT INTO public.title_streaming_platforms (title_id, platform_id)
  SELECT DISTINCT NEW.id, sp.id
  FROM (
    SELECT jsonb_path_query(NEW.watch_providers_json, '$.countries.*.flatrate[*].provider_name') #>> '{}' AS provider_name
  ) extracted
  JOIN public.streaming_platforms sp ON sp.name = extracted.provider_name
  ON CONFLICT (title_id, platform_id) DO NOTHING;

  -- 2. Delete stale links
  DELETE FROM public.title_streaming_platforms
  WHERE title_id = NEW.id
  AND platform_id NOT IN (
    SELECT sp.id
    FROM (
      SELECT jsonb_path_query(NEW.watch_providers_json, '$.countries.*.flatrate[*].provider_name') #>> '{}' AS provider_name
    ) extracted
    JOIN public.streaming_platforms sp ON sp.name = extracted.provider_name
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS tr_sync_streaming_platforms ON public.titles;

-- Create trigger
CREATE TRIGGER tr_sync_streaming_platforms
AFTER UPDATE OF watch_providers_json ON public.titles
FOR EACH ROW
WHEN (NEW.watch_providers_json IS DISTINCT FROM OLD.watch_providers_json)
EXECUTE FUNCTION public.sync_title_streaming_platforms();

-- Backfill existing data
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id, watch_providers_json FROM public.titles WHERE watch_providers_json IS NOT NULL LOOP
    -- Insert new links
    INSERT INTO public.title_streaming_platforms (title_id, platform_id)
    SELECT DISTINCT t.id, sp.id
    FROM (
      SELECT jsonb_path_query(t.watch_providers_json, '$.countries.*.flatrate[*].provider_name') #>> '{}' AS provider_name
    ) extracted
    JOIN public.streaming_platforms sp ON sp.name = extracted.provider_name
    ON CONFLICT (title_id, platform_id) DO NOTHING;
    
    -- Delete stale links
    DELETE FROM public.title_streaming_platforms
    WHERE title_id = t.id
    AND platform_id NOT IN (
      SELECT sp.id
      FROM (
        SELECT jsonb_path_query(t.watch_providers_json, '$.countries.*.flatrate[*].provider_name') #>> '{}' AS provider_name
      ) extracted
      JOIN public.streaming_platforms sp ON sp.name = extracted.provider_name
    );
  END LOOP;
END;
$$;
