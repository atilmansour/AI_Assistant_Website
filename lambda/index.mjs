// index.mjs (AWS Lambda)
// This Lambda acts as a secure proxy to call OpenAI / Claude / Gemini.
// Secrets (API keys) are stored in Lambda Environment Variables, NOT in the frontend.

export const handler = async (event) => {
  // --- CORS headers: lets your Amplify site call this API ---
  // For production, replace "*" with your Amplify domain:
  // e.g. "https://main.xxxxx.amplifyapp.com"
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };

  // Browser "preflight" request (CORS check)
  if (event?.requestContext?.http?.method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
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
