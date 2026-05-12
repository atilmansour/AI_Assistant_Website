// index.mjs
import crypto from "crypto";
import AWS from "aws-sdk";

const s3 = new AWS.S3();

function makeAdminToken(password) {
  return crypto
    .createHash("sha256")
    .update(password + ":admin_access_2026")
    .digest("hex");
}

function getHeader(event, name) {
  const target = name.toLowerCase();
  const headers = event?.headers || {};
  const key = Object.keys(headers).find((headerName) => headerName.toLowerCase() === target);
  return key ? headers[key] : "";
}

function validateAdmin(event) {
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  if (!adminPassword) return false;
  const authHeader = getHeader(event, "authorization");
  const token = (
    getHeader(event, "x-admin-token") ||
    authHeader.replace(/^Bearer\s+/i, "")
  ).trim();
  return token === makeAdminToken(adminPassword);
}

function response(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function getLogsBucket() {
  return process.env.REACT_APP_BucketS3 || process.env.BUCKET_NAME || "";
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

    objects.push(...(result.Contents || []).filter((obj) => obj.Key?.endsWith(".txt")));
    ContinuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
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

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Admin-Token",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Content-Type": "application/json",
  };

  if (event?.requestContext?.http?.method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const path = event?.rawPath || event?.path || "";
  const method = event?.requestContext?.http?.method || event?.httpMethod || "POST";

  if (path.includes("/api/admin/login") || path.includes("/api/research-admin/login")) {
    const body = JSON.parse(event.body || "{}");
    const adminPassword = process.env.ADMIN_PASSWORD || "";

    if (!adminPassword) {
      return response(500, headers, { error: "ADMIN_PASSWORD is not configured" });
    }

    if (!body.password || body.password !== adminPassword) {
      return response(401, headers, { error: "Invalid password" });
    }

    return response(200, headers, { ok: true, token: makeAdminToken(adminPassword) });
  }

  if (path.includes("/api/admin/sessions") || path.includes("/api/research-admin/sessions")) {
    if (!validateAdmin(event)) {
      return response(401, headers, { error: "Unauthorized" });
    }

    const bucket = getLogsBucket();
    if (!bucket) {
      return response(500, headers, { error: "Missing S3 bucket env var" });
    }

    if (method === "GET") {
      try {
        const objects = await listAllLogObjects(bucket);
        const sessions = await Promise.all(
          objects.map(async (objectMeta) => {
            try {
              const result = await s3
                .getObject({ Bucket: bucket, Key: objectMeta.Key })
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

        sessions.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return response(200, headers, { sessions });
      } catch (e) {
        console.error("Admin sessions fetch failed:", e);
        return response(500, headers, { error: "Failed to load sessions", details: String(e) });
      }
    }

    if (method === "DELETE") {
      const body = JSON.parse(event.body || "{}");
      const sessionId = String(body.session_id || "").trim();
      const key = String(body.key || (sessionId ? `${sessionId}.txt` : "")).trim();

      if (!key) return response(400, headers, { error: "Missing session_id" });

      try {
        await s3.deleteObject({ Bucket: bucket, Key: key }).promise();
        return response(200, headers, { ok: true });
      } catch (e) {
        console.error("Admin session delete failed:", e);
        return response(500, headers, { error: "Delete failed", details: String(e) });
      }
    }

    return response(405, headers, { error: "Method not allowed" });
  }

  if (path.includes("/api/logs")) {
    try {
      const bucket = getLogsBucket();
      if (!bucket) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: "Missing S3 bucket env var" }),
        };
      }

      const body = JSON.parse(event.body || "{}");
      const logs = body?.logs;

      if (!logs?.id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing logs.id" }),
        };
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

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, key }),
      };
    } catch (e) {
      console.error("S3 upload failed:", e);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Failed to upload logs",
          details: String(e),
        }),
      };
    }
  }
  try {
    // Parse incoming JSON from API Gateway
    const body = JSON.parse(event.body || "{}");
    const provider = body.provider || "chatgpt";

    // Expect: chatHistory = [{role:"user"/"assistant", content:"..."}, ...]
    const chatHistory = (body.chatHistory || []).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? ""),
    }));

    // -------------------- CLAUDE (Anthropic) --------------------
    if (provider === "claude") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.CLAUDE_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: chatHistory,
        }),
      });

      const data = await r.json();

      // Claude returns content blocks; collect text blocks
      const text = (data?.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      return { statusCode: 200, headers, body: JSON.stringify({ text }) };
    }

    // -------------------- GEMINI (Google) --------------------
    if (provider === "gemini") {
      const contents = chatHistory
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      const r = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_KEY,
          },
          body: JSON.stringify({
            contents,
            generationConfig: { maxOutputTokens: 1000 },
          }),
        },
      );

      const data = await r.json();

      const text = (data?.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || "")
        .join("\n")
        .trim();

      return { statusCode: 200, headers, body: JSON.stringify({ text }) };
    }

    // -------------------- OPENAI (default) --------------------
    // Frontend sends plain strings; OpenAI chat completions expects role+content strings.
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: process.env.OPENAI_KEY,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 1000,
        messages: chatHistory.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    const data = await r.json();
    const text = String(data?.choices?.[0]?.message?.content ?? "").trim();

    return { statusCode: 200, headers, body: JSON.stringify({ text }) };
  } catch (e) {
    // Return a helpful error message (still safe; doesn't expose secrets)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "AI request failed",
        details: String(e),
      }),
    };
  }
};
