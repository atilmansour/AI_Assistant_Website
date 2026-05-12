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
import crypto from "crypto";
import AWS from "aws-sdk";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

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
app.use(express.json({ limit: "10mb" }));

// Allow your frontend to call this backend (CORS)
app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Token"],
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
// LOGGING + ADMIN HELPERS
// -----------------------------

const awsConfig = {};
if (process.env.REACT_APP_REGION || process.env.AWS_REGION) {
  awsConfig.region = process.env.REACT_APP_REGION || process.env.AWS_REGION;
}
if (process.env.REACT_APP_ACCESS_KEY_ID && process.env.REACT_APP_SECRET_ACCESS_KEY) {
  awsConfig.accessKeyId = process.env.REACT_APP_ACCESS_KEY_ID;
  awsConfig.secretAccessKey = process.env.REACT_APP_SECRET_ACCESS_KEY;
}
AWS.config.update(awsConfig);

const s3 = new AWS.S3();

function getLogsBucket() {
  return process.env.REACT_APP_BucketS3 || process.env.BUCKET_NAME || "";
}

function makeAdminToken(password) {
  return crypto
    .createHash("sha256")
    .update(password + ":admin_access_2026")
    .digest("hex");
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || "";
}

function getBearerToken(req) {
  const authHeader = req.get("authorization") || "";
  return (
    req.get("x-admin-token") ||
    authHeader.replace(/^Bearer\s+/i, "")
  ).trim();
}

function requireAdmin(req, res, next) {
  const adminPassword = getAdminPassword();
  if (!adminPassword || getBearerToken(req) !== makeAdminToken(adminPassword)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

async function listAllLogObjects(bucket) {
  const objects = [];
  let ContinuationToken;

  do {
    const result = await s3
      .listObjectsV2({
        Bucket: bucket,
        ContinuationToken,
      })
      .promise();

    objects.push(
      ...(result.Contents || []).filter((obj) => obj.Key?.endsWith(".txt")),
    );
    ContinuationToken = result.IsTruncated
      ? result.NextContinuationToken
      : undefined;
  } while (ContinuationToken);

  return objects;
}

async function readLogObject(bucket, key) {
  const result = await s3.getObject({ Bucket: bucket, Key: key }).promise();
  const raw = result.Body?.toString("utf-8") || "{}";
  return JSON.parse(raw);
}

function deriveConditionFromId(id = "") {
  if (/^OL[A-Z0-9]+C$/.test(id)) return "No LLM / control";
  if (/^AVL[A-Z0-9]+U$/.test(id)) return "Always Visible LLM";
  if (/^TL[A-Z0-9]+O$/.test(id)) return "Toggleable LLM";
  if (/^PI[A-Z0-9]+B$/.test(id)) return "Participant-Initiated LLM";
  if (/^OC[A-Z0-9]+A$/.test(id)) return "Only Chat";
  return "";
}

function summarizeLog(logs, objectMeta = {}) {
  const id = String(logs?.id || objectMeta.Key?.replace(/\.txt$/i, "") || "");
  const messages = Array.isArray(logs?.messages) ? logs.messages : [];
  const editor = Array.isArray(logs?.editor) ? logs.editor : [];

  return {
    key: objectMeta.Key || `${id}.txt`,
    session_id: id,
    condition: deriveConditionFromId(id),
    participant_id: "",
    total_rounds: messages.filter((msg) => msg?.sender === "user").length,
    submit_click_count: logs?.NumOfSubmitClicks ?? "",
    created_at: objectMeta.LastModified?.toISOString?.() || "",
    size: objectMeta.Size || 0,
    final_solution: editor.length ? editor[editor.length - 1]?.text || "" : "",
    full_messages_json: messages,
    editor_progress_json: editor,
    raw_payload_json: logs,
  };
}

// -----------------------------
// LOGGING ENDPOINT
// -----------------------------

app.post("/api/logs", async (req, res) => {
  try {
    const bucket = getLogsBucket();
    if (!bucket) {
      return res.status(500).json({ error: "Missing S3 bucket env var" });
    }

    const logs = req.body?.logs;
    if (!logs?.id) {
      return res.status(400).json({ error: "Missing logs.id" });
    }

    const key = `${logs.id}.txt`;
    await s3
      .putObject({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(logs),
        ContentType: "text/plain",
      })
      .promise();

    return res.json({ ok: true, key });
  } catch (err) {
    console.error("S3 upload failed:", err);
    return res.status(500).json({
      error: "Failed to upload logs",
      details: String(err),
    });
  }
});

// -----------------------------
// ADMIN ENDPOINTS
// -----------------------------

app.post(["/api/admin/login", "/api/research-admin/login"], (req, res) => {
  const password = req.body?.password;
  const adminPassword = getAdminPassword();

  if (!adminPassword) {
    return res.status(500).json({ error: "ADMIN_PASSWORD is not configured" });
  }

  if (!password || password !== adminPassword) {
    return res.status(401).json({ error: "Invalid password" });
  }

  return res.json({ ok: true, token: makeAdminToken(adminPassword) });
});

app.get(
  ["/api/admin/sessions", "/api/research-admin/sessions"],
  requireAdmin,
  async (_req, res) => {
    try {
      const bucket = getLogsBucket();
      if (!bucket) {
        return res.status(500).json({ error: "Missing S3 bucket env var" });
      }

      const objects = await listAllLogObjects(bucket);
      const sessions = await Promise.all(
        objects.map(async (objectMeta) => {
          try {
            const logs = await readLogObject(bucket, objectMeta.Key);
            return summarizeLog(logs, objectMeta);
          } catch (err) {
            return {
              key: objectMeta.Key,
              session_id: objectMeta.Key?.replace(/\.txt$/i, "") || "",
              condition: "",
              parse_error: String(err),
              created_at: objectMeta.LastModified?.toISOString?.() || "",
              size: objectMeta.Size || 0,
              raw_payload_json: null,
            };
          }
        }),
      );

      sessions.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return res.json({ sessions });
    } catch (err) {
      console.error("Admin sessions fetch failed:", err);
      return res.status(500).json({ error: "Failed to load sessions", details: String(err) });
    }
  },
);

app.delete(
  ["/api/admin/sessions", "/api/research-admin/sessions"],
  requireAdmin,
  async (req, res) => {
    try {
      const bucket = getLogsBucket();
      const sessionId = String(req.body?.session_id || "").trim();
      const key = String(req.body?.key || (sessionId ? `${sessionId}.txt` : "")).trim();

      if (!bucket) return res.status(500).json({ error: "Missing S3 bucket env var" });
      if (!key) return res.status(400).json({ error: "Missing session_id" });

      await s3.deleteObject({ Bucket: bucket, Key: key }).promise();
      return res.json({ ok: true });
    } catch (err) {
      console.error("Admin session delete failed:", err);
      return res.status(500).json({ error: "Delete failed", details: String(err) });
    }
  },
);

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
