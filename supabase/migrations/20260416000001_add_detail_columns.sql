ALTER TABLE titles ADD COLUMN IF NOT EXISTS budget bigint;
ALTER TABLE titles ADD COLUMN IF NOT EXISTS revenue bigint;
ALTER TABLE titles ADD COLUMN IF NOT EXISTS studios text[];
ALTER TABLE titles ADD COLUMN IF NOT EXISTS directors text[];
ALTER TABLE titles ADD COLUMN IF NOT EXISTS writers text[];
ALTER TABLE titles ADD COLUMN IF NOT EXISTS spoken_languages text[];
