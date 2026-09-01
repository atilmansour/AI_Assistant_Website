// index.mjs
import crypto from "crypto";
import AWS from "aws-sdk";

const s3 = new AWS.S3();

const DEFAULT_ALLOWED_ORIGINS = [
  "https://main.d2gkp0fur5ysdy.amplifyapp.com",
  "http://localhost:3000",
  "http://localhost:3005",
  "http://localhost:3006",
];

const DEFAULT_MODELS = {
  chatgpt: "gpt-4o",
  claude: "claude-sonnet-5",
  gemini: "gemini-2.5-flash",
  groq: "openai/gpt-oss-20b",
};

const DEFAULT_MAX_TOKENS = 1000;

function getAllowedOrigins() {
  const configured =
    process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || "";
  const origins = configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length ? origins : DEFAULT_ALLOWED_ORIGINS;
}

function getHeader(event, name) {
  const target = name.toLowerCase();
  const headers = event?.headers || {};
  const key = Object.keys(headers).find(
    (headerName) => headerName.toLowerCase() === target,
  );
  return key ? headers[key] : "";
}

function getCorsHeaders(event) {
  const requestOrigin = getHeader(event, "origin");
  const allowedOrigins = getAllowedOrigins();
  const allowOrigin = allowedOrigins.includes("*")
    ? "*"
    : allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "Content-Type,Authorization,X-Admin-Token,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function response(statusCode, headers, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

function makeAdminToken(password) {
  return crypto
    .createHash("sha256")
    .update(password + ":admin_access_2026")
    .digest("hex");
}

function validateAdmin(event) {
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  if (!adminPassword) return false;

  const authHeader = getHeader(event, "authorization");
  const token = (
    getHeader(event, "x-admin-token") || authHeader.replace(/^Bearer\s+/i, "")
  ).trim();

  return token === makeAdminToken(adminPassword);
}

function getLogsBucket() {
  return process.env.REACT_APP_BucketS3 || process.env.BUCKET_NAME || "";
}

function normalizeProvider(provider) {
  const p = String(provider || "chatgpt")
    .toLowerCase()
    .trim();

  if (p === "openai") return "chatgpt";
  if (p === "anthropic") return "claude";
  if (p === "google") return "gemini";

  return p;
}

function getSelectedModel(provider, requestedModel) {
  const model = String(requestedModel || "").trim();
  return model.length > 0 ? model : DEFAULT_MODELS[provider];
}

function getSelectedMaxTokens(requestedMaxTokens) {
  const value = Number(requestedMaxTokens);
  return Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DEFAULT_MAX_TOKENS;
}

function normalizeChatHistory(chatHistory) {
  return (chatHistory || [])
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? ""),
    }))
    .filter((m) => m.content.trim().length > 0);
}

function extractClaudeText(data) {
  return (data?.content || [])
    .map((block) => {
      if (typeof block === "string") return block;
      if (block?.type === "text") return block.text || "";
      if (block?.text) return block.text;
      return "";
    })
    .join("\n")
    .trim();
}

function extractGeminiText(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

function extractOpenAIText(data) {
  const content = data?.choices?.[0]?.message?.content;

  if (Array.isArray(content)) {
    return content
      .map((part) => part.text || part.content || "")
      .join("\n")
      .trim();
  }

  return String(content ?? "").trim();
}

async function bodyToString(body) {
  if (!body) return "";
  if (Buffer.isBuffer(body)) return body.toString("utf-8");
  if (typeof body === "string") return body;

  if (typeof body.transformToString === "function") {
    return body.transformToString();
  }

  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf-8");
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

async function handleAiRequest(event, headers) {
  const body = JSON.parse(event.body || "{}");

  const provider = normalizeProvider(body.provider);
  const model = getSelectedModel(provider, body.model);
  const maxTokens = getSelectedMaxTokens(body.maxTokens);
  const chatHistory = normalizeChatHistory(body.chatHistory);

  if (!model) {
    return response(400, headers, {
      error: `Unsupported provider: ${provider}`,
      supportedProviders: ["chatgpt", "claude", "gemini", "groq"],
    });
  }

  if (chatHistory.length === 0) {
    return response(400, headers, {
      error: "chatHistory is empty",
    });
  }

  if (provider === "claude") {
    if (!process.env.CLAUDE_KEY) {
      return response(500, headers, {
        error: "Missing CLAUDE_KEY in Lambda environment",
      });
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.CLAUDE_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: chatHistory,
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      return response(r.status, headers, {
        error: "Claude request failed",
        provider,
        model,
        details: data,
      });
    }

    return response(200, headers, {
      text: extractClaudeText(data),
      provider,
      model,
    });
  }

  if (provider === "gemini") {
    if (!process.env.GEMINI_KEY) {
      return response(500, headers, {
        error: "Missing GEMINI_KEY in Lambda environment",
      });
    }

    const contents = chatHistory.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_KEY,
        },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      },
    );

    const data = await r.json();

    if (!r.ok) {
      return response(r.status, headers, {
        error: "Gemini request failed",
        provider,
        model,
        details: data,
      });
    }

    return response(200, headers, {
      text: extractGeminiText(data),
      provider,
      model,
    });
  }

  if (provider === "groq") {
    if (!process.env.GROQ_KEY) {
      return response(500, headers, {
        error: "Missing GROQ_KEY in Lambda environment",
      });
    }

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: process.env.GROQ_KEY,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: chatHistory.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      return response(r.status, headers, {
        error: "Groq request failed",
        provider,
        model,
        details: data,
      });
    }

    return response(200, headers, {
      text: extractOpenAIText(data),
      provider,
      model,
    });
  }

  if (provider === "chatgpt") {
    if (!process.env.OPENAI_KEY) {
      return response(500, headers, {
        error: "Missing OPENAI_KEY in Lambda environment",
      });
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: process.env.OPENAI_KEY,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: chatHistory.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      return response(r.status, headers, {
        error: "OpenAI request failed",
        provider,
        model,
        details: data,
      });
    }

    return response(200, headers, {
      text: extractOpenAIText(data),
      provider,
      model,
    });
  }

  return response(400, headers, {
    error: `Unsupported provider: ${provider}`,
    supportedProviders: ["chatgpt", "claude", "gemini", "groq"],
  });
}

