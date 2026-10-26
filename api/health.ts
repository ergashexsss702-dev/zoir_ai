import { getDiagnosticStatus } from "../src/services/aiService.ts";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  const diagnostic = getDiagnosticStatus();

  res.statusCode = 200;
  res.end(
    JSON.stringify({
      ok: true,
      service: "ZOIR AI API",
      status: "operational",
      timestamp: new Date().toISOString(),
      diagnostics: {
        geminiConfigured: diagnostic.hasKey,
        keyPrefix: diagnostic.keyPrefix,
        model: diagnostic.defaultModel,
        runtime: "Vercel / Node Serverless",
      },
    })
  );
}
