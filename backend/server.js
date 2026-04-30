/**
 * server.js (Express backend proxy)
 *
 * WHY THIS EXISTS:
 * - Browsers cannot safely call OpenAI/Claude/Gemini/Groq directly.
 * - This server receives requests from your React app and calls providers securely.
 *
 * FLOW:
 * React (browser) -> POST /api/ai -> this server -> provider -> returns { text }
 *
 * Search CONFIG YOU WILL EDIT for relevant change suggestions.
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

/**
 * CONFIG YOU WILL EDIT:
 * These are the default models used when the frontend does not send a model.
 *
 * Researchers can still override the model by sending "model" in the request body.
 */
const DEFAULT_MODELS = {
  chatgpt: "gpt-4o",
  claude: "claude-sonnet-4-20250514",
  gemini: "gemini-2.5-flash",
  groq: "llama-3.3-70b-versatile",
};

const DEFAULT_MAX_TOKENS = 1000;

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
  return (chatHistory || [])
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? ""),
    }))
    .filter((m) => m.content.trim().length > 0);
}

/**
 * normalizeProvider
 * Lets the frontend send either "chatgpt" or "openai", etc.
 */
function normalizeProvider(provider) {
  const p = String(provider || "chatgpt")
    .toLowerCase()
    .trim();

  if (p === "openai") return "chatgpt";
  if (p === "anthropic") return "claude";
  if (p === "google") return "gemini";

  return p;
}

/**
 * getSelectedModel
 * If the frontend sends a model, use it.
 * Otherwise, use the default model for that provider.
 */
function getSelectedModel(provider, requestedModel) {
  const model = String(requestedModel || "").trim();

  if (model.length > 0) {
    return model;
  }

  return DEFAULT_MODELS[provider];
}

/**
 * getSelectedMaxTokens
 * If the frontend sends maxTokens, use it.
 * Otherwise, use the default value.
 */
function getSelectedMaxTokens(requestedMaxTokens) {
  const value = Number(requestedMaxTokens);

  if (Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  return DEFAULT_MAX_TOKENS;
}

// -----------------------------
// MAIN ENDPOINT
// -----------------------------

/**
 * POST /api/ai
 *
 * Request body from React:
 * {
 *   "provider": "chatgpt" | "claude" | "gemini" | "groq",
 *   "model": "optional model id",
 *   "maxTokens": 1000,
 *   "chatHistory": [{ role, content }, ...]
 * }
 *
 * If model is not provided, the backend uses DEFAULT_MODELS.
 *
 * Response:
 * {
 *   "text": "assistant reply here",
 *   "provider": "groq",
 *   "model": "llama-3.3-70b-versatile"
 * }
 */
app.post("/api/ai", async (req, res) => {
  try {
    const provider = normalizeProvider(req.body?.provider);
    const chatHistory = normalizeChatHistory(req.body?.chatHistory);
    const model = getSelectedModel(provider, req.body?.model);
    const maxTokens = getSelectedMaxTokens(req.body?.maxTokens);

    if (!model) {
      return res.status(400).json({
        error: `Unsupported provider: ${provider}`,
        supportedProviders: ["chatgpt", "claude", "gemini", "groq"],
      });
    }

    if (chatHistory.length === 0) {
      return res.status(400).json({
        error: "chatHistory is empty",
      });
    }

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
          // CONFIG YOU WILL EDIT:
          // Default model is set in DEFAULT_MODELS.
          // Frontend can override it by sending "model".
          model,
          max_tokens: maxTokens,
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

      return res.json({
        text: extractClaudeText(r.data),
        provider,
        model,
      });
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
      const contents = chatHistory.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          contents,
          generationConfig: { maxOutputTokens: maxTokens },
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_KEY,
          },
        },
      );

      return res.json({
        text: extractGeminiText(r.data),
        provider,
        model,
      });
    }

    // -----------------------------
    // PROVIDER: GROQ
    // -----------------------------
    if (provider === "groq") {
      if (!process.env.GROQ_KEY) {
        return res
          .status(500)
          .json({ error: "Missing GROQ_KEY in backend env" });
      }

      const r = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          // CONFIG YOU WILL EDIT:
          // Default model is set in DEFAULT_MODELS.
          // Example default: llama-3.3-70b-versatile
          model,
          max_tokens: maxTokens,
          messages: chatHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: process.env.GROQ_KEY,
          },
        },
      );

      return res.json({
        text: extractOpenAIText(r.data),
        provider,
        model,
      });
    }

    // -----------------------------
    // PROVIDER: OPENAI (ChatGPT) [DEFAULT]
    // -----------------------------
    if (provider === "chatgpt") {
      if (!process.env.OPENAI_KEY) {
        return res
          .status(500)
          .json({ error: "Missing OPENAI_KEY in backend env" });
      }

      const r = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          // CONFIG YOU WILL EDIT:
          // Default model is set in DEFAULT_MODELS.
          // Frontend can override it by sending "model".
          model,
          max_tokens: maxTokens,
          messages: chatHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        },
        {
          headers: {
            "Content-Type": "application/json",

            // Kept in the same style as your original code.
            // Your OPENAI_KEY should include "Bearer ...".
            Authorization: process.env.OPENAI_KEY,
          },
        },
      );

      return res.json({
        text: extractOpenAIText(r.data),
        provider,
        model,
      });
    }

    return res.status(400).json({
      error: `Unsupported provider: ${provider}`,
      supportedProviders: ["chatgpt", "claude", "gemini", "groq"],
    });
  } catch (err) {
    // Print detailed errors on server logs; helps debugging
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
