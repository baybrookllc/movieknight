-- The streaming-platform sync joined streaming_platforms.name = TMDB provider_name
-- by exact string. TMDB emits "Amazon Prime Video", "Disney Plus", "HBO Max",
-- "Paramount Plus", "Peacock Premium", etc., so only "Netflix" and "Hulu" ever
-- matched — the Platforms filter was effectively broken for 8 of 10 platforms.
--
-- This migration adds a normalizer that maps TMDB's many naming variants onto the
-- 10 canonical platform names, rewires the trigger to use it, and re-backfills.

-- ── Provider-name normalizer ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_provider_name(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw ILIKE 'Netflix%'                                   THEN 'Netflix'
    WHEN raw ILIKE 'Amazon Prime Video%' OR raw = 'Prime Video' THEN 'Prime Video'
    WHEN raw ILIKE 'Disney Plus%' OR raw ILIKE 'Disney+%'       THEN 'Disney+'
    WHEN raw IN ('Apple TV+', 'Apple TV Plus')                  THEN 'Apple TV+'
    WHEN raw ILIKE 'Hulu%'                                      THEN 'Hulu'
    WHEN raw IN ('Max', 'HBO Max')                              THEN 'Max'
    WHEN raw ILIKE 'Paramount Plus%' OR raw ILIKE 'Paramount+%' THEN 'Paramount+'
    WHEN raw ILIKE 'Peacock%'                                   THEN 'Peacock'
    WHEN raw ILIKE '%Roku Channel%'                             THEN 'Roku Channel'
    WHEN raw = 'YouTube'                                        THEN 'YouTube'
    ELSE raw
  END;
$$;

-- ── Trigger function: sync junction table using the normalizer ─────────────────
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
    SELECT public.normalize_provider_name(
             jsonb_path_query(NEW.watch_providers_json, '$.countries.*.flatrate[*].provider_name') #>> '{}'
           ) AS provider_name
  ) extracted
  JOIN public.streaming_platforms sp ON sp.name = extracted.provider_name
  ON CONFLICT (title_id, platform_id) DO NOTHING;

  -- 2. Delete stale links
  DELETE FROM public.title_streaming_platforms
  WHERE title_id = NEW.id
  AND platform_id NOT IN (
    SELECT sp.id
    FROM (
      SELECT public.normalize_provider_name(
               jsonb_path_query(NEW.watch_providers_json, '$.countries.*.flatrate[*].provider_name') #>> '{}'
             ) AS provider_name
    ) extracted
    JOIN public.streaming_platforms sp ON sp.name = extracted.provider_name
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Backfill: add the now-matchable links for existing titles ──────────────────
INSERT INTO public.title_streaming_platforms (title_id, platform_id)
SELECT DISTINCT t.id, sp.id
FROM public.titles t
CROSS JOIN LATERAL (
  SELECT public.normalize_provider_name(
           jsonb_path_query(t.watch_providers_json, '$.countries.*.flatrate[*].provider_name') #>> '{}'
         ) AS provider_name
) extracted
JOIN public.streaming_platforms sp ON sp.name = extracted.provider_name
WHERE t.watch_providers_json IS NOT NULL
ON CONFLICT (title_id, platform_id) DO NOTHING;
