/**
 * Gemini API integration — server-side only.
 *
 * Gemini is the FALLBACK AI provider for AI Mode (Grok is primary).
 *
 * GEMINI_API_KEY is read from the environment and NEVER exposed to the client.
 */

import { MATERIAL_DATA, getAllGradeNames } from "./ai-recommendation";

/* ------------------------------------------------------------------ *
 * Config
 * ------------------------------------------------------------------ */

const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Only 503/502/500 are retried. 429 is quota exhaustion — stop immediately. */
const RETRYABLE_STATUS = new Set([500, 502, 503]);
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1000, 2000];

function getApiKey(): string | null {
  const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  return env.GEMINI_API_KEY ?? env.gemini_api_key ?? null;
}

export function isGeminiConfigured(): boolean {
  return getApiKey() != null;
}

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export interface GeminiMessage {
  role: "user" | "model";
  content: string;
}

export interface GeminiGradeSelection {
  grade: string;
  reason: string;
}

export interface GeminiAIResponse {
  isRecommendation: boolean;
  isGeneralQuestion: boolean;
  mentionedGradeUnavailable: string | null;
  selectedGrades: GeminiGradeSelection[];
  explanation: string;
}

/* ------------------------------------------------------------------ *
 * Gemini REST API types
 * ------------------------------------------------------------------ */

interface GeminiRestContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

interface GeminiRestResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  error?: { message?: string; code?: number; status?: string };
}

/* ------------------------------------------------------------------ *
 * Error with HTTP status attached
 * ------------------------------------------------------------------ */

export interface AIProviderError extends Error {
  status?: number;
  code?: string;
}

function makeError(message: string, status?: number, code?: string): AIProviderError {
  const err = new Error(message) as AIProviderError;
  err.status = status;
  err.code = code;
  return err;
}

/* ------------------------------------------------------------------ *
 * Low-level Gemini call (single attempt)
 * ------------------------------------------------------------------ */

