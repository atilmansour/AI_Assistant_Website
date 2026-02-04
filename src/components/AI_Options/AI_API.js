import React, { useState, useEffect } from "react";
import MessageInput from "./MessageComponents/MessageInput";
import axios from "axios";
import MessageDisplay from "./MessageComponents/MessageHistory";
import "../../App.css";

const AI_API = ({
  onMessagesSubmit,
  initialMessages = [],
  lastEditedText,
  aiProvider = "chatgpt", // "chatgpt" | "claude" | "gemini"
}) => {
  // Always store plain strings in state (old behavior)
  const [messages, setMessages] = useState(() =>
    (initialMessages || []).map((text) => ({
      timestamp: new Date().toLocaleTimeString(),
      text: String(text ?? ""),
      sender: "chatbot",
    })),
  );

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

  // Helper to force anything into a plain string (prevents array/object leaks into state)
  const toText = (v) => {
    if (typeof v === "string") return v;
    if (v == null) return "";
    if (Array.isArray(v)) {
      // If an array of parts/blocks sneaks in, join text fields if present
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

  // OpenAI now sometimes expects "content parts". We keep the OLD INTERNAL FORMAT,
  // and only convert right at the OpenAI request boundary.
  const toOpenAIContent = (text) => [{ type: "text", text: toText(text) }];

  const sendMessage = async (userMessage) => {
    const timestamp = new Date().toLocaleTimeString();

    const newUserMessage = {
      timestamp,
      text: toText(userMessage),
      sender: "user",
    };

    // Update UI immediately (old behavior)
    setMessages((prev) => [...prev, newUserMessage]);

    const writingContext = lastEditedText
      ? `This is what I have written so far: ${toText(lastEditedText)}`
      : `My text is currently empty.`;

    // IMPORTANT: include this message in what we send (since setState is async)
    const fullMessages = [...messages, newUserMessage];

    // OLD internal format: role + plain string content
    const chatHistory = [
      { role: "user", content: writingContext },
      ...fullMessages.map((msg) => ({
        role: msg.sender === "user" ? "user" : "assistant",
        content: toText(msg.text),
      })),
    ];

    try {
      let chatbotResponseText = "";

      if (aiProvider === "claude") {
        const response = await axios.post(
          "https://api.anthropic.com/v1/messages",
          {
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1000,
            // Claude: keep it simple (strings)
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

        // Claude returns blocks
        chatbotResponseText = (response.data.content || [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
      } else if (aiProvider === "gemini") {
        // Gemini expects "contents" with parts
        const contents = chatHistory
          .filter((m) => toText(m.content).trim().length > 0)
          .map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: toText(m.content) }],
          }));

        const response = await axios.post(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
          {
            contents,
            generationConfig: { maxOutputTokens: 1000 },
          },
          {
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": process.env.REACT_APP_GEMINI_KEY,
            },
          },
        );

        chatbotResponseText = (
          response.data?.candidates?.[0]?.content?.parts || []
        )
          .map((p) => p.text || "")
          .join("\n")
          .trim();
      } else {
        // OpenAI: convert from old internal strings -> required parts format ONLY here
        const openAiMessages = chatHistory.map((m) => ({
          role: m.role,
          content: toOpenAIContent(m.content),
        }));

        const response = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            max_tokens: 1000,
            model: "gpt-4o",
            messages: openAiMessages,
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: process.env.REACT_APP_GPT_KEY, // keep as-is if it already includes Bearer
            },
          },
        );

        const msg = response.data?.choices?.[0]?.message;

        // msg.content can be string OR parts; convert to plain string (old behavior)
        chatbotResponseText = Array.isArray(msg?.content)
          ? msg.content
              .map((p) => p.text || "")
              .join("\n")
              .trim()
          : toText(msg?.content).trim();
      }

      // Store only plain string in state (old behavior)
      setMessages((prev) => [
        ...prev,
        { timestamp, text: toText(chatbotResponseText), sender: "chatbot" },
      ]);
    } catch (error) {
      console.error("Error:", error);
      console.error("Status:", error?.response?.status);
      console.error("Body:", error?.response?.data);

      setMessages((prev) => [
        ...prev,
        { timestamp, text: "Sorry, an error occurred.", sender: "chatbot" },
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
