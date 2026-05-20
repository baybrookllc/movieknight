ALTER TABLE titles ADD COLUMN IF NOT EXISTS runtime integer;
ALTER TABLE titles ADD COLUMN IF NOT EXISTS original_language text;
ALTER TABLE titles ADD COLUMN IF NOT EXISTS origin_country text;
ALTER TABLE titles ADD COLUMN IF NOT EXISTS certification_ca text;
