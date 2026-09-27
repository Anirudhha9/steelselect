/**
 * AI Mode — server-side processing function.
 *
 * Architecture:
 *   User message → Grok (primary) → Gemini (fallback)
 *   → Backend validates grade selections against the database
 *   → Response
 *
 * Fallback rules:
 *   - Grok 400/401/403 (invalid key): STOP, report config error, do NOT call Gemini.
 *   - Grok 429 (rate limit): retry up to 2 times, then fall back to Gemini.
 *   - Grok 5xx: retry up to 2 times, then fall back to Gemini.
 *   - Gemini 429 (quota): STOP immediately, do NOT retry or try another model.
 *   - Gemini 5xx: retry up to 2 times, then return clean error.
 *
 * Raw API errors are never exposed to the user.
 */

import { MATERIAL_DATA, type MaterialPropertyRecord } from "./ai-recommendation";
import {
  isGeminiConfigured,
  processWithGemini,
  type AIProviderError,
  type GeminiAIResponse,
  type GeminiGradeSelection,
  type GeminiMessage,
} from "./gemini";
import { isXAIConfigured, processWithGrok } from "./xai";

/* ------------------------------------------------------------------ *
 * Request / Response types
 * ------------------------------------------------------------------ */

export interface AIRecommendRequest {
  application: string | null;
  environment: string | null;
  costPreference: string | null;
  message: string;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
}

export interface AIValidatedGrade {
  grade: string;
  reason: string;
  properties: MaterialPropertyRecord;
}

export type AIErrorCode =
  | "AI_SUCCESS"
  | "GROK_INVALID_KEY"
  | "GROK_TEMPORARY_ERROR"
  | "GEMINI_QUOTA_EXCEEDED"
  | "GEMINI_TEMPORARY_ERROR"
  | "AI_NOT_CONFIGURED"
  | "VALIDATION_ERROR"
  | "ALL_PROVIDERS_FAILED";

export interface AIRecommendResponse {
  success: boolean;
  message: string;
  isRecommendation: boolean;
  isGeneralQuestion: boolean;
  mentionedGradeUnavailable: string | null;
  selectedGrades: AIValidatedGrade[];
  error: AIErrorCode;
  aiConfigured: boolean;
  provider: string | null;
}

/* ------------------------------------------------------------------ *
 * Clean user-facing messages — never expose raw API errors
 * ------------------------------------------------------------------ */

const MSG_GROK_INVALID_KEY =
  "The AI service (Grok) is not properly configured. Please contact the administrator to update the API key.";

const MSG_GROK_TEMPORARY =
  "The AI service (Grok) is temporarily unavailable. Please try again in a moment.";

const MSG_GEMINI_QUOTA =
  "AI service quota is temporarily unavailable. Please try again later.";

const MSG_GEMINI_TEMPORARY =
  "The AI service is temporarily unavailable. Please try again in a moment.";

const MSG_ALL_FAILED =
  "The AI service is temporarily unavailable. Please try again later.";

const MSG_NOT_CONFIGURED =
  "The AI service is not configured. Please contact the administrator to enable AI Mode.";

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

function validateInput(input: unknown): AIRecommendRequest {
  const d = (input ?? {}) as Record<string, unknown>;
  const message = typeof d["message"] === "string" ? d["message"].trim() : "";
  if (!message) {
    throw new Error("Message is required.");
  }
  if (message.length > 2000) {
    throw new Error("Message is too long (max 2000 characters).");
  }

  const history = Array.isArray(d["conversationHistory"])
    ? (d["conversationHistory"] as { role: string; content: string }[])
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
    : [];

  const trimmedHistory = history.slice(-10);

  return {
    application: typeof d["application"] === "string" ? d["application"] : null,
    environment: typeof d["environment"] === "string" ? d["environment"] : null,
    costPreference: typeof d["costPreference"] === "string" ? d["costPreference"] : null,
    message,
    conversationHistory: trimmedHistory,
  };
}

/* ------------------------------------------------------------------ *
 * Database boundary enforcement
 * ------------------------------------------------------------------ */

function findGradeInDatabase(gradeName: string): MaterialPropertyRecord | null {
  const q = gradeName.toLowerCase().trim();
  return (
    MATERIAL_DATA.find((g) => g.grade.toLowerCase() === q) ??
    MATERIAL_DATA.find((g) => g.grade.toLowerCase().includes(q)) ??
    MATERIAL_DATA.find((g) => g.name.toLowerCase().includes(q)) ??
    null
  );
}

function validateGradeSelections(
  selections: GeminiGradeSelection[],
): { valid: AIValidatedGrade[]; invalid: string[] } {
  const valid: AIValidatedGrade[] = [];
  const invalid: string[] = [];

  for (const sel of selections) {
    const dbGrade = findGradeInDatabase(sel.grade);
    if (dbGrade) {
      valid.push({
        grade: dbGrade.grade,
        reason: sel.reason,
        properties: dbGrade,
      });
    } else {
      invalid.push(sel.grade);
      console.warn(`[AI Mode] AI selected grade "${sel.grade}" NOT in database — filtered.`);
    }
  }

  return { valid, invalid };
}

/* ------------------------------------------------------------------ *
 * Error response helpers
 * ------------------------------------------------------------------ */

function errorResponse(
  message: string,
  error: AIErrorCode,
  aiConfigured: boolean,
): AIRecommendResponse {
  return {
    success: false,
    message,
    isRecommendation: false,
    isGeneralQuestion: false,
    mentionedGradeUnavailable: null,
    selectedGrades: [],
    error,
    aiConfigured,
    provider: null,
  };
}

