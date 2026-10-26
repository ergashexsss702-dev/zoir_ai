import { GoogleGenAI } from "@google/genai";

export interface ChatMessage {
  role: "user" | "assistant" | "model" | "system";
  content: string;
}

export interface GenerateOptions {
  message: string;
  history?: ChatMessage[];
  systemInstruction?: string;
}

export interface GenerateResult {
  text: string;
  model: string;
  durationMs: number;
}

export class AiServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 500, code = "AI_SERVICE_ERROR") {
    super(message);
    this.name = "AiServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Diagnostic helper that securely checks key configuration without leaking secrets.
 */
export function getDiagnosticStatus() {
  const key = process.env.GEMINI_API_KEY;
  return {
    hasKey: Boolean(key && key.trim().length > 0),
    keyPrefix: key && key.length > 6 ? `${key.substring(0, 4)}...` : undefined,
    defaultModel: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    nodeEnv: process.env.NODE_ENV || "development",
  };
}

/**
 * Generates an AI response for ZOIR AI using Google GenAI SDK.
 */
export async function generateZoirResponse(options: GenerateOptions): Promise<GenerateResult> {
  const startTime = Date.now();
  const { message, history = [], systemInstruction } = options;

  // 1. Validate Input
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    throw new AiServiceError("Message cannot be empty.", 400, "INVALID_INPUT");
  }

  // 2. Validate API Key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.error("[ZOIR AI Service] Error: GEMINI_API_KEY is not defined in environment.");
    throw new AiServiceError(
      "GEMINI_API_KEY environment variable is not configured. On Vercel, please add GEMINI_API_KEY in Project Settings > Environment Variables, then redeploy.",
      500,
      "MISSING_API_KEY"
    );
  }

  // 3. Initialize GoogleGenAI SDK with AI Studio telemetry header
  const ai = new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
      timeout: 25000, // 25s timeout to stay within Vercel execution bounds
    },
  });

  // 4. Format chat history into contents array compliant with @google/genai
  const formattedContents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  if (Array.isArray(history) && history.length > 0) {
    for (const msg of history) {
      if (!msg.content || typeof msg.content !== "string") continue;
      const text = msg.content.trim();
      if (!text) continue;

      const role: "user" | "model" = msg.role === "assistant" || msg.role === "model" ? "model" : "user";
      formattedContents.push({
        role,
        parts: [{ text }],
      });
    }
  }

  // Ensure user message is appended
  formattedContents.push({
    role: "user",
    parts: [{ text: message.trim() }],
  });

  const modelToUse = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  const defaultSystemInstruction =
    systemInstruction ||
    "You are ZOIR AI, a highly capable, articulate, and modern AI assistant. " +
    "Provide clear, accurate, and insightful responses. " +
    "Format code snippets using clean markdown with language specifiers. " +
    "Be helpful, direct, and thoughtful.";

  // 5. Query Gemini API with resilience
  try {
    const response = await ai.models.generateContent({
      model: modelToUse,
      contents: formattedContents,
      config: {
        systemInstruction: defaultSystemInstruction,
      },
    });

    const outputText = response.text;
    if (!outputText || typeof outputText !== "string") {
      throw new AiServiceError("Received empty response from AI model.", 502, "EMPTY_MODEL_RESPONSE");
    }

    const durationMs = Date.now() - startTime;
    return {
      text: outputText,
      model: modelToUse,
      durationMs,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[ZOIR AI Service] Gemini API call failed (${durationMs}ms):`, {
      name: error?.name,
      message: error?.message,
      status: error?.status || error?.statusCode,
      model: modelToUse,
    });

    // Check for specific Gemini API error statuses
    const status = error?.status || error?.statusCode;
    if (status === 403 || error?.message?.includes("PERMISSION_DENIED")) {
      throw new AiServiceError(
        "Invalid or unauthorized Gemini API key. Please check your GEMINI_API_KEY in Vercel environment settings.",
        403,
        "UNAUTHORIZED_API_KEY"
      );
    }

    if (status === 429 || error?.message?.includes("RESOURCE_EXHAUSTED")) {
      throw new AiServiceError(
        "Gemini API rate limit or quota exceeded. Please wait a moment before sending another request.",
        429,
        "RATE_LIMITED"
      );
    }

    if (status === 503 || status === 504 || error?.message?.includes("UNAVAILABLE") || error?.message?.includes("DEADLINE_EXCEEDED")) {
      // If primary model failed due to high demand, attempt fallback to flash lite
      if (modelToUse !== "gemini-3.1-flash-lite") {
        try {
          console.warn("[ZOIR AI Service] Primary model unavailable, falling back to gemini-3.1-flash-lite...");
          const fallbackRes = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: formattedContents,
            config: { systemInstruction: defaultSystemInstruction },
          });
          if (fallbackRes.text) {
            return {
              text: fallbackRes.text,
              model: "gemini-3.1-flash-lite",
              durationMs: Date.now() - startTime,
            };
          }
        } catch (fallbackErr: any) {
          console.error("[ZOIR AI Service] Fallback model also failed:", fallbackErr?.message);
        }
      }

      throw new AiServiceError(
        "The AI service is experiencing high demand. Please try sending your question again in a few seconds.",
        503,
        "SERVICE_OVERLOADED"
      );
    }

    // Default error wrapper
    throw new AiServiceError(
      error?.message || "Failed to generate AI response. Please try again.",
      status && typeof status === "number" && status >= 400 && status < 600 ? status : 500,
      "MODEL_ERROR"
    );
  }
}