export const handler = async (event) => {
  const headers = getCorsHeaders(event);
  const path = event?.rawPath || event?.path || "";
  const method =
    event?.requestContext?.http?.method || event?.httpMethod || "POST";

  try {
    if (method === "OPTIONS") {
      return { statusCode: 204, headers, body: "" };
    }

    if (
      path.includes("/api/admin/login") ||
      path.includes("/api/research-admin/login")
    ) {
      const body = JSON.parse(event.body || "{}");
      const adminPassword = process.env.ADMIN_PASSWORD || "";

      if (!adminPassword) {
        return response(500, headers, {
          error: "ADMIN_PASSWORD is not configured",
        });
      }

      if (!body.password || body.password !== adminPassword) {
        return response(401, headers, {
          error: "Invalid password",
        });
      }

      return response(200, headers, {
        ok: true,
        token: makeAdminToken(adminPassword),
      });
    }

    if (
      path.includes("/api/admin/sessions") ||
      path.includes("/api/research-admin/sessions")
    ) {
      if (!validateAdmin(event)) {
        return response(401, headers, {
          error: "Unauthorized",
        });
      }

      const bucket = getLogsBucket();

      if (!bucket) {
        return response(500, headers, {
          error: "Missing S3 bucket env var",
        });
      }

      if (method === "GET") {
        try {
          const objects = await listAllLogObjects(bucket);

          const sessions = await Promise.all(
            objects.map(async (objectMeta) => {
              try {
                const result = await s3
                  .getObject({
                    Bucket: bucket,
                    Key: objectMeta.Key,
                  })
                  .promise();

                const raw = await bodyToString(result.Body);

                return summarizeLog(JSON.parse(raw || "{}"), objectMeta);
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

          sessions.sort((a, b) =>
            String(b.created_at).localeCompare(String(a.created_at)),
          );

          return response(200, headers, { sessions });
        } catch (e) {
          console.error("Admin sessions fetch failed:", e);

          return response(500, headers, {
            error: "Failed to load sessions",
            details: String(e),
          });
        }
      }

      if (method === "DELETE") {
        const body = JSON.parse(event.body || "{}");
        const sessionId = String(body.session_id || "").trim();
        const key = String(
          body.key || (sessionId ? `${sessionId}.txt` : ""),
        ).trim();

        if (!key) {
          return response(400, headers, {
            error: "Missing session_id",
          });
        }

        try {
          await s3
            .deleteObject({
              Bucket: bucket,
              Key: key,
            })
            .promise();

          return response(200, headers, { ok: true });
        } catch (e) {
          console.error("Admin session delete failed:", e);

          return response(500, headers, {
            error: "Delete failed",
            details: String(e),
          });
        }
      }

      return response(405, headers, {
        error: "Method not allowed",
      });
    }

    if (path.includes("/api/logs")) {
      const bucket = getLogsBucket();

      if (!bucket) {
        return response(500, headers, {
          error: "Missing S3 bucket env var",
        });
      }

      const body = JSON.parse(event.body || "{}");
      const logs = body?.logs;

      if (!logs?.id) {
        return response(400, headers, {
          error: "Missing logs.id",
        });
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

      return response(200, headers, {
        ok: true,
        key,
      });
    }

    if (path.includes("/api/ai")) {
      return await handleAiRequest(event, headers);
    }

    return response(404, headers, {
      error: "Not found",
      path,
    });
  } catch (e) {
    console.error("Unhandled Lambda error:", e);

    return response(500, headers, {
      error: "Internal server error",
      details: String(e),
    });
  }
};
