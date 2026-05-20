/**
 * Runs an array of async thunks sequentially and returns their results in
 * order — same shape as Promise.all() but without concurrent Supabase
 * connections that saturate the connection pool.
 *
 * Usage:
 *   const [a, b, c] = await batchRpcs([
 *     () => supabase.rpc('foo'),
 *     () => supabase.rpc('bar'),
 *     () => supabase.from('baz').select('*'),
 *   ]);
 */
export async function batchRpcs<const T extends (() => PromiseLike<unknown>)[]>(
  fns: T,
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results: unknown[] = [];
  for (const fn of fns) {
    results.push(await fn());
  }
  return results as { [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
