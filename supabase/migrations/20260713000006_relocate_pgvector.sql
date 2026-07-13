-- ═══════════════════════════════════════════════════════════════
-- Relocate the pgvector extension out of the public schema
-- ═══════════════════════════════════════════════════════════════
-- Fixes the `extension_in_public` security advisory finding. pgvector 0.8.0
-- is relocatable, and this project uses it in exactly one place: the
-- title_embeddings.embedding column (type vector(1536)) plus one HNSW index
-- (vector_cosine_ops) and the match_titles() RPC functions that query it
-- via the <=> cosine-distance operator.
--
-- Table column types and index operator classes are resolved by OID in the
-- catalog, not by schema-qualified name — moving the extension does not
-- affect title_embeddings.embedding or title_embeddings_embedding_idx.
--
-- The one real risk: match_titles()'s two overloads are LANGUAGE sql
-- functions with `search_path=public` pinned (from the 2026-07-13
-- function_search_path_mutable fix). Their bodies call the <=> operator
-- unqualified, so once that operator's schema changes, they need
-- `extensions` added to their pinned search_path or they'll fail to
-- resolve it on next call. (get_titles_by_keywords also matched a grep for
-- "vector" during ground-truth review, but that was `to_tsvector` — no
-- actual pgvector usage, no change needed.)
-- ═══════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS extensions;

GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

ALTER EXTENSION vector SET SCHEMA extensions;

-- Schema-qualify the vector type in these ALTER FUNCTION clauses (rather
-- than relying on the session's search_path to resolve the bare word
-- "vector") since the type itself moved off public in the statement above,
-- and this connection's default search_path is just "$user", public.
ALTER FUNCTION public.match_titles(extensions.vector, double precision, integer)
    SET search_path = public, extensions;

ALTER FUNCTION public.match_titles(extensions.vector, double precision, integer, text)
    SET search_path = public, extensions;
