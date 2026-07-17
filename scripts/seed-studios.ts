import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tmdbApiKey = process.env.TMDB_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}
if (!tmdbApiKey) {
  console.error("Missing TMDB_API_KEY environment variable.");
  console.error("Usage: TMDB_API_KEY=your_key npx ts-node scripts/seed-studios.ts");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const DRY_RUN = process.env.DRY_RUN === 'true';

// Major studio mappings to their TMDB company IDs
const STUDIOS = [
  { name: 'Warner Bros. Discovery', ids: [174, 12, 97] }, // WB, New Line, Castle Rock
  { name: 'Paramount Pictures', ids: [4, 14] },           // Paramount, Miramax
  { name: 'Walt Disney Studios', ids: [2, 25, 420, 1, 3] },// Disney, 20th Century, Marvel, Lucasfilm, Pixar
  { name: 'Amazon MGM Studios', ids: [21, 60, 41] },      // MGM, UA, Orion
  { name: 'Sony Pictures', ids: [5, 559, 3287] },         // Columbia, TriStar, Screen Gems
  { name: 'Universal Pictures', ids: [33, 521, 10146, 56] },// Universal, DreamWorks, Focus, Amblin
  { name: 'Lionsgate', ids: [1632, 491, 17] }             // Lionsgate, Summit, Starz
];

// Date ranges to chunk the requests and bypass the 10,000 result pagination limit
const DECADES = [
  { gte: '1890-01-01', lte: '1949-12-31' },
  { gte: '1950-01-01', lte: '1969-12-31' },
  { gte: '1970-01-01', lte: '1989-12-31' },
  { gte: '1990-01-01', lte: '1999-12-31' },
  { gte: '2000-01-01', lte: '2009-12-31' },
  { gte: '2010-01-01', lte: '2019-12-31' },
  { gte: '2020-01-01', lte: '2029-12-31' }
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ── Minimal TMDB response shapes (only the fields this script reads) ───────────
interface TmdbMovieDetail {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  popularity?: number;
  runtime?: number | null;
  episode_run_time?: number[];
  original_language?: string;
  origin_country?: string[];
  production_countries?: { iso_3166_1: string }[];
  genres?: { id: number; name?: string }[];
  release_dates?: {
    results?: Array<{ iso_3166_1: string; release_dates?: Array<{ certification?: string }> }>;
  };
}
interface TmdbDiscoverResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbMovieDetail[];
}

async function fetchWithRetry<T>(url: string, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url);
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
      console.warn(`Rate limited. Sleeping for ${retryAfter} seconds...`);
      await sleep(retryAfter * 1000);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
    }
    return await res.json() as T;
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

function buildTitleRow(detail: TmdbMovieDetail, mediaType: string) {
  const certificationCa = detail.release_dates?.results
    ?.find((r) => r.iso_3166_1 === "CA" || r.iso_3166_1 === "US")
    ?.release_dates?.[0]?.certification || null;

  return {
    id: `${mediaType}:${detail.id}`,
    tmdb_id: detail.id,
    media_type: mediaType,
    title: detail.title || detail.name,
    overview: detail.overview,
    poster_path: detail.poster_path,
    backdrop_path: detail.backdrop_path,
    release_date: detail.release_date || detail.first_air_date,
    vote_average: detail.vote_average,
    popularity: detail.popularity,
    runtime: detail.runtime || detail.episode_run_time?.[0] || null,
    original_language: detail.original_language,
    origin_country: (detail.origin_country || detail.production_countries?.map((c) => c.iso_3166_1))?.[0] || null,
    certification_ca: certificationCa || null,
    cached_at: new Date().toISOString()
  };
}

async function runSeed() {
  console.log(`Starting ${DRY_RUN ? 'DRY RUN ' : ''}Database Seed...`);
  console.log('Target duration: ~5 hours. Target rate: ~2.2 requests / sec.');

  let totalSeeded = 0;

  for (const studio of STUDIOS) {
    console.log(`\n========================================`);
    console.log(`Processing Studio: ${studio.name}`);
    console.log(`========================================`);

    const companyIds = studio.ids.join('|');

    for (const decade of DECADES) {
      console.log(`\nFetching titles from ${decade.gte} to ${decade.lte}...`);
      
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        const url = `https://api.themoviedb.org/3/discover/movie?api_key=${tmdbApiKey}&with_companies=${companyIds}&primary_release_date.gte=${decade.gte}&primary_release_date.lte=${decade.lte}&page=${page}&include_adult=false&sort_by=popularity.desc`;
        
        try {
          const data = await fetchWithRetry<TmdbDiscoverResponse>(url);
          if (page === 1) {
            totalPages = data.total_pages;
            console.log(`Found ${data.total_results} titles across ${totalPages} pages for this date range.`);
          }

          if (data.results && data.results.length > 0) {
            const rows = [];
            const genreRows = [];

            for (const result of data.results) {
              // Deep Fetch
              const detailUrl = `https://api.themoviedb.org/3/movie/${result.id}?api_key=${tmdbApiKey}&append_to_response=release_dates`;
              const detail = await fetchWithRetry<TmdbMovieDetail>(detailUrl);
              
              const row = buildTitleRow(detail, 'movie');
              rows.push(row);

              if (detail.genres && detail.genres.length > 0) {
                for (const g of detail.genres) {
                  genreRows.push({ title_id: row.id, genre_id: g.id });
                }
              }

              // Sleep to stretch over 5 hours (approx 450ms per request = ~2.2 req/s)
              await sleep(450); 
            }

            if (!DRY_RUN) {
              const { error: titleError } = await supabase.from('titles').upsert(rows, { onConflict: 'id' });
              if (titleError) console.error("Error upserting titles:", titleError);

              if (genreRows.length > 0) {
                const { error: genreError } = await supabase.from('title_genres').upsert(genreRows, { onConflict: 'title_id,genre_id' });
                if (genreError) console.error("Error upserting genres:", genreError);
              }
            }

            totalSeeded += rows.length;
            console.log(`[${studio.name}] Processed page ${page}/${totalPages} (${rows.length} titles). Total seeded so far: ${totalSeeded}`);
          }
        } catch (error) {
          console.error(`Failed to process page ${page} for ${decade.gte}-${decade.lte}:`, error);
        }

        page++;
      }
    }
  }

  console.log(`\nSeed Complete! Total titles processed: ${totalSeeded}`);
}

runSeed().catch(console.error);
