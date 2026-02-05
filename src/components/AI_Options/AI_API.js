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
        const response = await axios.post(
          //Here you can change the components of the model
          "https://api.anthropic.com/v1/messages",
          {
            model: "claude-3-5-sonnet-20241022", //claude version
            max_tokens: 1000,
            // Claude: messages are simple strings
            messages: chatHistory.map((m) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: toText(m.content),
            })),
          },
          {
            headers: {
              "Content-Type": "application/json",
              "x-api-key": process.env.REACT_APP_CLAUDE_KEY,
              "anthropic-version": "2023-06-01",
            },
          },
        );

        // Claude returns content blocks; join text blocks into one string
        chatbotResponseText = (response.data.content || [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();

        // ---- Provider 2: Gemini (Google) ----
      } else if (aiProvider === "gemini") {
        // Gemini expects a "contents" format with parts
        const contents = chatHistory
          .filter((m) => toText(m.content).trim().length > 0)
          .map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: toText(m.content) }],
          }));

        const response = await axios.post(
          //Here you can change the model and components of the model, the current model is 2.5-flash
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
          {
            contents,
            generationConfig: {
              maxOutputTokens: 1000, //max tokens
            },
          },
          {
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": process.env.REACT_APP_GEMINI_KEY,
            },
          },
        );

        // Extract Gemini text parts
        chatbotResponseText = (
          response.data?.candidates?.[0]?.content?.parts || []
        )
          .map((p) => p.text || "")
          .join("\n")
          .trim();

        // ---- Provider 3: OpenAI (ChatGPT) ----
      } else {
        // Convert internal strings -> OpenAI "parts" format at the boundary
        const openAiMessages = chatHistory.map((m) => ({
          role: m.role,
          content: toOpenAIContent(m.content),
        }));

        const response = await axios.post(
          //Here you can change the model and components of the model
          "https://api.openai.com/v1/chat/completions",
          {
            max_tokens: 1000, //number of tokens
            model: "gpt-4o", //the model name
            messages: openAiMessages, //Do not change this, it sends the history of the messsages
          },
          {
            headers: {
              "Content-Type": "application/json",
              // NOTE: your key should be "Bearer <KEY>"
              Authorization: process.env.REACT_APP_GPT_KEY,
            },
          },
        );

        const msg = response.data?.choices?.[0]?.message;

        // msg.content might be string OR parts; convert to plain string
        chatbotResponseText = Array.isArray(msg?.content)
          ? msg.content
              .map((p) => p.text || "")
              .join("\n")
              .trim()
          : toText(msg?.content).trim();
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
