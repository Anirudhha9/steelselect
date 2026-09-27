/**
 * xAI (Grok) API integration — server-side only.
 *
 * Grok is the PRIMARY AI provider for AI Mode. Gemini is the fallback.
 *
 * Grok performs the COMPLETE AI reasoning:
 *   - Understands the user's natural-language requirements
 *   - Compares against the provided database material records
 *   - Selects suitable grades ONLY from those records
 *   - Explains the recommendation and trade-offs
 *
 * The backend enforces the database boundary: Grok can only recommend
 * grades that exist in the database. The caller validates Grok's output.
 *
 * XAI_API_KEY is read from the environment and NEVER exposed to the client.
 */

import { buildSystemPrompt, type GeminiAIResponse, type GeminiMessage } from "./gemini";

/* ------------------------------------------------------------------ *
 * Config
 * ------------------------------------------------------------------ */

const XAI_MODEL = "grok-4.7";
const XAI_API_URL = "https://api.x.ai/v1/chat/completions";

const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1000, 2000];
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

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
 * Low-level Grok call (single attempt, no retry)
 * ------------------------------------------------------------------ */

async function callGrokOnce(
  systemPrompt: string,
  userMessage: string,
  conversationHistory: GeminiMessage[],
): Promise<string> {
  const apiKey = getXAIApiKey();
  if (!apiKey) {
    const err = new Error("XAI_API_KEY is not configured.") as Error & { status?: number };
    err.status = undefined;
    throw err;
  }

  // Convert to OpenAI-compatible chat format
  const messages: XAIChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of conversationHistory) {
    messages.push({
      role: msg.role === "model" ? "assistant" : "user",
      content: msg.content,
    });
  }

  // Add the current user message
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
    const err = new Error(
      `Network error reaching xAI API: ${fetchErr instanceof Error ? fetchErr.message : "unknown"}`,
    ) as Error & { status?: number };
    err.status = 0;
    throw err;
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    const err = new Error(
      `xAI API returned HTTP ${resp.status}: ${errText.slice(0, 300)}`,
    ) as Error & { status?: number };
    err.status = resp.status;
    throw err;
  }

  const data = (await resp.json()) as XAIResponse;

  if (data.error) {
    throw new Error(`xAI API error: ${data.error.message ?? "Unknown"}`);
  }

  const text = data.choices?.[0]?.message?.content;
  const finishReason = data.choices?.[0]?.finish_reason;

  if (!text) {
    throw new Error(
      `xAI returned an empty response (finish_reason: ${finishReason ?? "unknown"})`,
    );
  }

  return text;
}

/* ------------------------------------------------------------------ *
 * Grok call with retry (429/5xx only, max 2 retries)
 * ------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGrokWithRetry(
  systemPrompt: string,
  userMessage: string,
  conversationHistory: GeminiMessage[],
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_DELAYS_MS[attempt - 1];
        console.log(`[AI Mode] Retrying Grok in ${delay}ms (attempt ${attempt + 1})...`);
        await sleep(delay);
      }

      const text = await callGrokOnce(systemPrompt, userMessage, conversationHistory);
      console.log(`[AI Mode] Grok response received (${text.length} chars)`);
      return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const status = (err as Error & { status?: number }).status;

      const retryable = status != null && status > 0 && RETRYABLE_STATUS.has(status);
      const moreRetries = attempt < MAX_RETRIES;

      if (retryable && moreRetries) {
        console.warn(`[AI Mode] Grok returned HTTP ${status} — will retry`);
        continue;
      }

      if (!retryable) {
        console.error(`[AI Mode] Grok failed (non-retryable): ${lastError.message}`);
      } else {
        console.error(`[AI Mode] Grok exhausted retries (HTTP ${status}): ${lastError.message}`);
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("xAI API failed after all retries.");
}

/* ------------------------------------------------------------------ *
 * Main entry — single Grok call for complete AI reasoning
 * ------------------------------------------------------------------ */

export async function processWithGrok(
  userMessage: string,
  applicationContext: string | null,
  environment: string | null,
  costPreference: string | null,
  conversationHistory: GeminiMessage[] = [],
): Promise<GeminiAIResponse> {
  const contextPrefix = [
    applicationContext ? `Application context (from UI): ${applicationContext}` : null,
    environment ? `Environment (from UI): ${environment}` : null,
    costPreference ? `Cost preference (from UI): ${costPreference}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const fullMessage = contextPrefix
    ? `${contextPrefix}\n\nUser message: ${userMessage}`
    : userMessage;

  console.log("[AI Mode] Building system prompt with database context...");
  const systemPrompt = buildSystemPrompt();
  console.log(`[AI Mode] System prompt length: ${systemPrompt.length} chars`);
  console.log(`[AI Mode] History messages: ${conversationHistory.length}`);

  const raw = await callGrokWithRetry(systemPrompt, fullMessage, conversationHistory);

  // Parse the JSON response
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }

  let parsed: GeminiAIResponse;
  try {
    parsed = JSON.parse(cleaned) as GeminiAIResponse;
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]) as GeminiAIResponse;
      } catch (parseErr) {
        console.error("[AI Mode] Failed to parse Grok JSON response:", parseErr instanceof Error ? parseErr.message : String(parseErr));
        console.error("[AI Mode] Raw response (first 500 chars):", cleaned.slice(0, 500));
        throw new Error("Grok returned an invalid response that could not be parsed as JSON.");
      }
    } else {
      console.error("[AI Mode] No JSON found in Grok response");
      console.error("[AI Mode] Raw response (first 500 chars):", cleaned.slice(0, 500));
      throw new Error("Grok returned an invalid response with no JSON content.");
    }
  }

  // Validate structure
  if (typeof parsed.explanation !== "string" || !parsed.explanation) {
    console.error("[AI Mode] Grok response missing explanation field");
    throw new Error("Grok response missing required 'explanation' field.");
  }
  if (!Array.isArray(parsed.selectedGrades)) {
    parsed.selectedGrades = [];
  }

  console.log(`[AI Mode] Grok response parsed successfully. isRecommendation: ${parsed.isRecommendation}, selectedGrades: ${parsed.selectedGrades.length}`);

  return parsed;
}
