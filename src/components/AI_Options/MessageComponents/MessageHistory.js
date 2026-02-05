import React, { useEffect, useRef } from "react";

/**
 * MessageHistory
 * Displays a chat history and automatically scrolls to the bottom
 * whenever the messages array updates.
 *
 * Expects `messages` like:
 * [{ sender: "user" |, text: "..." }, ...]
 */
const MessageHistory = ({ messages }) => {
  // Helpful for debugging: see incoming messages data
  console.log(messages);

  // Reference to an invisible "end" element at the bottom of the chat
  const messagesEndRef = useRef(null);

  // Scroll to the bottom of the chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Whenever messages change, scroll down to the latest one
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    // Chat container (style with #chat-output in CSS)
    <div id="chat-output">
      {/* Render each message */}
      {messages?.map((message, index) => (
        // message.sender is used as a CSS class (e.g., "user" vs "assistant")
        <div key={index} className={message?.sender}>
          {message?.text}
        </div>
      ))}

      {/* Invisible element used as the scroll target */}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageHistory;
