/**
 * AI Mode — server-side processing function.
 *
 * This is a PLAIN async function, NOT a TanStack createServerFn.
 * The API route calls this function directly.
 *
 * Architecture:
 *   User message → Grok (primary) or Gemini (fallback)
 *   → understands requirements, compares DB, selects grades, explains
 *   → Backend validates grade selections against the database
 *   → Response
 *
 * The AI performs the complete reasoning. The backend enforces the
 * database boundary: only grades that exist in the database are allowed.
 * Raw API errors are never exposed to the user.
 */

import { MATERIAL_DATA, type MaterialPropertyRecord } from "./ai-recommendation";
import {
  isGeminiConfigured,
  processWithGemini,
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

export interface AIRecommendResponse {
  success: boolean;
  message: string;
  isRecommendation: boolean;
  isGeneralQuestion: boolean;
  mentionedGradeUnavailable: string | null;
  selectedGrades: AIValidatedGrade[];
  error?: string;
  aiConfigured: boolean;
  provider: string | null;
}

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

/**
 * Validate AI grade selections against the database.
 * Any grade not in the database is filtered out and flagged.
 */
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
      console.warn(`[AI Mode] AI selected grade "${sel.grade}" which is NOT in the database — filtered out.`);
    }
  }

  return { valid, invalid };
}

/* ------------------------------------------------------------------ *
 * Clean error message — never expose raw API errors to the user
 * ------------------------------------------------------------------ */

const CLEAN_ERROR_MESSAGE =
  "I'm having trouble connecting to the AI service right now. Please try again in a moment.";

/* ------------------------------------------------------------------ *
 * Main processing function — called directly by the API route
 * ------------------------------------------------------------------ */

export async function processAIRecommendation(input: unknown): Promise<AIRecommendResponse> {
  console.log("[AI Mode] Request reached AI handler");

  let data: AIRecommendRequest;
  try {
    data = validateInput(input);
  } catch (err) {
    console.error("[AI Mode] Validation error:", err instanceof Error ? err.message : String(err));
    return {
      success: false,
      message: "Invalid request: " + (err instanceof Error ? err.message : "validation failed."),
      isRecommendation: false,
      isGeneralQuestion: false,
      mentionedGradeUnavailable: null,
      selectedGrades: [],
      aiConfigured: false,
      provider: null,
      error: "validation_error",
    };
  }

  const xaiConfigured = isXAIConfigured();
  const geminiConfigured = isGeminiConfigured();
  const aiConfigured = xaiConfigured || geminiConfigured;

  console.log(`[AI Mode] XAI_API_KEY detected: ${xaiConfigured}`);
  console.log(`[AI Mode] GEMINI_API_KEY detected: ${geminiConfigured}`);

  if (!aiConfigured) {
    return {
      success: false,
      message:
        "The AI service is not configured. Please contact the administrator to enable AI Mode.",
      isRecommendation: false,
      isGeneralQuestion: false,
      mentionedGradeUnavailable: null,
      selectedGrades: [],
      aiConfigured: false,
      provider: null,
      error: "ai_not_configured",
    };
  }

  // Convert conversation history to AI format (GeminiMessage is the shared internal format)
  const aiHistory: GeminiMessage[] = data.conversationHistory.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    content: m.content,
  }));

  let aiResult: GeminiAIResponse;
  let provider: string;

  // Try Grok first, fall back to Gemini
  if (xaiConfigured) {
    provider = "grok";
    try {
      console.log("[AI Mode] Attempting Grok (primary)...");
      aiResult = await processWithGrok(
        data.message,
        data.application,
        data.environment,
        data.costPreference,
        aiHistory,
      );
    } catch (grokErr) {
      console.error("[AI Mode] Grok failed:", grokErr instanceof Error ? grokErr.message : String(grokErr));

      if (geminiConfigured) {
        console.log("[AI Mode] Falling back to Gemini...");
        provider = "gemini";
        try {
          aiResult = await processWithGemini(
            data.message,
            data.application,
            data.environment,
            data.costPreference,
            aiHistory,
          );
        } catch (geminiErr) {
          console.error("[AI Mode] Gemini fallback also failed:", geminiErr instanceof Error ? geminiErr.message : String(geminiErr));
          return {
            success: false,
            message: CLEAN_ERROR_MESSAGE,
            isRecommendation: false,
            isGeneralQuestion: false,
            mentionedGradeUnavailable: null,
            selectedGrades: [],
            aiConfigured: true,
            provider: null,
            error: "all_providers_failed",
          };
        }
      } else {
        // Only Grok was configured and it failed — show clean error
        return {
          success: false,
          message: CLEAN_ERROR_MESSAGE,
          isRecommendation: false,
          isGeneralQuestion: false,
          mentionedGradeUnavailable: null,
          selectedGrades: [],
          aiConfigured: true,
          provider: null,
          error: "grok_failed",
        };
      }
    }
  } else {
    // Only Gemini configured
    provider = "gemini";
    try {
      console.log("[AI Mode] Using Gemini (no XAI key)...");
      aiResult = await processWithGemini(
        data.message,
        data.application,
        data.environment,
        data.costPreference,
        aiHistory,
      );
    } catch (geminiErr) {
      console.error("[AI Mode] Gemini failed:", geminiErr instanceof Error ? geminiErr.message : String(geminiErr));
      return {
        success: false,
        message: CLEAN_ERROR_MESSAGE,
        isRecommendation: false,
        isGeneralQuestion: false,
        mentionedGradeUnavailable: null,
        selectedGrades: [],
        aiConfigured: true,
        provider: null,
        error: "gemini_failed",
      };
    }
  }

  // Validate AI grade selections against the database
  const { valid: validatedGrades, invalid: invalidGrades } = validateGradeSelections(
    aiResult.selectedGrades ?? [],
  );

  if (invalidGrades.length > 0) {
    console.warn(`[AI Mode] ${invalidGrades.length} grade(s) from AI were not in the database and were removed.`);
  }

  // If AI said it's a recommendation but all grades were invalid, adjust the message
  let finalMessage = aiResult.explanation;
  if (
    aiResult.isRecommendation &&
    validatedGrades.length === 0 &&
    invalidGrades.length > 0 &&
    !aiResult.mentionedGradeUnavailable
  ) {
    finalMessage =
      "I was unable to find suitable grades in the current material database for your requirements. " +
      finalMessage;
  }

  return {
    success: true,
    message: finalMessage,
    isRecommendation: aiResult.isRecommendation,
    isGeneralQuestion: aiResult.isGeneralQuestion,
    mentionedGradeUnavailable: aiResult.mentionedGradeUnavailable,
    selectedGrades: validatedGrades,
    aiConfigured: true,
    provider,
  };
}
