/**
 * xAI (Grok) API integration — server-side only.
 *
 * Grok is the PRIMARY AI provider for AI Mode. Gemini is the fallback.
 *
 * XAI_API_KEY is read from the environment and NEVER exposed to the client.
 */

import { buildSystemPrompt, parseAIJsonResponse, type AIProviderError, type GeminiAIResponse, type GeminiMessage } from "./gemini";

/* ------------------------------------------------------------------ *
 * Config
 * ------------------------------------------------------------------ */

const XAI_MODEL = "grok-4.7";
const XAI_API_URL = "https://api.x.ai/v1/chat/completions";

/** Only 500/502/503/504 are retried. 429 is rate limit — stop immediately. */
const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1000, 2000];

function getXAIApiKey(): string | null {
  const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  const key = env.XAI_API_KEY ?? env.xai_api_key ?? null;
  return key && key.trim().length > 0 ? key.trim() : null;
}

export function isXAIConfigured(): boolean {
  return getXAIApiKey() != null;
}

/* ------------------------------------------------------------------ *
 * xAI (OpenAI-compatible) REST types
 * ------------------------------------------------------------------ */

interface XAIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface XAIResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string; type?: string; code?: string };
}

/* ------------------------------------------------------------------ *
 * Error helper
 * ------------------------------------------------------------------ */

function makeError(message: string, status?: number, code?: string): AIProviderError {
  const err = new Error(message) as AIProviderError;
  err.status = status;
  err.code = code;
  return err;
}

/* ------------------------------------------------------------------ *
 * Low-level Grok call (single attempt)
 * ------------------------------------------------------------------ */

async function callGrokOnce(
  systemPrompt: string,
  userMessage: string,
  conversationHistory: GeminiMessage[],
): Promise<string> {
  const apiKey = getXAIApiKey();
  if (!apiKey) {
    throw makeError("XAI_API_KEY is not configured.", undefined, "GROK_NOT_CONFIGURED");
  }

  const messages: XAIChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of conversationHistory) {
    messages.push({
      role: msg.role === "model" ? "assistant" : "user",
      content: msg.content,
    });
  }

  messages.push({ role: "user", content: userMessage });

  const body = {
    model: XAI_MODEL,
    messages,
    temperature: 0.4,
    max_tokens: 4096,
    response_format: { type: "json_object" },
  };

  let resp: Response;
  try {
    resp = await fetch(XAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    throw makeError(
      `Network error reaching xAI API: ${fetchErr instanceof Error ? fetchErr.message : "unknown"}`,
      0,
      "GROK_NETWORK_ERROR",
    );
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    let code: string;
    if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
      code = "GROK_INVALID_KEY";
    } else if (resp.status === 429) {
      code = "GROK_TEMPORARY_ERROR";
    } else {
      code = "GROK_TEMPORARY_ERROR";
    }
    throw makeError(`xAI API returned HTTP ${resp.status}: ${errText.slice(0, 200)}`, resp.status, code);
  }

  const data = (await resp.json()) as XAIResponse;

  if (data.error) {
    throw makeError(`xAI API error: ${data.error.message ?? "Unknown"}`, undefined, "GROK_TEMPORARY_ERROR");
  }

  const text = data.choices?.[0]?.message?.content;
  const finishReason = data.choices?.[0]?.finish_reason;

  if (!text) {
    throw makeError(`xAI returned empty response (finish_reason: ${finishReason ?? "unknown"})`, undefined, "PARSE_ERROR");
  }

  return text;
}

/* ------------------------------------------------------------------ *
 * Grok call with retry — 500/502/503/504 only, max 2 retries
 * 400/401/403/429 stop immediately
 * ------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGrokWithRetry(
  systemPrompt: string,
  userMessage: string,
  conversationHistory: GeminiMessage[],
): Promise<string> {
  let lastError: AIProviderError | null = null;

  // 1 initial request + up to 2 retries = max 3 total requests
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_DELAYS_MS[attempt - 1];
        console.log(`[AI Mode] Grok retry ${attempt}/${MAX_RETRIES} in ${delay}ms...`);
        await sleep(delay);
      }

      console.log(`[AI Mode] Grok request attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
      const text = await callGrokOnce(systemPrompt, userMessage, conversationHistory);
      console.log(`[AI Mode] Grok response received (${text.length} chars)`);
      return text;
    } catch (err) {
      lastError = err instanceof Error ? (err as AIProviderError) : makeError(String(err));
      const status = lastError.status;

      // 400/401/403 = invalid key — STOP immediately, do not retry
      if (status === 400 || status === 401 || status === 403) {
        console.error(`[AI Mode] Grok HTTP ${status} (invalid key) — stopping immediately`);
        throw lastError;
      }

      // 429 = rate limit — STOP immediately, do not retry
      if (status === 429) {
        console.error(`[AI Mode] Grok HTTP 429 (rate limit) — stopping immediately`);
        throw lastError;
      }

      // Non-retryable error — stop immediately
      const retryable = status != null && RETRYABLE_STATUS.has(status);
      if (!retryable) {
        console.error(`[AI Mode] Grok non-retryable error (HTTP ${status}): ${lastError.message}`);
        throw lastError;
      }

      // Retryable (500/502/503/504) — retry if we haven't exhausted
      if (attempt < MAX_RETRIES) {
        console.warn(`[AI Mode] Grok HTTP ${status} — will retry`);
        continue;
      }

      console.error(`[AI Mode] Grok exhausted ${MAX_RETRIES} retries (HTTP ${status})`);
      throw lastError;
    }
  }

  throw lastError ?? makeError("xAI API failed after all retries.");
}

/* ------------------------------------------------------------------ *
 * Main entry — single Grok call
 * ------------------------------------------------------------------ */

export async function processWithGrok(
  userMessage: string,
  applicationContext: string | null,
  environment: string | null,
  costPreference: string | null,
  conversationHistory: GeminiMessage[] = [],
): Promise<GeminiAIResponse> {
  const contextPrefix = [
    applicationContext ? `Application: ${applicationContext}` : null,
    environment ? `Environment: ${environment}` : null,
    costPreference ? `Cost preference: ${costPreference}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const fullMessage = contextPrefix
    ? `${contextPrefix}\n\nUser: ${userMessage}`
    : userMessage;

  console.log("[AI Mode] Grok system prompt built");
  console.log(`[AI Mode] History: ${conversationHistory.length} messages`);

  const raw = await callGrokWithRetry(buildSystemPrompt(), fullMessage, conversationHistory);

  return parseAIJsonResponse(raw, "Grok");
}
