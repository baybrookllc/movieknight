'use client';

/**
 * Shared async-state hooks — replace the hand-rolled
 * `useState(loading)` / `useState(error)` / `try/await/catch/finally` scaffold
 * that was copy-pasted across ~14 components and pages.
 *
 * Two shapes:
 *   - useAsyncData   — fetch-on-mount / re-fetch when deps change (read flows).
 *   - useAsyncAction — imperative trigger from an event handler (submit/click).
 *
 * Both drop state updates that arrive after unmount, and useAsyncData ignores
 * out-of-order responses (only the latest invocation may write state), which
 * the ad-hoc versions did not do. Centralizing the pattern here also confines
 * the one intentional `set-state-in-effect` lint exception to a single,
 * reviewed spot instead of scattering `eslint-disable` across every call site.
 */

import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

// ── useAsyncData ─────────────────────────────────────────────────────────────

export interface AsyncDataOptions<T> {
  /** Value exposed before the first successful load (and the type anchor). */
  initialData: T;
  /** When false, the fetcher does not run and `loading` is false. Default true. */
  enabled?: boolean;
  /** Invoked with any thrown error (e.g. to show a toast). Error is also in state. */
  onError?: (error: Error) => void;
}

export interface AsyncDataState<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  /** Re-run the fetcher imperatively (e.g. a Refresh button). */
  reload: () => void;
}

/**
 * Run `fetcher` on mount and whenever `deps` change, tracking loading/error/data.
 * Stale responses (a newer run started, or the component unmounted) are ignored.
 *
 * @example
 * const { data: rows, loading, reload } = useAsyncData(
 *   async () => (await supabase.rpc('get_x')).data ?? [],
 *   [user],
 *   { initialData: [], enabled: !!user },
 * );
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
  options: AsyncDataOptions<T>,
): AsyncDataState<T> {
  const { initialData, enabled = true, onError } = options;

  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<Error | null>(null);

  // Monotonic token: only the most recent run may commit state.
  const callIdRef = useRef(0);
  // Hold the latest closures so `reload` (stable) always calls the current ones
  // without re-subscribing the effect on every render. Updated in an effect,
  // never during render.
  const fetcherRef = useRef(fetcher);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    fetcherRef.current = fetcher;
    onErrorRef.current = onError;
  });

  const reload = useCallback(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const callId = ++callIdRef.current;
    setLoading(true);
    setError(null);
    fetcherRef.current()
      .then((result) => {
        if (callId === callIdRef.current) setData(result);
      })
      .catch((err: unknown) => {
        if (callId !== callIdRef.current) return;
        const e = toError(err);
        setError(e);
        onErrorRef.current?.(e);
      })
      .finally(() => {
        if (callId === callIdRef.current) setLoading(false);
      });
  }, [enabled]);

  useEffect(() => {
    // Intentional: kick off the fetch (which flips `loading`) on mount and when
    // the caller's `deps` change. This is the single centralized exception.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    // Invalidate any in-flight run when deps change or on unmount. `callIdRef`
    // is an invalidation counter, not a DOM-node ref — mutating it here is the
    // intended stale-guard, so the "ref changed by cleanup" heuristic is moot.
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      callIdRef.current++;
    };
    // `deps` is the caller-declared re-fetch trigger; `reload` is stable per `enabled`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, ...deps]);

  return { data, loading, error, reload };
}

// ── useAsyncAction ───────────────────────────────────────────────────────────

export interface AsyncActionOptions<R> {
  onError?: (error: Error) => void;
  onSuccess?: (result: R) => void;
}

export interface AsyncActionState<Args extends unknown[], R> {
  /** Invoke the action. Resolves to the result, or undefined if it threw. */
  run: (...args: Args) => Promise<R | undefined>;
  loading: boolean;
  error: Error | null;
  /** Clear error/loading (e.g. when reopening a form). */
  reset: () => void;
}

/**
 * Wrap an imperative async action (form submit, button click) with
 * loading/error state. The action should THROW to signal failure — for APIs
 * that return `{ error }` (e.g. Supabase auth), throw it explicitly:
 *
 * @example
 * const { run: login, loading, error } = useAsyncAction(async () => {
 *   const { error } = await supabase.auth.signInWithPassword({ email, password });
 *   if (error) throw new Error(error.message);
 *   router.push('/home');
 * });
 */
export function useAsyncAction<Args extends unknown[], R>(
  action: (...args: Args) => Promise<R>,
  options?: AsyncActionOptions<R>,
): AsyncActionState<Args, R> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const actionRef = useRef(action);
  const optionsRef = useRef(options);
  const mountedRef = useRef(true);
  useEffect(() => {
    actionRef.current = action;
    optionsRef.current = options;
  });
  useEffect(() => () => { mountedRef.current = false; }, []);

  const run = useCallback(async (...args: Args): Promise<R | undefined> => {
    setLoading(true);
    setError(null);
    try {
      const result = await actionRef.current(...args);
      optionsRef.current?.onSuccess?.(result);
      return result;
    } catch (err) {
      const e = toError(err);
      if (mountedRef.current) setError(e);
      optionsRef.current?.onError?.(e);
      return undefined;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setLoading(false);
  }, []);

  return { run, loading, error, reset };
}
