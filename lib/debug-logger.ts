/**
 * Browser-side debug logging singleton.
 *
 * Intercepts console methods, window.onerror, unhandledrejection, and fetch.
 * Observes Core Web Vitals (LCP, FCP, CLS, TTFB) via PerformanceObserver.
 * Buffers all events and flushes to /api/debug/ingest every 10 seconds or
 * when the buffer reaches 20 entries, whichever comes first.
 * Falls back to navigator.sendBeacon on page unload.
 *
 * Usage:
 *   import { debugLogger } from '@/lib/debug-logger';
 *   debugLogger.init(userId);   // call once on mount (client side only)
 *   debugLogger.destroy();      // call on unmount / cleanup
 */

import { redactPII, redactContext } from '@/lib/pii-redact';

export type EventType = 'console' | 'error' | 'network' | 'perf';
export type LogLevel = 'log' | 'warn' | 'error' | 'info';

interface BaseEvent {
  type: EventType;
  timestamp: string;
}

export interface ConsoleEvent extends BaseEvent {
  type: 'console';
  level: LogLevel;
  message: string;
  context: { page: string; component?: string };
  stack: string | null;
}

export interface ErrorEvent extends BaseEvent {
  type: 'error';
  level: 'error';
  message: string;
  context: { page: string; component?: string; [key: string]: unknown };
  stack: string | null;
}

export interface NetworkEvent extends BaseEvent {
  type: 'network';
  url: string;
  method: string;
  status: number;
  responseTime: number;
  context: { page: string };
}

export interface PerfEvent extends BaseEvent {
  type: 'perf';
  metricName: string;
  value: number;
  context: { page: string };
}

export type DebugEvent = ConsoleEvent | ErrorEvent | NetworkEvent | PerfEvent;

export interface FlushPayload {
  sessionId: string;
  userId: string | null;
  events: DebugEvent[];
}

// ── Constants ──────────────────────────────────────────────────────────────

export const INGEST_URL = '/api/debug/ingest';
const FLUSH_INTERVAL_MS = 10_000;
const BUFFER_FLUSH_THRESHOLD = 20;
export const SESSION_STORAGE_KEY = 'dbg_session_id';

// ── Session ID (module-level; shared with lib/client-error-report.ts) ───────

/** UUID with a non-crypto fallback for older/embedded browsers. */
export function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/**
 * Read the telemetry session id from sessionStorage, creating one if absent.
 * Single source of truth so error-boundary reports (lib/client-error-report.ts),
 * which run outside the debugLogger singleton, land in the same session as any
 * telemetry the singleton has already collected.
 */
export function getOrCreateSessionId(): string {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) return stored;
    const id = randomId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

// ── Singleton class ────────────────────────────────────────────────────────

class DebugLogger {
  private sessionId: string | null = null;
  private userId: string | null = null;
  private buffer: DebugEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private originalConsole: Partial<Record<LogLevel, (...args: unknown[]) => void>> = {};
  private originalFetch: typeof fetch | null = null;
  private vitalObservers: PerformanceObserver[] = [];
  private clsTotal = 0;
  private initialized = false;

  // ── Public API ───────────────────────────────────────────────────────────

  init(userId?: string): void {
    if (typeof window === 'undefined') return;
    if (this.initialized) return;

    try {
      this.initialized = true;
      this.userId = userId ?? null;
      this.sessionId = getOrCreateSessionId();

      this.interceptConsole();
      this.interceptFetch();
      this.installErrorHandlers();
      this.observeWebVitals();

      this.flushTimer = setInterval(() => { this.flush(); }, FLUSH_INTERVAL_MS);

      window.addEventListener('visibilitychange', this.handleVisibilityChange);
      window.addEventListener('pagehide', this.handlePageHide);
    } catch {
      // Never throw
    }
  }