function successResponse(
  result: GeminiAIResponse,
  validatedGrades: AIValidatedGrade[],
  invalidCount: number,
  provider: string,
): AIRecommendResponse {
  let finalMessage = result.explanation;
  if (
    result.isRecommendation &&
    validatedGrades.length === 0 &&
    invalidCount > 0 &&
    !result.mentionedGradeUnavailable
  ) {
    finalMessage =
      "I was unable to find suitable grades in the current material database for your requirements. " +
      finalMessage;
  }

  return {
    success: true,
    message: finalMessage,
    isRecommendation: result.isRecommendation,
    isGeneralQuestion: result.isGeneralQuestion,
    mentionedGradeUnavailable: result.mentionedGradeUnavailable,
    selectedGrades: validatedGrades,
    error: "AI_SUCCESS",
    aiConfigured: true,
    provider,
  };
}

/* ------------------------------------------------------------------ *
 * Main processing function
 * ------------------------------------------------------------------ */

export async function processAIRecommendation(input: unknown): Promise<AIRecommendResponse> {
  console.log("[AI Mode] Request reached AI handler");

  // 1. Validate input
  let data: AIRecommendRequest;
  try {
    data = validateInput(input);
  } catch (err) {
    console.error("[AI Mode] Validation error:", err instanceof Error ? err.message : String(err));
    return errorResponse(
      "Invalid request: " + (err instanceof Error ? err.message : "validation failed."),
      "VALIDATION_ERROR",
      false,
    );
  }

  // 2. Check configuration
  const xaiConfigured = isXAIConfigured();
  const geminiConfigured = isGeminiConfigured();

  console.log(`[AI Mode] XAI_API_KEY detected: ${xaiConfigured}`);
  console.log(`[AI Mode] GEMINI_API_KEY detected: ${geminiConfigured}`);

  if (!xaiConfigured && !geminiConfigured) {
    return errorResponse(MSG_NOT_CONFIGURED, "AI_NOT_CONFIGURED", false);
  }

  // 3. Convert conversation history to shared AI format
  const aiHistory: GeminiMessage[] = data.conversationHistory.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    content: m.content,
  }));

  // 4. Try Grok (primary) if configured
  if (xaiConfigured) {
    console.log("[AI Mode] Attempting Grok (primary)...");
    try {
      const result = await processWithGrok(
        data.message,
        data.application,
        data.environment,
        data.costPreference,
        aiHistory,
      );

      const { valid, invalid } = validateGradeSelections(result.selectedGrades ?? []);
      if (invalid.length > 0) {
        console.warn(`[AI Mode] ${invalid.length} grade(s) from Grok not in database — removed.`);
      }
      return successResponse(result, valid, invalid.length, "grok");
    } catch (grokErr) {
      const providerErr = grokErr as AIProviderError;
      const code = providerErr.code;
      const status = providerErr.status;
      console.error(`[AI Mode] Grok failed: code=${code}, status=${status}, msg=${providerErr.message}`);

      // Grok invalid key (400/401/403) — STOP, do NOT fall back to Gemini
      if (code === "GROK_INVALID_KEY" || status === 400 || status === 401 || status === 403) {
        console.error("[AI Mode] Grok invalid key — stopping, no Gemini fallback");
        return errorResponse(MSG_GROK_INVALID_KEY, "GROK_INVALID_KEY", true);
      }

      // Grok temporary error (429/5xx after retries exhausted) — try Gemini if available
      console.log("[AI Mode] Grok temporary error — checking Gemini fallback...");
      // Falls through to Gemini below
    }
  } else {
    console.log("[AI Mode] XAI not configured — using Gemini directly");
  }

  // 5. Try Gemini (fallback or only provider)
  if (!geminiConfigured) {
    // Grok failed temporarily and Gemini is not configured
    if (xaiConfigured) {
      return errorResponse(MSG_GROK_TEMPORARY, "GROK_TEMPORARY_ERROR", true);
    }
    return errorResponse(MSG_NOT_CONFIGURED, "AI_NOT_CONFIGURED", false);
  }

  console.log("[AI Mode] Attempting Gemini...");
  try {
    const result = await processWithGemini(
      data.message,
      data.application,
      data.environment,
      data.costPreference,
      aiHistory,
    );

    const { valid, invalid } = validateGradeSelections(result.selectedGrades ?? []);
    if (invalid.length > 0) {
      console.warn(`[AI Mode] ${invalid.length} grade(s) from Gemini not in database — removed.`);
    }
    return successResponse(result, valid, invalid.length, "gemini");
  } catch (geminiErr) {
    const providerErr = geminiErr as AIProviderError;
    const code = providerErr.code;
    const status = providerErr.status;
    console.error(`[AI Mode] Gemini failed: code=${code}, status=${status}, msg=${providerErr.message}`);

    // Gemini 429 = quota exhausted — STOP immediately
    if (status === 429 || code === "GEMINI_QUOTA_EXCEEDED") {
      console.error("[AI Mode] Gemini quota exceeded — stopping immediately");
      return errorResponse(MSG_GEMINI_QUOTA, "GEMINI_QUOTA_EXCEEDED", true);
    }

    // Gemini temporary error (5xx after retries)
    if (xaiConfigured) {
      // Both providers failed
      return errorResponse(MSG_ALL_FAILED, "ALL_PROVIDERS_FAILED", true);
    }
    return errorResponse(MSG_GEMINI_TEMPORARY, "GEMINI_TEMPORARY_ERROR", true);
  }
}
