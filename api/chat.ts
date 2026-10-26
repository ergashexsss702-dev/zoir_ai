import type { IncomingMessage, ServerResponse } from "http";
import { generateZoirResponse, AiServiceError } from "../src/services/aiService.ts";

// Config for Vercel Serverless Function
export const config = {
  maxDuration: 30, // 30 seconds max duration on Vercel
};

/**
 * Vercel Serverless Function Handler for /api/chat
 */
export default async function handler(req: any, res: any) {
  // Set CORS & JSON headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Enforce POST method
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(
      JSON.stringify({
        ok: false,
        error: `HTTP method ${req.method} is not allowed. Please use POST.`,
        code: "METHOD_NOT_ALLOWED",
      })
    );
    return;
  }

  try {
    // Parse body if it's a stream/string or already parsed by body-parser
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (parseErr) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            ok: false,
            error: "Invalid JSON in request body.",
            code: "INVALID_JSON",
          })
        );
        return;
      }
    }

    if (!body || typeof body !== "object") {
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          ok: false,
          error: "Request body must be a JSON object containing a 'message' field.",
          code: "MISSING_BODY",
        })
      );
      return;
    }

    const { message, history, systemInstruction } = body;

    const result = await generateZoirResponse({
      message,
      history,
      systemInstruction,
    });

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        ok: true,
        response: result.text,
        model: result.model,
        durationMs: result.durationMs,
      })
    );
  } catch (error: any) {
    const statusCode = error instanceof AiServiceError ? error.statusCode : 500;
    const errorCode = error instanceof AiServiceError ? error.code : "INTERNAL_SERVER_ERROR";
    const errorMessage = error?.message || "An unexpected error occurred while processing your request.";

    console.error("[Vercel /api/chat] Error:", {
      code: errorCode,
      status: statusCode,
      message: errorMessage,
    });

    res.statusCode = statusCode;
    res.end(
      JSON.stringify({
        ok: false,
        error: errorMessage,
        code: errorCode,
      })
    );
  }
}
