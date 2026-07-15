import { queryRecent, bucketBy } from "../db.js";
export async function handleGetConsoleLogs(args) {
    const { level, page, hours = 24, limit = 50 } = args;
    const rows = await queryRecent({
        table: "debug_logs",
        columns: "id, level, message, context, stack_trace, session_id, timestamp",
        hours, limit,
        apply: (q) => {
            if (level)
                q = q.eq("level", level);
            if (page)
                q = q.contains("context", { page });
            return q;
        },
    });
    return { total: rows.length, by_level: bucketBy(rows, "level"), logs: rows };
}
export async function handleGetErrorLogs(args) {
    const { severity, hours = 48, limit = 30 } = args;
    const rows = await queryRecent({
        table: "error_logs",
        columns: "id, error_type, error_message, stack_trace, context, severity, session_id, timestamp, resolved",
        hours, limit,
        apply: (q) => severity ? q.eq("severity", severity) : q,
    });
    return { total: rows.length, by_severity: bucketBy(rows, "severity"), errors: rows };
}
export async function handleGetNetworkMetrics(args) {
    const { min_response_time_ms, url_contains, hours = 24, limit = 50 } = args;
    // When filtering for slow requests, sort by response time. Otherwise sort
    // by recency so callers see what just happened.
    const orderBy = min_response_time_ms
        ? { column: "response_time_ms", ascending: false }
        : { column: "timestamp", ascending: false };
    const rows = await queryRecent({
        table: "network_metrics",
        columns: "id, url, method, status_code, response_time_ms, session_id, timestamp",
        hours, limit, orderBy,
        apply: (q) => {
            if (min_response_time_ms)
                q = q.gte("response_time_ms", min_response_time_ms);
            if (url_contains)
                q = q.ilike("url", `%${url_contains}%`);
            return q;
        },
    });
    const avgMs = rows.length > 0
        ? Math.round(rows.reduce((s, r) => s + (r.response_time_ms ?? 0), 0) / rows.length)
        : 0;
    const failed = rows.filter(r => !r.status_code || r.status_code === 0 || r.status_code >= 500).length;
    return { total: rows.length, avg_response_ms: avgMs, failed_requests: failed, requests: rows };
}
export async function handleGetPerfMetrics(args) {
    const { metric_name, page, hours = 72, limit = 100 } = args;
    const rows = await queryRecent({
        table: "performance_metrics",
        columns: "id, metric_name, value, page, session_id, timestamp",
        hours, limit,
        apply: (q) => {
            if (metric_name)
                q = q.eq("metric_name", metric_name);
            if (page)
                q = q.eq("page", page);
            return q;
        },
    });
    // Single O(N) pass into per-metric buckets, then one sort per bucket.
    const buckets = new Map();
    for (const r of rows) {
        const arr = buckets.get(r.metric_name) ?? [];
        arr.push(r.value);
        buckets.set(r.metric_name, arr);
    }
    const summary = {};
    for (const [name, vals] of buckets) {
        vals.sort((a, b) => a - b);
        const sum = vals.reduce((s, v) => s + v, 0);
        summary[name] = {
            count: vals.length,
            avg: Math.round((sum / vals.length) * 10) / 10,
            p75: vals[Math.floor(vals.length * 0.75)] ?? 0,
        };
    }
    return { total: rows.length, summary, samples: rows.slice(0, 20) };
}
