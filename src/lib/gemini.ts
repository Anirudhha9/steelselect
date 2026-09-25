/**
 * Gemini API integration — server-side only.
 *
 * Two responsibilities:
 * 1. extractRequirements: natural language → structured AIRequirements JSON
 * 2. explainRecommendations: candidates + requirements → natural-language explanation
 *
 * Also supports general conversational follow-ups grounded in database data.
 *
 * GEMINI_API_KEY is read from the environment and NEVER exposed to the client.
 */

import type { AIRequirements, AIGradeCandidate, AIRecommendationResult, MaterialPropertyRecord } from "./ai-recommendation";
import { MATERIAL_DATA, findGradeByName, getAllGradeNames } from "./ai-recommendation";

/* ------------------------------------------------------------------ *
 * Config
 * ------------------------------------------------------------------ */

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function getApiKey(): string | null {
  // Works in TanStack Start / Nitro server environment
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

export interface ExtractionResult {
  requirements: AIRequirements;
  isGeneralQuestion: boolean;
  mentionedGrade?: string;
}

export interface ExplanationResult {
  text: string;
}

/* ------------------------------------------------------------------ *
 * Low-level Gemini call
 * ------------------------------------------------------------------ */

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
}

async function callGemini(
  systemPrompt: string,
  userMessage: string,
  conversationHistory: GeminiMessage[] = [],
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Please set it in the environment variables.");
  }

  const contents: GeminiMessage[] = [];

  // Add conversation history
  for (const msg of conversationHistory) {
    contents.push(msg);
  }

  // Add current user message
  contents.push({ role: "user", content: userMessage });

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.4,
      topP: 0.9,
      maxOutputTokens: 2048,
    },
  };

  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Gemini API error (${resp.status}): ${errText.slice(0, 500)}`);
  }

  const data = (await resp.json()) as GeminiResponse;

  if (data.error) {
    throw new Error(`Gemini API error: ${data.error.message ?? "Unknown"}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}

/* ------------------------------------------------------------------ *
 * 1. Requirement extraction
 * ------------------------------------------------------------------ */

const EXTRACTION_SYSTEM_PROMPT = `You are a materials engineering assistant. Your job is to extract structured material requirements from a user's natural-language description about stainless steel selection.

You must return ONLY a valid JSON object with no markdown formatting, no code blocks, no explanation. The JSON must conform to this TypeScript interface:

interface AIRequirements {
  applicationContext?: string;       // what the user is building (e.g. "outdoor railing", "heat exchanger")
  environment?: string;             // service environment (e.g. "marine/coastal", "indoor", "high temperature")
  minimumUTS?: number;              // minimum ultimate tensile strength in MPa
  minimumYieldStrength?: number;    // minimum yield strength in MPa
  hardness?: number;                 // target Brinell hardness (HB)
  operatingTemperature?: number;    // operating/service temperature in Celsius
  corrosionRequirement?: string;    // "low" | "medium" | "high" | "very-high"
  formabilityRequirement?: string;  // "low" | "medium" | "high" | "very-high"
  weldabilityRequirement?: string;  // "low" | "medium" | "high" | "very-high"
  toughnessRequirement?: string;    // "low" | "medium" | "high" | "very-high"
  costPreference?: string;           // "budget" | "balanced" | "premium"
  compositionRequirements?: {
    minChromium?: number;
    maxChromium?: number;
    minMolybdenum?: number;
    maxMolybdenum?: number;
    minNitrogen?: number;
    maxNitrogen?: number;
  };
  otherRequirements?: string;        // any requirement not captured above
}

Rules:
- Only populate fields that are explicitly or implicitly stated in the user's message.
- If the user says "near the sea" or "marine", set corrosionRequirement to "high" or "very-high".
- If the user says "high temperature" or gives a temperature, set operatingTemperature.
- If the user says "strong" or "high strength", set minimumUTS to a reasonable value (e.g. 500-700 MPa).
- If the user says "not too expensive" or "budget", set costPreference to "budget".
- If the user says "premium" or "cost is not an issue", set costPreference to "premium".
- If the user says "easy to weld", set weldabilityRequirement to "high".
- If the user says "easy to form" or "deep drawing", set formabilityRequirement to "high".
- If the user says "tough" or "impact resistant", set toughnessRequirement to "high".
- If the user mentions a specific hardness number, set hardness to that value.
- If the user mentions a specific UTS number, set minimumUTS to that value.
- Do NOT invent numbers unless the user gives a clear quantitative hint.
- Return ONLY the JSON object, nothing else.

Additionally, if the user is asking a general question (not a material selection request), include an additional field "isGeneralQuestion": true at the top level of the JSON alongside the requirements. If the user mentions a specific grade name (like "304", "316L", "410"), include "mentionedGrade": "<grade name>" at the top level.

The response must be valid JSON parseable by JSON.parse(). Do not wrap it in markdown code fences.`;

