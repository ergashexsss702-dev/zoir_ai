import assert from "node:assert/strict";
import test from "node:test";
import { generateZoirResponse, getDiagnosticStatus, AiServiceError } from "../src/services/aiService.ts";

test("Diagnostic status returns accurate configuration without leaking keys", () => {
  const diag = getDiagnosticStatus();
  assert.equal(typeof diag.hasKey, "boolean");
  if (diag.hasKey && typeof diag.keyPrefix === "string") {
    assert.ok(diag.keyPrefix.endsWith("..."), "Key prefix should be masked");
  }
  assert.equal(typeof diag.defaultModel, "string");
});

test("Input validation rejects empty messages with 400 status", async () => {
  await assert.rejects(
    async () => {
      await generateZoirResponse({ message: "" });
    },
    (err: any) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, "INVALID_INPUT");
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await generateZoirResponse({ message: "   \n\t  " });
    },
    (err: any) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, "INVALID_INPUT");
      return true;
    }
  );
});

test("Missing API key is handled gracefully when key is empty", async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    await assert.rejects(
      async () => {
        await generateZoirResponse({ message: "Hello" });
      },
      (err: any) => {
        assert.ok(err instanceof AiServiceError);
        assert.equal(err.statusCode, 500);
        assert.equal(err.code, "MISSING_API_KEY");
        assert.ok(err.message.includes("GEMINI_API_KEY"));
        return true;
      }
    );
  } finally {
    process.env.GEMINI_API_KEY = originalKey;
  }
});

test("Live AI Response generation works with real Gemini credentials and multi-turn context", async () => {
  if (!process.env.GEMINI_API_KEY) {
    console.log("Skipping live API test: GEMINI_API_KEY not present in environment.");
    return;
  }

  const result = await generateZoirResponse({
    message: "What is 2 + 2? Reply with just the number.",
    history: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi! How can I help you today?" }
    ]
  });

  assert.ok(result.text, "Response text should exist");
  assert.ok(typeof result.text === "string", "Response should be string");
  assert.ok(result.text.includes("4"), "Response should calculate 2+2=4");
  assert.ok(result.durationMs > 0, "Duration should be positive number");
  console.log(`✓ Real AI test passed (${result.durationMs}ms): "${result.text.trim()}"`);
});