async function callGeminiOnce(
  systemPrompt: string,
  userMessage: string,
  conversationHistory: GeminiMessage[],
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw makeError("GEMINI_API_KEY is not configured.", undefined, "GEMINI_NOT_CONFIGURED");
  }

  const contents: GeminiRestContent[] = [];

  for (const msg of conversationHistory) {
    contents.push({
      role: msg.role,
      parts: [{ text: msg.content }],
    });
  }

  contents.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      temperature: 0.4,
      topP: 0.9,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  };

  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    throw makeError(
      `Network error reaching Gemini API: ${fetchErr instanceof Error ? fetchErr.message : "unknown"}`,
      0,
      "GEMINI_NETWORK_ERROR",
    );
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    const code = resp.status === 429 ? "GEMINI_QUOTA_EXCEEDED" : "GEMINI_TEMPORARY_ERROR";
    throw makeError(`Gemini API returned HTTP ${resp.status}: ${errText.slice(0, 200)}`, resp.status, code);
  }

  const data = (await resp.json()) as GeminiRestResponse;

  if (data.error) {
    throw makeError(
      `Gemini API error: ${data.error.message ?? "Unknown"}`,
      undefined,
      "GEMINI_TEMPORARY_ERROR",
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const finishReason = data.candidates?.[0]?.finishReason;

  if (!text) {
    throw makeError(
      `Gemini returned an empty response (finishReason: ${finishReason ?? "unknown"})`,
      undefined,
      "GEMINI_PARSE_ERROR",
    );
  }

  return text;
}

/* ------------------------------------------------------------------ *
 * Gemini call with retry — 503/502/500 only, max 2 retries, 429 stops
 * ------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiWithRetry(
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
        console.log(`[AI Mode] Gemini retry ${attempt}/${MAX_RETRIES} in ${delay}ms...`);
        await sleep(delay);
      }

      console.log(`[AI Mode] Gemini request attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
      const text = await callGeminiOnce(systemPrompt, userMessage, conversationHistory);
      console.log(`[AI Mode] Gemini response received (${text.length} chars)`);
      return text;
    } catch (err) {
      lastError = err instanceof Error ? (err as AIProviderError) : makeError(String(err));
      const status = lastError.status;

      // 429 = quota exhausted — STOP immediately, no retry, no fallback model
      if (status === 429) {
        console.error(`[AI Mode] Gemini HTTP 429 (quota exceeded) — stopping immediately`);
        throw lastError;
      }

      // Non-retryable error — stop immediately
      const retryable = status != null && RETRYABLE_STATUS.has(status);
      if (!retryable) {
        console.error(`[AI Mode] Gemini non-retryable error (HTTP ${status}): ${lastError.message}`);
        throw lastError;
      }

      // Retryable (500/502/503) — retry if we haven't exhausted
      if (attempt < MAX_RETRIES) {
        console.warn(`[AI Mode] Gemini HTTP ${status} — will retry`);
        continue;
      }

      console.error(`[AI Mode] Gemini exhausted ${MAX_RETRIES} retries (HTTP ${status})`);
      throw lastError;
    }
  }

  throw lastError ?? makeError("Gemini API failed after all retries.");
}

/* ------------------------------------------------------------------ *
 * Database material data formatting (compact — only essential properties)
 * ------------------------------------------------------------------ */

function formatMaterialRecord(g: (typeof MATERIAL_DATA)[number]): string {
  return [
    `{"grade":"${g.grade}","type":"${g.type}","standard":"${g.standard}",`,
    `"uts":${g.uts},"ys":${g.yieldStrength},"hardness":${g.hardness},"elongation":${g.elongation},`,
    `"cr":${g.chromium},"mo":${g.molybdenum},"n":${g.nitrogen},"pren":${g.pren},`,
    `"minTemp":${g.minServiceTemp},"maxTemp":${g.maxServiceTemp},`,
    `"weldability":${g.weldability},"formability":${g.formability},"cost":${g.cost}}`,
  ].join("");
}

function buildMaterialDatabaseContext(): string {
  return MATERIAL_DATA.map(formatMaterialRecord).join(",");
}

/* ------------------------------------------------------------------ *
 * System prompt — compact, only essential properties
 * ------------------------------------------------------------------ */

export function buildSystemPrompt(): string {
  const dbJson = buildMaterialDatabaseContext();
  const gradeNames = getAllGradeNames().join(", ");

  return `You are an expert materials engineering assistant for stainless steel selection. You help non-technical users find the right stainless steel grade.

You have a CLOSED DATABASE of stainless steel grades. This is the ONLY set of grades you can recommend.

DATABASE (JSON array):
[${dbJson}

]

GRADES: ${gradeNames}

Field meanings:
- uts: Ultimate Tensile Strength (MPa)
- ys: Yield Strength (MPa)
- hardness: Brinell Hardness (HB)
- elongation: Elongation % (higher = more ductile/tough)
- cr: Chromium %, mo: Molybdenum %, n: Nitrogen %
- pren: Pitting Resistance Equivalent Number (higher = better corrosion resistance)
- minTemp/maxTemp: Service temperature range (°C)
- weldability/formability: 0-100 (higher = better)
- cost: 0-100 (higher = more affordable)

TASK:
1. Understand the user's requirements from their message and any application/environment/cost context.
2. Compare against the database properties.
3. Select 1-5 most suitable grades. ONLY from the database above.
4. Explain why each fits, using ONLY actual database values.

RULES:
- ONLY recommend grades in the database. NEVER invent grades or properties.
- NEVER estimate or hallucinate any value. Every number must come from the database.
- If a grade the user asks about is not in the database, set "mentionedGradeUnavailable" and explain.
- If no grade meets the requirements, say so clearly.
- Use simple language. Explain technical terms when first used.

Respond with ONLY a valid JSON object (no markdown):
{
  "isRecommendation": true/false,
  "isGeneralQuestion": true/false,
  "mentionedGradeUnavailable": null,
  "selectedGrades": [{"grade":"exact grade name","reason":"why it fits"}],
  "explanation": "Your full response to the user with properties, reasoning, and trade-offs."
}`;
}

/* ------------------------------------------------------------------ *
 * Main entry — single Gemini call
 * ------------------------------------------------------------------ */

export async function processWithGemini(
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

  console.log("[AI Mode] Gemini system prompt built");
  console.log(`[AI Mode] History: ${conversationHistory.length} messages`);

  const raw = await callGeminiWithRetry(buildSystemPrompt(), fullMessage, conversationHistory);

  return parseAIJsonResponse(raw, "Gemini");
}

/* ------------------------------------------------------------------ *
 * JSON parsing (shared with xai.ts)
 * ------------------------------------------------------------------ */

export function parseAIJsonResponse(raw: string, provider: string): GeminiAIResponse {
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
        console.error(`[AI Mode] ${provider} JSON parse failed:`, parseErr instanceof Error ? parseErr.message : String(parseErr));
        console.error(`[AI Mode] Raw (first 300):`, cleaned.slice(0, 300));
        throw makeError(`${provider} returned invalid JSON.`, undefined, "PARSE_ERROR");
      }
    } else {
      console.error(`[AI Mode] ${provider} no JSON found in response`);
      throw makeError(`${provider} returned no JSON.`, undefined, "PARSE_ERROR");
    }
  }

  if (typeof parsed.explanation !== "string" || !parsed.explanation) {
    throw makeError(`${provider} response missing explanation.`, undefined, "PARSE_ERROR");
  }
  if (!Array.isArray(parsed.selectedGrades)) {
    parsed.selectedGrades = [];
  }

  console.log(`[AI Mode] ${provider} parsed: isRecommendation=${parsed.isRecommendation}, grades=${parsed.selectedGrades.length}`);
  return parsed;
}