  destroy(): void {
    if (typeof window === 'undefined') return;

    try {
      if (this.flushTimer !== null) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }

      this.restoreConsole();
      this.restoreFetch();
      this.disconnectVitalObservers();

      window.removeEventListener('error', this.handleWindowError);
      window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
      window.removeEventListener('visibilitychange', this.handleVisibilityChange);
      window.removeEventListener('pagehide', this.handlePageHide);

      this.flush();

      this.initialized = false;
      this.sessionId = null;
      this.userId = null;
      this.buffer = [];
    } catch {
      // Never throw
    }
  }

  // ── Buffer management ─────────────────────────────────────────────────────

  private push(event: DebugEvent): void {
    try {
      this.buffer.push(event);
      if (this.buffer.length >= BUFFER_FLUSH_THRESHOLD) {
        this.flush();
      }
    } catch {
      // Never throw
    }
  }

  private currentPage(): string {
    try {
      return window.location.pathname;
    } catch {
      return '/';
    }
  }

  private now(): string {
    return new Date().toISOString();
  }

  private buildPayload(): { body: string; events: DebugEvent[] } | null {
    if (!this.sessionId || this.buffer.length === 0) return null;
    const events = this.buffer.splice(0);
    const payload: FlushPayload = {
      sessionId: this.sessionId,
      userId: this.userId,
      events,
    };
    return { body: JSON.stringify(payload), events };
  }

  // ── Flush ─────────────────────────────────────────────────────────────────

  private flush(): void {
    try {
      const data = this.buildPayload();
      if (!data) return;

      const fn = this.originalFetch ?? fetch;
      fn(INGEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data.body,
        keepalive: true,
      }).catch(() => {
        // Silently discard — don't re-buffer
      });
    } catch {
      // Never throw
    }
  }

  private flushBeacon(): void {
    try {
      const data = this.buildPayload();
      if (!data) return;

      if (navigator.sendBeacon) {
        const blob = new Blob([data.body], { type: 'application/json' });
        navigator.sendBeacon(INGEST_URL, blob);
      } else {
        // Fallback to keepalive fetch
        const fn = this.originalFetch ?? fetch;
        fn(INGEST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: data.body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // Never throw
    }
  }

  // ── Unload handlers ───────────────────────────────────────────────────────

  private emitFinalCls(): void {
    try {
      if (this.clsTotal <= 0) return;
      const event: PerfEvent = {
        type: 'perf',
        metricName: 'CLS',
        value: Math.round(this.clsTotal * 1000) / 1000,
        context: { page: this.currentPage() },
        timestamp: this.now(),
      };
      this.buffer.push(event);
      this.clsTotal = 0;
    } catch {
      // Never throw
    }
  }

  private handleVisibilityChange = (): void => {
    try {
      if (document.visibilityState === 'hidden') {
        this.emitFinalCls();
        this.flushBeacon();
      }
    } catch {
      // Never throw
    }
  };

  private handlePageHide = (): void => {
    try {
      this.emitFinalCls();
      this.flushBeacon();
    } catch {
      // Never throw
    }
  };

  // ── Console interception ──────────────────────────────────────────────────

  private interceptConsole(): void {
    const levels: LogLevel[] = ['log', 'warn', 'error', 'info'];
    for (const level of levels) {
      try {
        this.originalConsole[level] = console[level].bind(console);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console[level] = (...args: any[]): void => {
          try {
            this.originalConsole[level]!(...args);
          } catch {
            // Forward failure is non-fatal
          }
          try {
            const message = redactPII(
              args
                .map((a) =>
                  typeof a === 'string'
                    ? a
                    : a instanceof Error
                    ? a.message
                    : JSON.stringify(a)
                )
                .join(' ')
                .slice(0, 2000)
            );

            const errorArg = args.find((a): a is Error => a instanceof Error);

            const event: ConsoleEvent = {
              type: 'console',
              level,
              message,
              context: { page: this.currentPage() },
              stack: errorArg?.stack ?? null,
              timestamp: this.now(),
            };
            this.push(event);
          } catch {
            // Never throw
          }
        };
      } catch {
        // Never throw
      }
    }
  }

  private restoreConsole(): void {
    const levels: LogLevel[] = ['log', 'warn', 'error', 'info'];
    for (const level of levels) {
      try {
        if (this.originalConsole[level]) {
          console[level] = this.originalConsole[level]!;
        }
      } catch {
        // Never throw
      }
    }
    this.originalConsole = {};
  }

  // ── Error handlers ────────────────────────────────────────────────────────

  private handleWindowError = (ev: globalThis.ErrorEvent): void => {
    try {
      const event: ErrorEvent = {
        type: 'error',
        level: 'error',
        message: redactPII(ev.message ?? 'Unknown error'),
        context: redactContext({
          page: this.currentPage(),
          filename: ev.filename,
          lineno: ev.lineno,
          colno: ev.colno,
        }),
        stack: (ev.error as Error | null)?.stack ?? null,
        timestamp: this.now(),
      };
      this.push(event);
    } catch {
      // Never throw
    }
  };

  private handleUnhandledRejection = (ev: PromiseRejectionEvent): void => {
    try {
      const reason = ev.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
          ? reason
          : JSON.stringify(reason) ?? 'Unhandled promise rejection';

      const event: ErrorEvent = {
        type: 'error',
        level: 'error',
        message: redactPII(String(message).slice(0, 2000)),
        context: { page: this.currentPage() },
        stack: reason instanceof Error ? reason.stack ?? null : null,
        timestamp: this.now(),
      };
      this.push(event);
    } catch {
      // Never throw
    }
  };

  private installErrorHandlers(): void {
    try {
      window.addEventListener('error', this.handleWindowError);
      window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
    } catch {
      // Never throw
    }
  }

  // ── Fetch interception ────────────────────────────────────────────────────

  private interceptFetch(): void {
    try {
      this.originalFetch = window.fetch.bind(window);

      window.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit
      ): Promise<Response> => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
            ? input.href
            : (input as Request).url;

        // Exit early for ingest calls — avoid timing overhead
        if (url.includes(INGEST_URL)) {
          return this.originalFetch!(input, init);
        }

        const method =
          init?.method ??
          (typeof input !== 'string' && !(input instanceof URL)
            ? (input as Request).method
            : 'GET') ??
          'GET';

        const start = performance.now();
        const baseUrl = url.split('?')[0];

        try {
          const response = await this.originalFetch!(input, init);
          const responseTime = Math.round(performance.now() - start);

          try {
            const event: NetworkEvent = {
              type: 'network',
              url: baseUrl,
              method: method.toUpperCase(),
              status: response.status,
              responseTime,
              context: { page: this.currentPage() },
              timestamp: this.now(),
            };
            this.push(event);
          } catch {
            // Never throw
          }

          return response;
        } catch (err) {
          const responseTime = Math.round(performance.now() - start);
          try {
            const event: NetworkEvent = {
              type: 'network',
              url: baseUrl,
              method: method.toUpperCase(),
              status: 0,
              responseTime,
              context: { page: this.currentPage() },
              timestamp: this.now(),
            };
            this.push(event);
          } catch {
            // Never throw
          }
          throw err;
        }
      };
    } catch {
      // Never throw
    }
  }

  private restoreFetch(): void {
    try {
      if (this.originalFetch) {
        window.fetch = this.originalFetch;
        this.originalFetch = null;
      }
    } catch {
      // Never throw
    }
  }

  // ── Core Web Vitals ───────────────────────────────────────────────────────

  private observeWebVitals(): void {
    const recordVital = (name: string, value: number): void => {
      try {
        const event: PerfEvent = {
          type: 'perf',
          metricName: name,
          value: Math.round(value * 100) / 100,
          context: { page: this.currentPage() },
          timestamp: this.now(),
        };
        this.push(event);
      } catch {
        // Never throw
      }
    };

    // LCP — fires once with the final value before the page becomes hidden
    try {
      let lcpFired = false;
      const lcpObs = new PerformanceObserver((list) => {
        if (lcpFired) return;
        const entries = list.getEntries();
        const last = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
        if (last) {
          lcpFired = true;
          recordVital('LCP', last.startTime);
        }
      });
      lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
      this.vitalObservers.push(lcpObs);
    } catch {
      // Not supported
    }

    // FCP — fires once
    try {
      let fcpFired = false;
      const fcpObs = new PerformanceObserver((list) => {
        if (fcpFired) return;
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            fcpFired = true;
            recordVital('FCP', entry.startTime);
            break;
          }
        }
      });
      fcpObs.observe({ type: 'paint', buffered: true });
      this.vitalObservers.push(fcpObs);
    } catch {
      // Not supported
    }

    // CLS accumulates across the page lifetime; recording every layout-shift
    // floods the buffer. Track the running total and emit once on pagehide
    // (via destroy() / flushBeacon path).
    try {
      const clsObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const ls = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
          if (!ls.hadRecentInput) {
            this.clsTotal = Math.min(this.clsTotal + ls.value, 1.0);
          }
        }
      });
      clsObs.observe({ type: 'layout-shift', buffered: true });
      this.vitalObservers.push(clsObs);
    } catch {
      // Not supported
    }

    // TTFB — from navigation timing, fires once
    try {
      let ttfbFired = false;
      const navObs = new PerformanceObserver((list) => {
        if (ttfbFired) return;
        for (const entry of list.getEntries()) {
          const nav = entry as PerformanceNavigationTiming;
          if (nav.responseStart > 0) {
            ttfbFired = true;
            recordVital('TTFB', nav.responseStart - nav.requestStart);
            break;
          }
        }
      });
      navObs.observe({ type: 'navigation', buffered: true });
      this.vitalObservers.push(navObs);
    } catch {
      // Not supported
    }
  }

  private disconnectVitalObservers(): void {
    for (const obs of this.vitalObservers) {
      try {
        obs.disconnect();
      } catch {
        // Never throw
      }
    }
    this.vitalObservers = [];
  }
}

// ── Singleton export ───────────────────────────────────────────────────────

export const debugLogger = new DebugLogger();
