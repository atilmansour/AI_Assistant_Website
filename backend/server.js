/**
 * server.js (Express backend proxy)
 *
 * WHY THIS EXISTS:
 * - Browsers cannot safely call OpenAI/Claude/Gemini directly (CORS + API keys leak).
 * - This server receives requests from your React app and calls providers securely.
 *
 * FLOW:
 * React (browser) -> POST /api/ai -> (this server) -> provider -> returns { text }
 */

import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();

/**
 * In production, lock this down to your real Amplify domain:
 * e.g. https://yourapp.amplifyapp.com
 *
 * For local dev, it will be http://localhost:3000
 */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:3000";

/**
 * Local port for backend (development)
 */
const PORT = Number(process.env.PORT || 5050);

// -----------------------------
// MIDDLEWARE
// -----------------------------

// Parse JSON request bodies
app.use(express.json({ limit: "1mb" }));

// Allow your frontend to call this backend (CORS)
app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);

// -----------------------------
// HELPERS: Extract text from each provider response
// -----------------------------

function extractClaudeText(data) {
  return (data?.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function extractGeminiText(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("\n")
    .trim();
}

function extractOpenAIText(data) {
  const msg = data?.choices?.[0]?.message?.content;
  if (Array.isArray(msg)) {
    return msg
      .map((p) => p.text || "")
      .join("\n")
      .trim();
  }
  return String(msg ?? "").trim();
}

/**
 * normalizeChatHistory
 * Ensures we always pass clean strings to providers.
 * Expected input format from React:
 * [{ role: "user"|"assistant", content: "..." }, ...]
 */
function normalizeChatHistory(chatHistory) {
  return (chatHistory || []).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content ?? ""),
  }));
}

// -----------------------------
// MAIN ENDPOINT
// -----------------------------

/**
 * POST /api/ai
 *
 * Request body (from React):
 * {
 *   "provider": "chatgpt" | "claude" | "gemini",
 *   "chatHistory": [{ role, content }, ...]
 * }
 *
 * Response:
 * { "text": "assistant reply here" }
 */
app.post("/api/ai", async (req, res) => {
  try {
    const provider = req.body?.provider || "chatgpt";
    const chatHistory = normalizeChatHistory(req.body?.chatHistory);

    // -----------------------------
    // PROVIDER: CLAUDE (Anthropic)
    // -----------------------------
    if (provider === "claude") {
      if (!process.env.CLAUDE_KEY) {
        return res
          .status(500)
          .json({ error: "Missing CLAUDE_KEY in backend env" });
      }

      const r = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          //CONFIG YOU WILL EDIT: you can edit here the Claude model and max tokens, etc.
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: chatHistory,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.CLAUDE_KEY,
            "anthropic-version": "2023-06-01",
          },
        },
      );

      return res.json({ text: extractClaudeText(r.data) });
    }

    // -----------------------------
    // PROVIDER: GEMINI (Google)
    // -----------------------------
    if (provider === "gemini") {
      if (!process.env.GEMINI_KEY) {
        return res
          .status(500)
          .json({ error: "Missing GEMINI_KEY in backend env" });
      }

      // Gemini expects: role "user" | "model" with parts
      const contents = chatHistory
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      const r = await axios.post(
        //CONFIG YOU WILL EDIT: you can edit here the Gemini model and max tokens, etc.
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          contents,
          generationConfig: { maxOutputTokens: 1000 },
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_KEY,
          },
        },
      );

      return res.json({ text: extractGeminiText(r.data) });
    }

    // -----------------------------
    // PROVIDER: OPENAI (ChatGPT) [DEFAULT]
    // -----------------------------
    // Note: your React uses aiProvider="chatgpt" for OpenAI, so we treat everything else as OpenAI.
    if (!process.env.OPENAI_KEY) {
      return res
        .status(500)
        .json({ error: "Missing OPENAI_KEY in backend env" });
    }

    const r = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        //CONFIG YOU WILL EDIT: you can edit here the ChatGPT model and max tokens, etc.
        model: "gpt-4o",
        max_tokens: 1000,
        // OpenAI expects messages: [{role, content: string}, ...]
        messages: chatHistory.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: process.env.OPENAI_KEY,
        },
      },
    );

    return res.json({ text: extractOpenAIText(r.data) });
  } catch (err) {
    // Print detailed errors on server logs (helps debugging)
    console.error(
      "Backend Error:",
      err?.response?.status,
      err?.response?.data || err,
    );

    return res.status(err?.response?.status || 500).json({
      error: "AI request failed",
      details: err?.response?.data || String(err),
    });
  }
});

// -----------------------------
// START SERVER
// -----------------------------
app.listen(PORT, () => {
  console.log(`AI proxy backend running on http://localhost:${PORT}`);
  console.log(`CORS allowed origin: ${ALLOWED_ORIGIN}`);
});