interface ExtractionResponse {
  requirements: AIRequirements;
  isGeneralQuestion?: boolean;
  mentionedGrade?: string;
}

export async function extractRequirements(
  userMessage: string,
  applicationContext?: string,
  environment?: string,
  costPreference?: string,
  conversationHistory: GeminiMessage[] = [],
): Promise<ExtractionResult> {
  // Pre-fill context from UI dropdowns
  const contextPrefix = [
    applicationContext ? `Application context from UI: ${applicationContext}` : null,
    environment ? `Environment from UI: ${environment}` : null,
    costPreference ? `Cost preference from UI: ${costPreference}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const fullMessage = contextPrefix
    ? `${contextPrefix}\n\nUser message: ${userMessage}`
    : userMessage;

  const raw = await callGemini(EXTRACTION_SYSTEM_PROMPT, fullMessage, conversationHistory);

  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }

  let parsed: ExtractionResponse;
  try {
    parsed = JSON.parse(cleaned) as ExtractionResponse;
  } catch {
    // Try to extract JSON from the text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]) as ExtractionResponse;
    } else {
      throw new Error("Gemini returned invalid JSON for requirement extraction.");
    }
  }

  // Merge UI context into requirements if not already set
  const req: AIRequirements = { ...parsed.requirements };
  if (!req.applicationContext && applicationContext) req.applicationContext = applicationContext;
  if (!req.environment && environment) req.environment = environment;
  if (!req.costPreference && costPreference) req.costPreference = costPreference;

  return {
    requirements: req,
    isGeneralQuestion: parsed.isGeneralQuestion ?? false,
    mentionedGrade: parsed.mentionedGrade,
  };
}

/* ------------------------------------------------------------------ *
 * 2. Recommendation explanation
 * ------------------------------------------------------------------ */

function formatCandidate(c: AIGradeCandidate): string {
  return [
    `Grade: ${c.grade}`,
    `  Name: ${c.name}`,
    `  Type: ${c.type}`,
    `  Standard: ${c.standard}`,
    `  UTS: ${c.uts} MPa`,
    `  Yield Strength: ${c.yieldStrength} MPa`,
    `  Hardness: ${c.hardness} HB`,
    `  Elongation: ${c.elongation}%`,
    `  Chromium: ${c.chromium}%`,
    `  Molybdenum: ${c.molybdenum}%`,
    `  Nitrogen: ${c.nitrogen}%`,
    `  PREN: ${c.pren} (${c.prenIndex})`,
    `  Service Temperature: ${c.minServiceTemp}°C to ${c.maxServiceTemp}°C`,
    `  Weldability: ${c.weldability}/100`,
    `  Formability: ${c.formability}/100`,
    `  Cost Score: ${c.cost}/100 (higher = more affordable)`,
    `  Treatment: ${c.treatment}`,
    `  Description: ${c.description || "N/A"}`,
    `  Match Score: ${c.score}/100`,
  ].join("\n");
}

const EXPLANATION_SYSTEM_PROMPT = `You are a materials engineering assistant explaining stainless steel grade recommendations to a non-technical user.

CRITICAL RULES:
1. You may ONLY discuss material properties that are explicitly provided in the candidate data below.
2. You must NEVER invent, estimate, or hallucinate any material property value.
3. If a property is missing or "N/A", say it is unavailable — do not guess.
4. Every numerical value you mention must come directly from the provided candidate data.
5. You must ONLY recommend grades from the provided candidate list. Never suggest a grade that is not in the list.
6. If the candidate list is empty, explain that no grade in the database satisfies the stated requirements.
7. Use simple, non-technical language. Explain technical terms when first used.
8. Structure your response clearly with the recommended grade(s) first, then why each fits, then trade-offs.
9. If there are requirements that could not be evaluated, mention them.
10. Keep the response concise but informative. Use bullet points for readability.
11. Do NOT use markdown headers (#). Use plain text formatting.`;

export async function explainRecommendations(
  userMessage: string,
  requirements: AIRequirements,
  result: AIRecommendationResult,
  conversationHistory: GeminiMessage[] = [],
): Promise<string> {
  const candidateData = result.candidates.length > 0
    ? result.candidates.map(formatCandidate).join("\n\n")
    : "No candidates found.";

  const hardReqs = result.hardRequirementsApplied.length > 0
    ? result.hardRequirementsApplied.join("\n  - ")
    : "None";

  const softPrefs = result.softPreferencesApplied.length > 0
    ? result.softPreferencesApplied.join("\n  - ")
    : "None";

  const unevaluated = result.unevaluatedRequirements.length > 0
    ? result.unevaluatedRequirements.join("\n  - ")
    : "None";

  const closest = result.closestGrades && result.closestGrades.length > 0
    ? result.closestGrades
        .map((c) => `  ${c.grade} (${c.type}) — failed: ${c.failedHardRequirements.join(", ")}`)
        .join("\n")
    : "";

  const userPrompt = `User's original request: "${userMessage}"

Extracted requirements:
  Hard requirements:
  - ${hardReqs}
  Soft preferences:
  - ${softPrefs}
  Unevaluated requirements:
  - ${unevaluated}

${result.noMatchReason ? `NO MATCH: ${result.noMatchReason}` : ""}

${closest ? `Closest grades that failed the fewest hard requirements:\n${closest}` : ""}

Candidate grades from the database (ranked by match score):
${candidateData}

Please explain these recommendations to the user in clear, simple language. Include:
1. The recommended grade(s) and their key properties (using ONLY the values above)
2. Why each grade fits the user's requirements
3. Important trade-offs between the top candidates
4. Any requirements that could not be evaluated
5. A brief note if the recommendation is based on incomplete information`;

  return await callGemini(EXPLANATION_SYSTEM_PROMPT, userPrompt, conversationHistory);
}

/* ------------------------------------------------------------------ *
 * 3. Conversational follow-up (grounded in database data)
 * ------------------------------------------------------------------ */

const CONVERSATION_SYSTEM_PROMPT = `You are a helpful materials engineering assistant for stainless steel selection. You answer follow-up questions about stainless steel grades.

CRITICAL RULES:
1. When discussing specific steel grades, you may ONLY use material properties from the database data provided below.
2. Never invent or estimate material properties. If a property is not in the data, say it is unavailable.
3. If the user asks about a grade not in the database, clearly state it is not available in the current material database.
4. You can explain general engineering concepts (like what PREN means, what UTS is, etc.) using your general knowledge.
5. When comparing grades or discussing their properties, always use the actual database values.
6. Keep responses concise and use simple language suitable for non-engineers.
7. Do NOT use markdown headers (#). Use plain text formatting.

Available grades in the database:
${getAllGradeNames().join(", ")}`;

function formatGradeForContext(g: MaterialPropertyRecord): string {
  return `${g.grade}: UTS=${g.uts} MPa, YS=${g.yieldStrength} MPa, Hardness=${g.hardness} HB, PREN=${g.pren} (${g.prenIndex}), Weldability=${g.weldability}/100, Formability=${g.formability}/100, Cost=${g.cost}/100, Temp=${g.minServiceTemp}°C to ${g.maxServiceTemp}°C, Type=${g.type}, Standard=${g.standard}`;
}

export async function conversationalFollowUp(
  userMessage: string,
  conversationHistory: GeminiMessage[] = [],
): Promise<string> {
  // Check if the user is asking about a specific grade
  const mentionedGrade = findGradeByName(userMessage);

  // Build context: include the mentioned grade's full data, plus a compact list of all grades
  let gradeContext: string;
  if (mentionedGrade) {
    gradeContext = `The user seems to be asking about ${mentionedGrade.grade}. Here is its full data:\n${formatGradeForContext(mentionedGrade)}\n\nAll other grades in the database (compact):\n${MATERIAL_DATA.filter((g) => g.grade !== mentionedGrade.grade).map((g) => `${g.grade}: UTS=${g.uts}, PREN=${g.pren}, Cost=${g.cost}`).join(", ")}`;
  } else {
    gradeContext = `All grades in the database (compact):\n${MATERIAL_DATA.map((g) => formatGradeForContext(g)).join("\n")}`;
  }

  const systemPrompt = `${CONVERSATION_SYSTEM_PROMPT}\n\n${gradeContext}`;

  return await callGemini(systemPrompt, userMessage, conversationHistory);
}

/* ------------------------------------------------------------------ *
 * Error wrapper
 * ------------------------------------------------------------------ */

export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiError";
  }
}
