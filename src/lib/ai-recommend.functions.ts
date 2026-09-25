/**
 * AI Mode server function — orchestrates the full AI pipeline:
 *
 *   User message → Gemini (extract requirements) → AI recommendation engine
 *   → Gemini (explain recommendations) → final response
 *
 * Also handles conversational follow-ups and general questions.
 *
 * This is completely separate from Engineering Mode's recommend.functions.ts.
 */

import { createServerFn } from "@tanstack/react-start";

import { aiRecommend, type AIRequirements, type AIRecommendationResult } from "./ai-recommendation";
import {
  conversationalFollowUp,
  explainRecommendations,
  extractRequirements,
  isGeminiConfigured,
  type GeminiMessage,
} from "./gemini";

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

export interface AIRecommendResponse {
  success: boolean;
  message: string;
  requirements?: AIRequirements;
  recommendations?: AIRecommendationResult;
  error?: string;
  geminiConfigured: boolean;
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

function validate(input: unknown): AIRecommendRequest {
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

  // Keep last 10 messages to stay within token limits
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
 * Server function
 * ------------------------------------------------------------------ */

export const aiRecommendGrades = createServerFn({ method: "POST" })
  .inputValidator(validate)
  .handler(async ({ data }): Promise<AIRecommendResponse> => {
    const geminiConfigured = isGeminiConfigured();

    if (!geminiConfigured) {
      return {
        success: false,
        message:
          "The AI service is not configured. Please set the GEMINI_API_KEY environment variable to enable AI Mode.",
        geminiConfigured: false,
        error: "GEMINI_API_KEY not set",
      };
    }

    // Convert conversation history to Gemini format
    const geminiHistory: GeminiMessage[] = data.conversationHistory.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      content: m.content,
    }));

    try {
      // Step 1: Extract structured requirements from the user's message
      const extraction = await extractRequirements(
        data.message,
        data.application ?? undefined,
        data.environment ?? undefined,
        data.costPreference ?? undefined,
        geminiHistory,
      );

      // If it's a general question (not a material selection request), handle conversationally
      if (extraction.isGeneralQuestion && extraction.requirements.minimumUTS == null && extraction.requirements.operatingTemperature == null && extraction.requirements.corrosionRequirement == null && !extraction.mentionedGrade) {
        const response = await conversationalFollowUp(data.message, geminiHistory);
        return {
          success: true,
          message: response,
          requirements: extraction.requirements,
          geminiConfigured: true,
        };
      }

      // If the user mentioned a specific grade, handle conversationally with that grade's data
      if (extraction.mentionedGrade && extraction.requirements.minimumUTS == null && extraction.requirements.operatingTemperature == null) {
        const response = await conversationalFollowUp(data.message, geminiHistory);
        return {
          success: true,
          message: response,
          requirements: extraction.requirements,
          geminiConfigured: true,
        };
      }

      // Step 2: Run the AI recommendation engine over the database
      const result = aiRecommend(extraction.requirements);

      // Step 3: Generate the natural-language explanation via Gemini
      const explanation = await explainRecommendations(
        data.message,
        extraction.requirements,
        result,
        geminiHistory,
      );

      return {
        success: true,
        message: explanation,
        requirements: extraction.requirements,
        recommendations: result,
        geminiConfigured: true,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "An unexpected error occurred.";
      console.error("AI Mode error:", errorMsg);
      return {
        success: false,
        message: `I encountered an error while processing your request: ${errorMsg}. Please try rephrasing your question.`,
        geminiConfigured: true,
        error: errorMsg,
      };
    }
  });
