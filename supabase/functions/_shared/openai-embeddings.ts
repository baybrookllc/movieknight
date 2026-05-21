// Shared OpenAI text embedding helper for Deno edge functions.
// Wraps the embeddings API call with timeout, retry, and circuit breaker.

import { retryWithBackoff } from "./retry.ts";
import { CircuitBreaker } from "./circuit-breaker.ts";

const OPENAI_MODEL = "text-embedding-3-small";
const TIMEOUT_MS = 8000;

export const openaiBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  monitoringWindowMs: 60000,
});

export async function embedText(text: string): Promise<number[]> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new Error("OPENAI_API_KEY secret is not set");

  return openaiBreaker.execute(() =>
    retryWithBackoff(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
          const res = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({ model: OPENAI_MODEL, input: text }),
            signal: controller.signal,
          });

          if (!res.ok) {
            const body = await res.text();
            throw new Error(`OpenAI embeddings error ${res.status}: ${body}`);
          }

          const data = await res.json();
          const embedding = data?.data?.[0]?.embedding;
          if (!Array.isArray(embedding)) {
            throw new Error("OpenAI returned no embedding vector");
          }
          return embedding as number[];
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            throw new Error(`OpenAI request timeout (${TIMEOUT_MS}ms)`);
          }
          throw err;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      { maxRetries: 2, baseDelayMs: 100, maxDelayMs: 1000 }
    )
  );
}
