import React, { useState, useEffect } from "react";
import MessageInput from "./MessageComponents/MessageInput";
import axios from "axios";
import MessageDisplay from "./MessageComponents/MessageHistory";
import "../../App.css";

/**
 * AI_API
 * A chat UI component that can talk to different LLM providers through the backend.
 *
 * Supported providers depend on server.js:
 * - chatgpt / OpenAI
 * - claude / Anthropic
 * - gemini / Google
 * - groq / hosted open-weight models, such as Llama-family models
 *
 * The frontend never calls providers directly.
 * It calls the backend proxy endpoint: POST /api/ai
 */
const AI_API = ({
  onMessagesSubmit,
  initialMessages = [],
  lastEditedText,
  LLMProvider = "chatgpt", // "chatgpt" | "claude" | "gemini" | "groq"

  /**
   * CONFIG YOU WILL EDIT:
   * Optional model override.
   *
   * If this is empty, server.js will use the default model for that provider.
   *
   * Examples:
   * LLMModel = "gpt-4o"
   * LLMModel = "claude-sonnet-4-20250514"
   * LLMModel = "gemini-2.5-flash"
   * LLMModel = "llama-3.3-70b-versatile"
   */
  LLMModel = "",

  backgroundAIMessage = "",
}) => {
  // Store chat messages in state
  const [messages, setMessages] = useState(() =>
    (initialMessages || []).map((text) => ({
      timestamp: Math.round(performance.now()),
      text: String(text ?? ""),
      sender: "LLMAssistant",
    })),
  );

  // Whenever messages change, report them to the parent component
  useEffect(() => {
    onMessagesSubmit(messages);
  }, [messages, onMessagesSubmit]);

  // Converts anything into a plain string.
  const toText = (v) => {
    if (typeof v === "string") return v;
    if (v == null) return "";

    if (Array.isArray(v)) {
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

  // sendMessage: Adds the user's message to the UI immediately, then calls the backend.
  const sendMessage = async (userMessage) => {
    const timestamp = Math.round(performance.now());

    const newUserMessage = {
      timestamp,
      text: toText(userMessage),
      sender: "user",
    };

    // Update UI immediately
    setMessages((prev) => [...prev, newUserMessage]);

    // ----------------------------
    // Add writing context so the AI can respond based on what the user wrote.
    // CONFIG YOU WILL EDIT:
    // You can use backgroundAIMessage to give the AI context or instructions.
    // ----------------------------
    const writingContext = lastEditedText
      ? `${backgroundAIMessage}. This is what I have written so far: ${toText(
          lastEditedText,
        )}`
      : `${backgroundAIMessage} My text is currently empty.`;

    // IMPORTANT: include the new message in the history we send
    const fullMessages = [...messages, newUserMessage];

    // Backend expects role + plain string content
    const chatHistory = [
      { role: "user", content: writingContext },
      ...fullMessages.map((msg) => ({
        role: msg.sender === "user" ? "user" : "assistant",
        content: toText(msg.text),
      })),
    ];

    try {
      const API_BASE =
        process.env.REACT_APP_API_BASE || "http://localhost:5050";

      const requestBody = {
        provider: LLMProvider,
        chatHistory,
      };

      // Only send model if the researcher provided one.
      // Otherwise, server.js will use the default model for that provider.
      if (LLMModel && LLMModel.trim().length > 0) {
        requestBody.model = LLMModel.trim();
      }

      const response = await axios.post(`${API_BASE}/api/ai`, requestBody);

      const LLMAssistantResponseText = toText(response.data?.text).trim();

      setMessages((prev) => [
        ...prev,
        {
          timestamp,
          text: LLMAssistantResponseText,
          sender: "LLMAssistant",
        },
      ]);
    } catch (error) {
      console.error("Error:", error);
      console.error("Status:", error?.response?.status);
      console.error("Body:", error?.response?.data);

      setMessages((prev) => [
        ...prev,
        {
          timestamp,
          text: "Sorry, an error occurred.",
          sender: "LLMAssistant",
        },
      ]);
    }
  };

  return (
    <div id="chat-container">
      <div id="chat-output">
        <div id="messages-history">
          <MessageDisplay messages={messages} />
        </div>
      </div>

      <MessageInput onSendMessage={sendMessage} />
    </div>
  );
};

export default AI_API;
