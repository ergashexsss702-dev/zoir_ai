import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { generateZoirResponse, getDiagnosticStatus, AiServiceError } from "./src/services/aiService.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === "production";

// Middleware
app.use(express.json({ limit: "5mb" }));

// CORS configuration for flexibility
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  const diagnostic = getDiagnosticStatus();
  res.json({
    ok: true,
    service: "ZOIR AI Express Server",
    status: "operational",
    timestamp: new Date().toISOString(),
    diagnostics: {
      geminiConfigured: diagnostic.hasKey,
      keyPrefix: diagnostic.keyPrefix,
      model: diagnostic.defaultModel,
      nodeEnv: diagnostic.nodeEnv,
      runtime: isProduction ? "Production Node.js" : "Development (Vite Middleware)",
    },
  });
});

// Chat endpoint matching Vercel Serverless Function behavior
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history, systemInstruction } = req.body || {};

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        error: "Message is required and must be a non-empty string.",
        code: "INVALID_INPUT",
      });
    }

    const result = await generateZoirResponse({
      message,
      history,
      systemInstruction,
    });

    return res.status(200).json({
      ok: true,
      response: result.text,
      model: result.model,
      durationMs: result.durationMs,
    });
  } catch (error: any) {
    const statusCode = error instanceof AiServiceError ? error.statusCode : 500;
    const errorCode = error instanceof AiServiceError ? error.code : "INTERNAL_SERVER_ERROR";
    const errorMessage = error?.message || "Internal server error occurred.";

    console.error("[Express /api/chat] Error handled:", {
      code: errorCode,
      status: statusCode,
      message: errorMessage,
    });

    return res.status(statusCode).json({
      ok: false,
      error: errorMessage,
      code: errorCode,
    });
  }
});

// Handle disallowed methods on /api/chat
app.all("/api/chat", (req, res) => {
  res.status(405).json({
    ok: false,
    error: `Method ${req.method} not allowed on /api/chat. Use POST.`,
    code: "METHOD_NOT_ALLOWED",
  });
});

// Vite dev server integration vs Production static serving
async function setupFrontend() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("[ZOIR Server] Vite dev middleware attached.");
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
    console.log(`[ZOIR Server] Serving static files from ${distPath}`);
  }
}

setupFrontend().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 ZOIR AI server running on http://0.0.0.0:${PORT} (Node: ${process.version})`);
  });
}).catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
