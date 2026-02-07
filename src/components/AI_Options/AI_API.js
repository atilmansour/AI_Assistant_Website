import React, { useState, useEffect } from "react";
import MessageInput from "./MessageComponents/MessageInput";
import axios from "axios";
import MessageDisplay from "./MessageComponents/MessageHistory";
import "../../App.css";

/**
 * AI_API
 * A chat UI component that can talk to ChatGPT (OpenAI), Claude (Anthropic), or Gemini (Google).
 * It keeps a messages array in state and sends the full conversation + writing context to the AI.
 */
const AI_API = ({
  onMessagesSubmit,
  initialMessages = [],
  lastEditedText,
  aiProvider = "chatgpt", // "chatgpt" | "claude" | "gemini"
}) => {
  // Store chat messages in state (we keep everything as plain strings internally)
  const [messages, setMessages] = useState(() =>
    (initialMessages || []).map((text) => ({
      timestamp: new Date().toLocaleTimeString(),
      text: String(text ?? ""),
      sender: "chatbot",
    })),
  );

  // Whenever messages change, report them to the parent component
  useEffect(() => {
    onMessagesSubmit(messages);
  }, [messages, onMessagesSubmit]);

  // Keep old behavior: set initial messages once on mount
  useEffect(() => {
    setMessages(
      (initialMessages || []).map((text) => ({
        timestamp: new Date().toLocaleTimeString(),
        text: String(text ?? ""),
        sender: "chatbot",
      })),
    );
  }, []);

  /**
   * toText
   * Converts anything into a plain string.
   * This prevents crashes if an API returns arrays/objects instead of normal text.
   */
  const toText = (v) => {
    if (typeof v === "string") return v;
    if (v == null) return "";
    if (Array.isArray(v)) {
      // If an array of parts sneaks in, join any .text fields
      return v
        .map((p) => {
          if (typeof p === "string") return p;
          if (typeof p?.text === "string") return p.text;
          return "";
        })
        .join("\n");
    }
    try {
      return String(v);
    } catch {
      return "";
    }
  };

  // OpenAI may expect content in "parts" format; we only convert at request time
  const toOpenAIContent = (text) => [{ type: "text", text: toText(text) }];

  /**
   * sendMessage
   * Adds the user's message to the UI immediately, then calls the selected AI provider.
   */
  const sendMessage = async (userMessage) => {
    const timestamp = new Date().toLocaleTimeString();

    // Create a user message object (stored as plain string)
    const newUserMessage = {
      timestamp,
      text: toText(userMessage),
      sender: "user",
    };

    // Update UI immediately (so the user sees their message right away)
    setMessages((prev) => [...prev, newUserMessage]);

    // Add writing context so the AI can respond based on what the user wrote
    const writingContext = lastEditedText
      ? `This is what I have written so far: ${toText(lastEditedText)}`
      : `My text is currently empty.`;

    // IMPORTANT: include the new message in the history we send (state updates are async)
    const fullMessages = [...messages, newUserMessage];

    // Internal chat format: role + plain string content
    const chatHistory = [
      { role: "user", content: writingContext },
      ...fullMessages.map((msg) => ({
        role: msg.sender === "user" ? "user" : "assistant",
        content: toText(msg.text),
      })),
    ];

    try {
      let chatbotResponseText = "";

      // ---- Provider 1: Claude (Anthropic) ----
      if (aiProvider === "claude") {
        /**
         * IMPORTANT CHANGE:
         * We do NOT call Anthropic directly from the browser anymore (CORS + API key leak).
         * Instead, we call OUR backend proxy endpoint: /api/ai
         *
         * Your backend will read the real keys (OPENAI_KEY / CLAUDE_KEY / GEMINI_KEY)
         * from server-side environment variables.
         */
        const API_BASE =
          process.env.REACT_APP_API_BASE || "http://localhost:5050";

        const response = await axios.post(`${API_BASE}/api/ai`, {
          provider: "claude",
          // Send role + plain string content to backend (backend will call Claude)
          chatHistory: chatHistory.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: toText(m.content),
          })),
        });

        // Backend returns { text: "..." }
        chatbotResponseText = toText(response.data?.text).trim();

        // ---- Provider 2: Gemini (Google) ----
      } else if (aiProvider === "gemini") {
        /**
         * IMPORTANT CHANGE:
         * We do NOT call Gemini directly from the browser anymore (API key leak).
         * Instead, we call OUR backend proxy endpoint: /api/ai
         */
        const API_BASE =
          process.env.REACT_APP_API_BASE || "http://localhost:5050";

        const response = await axios.post(`${API_BASE}/api/ai`, {
          provider: "gemini",
          // Send role + plain string content to backend (backend will call Gemini)
          chatHistory: chatHistory.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: toText(m.content),
          })),
        });

        // Backend returns { text: "..." }
        chatbotResponseText = toText(response.data?.text).trim();

        // ---- Provider 3: OpenAI (ChatGPT) ----
      } else {
        /**
         * IMPORTANT CHANGE:
         * We do NOT call OpenAI directly from the browser anymore (API key leak).
         * Instead, we call OUR backend proxy endpoint: /api/ai
         *
         * We keep your OpenAI "parts" converter here (to avoid changing your structure),
         * but we send plain strings to the backend to keep it simple.
         */
        const API_BASE =
          process.env.REACT_APP_API_BASE || "http://localhost:5050";

        // Convert internal strings -> OpenAI "parts" format at the boundary
        // (We keep this code, but we won't send parts to backend; we send plain strings.)
        const openAiMessages = chatHistory.map((m) => ({
          role: m.role,
          content: toOpenAIContent(m.content),
        }));

        // Backend expects role + content as plain string; convert safely here:
        const backendHistory = openAiMessages.map((m) => ({
          role: m.role,
          // m.content is [{type:"text", text:"..."}]; convert it back to plain text
          content: Array.isArray(m.content)
            ? m.content.map((p) => p.text || "").join("\n")
            : toText(m.content),
        }));

        const response = await axios.post(`${API_BASE}/api/ai`, {
          provider: "chatgpt",
          chatHistory: backendHistory,
        });

        // Backend returns { text: "..." }
        chatbotResponseText = toText(response.data?.text).trim();
      }

      // Add chatbot reply to the UI
      setMessages((prev) => [
        ...prev,
        { timestamp, text: toText(chatbotResponseText), sender: "chatbot" },
      ]);
    } catch (error) {
      // Log errors for debugging
      console.error("Error:", error);
      console.error("Status:", error?.response?.status);
      console.error("Body:", error?.response?.data);

      // Show a friendly error message in the chat
      setMessages((prev) => [
        ...prev,
        { timestamp, text: "Sorry, an error occurred.", sender: "chatbot" },
      ]);
    }
  };

  return (
    <div id="chat-container">
      {/* Chat messages area */}
      <div id="chat-output">
        <div id="messages-history">
          <MessageDisplay messages={messages} />
        </div>
      </div>

      {/* Input box + Send button */}
      <MessageInput onSendMessage={sendMessage} />
    </div>
  );
};

export default AI_API;
